---
title: "Over-Engineering a Magic 8-Ball: An Aspire and Docker Case Study"
slug: dotnet-aspire-docker-pet-project
description: What I learned building a deliberately over-engineered Magic 8-Ball — a FastEndpoints API and a React/Vite front-end orchestrated by Aspire, fronted by a hand-rolled Linux edge gateway, and instrumented through an OpenTelemetry stack into Grafana.
longDescription: A trivial domain hidden behind a production-shaped topology, built to learn Aspire and practice Docker end to end. This post walks the four parts — an ASP.NET Core FastEndpoints API, a React/Vite front-end delivered two different ways, a custom debian-slim nginx edge gateway, and an open-source OpenTelemetry pipeline (Collector → Prometheus, Tempo, Loki → Grafana) — and is honest about the parts that fought back — a single source of truth for ports, Aspire silently hijacking OTLP on publish, getting the edge gateway's ports and path prefixes right, and an edge image that began life as a Linux sandbox.
tags:
  ["dotnet", "aspire", "docker", "opentelemetry", "react", "devops"]
readTime: 20
featured: true
timestamp: 2026-07-03T00:00:00+00:00
---

A Magic 8-Ball takes a question and returns one of twenty fixed answers. There is no business logic worth the name, no persistence, no interesting edge cases. That is precisely why I chose it. I wanted the domain to vanish so the *infrastructure* could become the subject of study — a controlled environment to learn [Aspire](https://aspire.dev) without a real problem competing for attention, and to practice Docker the way only a real deployment forces you to.

The result is over-engineered on purpose. A twenty-line answer generator sits behind a reverse-proxy gateway, an orchestrator, and a four-backend observability stack. None of that is justified by the domain. All of it is justified by the goal: understand the moving parts well enough to use them in earnest later.

---

## The thesis: let the domain disappear

Aspire is pleasant to work with — the framework itself is not the hard part. The friction shows up at *delivery*. Aspire is cloud-native and Docker-compatible, but its defaults are built for local development, not production. The clearest example is the dashboard: great in development, and not designed for production at this point — as the Aspire team themselves say. So the motivation was to build something real with modern, cloud-friendly tooling and see how far Aspire carries it into a deployment: put a custom gateway in front of everything, wire in a JavaScript front-end, bring my own observability backends, and — the real test — publish the whole thing to Docker Compose and make it work *deployed*, not merely under `aspire run`.

The brief, then, covered four scenarios I wanted to exercise:

1. An **ASP.NET Core** service that is a first-class member of an Aspire solution.
2. A **React** front-end delivered through a **Vite** dev server in development and through a **Dockerfile** on publish-deploy.
3. A **custom Linux distribution** acting as the edge gateway — a pure, hand-written Dockerfile, not an off-the-shelf image.
4. **Open-source container images** for OpenTelemetry export and observability.

---

## The shape of the system

Everything is declared in C# in the Aspire AppHost. There is exactly one public entry point — the edge gateway — and everything else talks over the internal `aspire` network:

<img src="/magic-8-ball-infra.png" alt="Magic 8-Ball infrastructure: the edge gateway in front of the React front-end and the API, with the API's telemetry flowing through the OpenTelemetry Collector into Prometheus, Tempo, and Loki, and visualized in Grafana" style="display:block;margin-left:auto;margin-right:auto;max-width:100%;height:auto;" />

The edge proxies `/` to the SPA and `/api` to the API. The API emits telemetry over the OpenTelemetry Protocol (OTLP) to the Collector, which fans metrics, traces, and logs out to Prometheus, Tempo, and Loki respectively, all surfaced in Grafana. Under `aspire run` these are live containers wired by Aspire; on `aspire publish`/`deploy` the same model is serialized to a `docker-compose.yaml` plus a `.env`.

---

## Part 1 — An ASP.NET Core API that belongs to Aspire

The API is built with [FastEndpoints](https://fast-endpoints.com/). The library keeps things minimal: a single endpoint that takes a request and returns a response, without the overhead of MVC controllers. Inside the AppHost it's a normal `AddProject<>` resource that picks up the standard Aspire `ServiceDefaults` (health checks, resilience, OpenTelemetry wiring) and exposes a single `GET /ask-magic-8-ball`.

The only non-obvious detail is that the API lives behind the gateway under an `/api` prefix, which means it has to be comfortable being addressed both at the root (in dev) and under a stripped prefix (through the proxy). `app.UsePathBase("/api")` plus a careful proxy configuration is what makes the API — and its Scalar/OpenAPI UI — resolve correctly in both cases. More on that in the gateway section, because the prefix is a cross-cutting concern, not an API-local one.

---

## Part 2 — One front-end, two delivery modes

The front-end is a small React app built with Vite. The interesting requirement is that it has to be delivered *two completely different ways* from a single codebase:

- **In development**, Aspire runs the **Vite dev server** so you get Hot Module Replacement (HMR) — instant in-browser updates as you edit, without a full page reload — and the usual inner-loop experience.
- **On publish**, the app is built to static assets and served by **nginx from a Dockerfile** — no Node process in production.

I register it with `AddJavaScriptApp` rather than the Vite-specific helper, because I wanted to own the port explicitly. That decision surfaced a subtlety: the dev server has to listen on the port Aspire assigns, or Aspire's proxy can't reach it. The fix is to make Vite read its port from the environment Aspire provides:

```ts
// vite.config.ts
export default defineConfig({
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: true,
  },
});
```

This is a recurring theme in the project: the same configuration value (a port, a host, an endpoint) has to be agreed upon by tools that don't naturally share state — the orchestrator, the dev server, the proxy, the published compose file. Getting them to agree is most of the work.

---

## Part 3 — A custom Linux distro as the edge gateway

This is the part I enjoyed most, partly because it didn't begin as a gateway at all.

It started as a **Linux sandbox**: a small, reset-anytime `debian:12-slim` image I'd built to practice CLI work and Linux internals. The Dockerfile still reads like a workbench — nginx, the `micro` and `nano` editors, `mc`, `glow` for reading Markdown in the terminal, the `starship` prompt with native shell color, `htop` and `btop`, `glances` for monitoring, and `socat` / `netcat-openbsd` / `iproute2` for poking at sockets and pipes.

When I needed an edge gateway, I didn't reach for a stock nginx image — I promoted the sandbox. A second, slim Dockerfile builds *from* that base image and adds only the gateway's job: an nginx site that reverse-proxies the SPA and the API, plus glances exposed on a `/monitor` sub-path. The sandbox tooling comes along for free, which means the production edge container is also a perfectly good place to `exec` in and look around — a happy side effect of the lineage.

The nginx config is short, but every line is there for a reason:

```nginx
server {
    listen ${PORT};                       # match the port Aspire forwards

    location / {
        proxy_pass ${WEB_HTTP};           # SPA
        proxy_set_header Host $http_host; # keep host:port, don't drop the port
    }

    location /api/ {
        proxy_pass ${APISERVICE_HTTP};    # no trailing slash: keep the /api prefix
        proxy_set_header Host $http_host;
    }

    location /monitor {
        proxy_pass http://127.0.0.1:61208; # glances web UI from the base image
    }
}
```

Three details, three debugging sessions:

- **`listen ${PORT}`** — nginx originally listened on a hard-coded `80`, but Aspire forwards to whatever `PORT` it injects into the container. Hard-coding meant the site simply never answered when deployed.
- **`Host $http_host`** instead of `$host` — with `$host`, a sub-path like `/monitor` triggered a redirect that dropped the port number, and the browser dutifully followed it to the wrong place.
- **`proxy_pass` without a trailing slash on `/api/`** — combined with `UsePathBase("/api")` on the API, this keeps the prefix intact end to end so Scalar and the API routes line up whether you hit them directly or through the proxy.

A custom distro is more to maintain than `nginx:alpine`. For a learning project that *is* the point — owning the whole image is exactly the Docker practice I was after.

---

## Part 4 — Bring-your-own observability

Aspire ships a nice dashboard, but it's meant for development, not production. I wanted the real thing: an open-source pipeline I provisioned myself.

The [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/) (contrib distribution) is the hub. The API ships OTLP to it, and the Collector's pipelines fan the signals out:

- **Metrics** → a Prometheus exporter that Prometheus scrapes.
- **Traces** → Tempo over OTLP.
- **Logs** → Loki over its OTLP endpoint.

[Grafana](https://grafana.com/) sits on top with datasources and a starter dashboard provisioned from files, so the stack comes up already wired — no clicking through the UI to connect Prometheus by hand. Each backend is a standard Aspire `AddContainer` resource with a persistent lifetime so telemetry survives a restart.

This is far more than a Magic 8-Ball needs. But it's the shape of a real observability setup, which is the whole point.

---

## The challenges worth writing down

### A single source of truth for ports

The first real mess was ports. They appeared as literals in the Collector config, in `prometheus.yml`, in `tempo.yaml`, in Grafana's datasources, *and* in the AppHost's endpoint definitions. Change one and you'd hunt the rest by hand.

The fix is a single `ports.env` file — plain `KEY=VALUE` — that two consumers read:

1. A build-time PowerShell script parses the source YAML with the `powershell-yaml` module (no regex — an earlier version did string substitution and it was every bit as fragile as it sounds) and writes rendered configs into a `generated/` folder.
2. The Aspire AppHost reads the **same** `ports.env` so its endpoint ports match what the containers actually listen on.

```csharp
var ports = File.ReadAllLines(Path.Combine(builder.AppHostDirectory, "..",
        "MagicEightBallApp.Infra", "observability", "ports.env"))
    .Select(l => l.Trim())
    .Where(l => l.Length > 0 && !l.StartsWith('#') && l.Contains('='))
    .Select(l => l.Split('=', 2))
    .ToDictionary(p => p[0].Trim(), p => int.Parse(p[1].Trim()));
int Port(string key) => ports[key];
```

One file, both worlds — committed config templates stay separate from generated output, and the generated folder is git-ignored.

### Aspire quietly hijacking OTLP on publish

This one cost the most time and was the most instructive. In development, telemetry flowed neatly to my Collector and Grafana lit up. Published to Compose, the containers came up green — and Grafana showed *nothing*. No traces, no logs.

The cause is a known Aspire behavior ([dotnet/aspire#11298](https://github.com/dotnet/aspire/issues/11298)): the Docker Compose publisher overwrites the app's `OTEL_EXPORTER_OTLP_ENDPOINT` with its own bundled dashboard's address. My explicit "send telemetry to the Collector" setting worked in dev, but on publish Aspire quietly replaced it, so every service sent its telemetry to a dashboard I wasn't even looking at.

Aspire has a clean seam for exactly this: the built-in `ConfigureComposeFile` callback runs after the compose model is built and before it's written, in-process, only when publishing:

```csharp
builder.AddDockerComposeEnvironment("env")
    .ConfigureComposeFile(file =>
    {
        var collector = $"http://otel-collector:{Port("OTEL_OTLP_GRPC_PORT")}";
        foreach (var service in file.Services.Values)
        {
            if (service.Environment?.ContainsKey("OTEL_EXPORTER_OTLP_ENDPOINT") == true)
            {
                service.Environment["OTEL_EXPORTER_OTLP_ENDPOINT"] = collector;
            }
        }
    });
```

It runs only at publish time and never touches the dev experience. A single `aspire deploy` now produces a stack that reports telemetry to the right place.

### Development versus deployment

Most of the bugs came down to one pattern: a value that Aspire resolves one way under `aspire run` and another way on publish. The Vite port, the gateway's `listen` directive, the OTLP endpoint — in each case it worked in development, and only the deployed version showed the problem. The takeaway is simple: test against the published Docker Compose stack, not just the dev run.