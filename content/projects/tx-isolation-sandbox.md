---
title: Transaction Isolation Sandbox
slug: tx-isolation-sandbox
description: A Docker playground for triggering every classic concurrency anomaly — live, on PostgreSQL and SQL Server, side by side — and watching the fix work.
longDescription: A one-command Docker Compose environment (PostgreSQL 16, SQL Server 2022, and CloudBeaver as a single web SQL IDE) with scripted, runnable scenarios for dirty reads, non-repeatable reads, phantoms, lost updates, and write skew — plus snapshot isolation and RCSI. Each anomaly is two scripts you run as two real concurrent sessions, with the demo and its fix side by side and the two engines compared throughout. Companion to the Transaction Isolation Levels post.
tags: ["postgresql", "mssql", "docker", "database", "transactions", "devtools"]
timestamp: 2026-06-18T00:00:00+00:00
githubUrl: https://github.com/axltweek/TransactionIsolationLevels
featured: true
---

A `docker compose up` away from a working lab where you can **trigger** each concurrency anomaly — not just read about it — on PostgreSQL and SQL Server at the same time, and watch the higher isolation level shut it down.

The full setup, connection details, and per-scenario walkthrough live in the repo's README; this is the short story of why it exists and what building it taught me.

📖 **Deep dive:** [Transaction Isolation Levels — What Your Database Does When Nobody's Watching](/blog/transaction-isolation-levels)

## Motivation

Isolation levels are the kind of topic you think you understand until you have to predict what two concurrent transactions will actually do to each other. The documentation describes the anomalies abstractly and the engines describe their guarantees in standard vocabulary they then implement differently. I wanted something you could *run*: hit "execute" in one session, "execute" in another, and see the dirty read or the lost update happen — then raise the isolation level and watch it disappear. Doing it for PostgreSQL and SQL Server in parallel makes the divergences impossible to miss.

## Tech stack

- **PostgreSQL 16** and **SQL Server 2022 Express**, each seeded with the same little schema (accounts, products, on-call doctors).
- **CloudBeaver Community** as a single browser-based SQL IDE that talks to both engines.
- **Docker Compose** wires it together — databases, the web IDE, pre-listed connections, and the scenario scripts surfaced directly in CloudBeaver's Resource Manager.
- Each anomaly is a folder with two scripts — `session_a.sql` (the observer) and `session_b.sql` (the interferer) — run on two separate connections. Built-in `WAITFOR DELAY` / `pg_sleep()` timers interleave them, so you switch tabs and run, instead of racing a stopwatch. Every anomaly ships a `_demo` and a `_fix`.

## Challenges

The interesting parts were rarely the SQL itself:

- **Real concurrency inside a GUI.** CloudBeaver shares one database session across all tabs of the *same* connection — so "two tabs" quietly run serially and every demo silently fails. The fix is two distinct connections (a dedicated Session A and Session B) so there are genuinely two backend sessions.
- **Deterministic interleaving.** Rather than manual step-by-step clicking, each session self-paces with delays tuned so a human comfortably has time to start the second script inside the first's window.
- **Aborted-transaction traps.** A serialization failure in Postgres poisons the whole transaction — every later statement returns `25P02` until you roll back. The fix scenarios catch the `40001` in a PL/pgSQL block (the real-world "retry" pattern) so the transaction ends cleanly. On SQL Server the deadlock victim is made deterministic with `SET DEADLOCK_PRIORITY`.
- **Provisioning CloudBeaver.** The admin and the connection definitions are shipped via env vars and a tracked config file — but CloudBeaver encrypts saved passwords per workspace, so the database password can't be baked in and is entered once. That's a tool limitation, not an oversight.
- **Idempotent seeding.** SQL Server has no `/docker-entrypoint-initdb.d` equivalent, so a one-shot init container seeds it; the script is guarded so re-running `up` never duplicates data.

## Trade-offs

- **Free and Community-only.** CloudBeaver CE means no pre-saved credentials and a one-time password entry — accepted in exchange for a zero-cost, clone-and-run setup.
- **Bind mounts over named volumes**, so the scripts live in the repo and stay editable. The SQL editor's autosave sometime can corrupt the script file due to auto save so you can turn-off this feature in the docker compose file.
- **Two engines doubled the surface area** (T-SQL vs PL/pgSQL, locking vs MVCC), but that contrast is the entire point of the project.
