/*
 * A small highlighter for the code the sandboxes generate at runtime, so islands don't ship Shiki. It colours tokens the way
 * Shiki's grammars do with the site's themes (shiki.config.mjs): the light colours are the darkened Catppuccin Latte ones and
 * the dark colours are Mocha. Keep them in sync with that file.
 */

export type CodeLang = 'java' | 'sql' | 'json';

type Kind =
  | 'keyword'
  | 'type'
  | 'declaration'
  | 'method'
  | 'parameter'
  | 'string'
  | 'escape'
  | 'constant'
  | 'literal'
  | 'operator'
  | 'punctuation'
  | 'comment'
  | 'key';

/** [light, dark] per token kind, read from Shiki's output for Java, SQL and JSON. */
const COLORS: Record<Kind, [string, string]> = {
  keyword: ['#8839ef', '#cba6f7'],
  type: ['#8839ef', '#cba6f7'],
  declaration: ['#ac5e00', '#f9e2af'], // the name in a class, record, enum or interface declaration
  parameter: ['#d43245', '#eba0ac'],
  method: ['#1e66f5', '#89b4fa'],
  key: ['#1e66f5', '#89b4fa'],
  string: ['#1f8400', '#a6e3a1'],
  escape: ['#b5459a', '#f5c2e7'],
  constant: ['#d13800', '#fab387'], // numbers, annotations, JSON literals
  literal: ['#d20f39', '#f38ba8'], // true, false, null, this, super
  operator: ['#007e85', '#94e2d5'], // also instanceof and enum constants
  punctuation: ['#6d7084', '#9399b2'],
  comment: ['#6d7084', '#9399b2'],
};

/** A token without a colour is plain text, which CodeView shows in --code-fg, the theme's foreground. */
export interface Token {
  text: string;
  color?: [string, string];
}

const JAVA_KEYWORDS = new Set(
  'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import int interface long native new package private protected public record return sealed short static strictfp switch synchronized throw throws transient try var void volatile while yield'.split(
    ' ',
  ),
);
const JAVA_LITERALS = new Set(['true', 'false', 'null', 'this', 'super']);
const SQL_KEYWORDS = new Set(
  'select from where and or not as order by limit insert into values on conflict do update set delete create table if exists primary key default null is in like distinct group having join left inner using index returning'.split(
    ' ',
  ),
);

function java(code: string): Token[] {
  const out: Token[] = [];
  const push = (text: string, kind?: Kind) => out.push({ text, color: kind && COLORS[kind] });
  const pushString = (text: string) => text.split(/(\\.)/).forEach((part, i) => part && push(part, i % 2 ? 'escape' : 'string'));
  const rule =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("""[\s\S]*?"""|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])')|(@[A-Za-z_][\w.]*)|(\b\d[\d_]*(?:\.\d+)?[lLfFdD]?\b)|([A-Za-z_$][\w$]*)|(->|::|[+\-*/%=!&|^~?:<>]+)|([()[\]{}.,;])|(\s+)|([\s\S])/g;
  let previous = ''; // the last token that isn't whitespace
  let afterType = false; // the last token ended a type, so a name that follows is being declared
  let genericDepth = 0;
  let parenDepth = 0;
  let declaring = ''; // class, record, enum or interface, until its name is read
  let recordHeader = -1; // paren depth of a record's component list, whose names Shiki leaves plain
  let enumBody = false;
  let qualified = ''; // package or import, until the semicolon
  for (let m; (m = rule.exec(code)); ) {
    const [text, comment, string, annotation, number, word, operator, punctuation, space] = m;
    if (space) {
      push(text);
      continue;
    }
    const rest = code.slice(rule.lastIndex);
    let type = false;
    if (comment) push(text, 'comment');
    else if (string) pushString(text);
    else if (annotation || number) push(text, 'constant');
    else if (word) {
      if (previous === '.' && word === 'class') push(text);
      else if (qualified) push(text, qualified === 'package' || word === 'static' ? 'keyword' : undefined);
      else if (JAVA_LITERALS.has(word)) push(text, 'literal');
      else if (word === 'instanceof') push(text, 'operator');
      else if (JAVA_KEYWORDS.has(word)) {
        push(text, 'keyword');
        if (['class', 'record', 'enum', 'interface'].includes(word)) declaring = word;
        if (word === 'package' || word === 'import') qualified = word;
      } else if (declaring) {
        push(text, 'declaration');
        if (declaring === 'record') recordHeader = parenDepth + 1;
        if (declaring === 'enum') enumBody = true;
        declaring = '';
      } else if (enumBody && /^[A-Z][A-Z\d_]*$/.test(word)) push(text, 'operator');
      else if (previous === '::') push(text);
      else if (/^\s*\(/.test(rest)) push(text, 'method');
      else if (
        /^[A-Z]/.test(word) &&
        (previous === 'new' ||
          genericDepth > 0 ||
          /^(?:\.[A-Z][\w$]*)*(?:<|\[\]|\s+[a-z_$][\w$]*\s*[=;,)(:?&|])/.test(rest) ||
          (previous === '.' && afterType))
      ) {
        push(text, 'type');
        type = !rest.startsWith('.');
        if (rest.startsWith('<')) genericDepth++;
      } else if (afterType && /^\s*[,)]/.test(rest) && parenDepth !== recordHeader) push(text, 'parameter');
      else push(text);
    } else if (operator) {
      if (genericDepth > 0 && /^[<>?]+$/.test(operator)) {
        const closes = operator.split('>').length - 1;
        genericDepth = Math.max(0, genericDepth - closes);
        operator.split(/(\?)/).forEach((part) => part && push(part, part === '?' ? 'keyword' : 'punctuation'));
        type = closes > 0 && genericDepth === 0;
      } else push(text, ['->', '::', '?', ':'].includes(operator) ? 'keyword' : 'operator');
    } else if (punctuation) {
      push(text, 'punctuation');
      if (text === '(') parenDepth++;
      if (text === ')') {
        if (parenDepth === recordHeader) recordHeader = -1;
        parenDepth--;
      }
      if (text === ';') qualified = '';
      if (text === ';' || text === '}') enumBody = false;
      if (text === ']' && previous === '[' && afterType) type = true;
      if (text === '.' && afterType) type = true;
    } else push(text);
    afterType = type;
    previous = text;
  }
  return out;
}

function sql(code: string): Token[] {
  const out: Token[] = [];
  const push = (text: string, kind?: Kind) => out.push({ text, color: kind && COLORS[kind] });
  const rule = /(--[^\n]*)|('(?:''|[^'])*')|([A-Za-z_][\w.]*)|(<=>|<=|>=|<>|!=|[<>=*])|([\s\S])/g;
  for (let m; (m = rule.exec(code)); ) {
    const [text, comment, string, word, operator] = m;
    if (comment) push(text, 'comment');
    else if (string) push(text, 'string');
    else if (word) push(text, SQL_KEYWORDS.has(word.toLowerCase()) ? 'keyword' : undefined);
    else if (operator) push(text, 'operator');
    else push(text);
  }
  return out;
}

function json(code: string): Token[] {
  const out: Token[] = [];
  const push = (text: string, kind?: Kind) => out.push({ text, color: kind && COLORS[kind] });
  const rule = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)|([{}[\],:])|([\s\S])/g;
  for (let m; (m = rule.exec(code)); ) {
    const [text, string, colon, literal, punctuation] = m;
    if (string && colon) {
      push('"', 'punctuation');
      push(string.slice(1, -1), 'key');
      push('"', 'punctuation');
      push(colon, 'punctuation');
    } else if (string) push(text, 'string');
    else if (literal) push(text, 'constant');
    else if (punctuation) push(text, 'punctuation');
    else push(text);
  }
  return out;
}

export function tokenize(code: string, lang: CodeLang): Token[] {
  return lang === 'java' ? java(code) : lang === 'sql' ? sql(code) : json(code);
}
