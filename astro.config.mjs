// @ts-check

import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { config } from "dotenv";

import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, process.env.NODE_ENV === "production" ? ".env.production" : ".env") });
const PUBLIC_SITE_URL = process.env.PUBLIC_SITE_URL;

// https://astro.build/config
export default defineConfig({
  site: PUBLIC_SITE_URL,
  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [sitemap()],
});
