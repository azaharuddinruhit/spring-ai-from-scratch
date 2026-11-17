import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Entry ids look like "01-foundations/chatclient-fluent-api" and must match src/data/curriculum.ts.
const lessons = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/lessons' }),
  schema: z.object({
    description: z.string(),
  }),
});

export const collections = { lessons };
