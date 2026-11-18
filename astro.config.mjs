// @ts-check
import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { SHIKI_THEMES, SHIKI_TRANSFORMERS } from './shiki.config.mjs';
import { sectionReadingTime } from './src/lib/section-reading-time.mjs';

// Published as a GitHub Pages project site: https://<owner>.github.io/spring-ai-from-scratch/
export default defineConfig({
  site: 'https://azaharuddinruhit.github.io',
  base: '/spring-ai-from-scratch',
  trailingSlash: 'always',
  integrations: [react(), mdx()],
  markdown: {
    processor: satteri({ mdastPlugins: [sectionReadingTime] }),
    shikiConfig: {
      themes: SHIKI_THEMES,
      defaultColor: false,
      transformers: SHIKI_TRANSFORMERS,
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
