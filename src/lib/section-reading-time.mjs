// Estimates how long each `## ` section of a lesson takes to read, for the label under each heading and the "On this page"
// list. Prose counts by words, code and diagrams by lines; a sandbox counts only the text around it. Code counts only the
// lines that stay visible when a long file folds to its key lines (`code-fold.mjs`).
import { foldRuns, isFolded, metaLines } from './code-fold.mjs';

const WORDS_PER_MINUTE = 200;
const CODE_LINES_PER_MINUTE = 20;

/** Sätteri mdast plugin: puts the minutes in `sectionMinutes` (one per h2, in order) and a label under each h2. */
export const sectionReadingTime = {
  name: 'section-reading-time',
  before(root, context) {
    const sections = [];
    for (const node of root.children) {
      if (node.type === 'heading' && node.depth === 2) {
        sections.push({ heading: node, words: 0, codeLines: 0 });
      } else if (sections.length > 0) {
        count(node, sections.at(-1));
      }
    }

    const minutes = sections.map(({ words, codeLines }) =>
      Math.max(1, Math.ceil(words / WORDS_PER_MINUTE + codeLines / CODE_LINES_PER_MINUTE)),
    );
    context.data.astro.frontmatter.sectionMinutes = minutes;
    sections.forEach(({ heading }, index) =>
      context.insertAfter(heading, { raw: `<p class="section-time">${minutes[index]} min read</p>` }),
    );
  },
};

function count(node, section) {
  if (node.name === 'MoreGotchas') {
    return; // folded away for a first read, like folded code
  } else if (node.type === 'code') {
    section.codeLines += visibleLines(node.value, metaLines(node.meta));
  } else if (node.type === 'text' || node.type === 'inlineCode') {
    section.words += words(node.value);
  } else {
    const keyLines = metaLines(`{${attributeValue(node, 'lines') ?? ''}}`);
    for (const attribute of node.attributes ?? []) {
      const value = attribute.value?.value ?? attribute.value;
      if (attribute.name === 'title' && typeof value === 'string') {
        section.words += words(value); // a Gotcha's heading
      } else if (attribute.name === 'code' && typeof value === 'string' && value.startsWith('`')) {
        section.codeLines += visibleLines(value, keyLines); // a diagram or a code file written inline
      }
    }
    node.children?.forEach((child) => count(child, section));
  }
}

function words(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function attributeValue(node, name) {
  const attribute = node.attributes?.find((a) => a.name === name);
  const value = attribute?.value?.value ?? attribute?.value;
  return typeof value === 'string' ? value : undefined;
}

/** Non-blank lines, leaving out those a long code file folds away. */
function visibleLines(code, keyLines) {
  const all = code.split('\n');
  const runs = foldRuns(all.length, keyLines);
  return all.filter((line, index) => line.trim() && line.trim() !== '`' && !isFolded(runs, index + 1)).length;
}
