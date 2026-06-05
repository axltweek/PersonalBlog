---
title: Personal Blog
slug: personal-blog
description: My personal blog built with Astro, TailwindCSS, and TypeScript — fully static, zero database, content-as-code.
longDescription: A retro-inspired personal blog built on the Zaggonaut Astro theme, customized with animations, dynamic OG images, and a fully automated deploy pipeline.
tags: ["astro", "typescript", "tailwindcss", "open-source"]
githubUrl: https://github.com/axltweek/PersonalBlog
liveDemoUrl: https://axltweek.netlify.app
timestamp: 2026-06-04T00:00:00+00:00
featured: true
---

## The Idea

Every developer should have a personal blog. Not for SEO, not for clout — just a place to think out loud, document what you've learned, and occasionally rant about CSS.

This blog is that place.

## The Stack

Built on top of the [Zaggonaut](https://github.com/RATIU5/zaggonaut) Astro theme with a bunch of customizations:

- **Astro 6** — static site generation, content collections, file-based routing
- **TailwindCSS v4** — utility-first styling with custom CSS variables
- **TypeScript** — type-safe content schemas via Zod
- **Satori + Sharp** — dynamic OG image generation at build time
- **Netlify** — automatic deploys on every push

## The Content Model

Posts and projects are plain Markdown files with YAML frontmatter. No database, no admin panel, no CMS. Just files in a repo — portable, git-friendly, and future-proof.

## The Customizations

A few things added on top of the base theme:

- Fancy CSS animations throughout the UI
- Dynamic OG images per post and project using Satori
- `PUBLIC_SITE_URL` env var wiring through the entire build pipeline
- Centralized `MetaTags` component to avoid duplication across pages

## The Deploy

Push to GitHub → Netlify builds → site is live. That's it.
