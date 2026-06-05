---
title: Customizing an Astro Blog Theme
slug: astro-blog-customizations
description: Key technical decisions made while setting up this blog — env vars, dynamic OG images, and a few Astro patterns worth knowing.
longDescription: A walkthrough of the non-trivial customizations made to the Zaggonaut Astro theme — from wiring environment variables through the build pipeline to generating OG images with Satori at build time.
tags: ["astro", "typescript", "satori", "blog"]
readTime: 8
featured: true
timestamp: 2026-06-04T00:00:00+00:00
---

This blog is built on the [Zaggonaut](https://github.com/RATIU5/zaggonaut) Astro theme. It's a solid starting point — retro aesthetic, Content Collections, dark mode out of the box. But a few things needed rethinking before it was ready for production. Here's what changed and why.

## Environment Variable Wiring

The theme had `baseUrl` hardcoded in `configuration.toml`. This meant you'd have to manually update the file before every build — easy to forget, easy to ship the wrong domain.

The fix: a single `PUBLIC_SITE_URL` environment variable that flows through the entire build.

In `astro.config.mjs`, `dotenv` loads the value before Astro initializes — necessary because the config file runs outside Astro's env handling:

```js
import { config } from "dotenv";
config({ path: resolve(__dirname, process.env.NODE_ENV === "production" ? ".env.production" : ".env") });

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL,
  // ...
});
```

In `content.config.ts`, the schema transform overwrites `baseUrl` with the env var and uses it to resolve relative `cardImage` paths to absolute URLs:

```ts
}).transform((data) => {
  const siteUrl = getSiteUrl(data.site.baseUrl);
  const resolve = (path?: string) => resolveUrl(siteUrl, path);
  return {
    ...data,
    site: { ...data.site, baseUrl: siteUrl },
    globalMeta: { ...data.globalMeta, cardImage: resolve(data.globalMeta.cardImage) },
    // ...
  };
});
```

One env var. One change. Everything — sitemap, canonical URLs, OG images, robots.txt — uses the correct domain automatically.

## Dynamic OG Images with Satori

By default the theme uses a static image for all `og:image` tags. Every blog post and project gets the same thumbnail when shared on social media. That's fine for getting started, but not great for engagement.

The solution: generate a unique OG image for each post at build time using [Satori](https://github.com/vercel/satori) and [Sharp](https://sharp.pixelplumbing.com/).

Satori converts a tree of HTML-like elements into SVG. Sharp converts the SVG to PNG. Astro pre-renders the endpoint for each slug via `getStaticPaths`, so the output is just static files in `dist/`.

```ts
// src/pages/og/blog/[slug].png.ts
export async function getStaticPaths() {
  const posts = await getCollection("blog");
  return posts.map((post) => ({
    params: { slug: post.data.slug },
    props: { title: post.data.title, description: post.data.description },
  }));
}

export const GET: APIRoute = async ({ props }) => {
  const svg = await satori({ /* layout */ }, { width: 1200, height: 630, fonts });
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png" },
  });
};
```

Each post gets its own 1200×630 PNG with the post title in the Press Start 2P retro font — consistent with the site's visual identity.

One limitation worth knowing: Satori only supports a subset of CSS. No CSS variables, no grid, limited positioning. Inline styles with hardcoded values only.

## robots.txt as a Dynamic Endpoint

The original `public/robots.txt` had the `Sitemap:` URL hardcoded. Since the domain is now an env var, the file needed to be generated dynamically.

Astro's file-based routing handles this elegantly — any file in `src/pages/` becomes a route, including non-HTML files:

```ts
// src/pages/robots.txt.ts
export const GET: APIRoute = ({ site }) => {
  const body = `User-agent: *\nAllow: /\nSitemap: ${new URL("sitemap-index.xml", site).href}`;
  return new Response(body, { headers: { "Content-Type": "text/plain" } });
};
```

At build time Astro calls this handler, writes the output to `dist/robots.txt`, and deploys it as a static file. The `site` value comes from `astro.config.mjs` which reads from the env var. The chain stays intact.

## MetaTags Component

Every page and layout had an identical block of 12+ meta tags — `og:title`, `og:description`, `og:image`, Twitter cards, canonical, language, and so on. The only difference between pages was which config key they read from.

If you wanted to add a new meta tag — say `og:type` — you'd have to add it in five places.

The fix is a `MetaTags.astro` component that accepts a typed props object:

```astro
---
export type Props = {
  title: string;
  description: string;
  cardImage?: string;
  url: string;
  languageCode: string;
  languageName: string;
  // ...
};
---
<title>{title}</title>
<meta property="og:title" content={title} />
<!-- ... -->
```

Every page now has one line instead of twelve:

```astro
<MetaTags
  title={config.blogMeta.title}
  description={config.blogMeta.description}
  url={`${config.site.baseUrl}/blog`}
  cardImage={config.blogMeta.cardImage ?? `${config.site.baseUrl}/og/blog.png`}
  languageCode={config.site.languageCode}
  languageName={config.site.languageName}
/>
```

## Content Schema Customization

The original `content.config.ts` validated `cardImage` as `z.url()` — meaning only absolute URLs were accepted. Relative paths like `/og-image.webp` would fail Zod validation.

Changing it to `z.string()` and resolving relative paths in the transform makes the config much easier to work with. You can write `/hero.jpg` in your TOML and get `https://yourdomain.com/hero.jpg` in the rendered HTML automatically.

---

None of these changes are dramatic on their own. But together they turn a template into something that behaves predictably across local dev, staging, and production — without manual steps before each deploy.
