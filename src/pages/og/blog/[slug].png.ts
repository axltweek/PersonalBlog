import { getCollection } from "astro:content";
import satori from "satori";
import sharp from "sharp";
import type { APIRoute } from "astro";
import { getConfigurationCollection } from "../../../lib/utils";
import { loadFont, loadDisplayFont } from "../../../lib/og-font";

export async function getStaticPaths() {
  const posts = await getCollection("blog");
  return posts.map((post) => ({
    params: { slug: post.data.slug },
    props: { title: post.data.title, description: post.data.description },
  }));
}

export const GET: APIRoute = async ({ props }) => {
  const { data: config } = await getConfigurationCollection();
  const { title, description } = props as { title: string; description: string };
  const author = config.personal.name;
  const font = await loadFont();
  const displayFont = await loadDisplayFont();

  const svg = await satori(
    {
      type: "div",
      props: {
        style: {
          width: "1200px",
          height: "630px",
          backgroundColor: "#0a0a0a",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "60px",
          fontFamily: "monospace",
        },
        children: [
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                flexDirection: "column",
                gap: "24px",
              },
              children: [
                {
                  type: "div",
                  props: {
                    style: {
                      color: "#eb0dd1",
                      fontSize: "24px",
                      letterSpacing: "4px",
                      textTransform: "uppercase",
                    },
                    children: `${author} / blog`,
                  },
                },
                {
                  type: "div",
                  props: {
                    style: {
                      color: "#f5f5f5",
                      fontSize: title.length > 40 ? "36px" : "48px",
                      fontFamily: "Press Start 2P",
                      lineHeight: "1.6",
                      maxWidth: "1000px",
                    },
                    children: title,
                  },
                },
                {
                  type: "div",
                  props: {
                    style: {
                      color: "#999",
                      fontSize: "28px",
                      maxWidth: "900px",
                    },
                    children: description,
                  },
                },
              ],
            },
          },
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                alignItems: "center",
                gap: "16px",
              },
              children: [
                {
                  type: "div",
                  props: {
                    style: {
                      width: "60px",
                      height: "3px",
                      backgroundColor: "#eb0dd1",
                    },
                  },
                },
                {
                  type: "div",
                  props: {
                    style: {
                      color: "#666",
                      fontSize: "22px",
                      letterSpacing: "2px",
                    },
                    children: `${author}`,
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: "IBM Plex Mono",
          data: font,
          weight: 400,
          style: "normal",
        },
        {
          name: "Press Start 2P",
          data: displayFont,
          weight: 400,
          style: "normal",
        },
      ],
    }
  );

  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
