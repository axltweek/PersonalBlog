---
title: IP Addresses & Subnet Masks — Cheatsheet
slug: ip-addresses-and-masks
description: From private IP ranges to CIDR notation and VPC design — the networking fundamentals worth having in your head.
longDescription: A ground-up walkthrough of IPv4 addressing — why 10.x, 172.16.x, and 192.168.x exist, how subnet masks work via bitwise AND, CIDR notation, and how to apply all of it when designing cloud VPC address spaces.
tags: ["networking", "vpc", "aws", "fundamentals"]
readTime: 10
featured: true
timestamp: 2026-06-10T00:00:00+00:00
---

IPv4 gives you 32 bits — about 4.3 billion possible addresses. That sounds like a lot until you realize the internet formally ran out of them in 2011. The solution that keeps everything working is private address spaces, NAT, and subnetting. Here's how it all fits together.

## The Structure of an IPv4 Address

An IP address is a 32-bit number written as four decimal **octets** (8 bits each) separated by dots:

<div style="display:flex;flex-wrap:nowrap;align-items:center;gap:8px;border:1px solid color-mix(in srgb,currentColor 15%,transparent);border-radius:8px;padding:12px 16px;margin:1.25rem 0;font-family:'IBM Plex Mono',ui-monospace,monospace;overflow-x:auto;">
  <div style="text-align:center;white-space:nowrap;flex-shrink:0;">
    <div style="font-size:1.1rem;font-weight:700;">192.168.1.10</div>
    <div style="font-size:0.7rem;opacity:0.5;margin-top:2px;text-transform:uppercase;letter-spacing:0.05em;">Dotted-decimal</div>
  </div>
  <div style="opacity:0.4;font-size:1.2rem;flex-shrink:0;">=</div>
  <div style="text-align:center;white-space:nowrap;flex-shrink:0;">
    <div style="font-size:0.85rem;font-weight:700;color:#eb0dd1;">11000000.10101000.00000001.00001010</div>
    <div style="font-size:0.7rem;opacity:0.5;margin-top:2px;text-transform:uppercase;letter-spacing:0.05em;">Binary</div>
  </div>
  <div style="opacity:0.4;font-size:1.2rem;flex-shrink:0;">=</div>
  <div style="text-align:center;white-space:nowrap;flex-shrink:0;">
    <div style="font-size:1.1rem;font-weight:700;">0xC0A8010A</div>
    <div style="font-size:0.7rem;opacity:0.5;margin-top:2px;text-transform:uppercase;letter-spacing:0.05em;">Hexadecimal</div>
  </div>
</div>

Each octet ranges 0–255. Under the hood it's just a number — `192.168.1.10` is `0xC0A8010A` is `11000000.10101000.00000001.00001010`. The dotted-decimal form is purely for human readability.

## Why 10.x, 172.16.x, and 192.168.x?

**RFC 1918** (1996) reserved three ranges as *private* — they're never routed on the public internet. Millions of networks can all use `192.168.1.x` internally without conflicting, because those packets never leave the local network. A router doing **NAT** (Network Address Translation) swaps the private source IP for its own public IP before forwarding, and reverses the mapping on replies.

| Notation | CIDR | Full Range | Size | Typical use |
|---|---|---|---|---|
| 10.x.x.x | 10.0.0.0/8 | 10.0.0.0 – 10.255.255.255 | ~16.7M addresses | Large enterprise, cloud VPCs |
| 172.16.x – 172.31.x | 172.16.0.0/12 | 172.16.0.0 – 172.31.255.255 | ~1M addresses | Medium networks |
| 192.168.x.x | 192.168.0.0/16 | 192.168.0.0 – 192.168.255.255 | ~65K addresses | Home routers, small offices |

One gotcha: unlike `10.x.x.x` where the entire range is private, `172.x.x.x` is only partially private. The rule is simple — if the second number is between 16 and 31, it's private. If it's anything else, it's a public address on the internet.

## Special & Reserved IPv4 Addresses

Beyond the three private ranges, a handful of IPv4 addresses have fixed, well-known meanings baked into every operating system and router. You'll run into these constantly.

| Address / Range | Name | What it means |
|---|---|---|
| 127.0.0.1 | Loopback | "Talk to myself." Traffic never leaves the machine. `localhost` resolves here. |
| 127.0.0.0/8 | Loopback block | The entire range is loopback — not just `127.0.0.1`. |
| 0.0.0.0 | Unspecified | "Any address on this machine." Used by servers to listen on all interfaces. Also means the default route. |
| 255.255.255.255 | Limited broadcast | Send to every device on the local network. Routers don't forward it. |
| 169.254.0.0/16 | Link-local (APIPA) | Auto-assigned when DHCP fails. If your device shows a `169.254.x.x` address, it couldn't reach a DHCP server. |
| 224.0.0.0/4 | Multicast | Send to a group of interested devices at once — used by routing protocols, mDNS, video streaming. |
| 100.64.0.0/10 | Shared address space | Reserved for ISP carrier-grade NAT (CGN). You might see these if your ISP uses double-NAT. |

## Well-Known Public IPs

Some public IPs are famous enough that engineers just know them by heart. The most recognizable ones are DNS resolvers — servers you can point any device at to resolve domain names. They're deliberately assigned memorable addresses.

| IP | Provider | Notes |
|---|---|---|
| 8.8.8.8 | Google DNS | The most recognised public DNS on the planet |
| 8.8.4.4 | Google DNS | Secondary |
| 1.1.1.1 | Cloudflare | Fastest public resolver; also hardest IP to forget |
| 1.0.0.1 | Cloudflare | Secondary |
| 9.9.9.9 | Quad9 | Security-focused, blocks malicious domains |
| 149.112.112.112 | Quad9 | Secondary |
| 208.67.222.222 | OpenDNS (Cisco) | One of the oldest public resolvers |
| 208.67.220.220 | OpenDNS (Cisco) | Secondary |
| 4.2.2.1 | Level3 / Lumen | Unofficial but widely used for decades |
| 4.2.2.2 | Level3 / Lumen | Secondary |
| 64.6.64.6 | Verisign | Privacy-focused, no logs |
| 64.6.65.6 | Verisign | Secondary |
| 84.200.69.80 | DNS.Watch | No filtering, no logging |
| 185.228.168.9 | CleanBrowsing | Family-safe filtering |
| 76.76.19.19 | Alternate DNS | Ad-blocking resolver |

Notice that `1.1.1.1` and `9.9.9.9` are technically public addresses — they just happen to look like they could be private. They're not. Any IP outside the three RFC 1918 ranges is fair game for public assignment, and Cloudflare and Quad9 specifically chose those addresses for their memorability.

## How Subnet Masks Work

A subnet mask is a 32-bit value that splits an IP into two parts: the **network portion** (which network?) and the **host portion** (which device on that network?). It's always a block of 1s on the left followed by all 0s:

```astro
255.255.255.0  →  11111111.11111111.11111111.00000000
```

To find what network an address belongs to, you AND the IP with the mask. Every bit where the mask is 1 is kept; where the mask is 0, it's zeroed out:

```astro
192.168.1.42   →  11000000.10101000.00000001.00101010
255.255.255.0  →  11111111.11111111.11111111.00000000
              AND
192.168.1.0    →  11000000.10101000.00000001.00000000
```

That result — `192.168.1.0` — is the network address. Every device on the `192.168.1.x` subnet will AND to the same value, which is how a router knows they're local to each other.

When a device wants to send a packet, it does this check:
- AND its own IP with its mask → own network
- AND the destination IP with the same mask → destination network
- If they match → send directly. If not → send to the default gateway.

## CIDR Notation

Writing out `255.255.255.0` every time is verbose. **CIDR** (Classless Inter-Domain Routing) notation compresses it to a prefix length after a slash — the count of leading 1-bits in the mask:

```astro
192.168.1.0/24   ≡   192.168.1.0 with mask 255.255.255.0
10.0.0.0/8       ≡   10.0.0.0 with mask 255.0.0.0
```

The prefix tells you how many addresses you get. The remaining bits after the slash are yours to fill — and each bit doubles the count. So `/24` leaves you 8 bits → 2⁸ = 256 addresses. `/16` leaves 16 bits → 2¹⁶ = 65,536 addresses.

But two of those are always taken: the first address identifies the network itself, and the last one is the broadcast address (used to shout at every device at once). You can't assign either to a real device, so the actual usable count is always total minus 2. A `/24` gives you 256 − 2 = **254 real hosts**.

Each +1 to the prefix **halves** the address space. Common sizes worth memorizing:

| CIDR | Mask | Usable hosts | Use case |
|---|---|---|---|
| /8 | 255.0.0.0 | 16,777,214 | Entire 10.x.x.x block |
| /16 | 255.255.0.0 | 65,534 | Large VPC, campus network |
| /24 | 255.255.255.0 | 254 | Typical LAN subnet |
| /28 | 255.255.255.240 | 14 | Small cloud subnet (bastion hosts) |
| /30 | 255.255.255.252 | 2 | Point-to-point link between routers |
| /32 | 255.255.255.255 | 1 (host route) | Firewall rules, single host |

## Best Practices for IP Address Planning

Whether you're configuring a home lab or designing a cloud environment, get this right once — re-numbering a network later is painful.

**Pick a non-overlapping range.** If your company connects to partners or remote employees via VPN, every endpoint's private range must be unique. Using `192.168.1.0/24` everywhere will cause routing conflicts the moment someone tunnels in. The `10.x.x.x` space is large enough to carve unique ranges for every environment.

**Size the parent block generously.** Choose a large block (say `/16`) for an entire environment and carve it into smaller subnets. Changing the parent block is a painful migration; running out of space in a subnet and having to re-CIDR is equally painful.

**Separate concerns with subnets.** Don't put servers, user devices, and IoT on the same `/24`. Segmentation limits blast radius if one layer is compromised. Use separate subnets for separate security tiers.

**Document your conventions.** Decide once: `.1` is always the gateway, `.2–.9` reserved for infrastructure, `.10–.199` DHCP pool, `.200+` static devices. Write it down and keep it consistent.

**Avoid `192.168.1.0/24` for corporate networks.** It's the factory default for nearly every consumer router. VPN users coming in from home hit immediate routing conflicts.

## Applying This to Cloud VPCs

AWS, GCP, and Azure VPCs are private networks — the same fundamentals apply. A few cloud-specific wrinkles:

**Each cloud reserves addresses per subnet.** AWS reserves 5 addresses (first 4 + last 1). A `/24` gives you 251 usable addresses, not 254. GCP and Azure have similar reservations.

**A recommended layout for a `/16` VPC** (e.g. `10.10.0.0/16`): use `/24` subnets per tier and availability zone.

```astro
10.10.0.0/24   →  Public AZ-A   (load balancers, NAT gateways)
10.10.1.0/24   →  Public AZ-B
10.10.10.0/24  →  App AZ-A     (EC2, ECS, Lambda)
10.10.11.0/24  →  App AZ-B
10.10.20.0/24  →  Data AZ-A    (RDS, ElastiCache)
10.10.21.0/24  →  Data AZ-B
```

**For multi-account setups**, assign a unique `/16` per environment so routing tables stay trivial and peering never collides:

```astro
10.10.0.0/16  →  dev
10.20.0.0/16  →  staging
10.30.0.0/16  →  prod
```

## IPv6 — Same Idea, Bigger Space

IPv4 ran out of addresses. IPv6 is the fix — same conceptual model, but scaled up massively. Instead of 32 bits it uses **128 bits**, written as eight groups of four hex digits separated by colons. Each group is 4 hex digits (0–9, a–f), so values go up to `ffff` (65535) per group, not 255.

```astro
2001:0db8:85a3:0000:0000:8a2e:0370:7334
```

Two shorthand rules keep addresses readable. Leading zeros in any group can be dropped (`0db8` → `db8`), and one consecutive run of all-zero groups can be collapsed to `::`:

```astro
2001:0db8:0000:0000:0000:0000:0000:0001
→  2001:db8::1
```

**CIDR works exactly the same.** The prefix length still tells you how many bits are the network portion. `/64` is the standard subnet size for a LAN — that leaves 64 bits for hosts, which is 2⁶⁴ addresses per subnet (roughly 18 quintillion).

```astro
2001:db8:abcd:0012::/64   →  network prefix (first 64 bits)
    xxxx:xxxx:xxxx:xxxx   →  host portion (last 64 bits)
```

**Private and special ranges mirror IPv4's structure:**

| Range | Type | IPv4 equivalent |
|---|---|---|
| fc00::/7 | ULA — Unique Local (private) | 10.x.x.x / 172.16.x / 192.168.x |
| fe80::/10 | Link-local (auto-assigned) | 169.254.0.0/16 |
| ::1/128 | Loopback | 127.0.0.1 |
| ::/0 | Default route | 0.0.0.0/0 |

**In cloud VPCs**, IPv6 is typically assigned alongside IPv4 (dual-stack). AWS, GCP, and Azure all support it — you get a `/56` or `/64` block per subnet, and the same tier/AZ layout pattern applies.

The address space is large enough that NAT isn't needed — every device can have a globally unique public IPv6 address. Private ULA ranges still exist but are used mainly for networks that genuinely need to stay isolated.

---

## Interactive IP Toolkit

The tool below has three tabs: a **Subnet Calculator** (enter any IP + mask, see all derived values), a **Binary Visualizer** (see the AND operation bit-by-bit), and a **VPC Subnet Planner** (split a parent CIDR into subnets).

<iframe
  src="/ip-toolkit.html"
  width="100%"
  height="850"
  style="border:none;border-radius:8px;margin:1.5rem 0;display:block;"
  title="IP Toolkit — Subnet Calculator, Binary Visualizer, VPC Planner"
  loading="lazy"
></iframe>
