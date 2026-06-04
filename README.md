```
         ██████╗ ███████╗██████╗ ███████╗ ██████╗ ███╗   ██╗ █████╗ ██╗     
         ██╔══██╗██╔════╝██╔══██╗██╔════╝██╔═══██╗████╗  ██║██╔══██╗██║     
         ██████╔╝█████╗  ██████╔╝███████╗██║   ██║██╔██╗ ██║███████║██║     
         ██╔═══╝ ██╔══╝  ██╔══██╗╚════██║██║   ██║██║╚██╗██║██╔══██║██║     
         ██║     ███████╗██║  ██║███████║╚██████╔╝██║ ╚████║██║  ██║███████╗
         ╚═╝     ╚══════╝╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝
                                                                            
                         ██████╗ ██╗      ██████╗  ██████╗                  
                         ██╔══██╗██║     ██╔═══██╗██╔════╝                  
                         ██████╔╝██║     ██║   ██║██║  ███╗                 
                         ██╔══██╗██║     ██║   ██║██║   ██║                 
                         ██████╔╝███████╗╚██████╔╝╚██████╔╝                 
                         ╚═════╝ ╚══════╝ ╚═════╝  ╚═════╝                  
                                                                   
```
> **Built with [Astro](https://astro.build) and the [Zaggonaut](https://github.com/RATIU5/zaggonaut) theme.**

## Requirements

- Node.js v22+
- pnpm

## Getting Started

```bash
pnpm install
pnpm dev
```

The dev server runs at `http://localhost:4321` by default.

## Environment Variables

Create a `.env` file in the project root:

```
PUBLIC_SITE_URL=http://localhost:4321
```

For production, set `PUBLIC_SITE_URL` to your actual domain before building.

## Configuration

All site settings live in `content/configuration.toml` — name, bio, social links, page metadata, and navigation.

## Adding Content

**Blog post** — create a `.md` file in `content/blogs/`:

```markdown
---
title: My Post Title
description: Short description for SEO and previews.
timestamp: 2026-06-03
tags: ["astro", "web"]
featured: false
---

Post content here...
```

**Project** — create a `.md` file in `content/projects/`:

```markdown
---
title: My Project
description: What this project does.
timestamp: 2026-06-03
githubUrl: https://github.com/you/project
liveDemoUrl: https://project.example.com
tags: ["typescript"]
featured: false
---

Project details here...
```

## Building for Production

```bash
pnpm build
pnpm preview
```
