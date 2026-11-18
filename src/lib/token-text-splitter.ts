/**
 * A line-for-line port of Spring AI 2.0.2's TokenTextSplitter.doSplit and TextSplitter's chunk metadata,
 * so the ETL lab shows the chunks the real class produces. The encoder must be cl100k_base, the
 * splitter's default (jtokkit in Java, js-tiktoken here: same ranks, same pre-tokenizer pattern).
 * Assumes a Linux server, where System.lineSeparator() is "\n".
 */

export interface Encoder {
  encode(text: string): number[];
  decode(tokens: number[]): string;
}

export interface SplitterSettings {
  chunkSize: number;
  minChunkSizeChars: number;
  minChunkLengthToEmbed: number;
  maxNumChunks: number;
  keepSeparator: boolean;
  punctuationMarks: string[];
}

export const DEFAULT_SETTINGS: SplitterSettings = {
  chunkSize: 800,
  minChunkSizeChars: 350,
  minChunkLengthToEmbed: 5,
  maxNumChunks: 10_000,
  keepSeparator: true,
  punctuationMarks: ['.', '?', '!', '\n'],
};

/** Why a chunk ended where it did, for the lab's explanation. */
export type ChunkEnd = 'punctuation' | 'token-limit' | 'end-of-text' | 'remainder';

export interface SplitStep {
  /** Tokens taken from the remaining text for this step. */
  windowTokens: number;
  /** Tokens actually consumed (the truncated text, re-encoded). */
  consumedTokens: number;
  text: string;
  end: ChunkEnd;
  /** For a 'punctuation' end: the mark the chunk was cut after. */
  mark?: string;
  /** Set when the chunk was dropped: whitespace only, or not longer than minChunkLengthToEmbed. */
  dropped?: 'blank' | 'too-short';
}

/** Java's String.trim(): strips every char <= U+0020 from both ends, and nothing else. */
export function javaTrim(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && s.charCodeAt(start) <= 32) start++;
  while (end > start && s.charCodeAt(end - 1) <= 32) end--;
  return s.slice(start, end);
}

/** Runs doSplit and records every step, including the chunks it drops. */
export function splitSteps(text: string, settings: SplitterSettings, encoder: Encoder): SplitStep[] {
  const steps: SplitStep[] = [];
  if (javaTrim(text) === '') return steps;

  let tokens = encoder.encode(text);
  let numChunks = 0;
  while (tokens.length > 0 && numChunks < settings.maxNumChunks) {
    const chunk = tokens.slice(0, Math.min(settings.chunkSize, tokens.length));
    let chunkText = encoder.decode(chunk);
    if (javaTrim(chunkText) === '') {
      steps.push({ windowTokens: chunk.length, consumedTokens: chunk.length, text: chunkText, end: 'token-limit', dropped: 'blank' });
      tokens = tokens.slice(chunk.length);
      continue;
    }
    let end: ChunkEnd = tokens.length > settings.chunkSize ? 'token-limit' : 'end-of-text';
    let mark: string | undefined;
    if (tokens.length > settings.chunkSize) {
      const lastPunctuation = Math.max(-1, ...settings.punctuationMarks.map((m) => chunkText.lastIndexOf(m)));
      if (lastPunctuation !== -1 && lastPunctuation > settings.minChunkSizeChars) {
        mark = chunkText[lastPunctuation];
        chunkText = chunkText.substring(0, lastPunctuation + 1);
        end = 'punctuation';
      }
    }
    const toAppend = settings.keepSeparator ? javaTrim(chunkText) : javaTrim(chunkText.replaceAll('\n', ' '));
    const consumed = encoder.encode(chunkText).length;
    steps.push({
      windowTokens: chunk.length,
      consumedTokens: consumed,
      text: toAppend,
      end,
      mark,
      dropped: toAppend.length > settings.minChunkLengthToEmbed ? undefined : 'too-short',
    });
    tokens = tokens.slice(consumed);
    numChunks++;
  }
  if (tokens.length > 0) {
    const remaining = javaTrim(encoder.decode(tokens).replaceAll('\n', ' '));
    steps.push({
      windowTokens: tokens.length,
      consumedTokens: tokens.length,
      text: remaining,
      end: 'remainder',
      dropped: remaining.length > settings.minChunkLengthToEmbed ? undefined : 'too-short',
    });
  }
  return steps;
}

/** The chunk texts TokenTextSplitter returns. */
export function split(text: string, settings: SplitterSettings, encoder: Encoder): string[] {
  return splitSteps(text, settings, encoder)
    .filter((step) => !step.dropped)
    .map((step) => step.text);
}
