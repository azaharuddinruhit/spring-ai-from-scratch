// Shared by Markdown fences (astro.config.mjs) and build-time snippets (src/lib/highlight.ts),
// so every code block on the site gets the same themes and line-highlighting.
import { transformerMetaHighlight } from '@shikijs/transformers';
import catppuccinLatte from '@shikijs/themes/catppuccin-latte';

/**
 * Catppuccin Latte colours that fall below 4.6:1 on the light code background (#f8fafc), darkened in OKLCH with hue and
 * chroma kept until they reach it. Mocha needs no change on the dark code background.
 */
const LATTE_DARKENED = {
  '#7c7f93': '#6d7084', // overlay2, comments
  '#40a02b': '#1f8400', // green, strings
  '#ea76cb': '#b5459a', // pink
  '#fe640b': '#d13800', // peach, numbers
  '#179299': '#007e85', // teal
  '#df8e1d': '#ac5e00', // yellow, types
  '#e64553': '#d43245', // maroon
  '#04a5e5': '#0078b5', // sky, operators
  '#dd7878': '#b45455', // flamingo
  '#dc8a78': '#a85b4b', // rosewater
  '#7287fd': '#5566d9', // lavender
  '#209fb5': '#007d93', // sapphire
};

/** @type {import('shiki').ThemeRegistration} */
const latteAccessible = {
  ...JSON.parse(
    JSON.stringify(catppuccinLatte).replace(/#[0-9a-f]{6}/gi, (hex) => LATTE_DARKENED[hex.toLowerCase()] ?? hex),
  ),
  name: 'catppuccin-latte-accessible',
};

/** @type {{ light: import('shiki').ThemeRegistration, dark: import('shiki').BundledTheme }} */
export const SHIKI_THEMES = { light: latteAccessible, dark: 'catppuccin-mocha' };

/** Fence meta such as ```java {12-14} adds the `highlighted` class to those lines. */
export const SHIKI_TRANSFORMERS = [transformerMetaHighlight()];
