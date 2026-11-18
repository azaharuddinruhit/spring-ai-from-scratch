/**
 * Indents JSON text by its tokens, without parsing it: numbers keep their exact text (59.90 stays 59.90, as Jackson writes a
 * BigDecimal), strings are copied as they are (escapes and nested JSON inside a string included), and empty {} and [] stay
 * together. Text that doesn't start with { or [ comes back unchanged, so a JSON string such as "No order 2077." passes through.
 */
export function prettyJson(text: string, indent = '  '): string {
  const source = text.trim();
  if (!source.startsWith('{') && !source.startsWith('[')) return text;
  let out = '';
  let depth = 0;
  const newline = () => '\n' + indent.repeat(depth);
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      let j = i + 1;
      while (j < source.length && source[j] !== '"') j += source[j] === '\\' ? 2 : 1;
      out += source.slice(i, j + 1);
      i = j;
    } else if (c === '{' || c === '[') {
      let j = i + 1;
      while (/\s/.test(source[j] ?? '')) j++;
      if (source[j] === (c === '{' ? '}' : ']')) {
        out += c + source[j];
        i = j;
      } else {
        depth++;
        out += c + newline();
      }
    } else if (c === '}' || c === ']') {
      depth = Math.max(0, depth - 1);
      out += newline() + c;
    } else if (c === ',') {
      out += ',' + newline();
    } else if (c === ':') {
      out += ': ';
    } else if (!/\s/.test(c)) {
      out += c;
    }
  }
  return out;
}
