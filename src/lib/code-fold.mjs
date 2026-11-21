// Which lines of a code file fold away: a long file shows its key (highlighted) lines with a few lines around them, and each
// longer run of other lines folds into one "⋯ N lines" row. `CodeFile` folds with it and the reading-time plugin counts only
// the lines that stay visible, so both agree. Files without key lines never fold.

/** Files shorter than this always show in full. */
const MIN_LINES = 25;
/** Lines kept above and below each key line. */
const CONTEXT = 3;
/** A shorter run of hidden lines isn't worth a fold row, so it stays visible. */
const MIN_RUN = 4;

/** The line numbers (1-based) in fence meta such as `{12-14,20}`, as Shiki's meta highlight reads them. */
export function metaLines(meta) {
  const ranges = /\{([\d,\s-]+)\}/.exec(meta ?? '')?.[1];
  const found = new Set();
  for (const part of ranges?.split(',') ?? []) {
    const [from, to = from] = part.trim().split('-').map(Number);
    for (let n = from; n <= to; n++) if (n > 0) found.add(n);
  }
  return found;
}

/** The runs of lines to fold, as [first, last] line numbers (1-based, inclusive), for a file of `total` lines. */
export function foldRuns(total, keyLines) {
  if (total < MIN_LINES || keyLines.size === 0) return [];
  const runs = [];
  let start = 0;
  for (let n = 1; n <= total + 1; n++) {
    const near = n <= total && [...keyLines].some((key) => Math.abs(key - n) <= CONTEXT);
    if (!near && n <= total) {
      start ||= n;
    } else if (start) {
      if (n - start >= MIN_RUN) runs.push([start, n - 1]);
      start = 0;
    }
  }
  return runs;
}

/** True when line `n` is inside one of the runs. */
export function isFolded(runs, n) {
  return runs.some(([first, last]) => n >= first && n <= last);
}
