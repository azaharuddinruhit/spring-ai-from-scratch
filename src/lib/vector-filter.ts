/**
 * Spring AI 2.0.2's portable filter expressions, ported for the vector store lab:
 * - parseFilter() follows FilterExpressionTextParser (the ANTLR Filters grammar): AND binds tighter than OR, NOT has the
 *   lowest precedence and takes everything to its right, and characters the lexer can't match are skipped, as ANTLR's lexer
 *   recovery does: "! a == 1" parses as "a == 1".
 * - toPgVectorSql() follows PgVectorFilterExpressionConverter, including FilterHelper.negate for NOT.
 * - matchesPgVector() evaluates that SQL/JSON path the way PostgreSQL does, so && binds tighter than || in the generated string.
 * Checked against the 2.0.2 jar with a fuzzer: the same SQL, or the same rejection, for every generated expression.
 */

export type Scalar = string | number | boolean;
/** text keeps Java's rendering of a number (Integer, Long or Double); texts does the same for a list. */
export type Value = { kind: 'value'; value: Scalar | Scalar[]; text?: string; texts?: (string | undefined)[] };
export type Key = { kind: 'key'; key: string };
export type Group = { kind: 'group'; content: Expr };
export type ExprType = 'EQ' | 'NE' | 'GT' | 'GTE' | 'LT' | 'LTE' | 'AND' | 'OR' | 'IN' | 'NIN' | 'NOT' | 'ISNULL' | 'ISNOTNULL';
export type Expr = { kind: 'expr'; type: ExprType; left: Operand; right: Operand | null };
export type Operand = Value | Key | Group | Expr;

export class FilterParseError extends Error {}

type TokenType =
  | 'WHERE' | 'DOT' | 'COMMA' | 'LBRACKET' | 'RBRACKET' | 'LPAREN' | 'RPAREN' | 'EQ' | 'MINUS' | 'PLUS' | 'GT' | 'GE' | 'LT' | 'LE' | 'NE'
  | 'AND' | 'OR' | 'IN' | 'NIN' | 'NOT' | 'IS' | 'NULL' | 'BOOLEAN' | 'STRING' | 'INTEGER' | 'DECIMAL' | 'LONG' | 'IDENT' | 'EOF';
interface Token {
  type: TokenType;
  text: string;
}

const KEYWORDS: Record<string, TokenType> = {
  WHERE: 'WHERE', where: 'WHERE',
  AND: 'AND', and: 'AND',
  OR: 'OR', or: 'OR',
  IN: 'IN', in: 'IN',
  NIN: 'NIN', nin: 'NIN',
  NOT: 'NOT', not: 'NOT',
  IS: 'IS', is: 'IS',
  NULL: 'NULL', null: 'NULL',
  TRUE: 'BOOLEAN', FALSE: 'BOOLEAN', true: 'BOOLEAN', false: 'BOOLEAN',
};

const SYMBOLS: [string, TokenType][] = [
  ['&&', 'AND'], ['||', 'OR'], ['==', 'EQ'], ['>=', 'GE'], ['<=', 'LE'], ['!=', 'NE'],
  ['.', 'DOT'], [',', 'COMMA'], ['[', 'LBRACKET'], [']', 'RBRACKET'], ['(', 'LPAREN'], [')', 'RPAREN'],
  ['-', 'MINUS'], ['+', 'PLUS'], ['>', 'GT'], ['<', 'LT'],
];

/** Tokenizes like the ANTLR lexer. Unknown characters are skipped and reported, as ANTLR does by default. */
export function tokenize(src: string): { tokens: Token[]; skipped: string[] } {
  const tokens: Token[] = [];
  const skipped: string[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      if (j < src.length) {
        tokens.push({ type: 'STRING', text: src.slice(i, j + 1) });
        i = j + 1;
        continue;
      }
      skipped.push(src.slice(i)); // an unterminated string: the lexer gives up on the rest of the input
      break;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^(?:[0-9]+\.[0-9]*|\.[0-9]+)/.exec(src.slice(i));
      if (m) {
        tokens.push({ type: 'DECIMAL', text: m[0] });
        i += m[0].length;
        continue;
      }
      const digits = /^[0-9]+/.exec(src.slice(i))![0];
      if (src[i + digits.length] === 'l' || src[i + digits.length] === 'L') {
        tokens.push({ type: 'LONG', text: src.slice(i, i + digits.length + 1) });
        i += digits.length + 1;
      } else {
        tokens.push({ type: 'INTEGER', text: digits });
        i += digits.length;
      }
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))![0];
      tokens.push({ type: KEYWORDS[word] ?? 'IDENT', text: word });
      i += word.length;
      continue;
    }
    const symbol = SYMBOLS.find(([s]) => src.startsWith(s, i));
    if (symbol) {
      tokens.push({ type: symbol[1], text: symbol[0] });
      i += symbol[0].length;
      continue;
    }
    // A lone "!", "=", "&" or "|" starts a two-character token, so the lexer fails on the next character and skips both.
    const width = '!=&|'.includes(c) ? 2 : 1;
    skipped.push(src.slice(i, i + width));
    i += width;
  }
  tokens.push({ type: 'EOF', text: '' });
  return { tokens, skipped };
}

function unescape(quoted: string): string {
  const quote = quoted[0];
  const body = quoted.slice(1, -1);
  return quote === '"' ? body.replaceAll('\\"', '"').replaceAll('\\\\', '\\') : body.replaceAll("\\'", "'").replaceAll('\\\\', '\\');
}

const MAX_INT = 2147483647;

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }
  private next(): Token {
    return this.tokens[this.pos++];
  }
  private expect(type: TokenType): Token {
    const t = this.next();
    if (t.type !== type) throw new FilterParseError(`expected ${type} but found '${t.text || 'end of input'}'`);
    return t;
  }

  parseWhere(): Operand {
    if (this.peek().type === 'WHERE') this.next();
    const e = this.parseExpr(0);
    this.expect('EOF');
    return e;
  }

  /** Precedence climbing: OR = 1, AND = 2. A NOT operand is parsed at the lowest level, so it extends to the right. */
  private parseExpr(minPrec: number): Operand {
    let left = this.parsePrimary();
    for (;;) {
      const t = this.peek().type;
      const prec = t === 'AND' ? 2 : t === 'OR' ? 1 : 0;
      if (prec === 0 || prec < minPrec) return left;
      this.next();
      const right = this.parseExpr(prec + 1);
      left = { kind: 'expr', type: t === 'AND' ? 'AND' : 'OR', left, right };
    }
  }

  private parsePrimary(): Operand {
    const t = this.peek();
    if (t.type === 'NOT') {
      this.next();
      return { kind: 'expr', type: 'NOT', left: this.parseExpr(0), right: null };
    }
    if (t.type === 'LPAREN') {
      this.next();
      const inner = this.parseExpr(0);
      this.expect('RPAREN');
      return { kind: 'group', content: castToExpression(inner) };
    }
    const key = this.parseIdentifier();
    const op = this.next();
    switch (op.type) {
      case 'EQ': case 'NE': case 'GT': case 'GE': case 'LT': case 'LE': {
        const type = ({ EQ: 'EQ', NE: 'NE', GT: 'GT', GE: 'GTE', LT: 'LT', LE: 'LTE' } as const)[op.type];
        return { kind: 'expr', type, left: key, right: this.parseConstant() };
      }
      case 'IN':
        return { kind: 'expr', type: 'IN', left: key, right: this.parseArray() };
      case 'NIN':
        return { kind: 'expr', type: 'NIN', left: key, right: this.parseArray() };
      case 'NOT':
        this.expect('IN');
        return { kind: 'expr', type: 'NIN', left: key, right: this.parseArray() };
      case 'IS':
        if (this.peek().type === 'NOT') {
          this.next();
          this.expect('NULL');
          return { kind: 'expr', type: 'ISNOTNULL', left: key, right: null };
        }
        this.expect('NULL');
        return { kind: 'expr', type: 'ISNULL', left: key, right: null };
      default:
        throw new FilterParseError(`unexpected '${op.text || 'end of input'}'`);
    }
  }

  private parseIdentifier(): Key {
    const t = this.next();
    if (t.type === 'STRING') return { kind: 'key', key: unescape(t.text) };
    if (t.type !== 'IDENT') throw new FilterParseError(`expected a metadata key but found '${t.text || 'end of input'}'`);
    if (this.peek().type === 'DOT' && this.peek(1).type === 'IDENT') {
      this.next();
      return { kind: 'key', key: `${t.text}.${this.next().text}` };
    }
    return { kind: 'key', key: t.text };
  }

  private parseArray(): Value {
    this.expect('LBRACKET');
    const values: Value[] = [this.parseConstant()];
    while (this.peek().type === 'COMMA') {
      this.next();
      values.push(this.parseConstant());
    }
    this.expect('RBRACKET');
    return { kind: 'value', value: values.map((v) => v.value as Scalar), texts: values.map((v) => v.text) };
  }

  private parseConstant(): Value {
    let sign = '';
    if (this.peek().type === 'MINUS' || this.peek().type === 'PLUS') sign = this.next().text;
    const t = this.next();
    if (sign && !['INTEGER', 'DECIMAL', 'LONG'].includes(t.type)) throw new FilterParseError(`unexpected '${t.text}'`);
    switch (t.type) {
      case 'INTEGER': {
        const n = Number(sign + t.text);
        return { kind: 'value', value: n, text: Math.abs(n) <= MAX_INT ? String(n) : BigInt(sign + t.text).toString() };
      }
      case 'LONG':
        return { kind: 'value', value: Number(sign + t.text.slice(0, -1)), text: BigInt(sign + t.text.slice(0, -1)).toString() };
      case 'DECIMAL': {
        const n = Number(sign + t.text);
        return { kind: 'value', value: n, text: javaDouble(n) };
      }
      case 'STRING':
        return { kind: 'value', value: unescape(t.text) };
      case 'BOOLEAN':
        return { kind: 'value', value: t.text.toLowerCase() === 'true' };
      default:
        throw new FilterParseError(`expected a value but found '${t.text || 'end of input'}'`);
    }
  }
}

function castToExpression(op: Operand): Expr {
  if (op.kind === 'group') return op.content;
  if (op.kind === 'expr') return op;
  throw new FilterParseError('invalid expression');
}

/** Java's Double.toString, which Jackson uses for doubles. */
function javaDouble(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e7) return n.toFixed(1);
  const abs = Math.abs(n);
  if (abs >= 1e-3 && abs < 1e7) return String(n);
  const [mantissa, exponent] = n.toExponential().split('e');
  return `${mantissa.includes('.') ? mantissa : mantissa + '.0'}E${Number(exponent)}`;
}

/** FilterExpressionTextParser.parse. Throws FilterParseError where the Java parser throws FilterExpressionParseException. */
export function parseFilter(text: string): { expression: Operand; skipped: string[] } {
  const { tokens, skipped } = tokenize(text);
  const expression = new Parser(tokens).parseWhere();
  return { expression: expression.kind === 'group' ? expression.content : expression, skipped };
}

const NEGATION: Record<ExprType, ExprType> = {
  AND: 'OR', OR: 'AND', EQ: 'NE', NE: 'EQ', GT: 'LTE', GTE: 'LT', LT: 'GTE', LTE: 'GT', IN: 'NIN', NIN: 'IN',
  NOT: 'NOT', ISNULL: 'ISNOTNULL', ISNOTNULL: 'ISNULL',
};

/** FilterHelper.negate, including its handling of NOT(NOT a). */
function negate(op: Operand): Operand {
  if (op.kind === 'group') {
    let inner = negate(op.content);
    if (inner.kind === 'group') inner = inner.content;
    return { kind: 'group', content: inner as Expr };
  }
  if (op.kind !== 'expr') throw new FilterParseError('can not negate a ' + op.kind);
  switch (op.type) {
    case 'NOT':
      return negate(op.left);
    case 'AND':
    case 'OR':
      return { kind: 'expr', type: NEGATION[op.type], left: negate(op.left), right: negate(op.right!) };
    case 'ISNULL':
    case 'ISNOTNULL':
      throw new FilterParseError('Unknown expression type: ' + op.type);
    default:
      return { kind: 'expr', type: NEGATION[op.type], left: op.left, right: op.right };
  }
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/;

/** Jackson's string for one value, after AbstractFilterExpressionConverter turns ISO-8601 strings into dates. */
function jsonValue(value: Scalar, text?: string): string {
  if (typeof value === 'string') {
    const date = ISO_DATE.exec(value);
    if (date) {
      const [, y, mo, d, h, mi, s, frac] = date;
      if (frac !== undefined && frac.length !== 3) throw new FilterParseError('Invalid date type: ' + value);
      const t = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s, frac ? +frac : 0));
      if (t.getUTCMonth() !== +mo - 1 || t.getUTCDate() !== +d || +h > 23 || +mi > 59 || +s > 59) {
        throw new FilterParseError('Invalid date type: ' + value);
      }
      return JSON.stringify(t.toISOString());
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'number') return text ?? String(value);
  return String(value);
}

const SQL_OP: Partial<Record<ExprType, string>> = {
  AND: ' && ', OR: ' || ', EQ: ' == ', NE: ' != ', LT: ' < ', LTE: ' <= ', GT: ' > ', GTE: ' >= ',
};

function convert(op: Operand, out: string[]): void {
  switch (op.kind) {
    case 'group':
      out.push('(');
      convert(op.content, out);
      out.push(')');
      return;
    case 'key':
      out.push('$.' + JSON.stringify(op.key).replaceAll("'", "''"));
      return;
    case 'value':
      out.push(jsonValue(op.value as Scalar, op.text).replaceAll("'", "''"));
      return;
    case 'expr': {
      if (op.type === 'NOT') {
        convert(negate(op), out);
        return;
      }
      if (op.right === null) throw new FilterParseError('expression should have a right operand');
      if (op.type === 'IN' || op.type === 'NIN') {
        const right = op.right as Value;
        const values = right.value as Scalar[];
        out.push(op.type === 'IN' ? '(' : '!(');
        values.forEach((v, i) => {
          convert(op.left, out);
          out.push(' == ' + jsonValue(v, right.texts?.[i]).replaceAll("'", "''"));
          if (i < values.length - 1) out.push(' || ');
        });
        out.push(')');
        return;
      }
      convert(op.left, out);
      out.push(SQL_OP[op.type]!);
      convert(op.right, out);
    }
  }
}

/** The WHERE clause PgVectorFilterExpressionConverter produces. */
export function toPgVectorSql(expression: Operand): string {
  const out: string[] = [];
  convert(expression, out);
  return `metadata::jsonb @@ '${out.join('')}'::jsonpath`;
}

/** The jsonpath inside a PgVector WHERE clause, as written. */
export function jsonPathOf(sql: string): string {
  return sql.slice("metadata::jsonb @@ '".length, -"'::jsonpath".length).replaceAll("''", "'");
}

/**
 * Evaluates a generated jsonpath predicate against one row's metadata the way PostgreSQL does: && binds tighter than ||,
 * a comparison with a missing key is false, and comparing different types is unknown (null), which never matches.
 */
export function matchesPgVector(jsonPath: string, metadata: Record<string, Scalar>): boolean {
  let i = 0;
  const ws = () => {
    while (jsonPath[i] === ' ') i++;
  };
  const readJson = (): unknown => {
    ws();
    const start = i;
    if (jsonPath[i] === '"') {
      i++;
      while (jsonPath[i] !== '"') i += jsonPath[i] === '\\' ? 2 : 1;
      i++;
    } else {
      while (i < jsonPath.length && !' )'.includes(jsonPath[i])) i++;
    }
    return JSON.parse(jsonPath.slice(start, i).replace(/E(-?\d+)$/, 'e$1'));
  };
  const or = (): boolean | null => {
    let v = and();
    for (ws(); jsonPath.startsWith('||', i); ws()) {
      i += 2;
      const r = and();
      v = v === true || r === true ? true : v === null || r === null ? null : false;
    }
    return v;
  };
  const and = (): boolean | null => {
    let v = unary();
    for (ws(); jsonPath.startsWith('&&', i); ws()) {
      i += 2;
      const r = unary();
      v = v === false || r === false ? false : v === null || r === null ? null : true;
    }
    return v;
  };
  const unary = (): boolean | null => {
    ws();
    if (jsonPath[i] === '!') {
      i += 2; // "!("
      const v = or();
      ws();
      i++; // ")"
      return v === null ? null : !v;
    }
    if (jsonPath[i] === '(') {
      i++;
      const v = or();
      ws();
      i++;
      return v;
    }
    i += 2; // "$."
    const key = readJson() as string;
    ws();
    const op = /^(==|!=|<=|>=|<|>)/.exec(jsonPath.slice(i))![0];
    i += op.length;
    const right = readJson() as Scalar;
    if (!(key in metadata)) return false;
    const left = metadata[key];
    if (typeof left !== typeof right) return null;
    switch (op) {
      case '==': return left === right;
      case '!=': return left !== right;
      case '<': return left < right;
      case '<=': return left <= right;
      case '>': return left > right;
      default: return left >= right;
    }
  };
  return or() === true;
}
