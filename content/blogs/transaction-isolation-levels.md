---
title: Transaction Isolation Levels — What Your Database Does When Nobody's Watching
slug: transaction-isolation-levels
description: A deep dive into dirty reads, phantom reads, lost updates, and write skew — how PostgreSQL and SQL Server handle concurrency, and how to choose the right isolation level for your workload.
longDescription: Transaction isolation is one of those topics where the documentation is technically correct but practically useless. This post works from real-world failure scenarios — a flash sale that loses money, a compliance report that's internally inconsistent, two doctors both going off-call — and builds up to exactly how PostgreSQL and SQL Server handle each problem, why they differ despite both claiming SQL standard compliance, and what to reach for when you need to relax or tighten isolation in production.
tags:
  ["postgresql", "mssql", "database", "transactions", "concurrency", "advanced"]
readTime: 40
featured: true
timestamp: 2026-06-18T00:00:00+00:00
---

This post is a reference and a mental model for transaction isolation levels in PostgreSQL and MS SQL Server — the concurrency anomalies each level prevents, how the two engines implement them (often very differently despite sharing the same SQL standard vocabulary), the SQL hints available for per-statement control, and a practical guide for matching isolation level to workload.

---

## ACID: The Contract

Every serious database makes four guarantees about transactions, collectively known as ACID.

**Atomicity** — A transaction either commits in full or not at all. A bank transfer that debits one account and fails before crediting the other is rolled back entirely. No partial results reach the database.

**Consistency** — A transaction moves the database from one valid state to another. Any constraint, foreign key, or business invariant that held before the transaction must hold after it commits.

**Isolation** — Concurrent transactions behave as if they ran serially — one after another, with no interleaving. This is the property this article is about. The word "as if" carries a lot of weight: full serializability is expensive, and real systems offer a configurable spectrum of guarantees rather than a single all-or-nothing setting.

**Durability** — Once committed, a transaction survives crashes and power loss. The data reaches persistent storage — via the write-ahead log (WAL) in PostgreSQL, or the transaction log in SQL Server — before the commit acknowledgment is returned to the client.

Of the four, isolation is the only adjustable one. Atomicity, consistency, and durability are binary properties — either your database provides them or it doesn't. Isolation is a dial, and the rest of this article is about where to set it and why.

---

## The Fundamental Problem

A single transaction running alone against the database is simple: it reads committed data, makes changes, and either commits or rolls back and leaves no trace. Predictable and easy to reason about.

The moment you add concurrency, you get interleaving: transaction A reads a row, transaction B modifies that row, transaction A reads it again. What does A see? It depends on your isolation level, and the answer has real consequences.

The SQL standard defines a hierarchy of isolation levels, each protecting against a specific set of anomalies. Higher isolation = fewer anomalies = more restrictions on concurrency. The tradeoff is always correctness vs. throughput.

There are five classic concurrency anomalies worth understanding before looking at how the levels handle them.

---

## The Five Anomalies

### Dirty Read

A transaction reads data written by a concurrent transaction that has not yet committed.

<div style="border-left:3px solid color-mix(in srgb,currentColor 30%,transparent);padding:12px 16px;margin:1.25rem 0;font-size:0.9rem;">

**Real scenario.** An inventory sync job starts updating stock counts based on a supplier feed. Halfway through, it detects that the feed is corrupted and will roll back. But the order service is already running — it reads the in-progress stock numbers, sees false zeros, and starts rejecting orders for products that are actually in stock.

</div>

The key word is _uncommitted_. Dirty read means reading data that might not end up existing.

### Non-Repeatable Read

A transaction reads a row, another transaction modifies and commits that row, and the first transaction reads the same row again — and gets a different value.

<div style="border-left:3px solid color-mix(in srgb,currentColor 30%,transparent);padding:12px 16px;margin:1.25rem 0;font-size:0.9rem;">

**Real scenario.** A checkout flow reads the unit price of an item to calculate tax, then reads it again to build the order summary. Between those two reads, a flash sale job commits a price change. The tax was calculated at $99.99; the order total shows $69.99. The receipt is internally inconsistent.

</div>

Both reads are of committed data — so there's no "dirty" data involved. The problem is that the data legitimately changed between reads within the same transaction.

### Phantom Read

A transaction executes a range query (or any query with a predicate), another transaction inserts or deletes rows that match that predicate, and the first transaction re-executes the query — and gets a different set of rows.

<div style="border-left:3px solid color-mix(in srgb,currentColor 30%,transparent);padding:12px 16px;margin:1.25rem 0;font-size:0.9rem;">

**Real scenario.** A fraud detection job queries all transactions over $10,000 in the last hour: finds 4, flags them for review, and starts generating a detailed report. During report generation, three more qualifying transactions come in and commit. The summary says 4; the detailed section has 7. The compliance team sends the report to regulators.

</div>

Different from non-repeatable read in a specific way: the _rows themselves_ change (new rows appear or existing rows disappear), not the values of already-read rows.

### Lost Update

Two transactions both read the same value, compute a new value independently, and both write back. One overwrites the other.

<div style="border-left:3px solid color-mix(in srgb,currentColor 30%,transparent);padding:12px 16px;margin:1.25rem 0;font-size:0.9rem;">

**Real scenario.** Two customer service agents simultaneously open a customer's loyalty account, both reading 1,000 points. Agent A applies a 500-point promotional bonus and writes 1,500. Agent B applies a 200-point birthday bonus and writes 1,200 (having computed `1000 + 200` in memory). The customer ends up with 1,200 points instead of 1,700. One update was silently lost.

</div>

This is the classic read-modify-write race. The lost update is especially insidious because no error is thrown — both writes "succeed."

### Write Skew

Two transactions each read a set of rows, make a decision based on what they read, and each write _different_ rows — but together, their writes violate an invariant that neither transaction alone would violate.

<div style="border-left:3px solid color-mix(in srgb,currentColor 30%,transparent);padding:12px 16px;margin:1.25rem 0;font-size:0.9rem;">

**Real scenario.** A hospital scheduling system enforces a rule: at least one doctor must be on call at all times. Dr. Smith checks — there are 2 doctors on call, invariant holds — and marks herself as off-call. Simultaneously, Dr. Jones checks — also sees 2 doctors on call, invariant holds — and also marks himself as off-call. Result: zero doctors on call. Both transactions were individually correct; together they broke the system.

</div>

Write skew is the most subtle of the five. Neither transaction writes to a row the other read, so there's no direct conflict — just a logical dependency that lock-based systems can't see without range locks, and snapshot-based systems can't see without tracking read-write dependencies.

---

## The Standard Isolation Levels

SQL standard defines four levels, each preventing a subset of the anomalies above.

| Anomaly             | READ UNCOMMITTED | READ COMMITTED | REPEATABLE READ | SERIALIZABLE |
| ------------------- | :--------------: | :------------: | :-------------: | :----------: |
| Dirty Read          |        ❌        |       ✅       |       ✅        |      ✅      |
| Non-Repeatable Read |        ❌        |       ❌       |       ✅        |      ✅      |
| Phantom Read        |        ❌        |       ❌       |       ❌¹       |      ✅      |
| Lost Update         |        ❌        |       ❌       |       ❌²       |      ✅      |
| Write Skew          |        ❌        |       ❌       |       ❌        |      ✅      |

_✅ prevented · ❌ possible_

¹ Standard SQL allows phantom reads at REPEATABLE READ. PostgreSQL prevents them anyway — more on this shortly.  
² Standard SQL allows lost updates at REPEATABLE READ. Whether they're prevented depends on implementation.

This table is the textbook version. Real databases implement the standard imperfectly, differently, and sometimes better. PostgreSQL and SQL Server are a good case study in how much the implementation matters.

---

## PostgreSQL: The MVCC World

PostgreSQL traces its lineage to the POSTGRES research project at UC Berkeley, led by Michael Stonebraker, starting in 1986. The design goal was to support complex analytical queries and long-running transactions — workloads where lock-based concurrency would cause chronic blocking. MVCC was baked into the architecture from day one, influenced by earlier academic work on snapshot isolation. When POSTGRES became open-source in 1994 and eventually evolved into PostgreSQL, MVCC came along as a first-class citizen, not a retrofit. That decision shapes every query you run today.

**Multi-Version Concurrency Control (MVCC)** works like this: instead of locking a row when you write it, PostgreSQL keeps multiple versions of that row simultaneously — the old version for readers still referencing it, the new version for the transaction that wrote it.

The practical consequence is profound: **readers never block writers, and writers never block readers.** In a lock-based system, a long-running `SELECT` can hold shared locks that block `UPDATE` statements. In PostgreSQL, that scenario simply doesn't exist.

Each transaction gets a _snapshot_ of the database at a specific point in time. What "a specific point" means depends on the isolation level.

### READ UNCOMMITTED

PostgreSQL accepts the syntax but treats it as READ COMMITTED. The architecture doesn't support dirty reads — there's no mechanism to expose uncommitted row versions to other transactions. If you write `SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED` in PostgreSQL, you're getting READ COMMITTED.

This isn't a limitation — it's the correct behavior, and it means you never have to worry about dirty reads in PostgreSQL regardless of what isolation level you're at.

### READ COMMITTED (default)

This is the default, and it means: **each statement within your transaction gets a fresh snapshot.** Not the transaction — the statement.

```sql
BEGIN;
-- Snapshot taken here for this statement:
SELECT balance FROM accounts WHERE owner = 'Alice'; -- 10000

-- Another transaction commits a change to Alice's balance here.

-- New snapshot taken for THIS statement:
SELECT balance FROM accounts WHERE owner = 'Alice'; -- 9000
COMMIT;
```

The second read is consistent with committed data at the time that statement runs. Non-repeatable reads are possible by design. This is appropriate for most Online Transaction Processing (OLTP) operations — you're usually reading and modifying in the same statement, or you genuinely want the latest committed data.

### REPEATABLE READ

The snapshot is taken at the **start of the transaction**, not per-statement. Every read within the transaction sees the database as it was when the first command ran.

This prevents non-repeatable reads — but here's where PostgreSQL diverges from the standard: **REPEATABLE READ in PostgreSQL also prevents phantom reads.** The SQL standard doesn't require this; it's a bonus from the MVCC snapshot semantics. A range query re-executed within the same REPEATABLE READ transaction always returns the same rows, because new inserts by other transactions are simply not visible in your snapshot.

```sql
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
BEGIN;

SELECT COUNT(*) FROM accounts WHERE balance > 7000; -- 2

-- Another transaction inserts a new account with balance 9000 and commits.

SELECT COUNT(*) FROM accounts WHERE balance > 7000; -- still 2
-- The new row is invisible. Your snapshot predates the insert.

COMMIT;
```

One important caveat: if your transaction tries to _modify_ a row that was modified by another transaction after your snapshot was taken, you'll get a serialization error. PostgreSQL detects this and aborts your transaction rather than silently giving you stale data.

### SERIALIZABLE

PostgreSQL's SERIALIZABLE uses **Serializable Snapshot Isolation (SSI)**, which is both more sophisticated and more optimistic than the traditional range-locking approach.

The idea: let transactions run concurrently with snapshot semantics, but track read-write dependencies between them. If the dependency graph forms a cycle — meaning the transactions couldn't have run in any serial order — PostgreSQL detects this and aborts one transaction with a serialization error.

```
ERROR:  could not serialize access due to read/write dependencies among transactions
DETAIL:  Reason code: Canceled on identification as a pivot, during commit attempt.
HINT:  The transaction might succeed if retried.
```

This handles write skew. The doctor scheduling example from above: both transactions read the `on_call` table and write to it. SSI detects the dependency cycle and aborts one of them. No locks, no blocking — just detection and retry.

The downside: you need to be prepared to retry. The upside: SSI has significantly lower blocking than traditional serializable locking, and false positives (spurious aborts) are rare in well-designed schemas.

---

## SQL Server: Two Models in One

SQL Server's lineage goes back to Sybase, whose codebase Microsoft licensed in 1988 to build SQL Server 4.2. Sybase had designed a lock-based concurrency system — a pragmatic choice for the short, write-heavy Online Transaction Processing (OLTP) workloads of the late 1980s, where transactions were predictable and lock contention was manageable. Lock-based concurrency was well-understood, simpler to implement correctly, and sufficient for the target market. When Microsoft took SQL Server development fully in-house after version 4.21, the lock-based architecture stayed. MVCC-style row versioning didn't arrive until SQL Server 2005 — as RCSI and SNAPSHOT isolation — an explicit opt-in addition built on top of the existing locking infrastructure, not a replacement for it. The result is an engine that carries both models simultaneously, and which one you get depends on database-level settings.

### The Default: Lock-Based Concurrency

Out of the box, SQL Server is a lock-based system. `SELECT` statements acquire **shared (S) locks** on the rows (or pages, or the table) they read. `UPDATE`/`INSERT`/`DELETE` acquire **exclusive (X) locks**.

Shared and exclusive locks are incompatible: a reader blocks a writer, and a writer blocks a reader. This is very different from PostgreSQL.

Under the default **READ COMMITTED**:

- Shared locks are acquired per-row as they are read and **released immediately** — not held for the duration of the statement.
- Exclusive locks (writes) are held until the transaction commits or rolls back.

A reader that encounters a locked row will wait until the writer releases it (commits or rolls back) before reading it. Individual rows are never seen mid-update. But because shared locks are dropped immediately rather than held for the whole scan, a long-running `SELECT` can produce a result set that spans multiple points in time: rows scanned early see committed state as of that moment; rows scanned later may reflect a subsequent commit by a concurrent writer that happened while the scan was in progress.

Consider a `UPDATE` that touches 1,000 rows in a single transaction. A concurrent reader scanning the same table might see rows 1–500 in their pre-update state (already scanned before the writer got there), then block briefly on row 501 while the writer holds its exclusive lock, then — once the writer commits the entire transaction — continue reading rows 501–1,000 in their post-update state. No dirty reads, but a single result set with values from two different points in time.

This contention between shared and exclusive locks also shows up as blocking in `sys.dm_exec_requests` and deadlock graphs — especially in write-heavy workloads where readers and writers frequently target overlapping row sets.

### REPEATABLE READ and SERIALIZABLE (Lock-Based)

At **REPEATABLE READ**, SQL Server holds shared locks until the transaction commits — not just until each row is processed. This prevents non-repeatable reads (no one can modify a row you've read) but allows phantoms (new rows matching your predicate can be inserted, since you only hold locks on rows you've already seen).

At **SERIALIZABLE**, SQL Server escalates to **range locks** — it locks the entire predicate range, not just individual rows. New rows cannot be inserted into a range you've queried. This prevents phantom reads. Range locking is the most heavyweight option and the one most likely to cause deadlocks under contention — and that deadlock is precisely how SQL Server prevents write skew. Two transactions that each read a range and then cross-update rows inside it block each other into a cycle, and SQL Server resolves it by killing one as the deadlock victim. PostgreSQL arrives at the same protection from the opposite direction: instead of blocking into a deadlock, its SSI lets both run and detects the read-write dependency cycle, aborting one with a serialization error. Same guarantee, pessimistic vs. optimistic.

### READ COMMITTED SNAPSHOT ISOLATION (RCSI)

This is a database-level setting that changes how READ COMMITTED behaves:

```sql
ALTER DATABASE your_db SET READ_COMMITTED_SNAPSHOT ON;
```

With RCSI enabled, **READ COMMITTED no longer takes shared locks on reads.** Instead, SQL Server stores old row versions in `tempdb` and uses them to serve consistent reads. Readers see the last committed version of a row at the time the statement starts — exactly like PostgreSQL's default READ COMMITTED.

The result: **readers don't block writers, writers don't block readers.** Your existing application code doesn't change; it just becomes much less prone to lock contention. This is why RCSI is the recommended default for most SQL Server OLTP workloads. Azure SQL Database has RCSI enabled by default.

The cost is `tempdb` usage — SQL Server needs to store version chains for active rows. At very high update rates, this can be significant. Monitor `sys.dm_db_file_space_usage` and `sys.dm_tran_version_store_space_usage` if you turn it on.

### SNAPSHOT Isolation

SNAPSHOT isolation is different from RCSI in a critical way: **the snapshot is taken at transaction start, not per-statement.**

```sql
-- Enable at the database level first (one-time):
ALTER DATABASE your_db SET ALLOW_SNAPSHOT_ISOLATION ON;

-- Then use per-transaction:
SET TRANSACTION ISOLATION LEVEL SNAPSHOT;
BEGIN TRANSACTION;

SELECT balance FROM accounts WHERE owner = 'Alice'; -- 10000

-- Another transaction commits a change here.

SELECT balance FROM accounts WHERE owner = 'Alice'; -- still 10000
-- You're reading your transaction-start snapshot.

COMMIT;
```

This is closer to PostgreSQL's REPEATABLE READ. Long-running analytics transactions, monthly reports, ETL reads — these are ideal candidates for SNAPSHOT. The transaction gets a consistent view of the world for its entire lifetime, without holding any shared locks.

There's a conflict detection mechanism: if your SNAPSHOT transaction tries to modify a row that was modified by another transaction after your snapshot was taken, you get an error:

```
Snapshot isolation transaction aborted due to update conflict.
The database object you accessed has been modified by a statement in another transaction since the start of this transaction.
```

This makes SNAPSHOT isolation unsuitable as a general replacement for SERIALIZABLE — it doesn't catch all write conflicts. But for read-heavy transactions that do targeted writes, it's excellent.

### Comparing PostgreSQL and SQL Server

| Feature                  | PostgreSQL                       | SQL Server                            |
| ------------------------ | -------------------------------- | ------------------------------------- |
| Default isolation        | READ COMMITTED (MVCC)            | READ COMMITTED (lock-based)           |
| Dirty reads              | Never possible                   | Possible at READ UNCOMMITTED / NOLOCK |
| Read blocks write?       | Never                            | Yes (unless RCSI/SNAPSHOT enabled)    |
| REPEATABLE READ phantoms | Prevented (exceeds SQL standard) | Possible (standard behavior)          |
| Snapshot at txn start    | REPEATABLE READ and above        | SNAPSHOT isolation (explicit)         |
| SERIALIZABLE mechanism   | SSI (optimistic, detect + abort) | Range locks (pessimistic, block)      |
| Version store location   | In-table (heap/index pages)      | tempdb                                |

---

## Relaxing Isolation: Hints and Escapes

<div class="flex gap-6 items-center">
  <img src="/relax-calm-down.gif" alt="RELAX" class="w-48 flex-shrink-0 rounded" />
  <div style="border-left:3px solid color-mix(in srgb,currentColor 30%,transparent);padding:12px 16px;margin:1.25rem 0;font-size:0.9rem;">Frankie Goes to Hollywood sold a million t-shirts that said "FRANKIE SAYS RELAX." Your queries can say the same — there are hints for exactly that. The BBC banned Frankie's advice for being inappropriate. DBAs should apply the same judgment to `WITH (NOLOCK)`.<p>
  </div>
</div>

There are legitimate reasons to reach for a lower isolation level for specific queries — reporting queries that can tolerate slight inconsistency, queue-style workloads, or reads where stale data is acceptable and you'd rather avoid lock contention. The tool for this is different in each database.

### PostgreSQL: Row-Level Locking Clauses

PostgreSQL doesn't have per-statement isolation hints in the SQL Server sense. You can't add `WITH (NOLOCK)` to a table reference. Isolation level is set per-transaction.

What PostgreSQL _does_ give you is fine-grained explicit row locking as part of `SELECT`:

```sql
-- Exclusive lock — prevents any other transaction from updating these rows
SELECT * FROM accounts WHERE owner = 'Alice' FOR UPDATE;

-- Shared lock — allows other shared locks, blocks exclusive
SELECT * FROM accounts WHERE owner = 'Alice' FOR SHARE;

-- Exclusive, but allows rows referenced by foreign keys to be locked
SELECT * FROM orders WHERE customer_id = 1 FOR NO KEY UPDATE;

-- Shared, for FK validation only
SELECT * FROM products WHERE id = 5 FOR KEY SHARE;
```

These locking clauses combine with two modifiers that are particularly useful:

```sql
-- Skip rows that are currently locked (don't wait)
-- LIMIT 1: each worker grabs exactly one job at a time. Without it, the query
-- would lock all pending rows for the session, defeating the fan-out purpose.
SELECT * FROM jobs WHERE status = 'pending' FOR UPDATE SKIP LOCKED LIMIT 1;

-- Fail immediately if any row is locked
SELECT * FROM accounts WHERE owner = 'Alice' FOR UPDATE NOWAIT;
```

`SKIP LOCKED` is the canonical pattern for implementing work queues in PostgreSQL — multiple worker processes can each grab a distinct pending job without stepping on each other, because each `FOR UPDATE SKIP LOCKED` atomically skips rows already locked by another worker.

For session- or transaction-level control, PostgreSQL uses `SET TRANSACTION` (applied before the first statement of a transaction) or `SET` for the session default:

```sql
-- Per-transaction (must be set before the first statement in the transaction)
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED; -- treated as READ COMMITTED
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;   -- default
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

-- Session default (affects all subsequent transactions in the session)
SET default_transaction_isolation = 'read committed';
SET default_transaction_isolation = 'repeatable read';
SET default_transaction_isolation = 'serializable';
```

### SQL Server: Table Hints

SQL Server supports per-table isolation hints in the query itself. This is more flexible (and more dangerous) than PostgreSQL's approach.

**Relaxing isolation:**

```sql
-- READ UNCOMMITTED for this table — allows dirty reads
SELECT * FROM accounts WITH (NOLOCK);

-- Skip locked rows instead of waiting (like SKIP LOCKED in PG)
SELECT TOP 1 * FROM jobs WITH (READPAST) WHERE status = 'pending';
```

`WITH (NOLOCK)` is heavily overused. It's often applied "for performance" to queries that then silently return incorrect data — rows that were never committed, rows mid-update (that may appear twice or not at all due to page splits), or rows that no longer exist. Use it only when you explicitly accept stale or inconsistent reads.

**Tightening isolation:**

```sql
-- Take an update lock (not shared) — prevents deadlocks in read-then-update patterns
SELECT balance FROM accounts WITH (UPDLOCK) WHERE owner = 'Alice';

-- Hold shared lock until transaction end (SERIALIZABLE for this read)
SELECT COUNT(*) FROM orders WITH (HOLDLOCK) WHERE status = 'pending';

-- Combine: update lock held until transaction end
SELECT * FROM inventory WITH (UPDLOCK, HOLDLOCK) WHERE product_id = 42;
```

**Lock granularity and escalation:**

SQL Server's lock manager operates at multiple granularities. Fine-grained locks allow more concurrency but consume more memory; coarse-grained locks use less memory but restrict more concurrent access. The lock manager is constantly balancing between the two.

_Row locks (RID / Key)_ are the most granular. A RID lock targets a specific row in a heap table by its physical location. A Key lock targets a row in a B-tree index by its key value — this is what you get when touching rows in a clustered or non-clustered index. Row locks maximise concurrency: two transactions updating different rows in the same table never block each other. This is the right level for high-traffic OLTP tables — order lines, ledger entries, inventory rows — where many sessions update distinct rows simultaneously.

_Page locks_ cover a single 8 KB data page, which typically holds dozens to hundreds of rows depending on row size. The lock manager may choose page locks when a query touches many rows on the same page, trading some concurrency for fewer lock entries to track. This can work well for range-based batch updates on physically contiguous data — for example, archiving all orders from a specific date range that happen to be co-located on disk.

_Table locks_ (HoBT or TAB level) cover the entire object. This blocks all concurrent access to the table depending on the lock mode. They're appropriate for bulk loads, index rebuilds, or DDL operations where you intentionally want exclusive ownership. `WITH (TABLOCK)` is the explicit form — you're declaring "I own this table for the duration."

_Database locks_ are held during database-level operations: taking a database offline, restoring a backup, changing compatibility level. Application queries don't interact with these directly.

**How the lock manager and query optimizer decide**

The query optimizer uses index statistics — estimated row counts, index selectivity, the fraction of the table a query is expected to touch — to inform the initial locking strategy:

- A selective index seek expected to return a handful of rows gets row-level locks.
- A range scan touching a moderate number of rows on the same pages may use page locks if the optimizer estimates the concurrency trade-off is worth it.
- A query that will scan a large portion of the table may jump directly to a table lock if tracking thousands of individual row locks would cost more than the concurrency benefit is worth.

At runtime, the **Lock Manager** monitors the actual number of locks held by a transaction. When a single transaction accumulates more than approximately 5,000 row or page locks on a single object, SQL Server escalates to a table lock regardless of what the optimizer originally planned. This threshold is configurable per table:

```sql
-- Check escalation setting for a table
SELECT name, lock_escalation_desc FROM sys.tables WHERE name = 'orders';

-- Disable automatic escalation for a specific high-traffic table
ALTER TABLE orders SET (LOCK_ESCALATION = DISABLE);

-- View locks currently held by your session
SELECT resource_type, resource_description, request_mode, request_status
FROM sys.dm_tran_locks
WHERE request_session_id = @@SPID;
```

Escalation is one of the most common sources of unexpected blocking spikes in production. A batch update that runs cleanly under normal load can cross the lock threshold and acquire a table lock mid-execution, blocking every other session touching that table until it commits.

Granularity hints let you override the optimizer and lock manager per statement:

```sql
-- Force row-level locks — suppresses page and table escalation
SELECT * FROM large_table WITH (ROWLOCK) WHERE id = 1234;

-- Force page-level locks — useful for updates on physically contiguous rows
SELECT * FROM accounts WITH (PAGLOCK) WHERE region = 'EU';

-- Intentional table lock — for bulk operations where you want
-- exclusive access and don't need row-level concurrency
SELECT * FROM staging WITH (TABLOCK);
```

`ROWLOCK` is most commonly used to prevent a targeted update from escalating and locking an entire high-traffic table. `TABLOCK` is the intentional version — you're explicitly trading concurrency for simplicity.

**Session-level isolation in SQL Server:**

```sql
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;     -- default
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SET TRANSACTION ISOLATION LEVEL SNAPSHOT;           -- requires DB opt-in
```

One important difference from PostgreSQL: SQL Server table hints override the session-level isolation. If your session is SERIALIZABLE but you query with `WITH (NOLOCK)`, that table is read uncommitted. PostgreSQL has no equivalent mechanism.

---

## Choosing the Right Level

The practical question: which level for which workload?

**READ COMMITTED (with MVCC or RCSI)** is the right default for most OLTP. It prevents dirty reads, allows non-repeatable reads (which is usually fine when you're reading to make a single decision), and has minimal overhead. In PostgreSQL, this is what you always get. In SQL Server, turn on RCSI to get the same reader-writer non-blocking semantics.

**REPEATABLE READ** is appropriate when a transaction reads data multiple times and needs those reads to be consistent — but you can tolerate new rows appearing (phantoms). An example: a transaction that reads a customer's account data at the start, performs some validation, and then writes based on that data — you want the validation to be based on the same data as the write.

In PostgreSQL, remember that REPEATABLE READ also prevents phantoms, so you're getting more than the standard guarantees.

**SNAPSHOT (SQL Server)** is the right choice for long-running reads that need a consistent point-in-time view of the database — monthly billing runs, analytics queries, report generation — where the query might run for seconds or minutes and you don't want it either blocking writers or seeing inconsistent data mid-run.

**SERIALIZABLE** belongs in places where correctness is non-negotiable and you have write-write or read-write conflicts that lower levels won't handle. Financial operations that enforce business invariants (account balance can't go below zero, on-call schedule must always have at least one doctor) are the canonical use case. Expect to retry transactions on serialization failures; treat the error code as a normal part of the flow, not an exception.

**READ UNCOMMITTED / NOLOCK** has a very narrow legitimate window: monitoring queries, approximate counts on large tables, or dashboards where you'd rather have a fast approximate answer than a slow exact one — and where you've explicitly documented and accepted the data quality trade-off. Don't let it creep into business logic.

| Use Case                               | PostgreSQL                     | SQL Server                              |
| -------------------------------------- | ------------------------------ | --------------------------------------- |
| General OLTP                           | READ COMMITTED (default)       | READ COMMITTED + RCSI enabled           |
| Multi-read validation in one txn       | REPEATABLE READ                | REPEATABLE READ or SNAPSHOT             |
| Long-running reports / analytics       | REPEATABLE READ                | SNAPSHOT                                |
| Financial invariants (balance, limits) | SERIALIZABLE                   | SERIALIZABLE                            |
| Work queues / job dispatch             | `FOR UPDATE SKIP LOCKED`       | `WITH (READPAST, UPDLOCK)`              |
| Approximate monitoring queries         | READ COMMITTED (MVCC is cheap) | `WITH (NOLOCK)` — explicitly documented |
| Read-then-update (prevent lost update) | `SELECT ... FOR UPDATE`        | `WITH (UPDLOCK)`                        |

---

## A Note on the "Right" Default

There's a common piece of advice that circulates: "just use SERIALIZABLE and don't worry about it." This is well-intentioned but operationally naive. SERIALIZABLE workloads require retry logic for serialization failures — if your application isn't built to handle `ERROR: could not serialize access` or `Snapshot isolation transaction aborted due to update conflict`, you'll have silent failures in production when contention spikes.

The opposite advice — "use NOLOCK everywhere for performance" — is actively harmful. Dirty reads in financial or inventory systems cause real data loss.

The practical path: start with READ COMMITTED + RCSI (SQL Server) or READ COMMITTED (PostgreSQL), which handles most OLTP workloads correctly and cheaply. Use `SELECT ... FOR UPDATE` / `WITH (UPDLOCK)` for explicit critical sections. Reach for REPEATABLE READ or SNAPSHOT for read-heavy long transactions. Reserve SERIALIZABLE for operations where you've explicitly identified a write-skew risk and your retry path is tested.

And read the blocking reports. On SQL Server, `sys.dm_exec_requests` and `sys.dm_os_waiting_tasks` tell you what's actually waiting and for what. On PostgreSQL, `pg_stat_activity` and `pg_locks` tell you the same. If your lock waits are climbing, the solution might be a better isolation level — or it might be better indexing, shorter transactions, or application-level changes. Isolation level is one dial in a larger system.

---

## Try It Yourself

The companion project, [Transaction Isolation Sandbox](/projects/tx-isolation-sandbox), is a `docker compose up` away from a working environment with PostgreSQL, SQL Server, and CloudBeaver pre-configured. All the scenarios described in this article — dirty reads, non-repeatable reads, phantoms, lost updates, write skew, snapshot isolation, RCSI — are scripted and ready to run. Running them interactively, watching one session block (or not block) the other depending on which level you're at, is worth more than any amount of reading.

Each scenario is a folder with two scripts: `session_a.sql`, the observer where you watch the anomaly's effect, and `session_b.sql`, the concurrent transaction that causes it. You open each in its own CloudBeaver tab — two files means two real connections, which is what makes the concurrency genuine rather than a single transaction pretending to be two. Run Session A, switch tabs, run Session B; built-in `WAITFOR DELAY` / `pg_sleep()` timers interleave them automatically, and Session B restores the original data so every demo is repeatable. Folders ending in `_demo` show the anomaly; the matching `_fix` shows the higher isolation level shutting it down.
