---
title: Magic 8-Ball on Aspire
slug: magic-eight-ball-aspire
description: A Magic 8-Ball built with Aspire and a modern, cloud-friendly toolchain — a FastEndpoints API, a React/Vite front-end, a custom Linux edge gateway, and a full OpenTelemetry stack, practiced end to end through to a Docker Compose deploy.
longDescription: A pet-project that hides a trivial domain (ask a question, get one of the classic 20 answers) behind a production-shaped topology. An ASP.NET Core FastEndpoints API and a React/Vite front-end are orchestrated by Aspire, fronted by a hand-rolled debian-slim nginx edge gateway as the single public entry point, and instrumented through an OpenTelemetry Collector into Prometheus, Tempo, Loki, and Grafana. Everything is declared in C# in the AppHost and publishes to a Docker Compose stack with one command. Companion to the deep-dive post.
tags: ["dotnet", "aspire", "docker", "react", "opentelemetry", "devops"]
githubUrl: https://github.com/axltweek/aspire-magic-eight-ball-app
timestamp: 2026-06-30T00:00:00+00:00
featured: true
---

A Magic 8-Ball is the most trivial domain imaginable: take a question, return one of twenty canned answers. That was the point. I wanted a domain small enough to disappear so the *infrastructure* could be the actual subject — a sandbox to learn [Aspire](https://aspire.dev) properly and practice Docker the way a real deployment forces you to.

📖 **Deep dive:** [Over-Engineering a Magic 8-Ball: An Aspire and Docker Case Study](/blog/dotnet-aspire-docker-pet-project)

## Motivation

I wanted to build something real with modern, cloud-friendly tools and use Aspire to tie them together. Aspire is easy to work with in development — the hard part is delivery. It's cloud-native and Docker-ready, but its defaults are made for local dev, not production; the dashboard is the clearest example — great while coding, but not designed for production at this point, as the Aspire team themselves say. So I put the focus on the deployment: a custom gateway, a JavaScript front-end, my own observability stack, and a real publish to Docker Compose.

## Tech stack

- **Aspire** (AppHost + ServiceDefaults) orchestrates everything and publishes to Docker Compose via the Docker publisher.
- **ASP.NET Core + FastEndpoints** for the API — a thin REPR-style endpoint over a tiny domain core.
- **React + Vite** for the front-end, delivered two different ways: Vite dev server under `aspire run`, and a static nginx build behind a Dockerfile on publish.
- **Custom Linux edge gateway** — a `debian:12-slim` image with nginx as the *single public entry point*, reverse-proxying `/` to the SPA and `/api` to the API. It began as a reset-anytime Linux sandbox (nano, micro, mc, glow, starship, htop/btop, glances, socat) and still works as one — the gateway is just a role it grew into.
- **OpenTelemetry Collector** fanning telemetry out to **Prometheus** (metrics), **Tempo** (traces), and **Loki** (logs), all visualized in **Grafana** with provisioned datasources and dashboards.

## Challenges

The domain was never the hard part. The infrastructure was:

- **Single source of truth for ports.** Hard-coded ports leaked across YAML configs and the AppHost. I extracted them into one `ports.env`, render the observability configs from it with a `powershell-yaml` script at build time, and have the AppHost read the *same* file — one file, both worlds.
- **Aspire hijacking OTLP on publish.** In dev, telemetry flowed to my Collector; published to Compose, every service was silently repointed at Aspire's bundled dashboard ([dotnet/aspire#11298](https://github.com/dotnet/aspire/issues/11298)) and Grafana stayed empty. Fixed in-process with the `ConfigureComposeFile` hook, repointing OTLP back to the Collector at publish time.
- **Configuring the edge gateway.** `listen ${PORT}` to match the port Aspire forwards, `$http_host` to stop a sub-path redirect from dropping the port, and `UsePathBase("/api")` so Scalar and the API work behind a stripped/un-stripped prefix.
- **Two delivery modes for one front-end.** Making the same React app behave under the Vite dev server *and* as a static Dockerfile build meant teaching Vite to take its port from Aspire.
