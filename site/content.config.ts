import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const docs = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./site/src/content/docs" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    group: z.enum([
      "Getting Started",
      "Guides",
      "API Reference",
      "Reference",
      "Development",
      "Specifications",
    ]),
    order: z.number().int(),
    section: z.string().optional(),
  }),
});

export const collections = { docs };
