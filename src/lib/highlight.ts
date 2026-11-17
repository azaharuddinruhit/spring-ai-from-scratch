import { codeToHtml } from 'shiki';
import { SHIKI_THEMES, SHIKI_TRANSFORMERS } from '../../shiki.config.mjs';

/**
 * Build-time highlighting for snippets generated from src/data and for code that islands display.
 * Uses the same dual themes and transformers as Markdown fences, so the output follows the site theme.
 * `lines` uses fence-meta syntax without braces, e.g. "3" or "12-14,20".
 */
export function highlight(code: string, lang: string, lines?: string): Promise<string> {
  return codeToHtml(code, {
    lang,
    themes: SHIKI_THEMES,
    defaultColor: false,
    transformers: SHIKI_TRANSFORMERS,
    meta: lines ? { __raw: `{${lines}}` } : undefined,
  });
}
