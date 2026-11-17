import { useMemo, useRef, useState } from 'react';
import { CodeView, LabFrame, Pill } from './LabFrame';

/*
 * A browser-side copy of the rules BeanOutputConverter (Spring AI 2.0.2) uses to turn a record into JSON Schema, checked
 * against the real generator: draft 2020-12, properties sorted by name unless @JsonPropertyOrder says otherwise,
 * "additionalProperties": false on every object, a type used more than once moved to $defs, and these required rules in order:
 * @JsonProperty decides with its required flag (false by default), then @Schema (required unless NOT_REQUIRED),
 * then a @Nullable type is optional, and everything else is required.
 */

type Json = string | number | boolean | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

interface Annotation {
  name: string;
  args: Record<string, string>;
}

interface Component {
  javaName: string;
  jsonName: string;
  type: string;
  description?: string;
  required: boolean;
  reason: string;
}

interface RecordDecl {
  name: string;
  description?: string;
  order?: string[];
  components: Component[];
}

interface Model {
  records: Map<string, RecordDecl>;
  enums: Map<string, string[]>;
  root: RecordDecl;
}

const PRESETS: { id: string; label: string; source: string }[] = [
  {
    id: 'ticket',
    label: 'Support ticket',
    source: `@JsonClassDescription("Triage result for one support ticket")
record TicketTriage(
        @JsonPropertyDescription("One sentence, under 20 words") String summary,
        @JsonPropertyDescription("How fast support must respond") Priority priority,
        Customer customer,
        List<String> tags,
        @Nullable String suggestedReply) {}

enum Priority { LOW, MEDIUM, HIGH, URGENT }

record Customer(String name, @JsonProperty("account_id") String accountId) {}`,
  },
  {
    id: 'order',
    label: 'Type used twice',
    source: `record Order(String id, Address billing, Address shipping, List<Line> lines, BigDecimal total, LocalDate placedOn) {}

record Address(String city, String country) {}

record Line(String sku, int quantity) {}`,
  },
  {
    id: 'answer',
    label: 'Answer',
    source: `@JsonPropertyOrder({"text", "sources"})
record Answer(
        @JsonPropertyDescription("The answer in two or three sentences") String text,
        @JsonPropertyDescription("File names of the documents used") List<String> sources) {}`,
  },
];

const SCALARS: Record<string, JsonObject> = {
  String: { type: 'string' },
  char: { type: 'string' },
  Character: { type: 'string' },
  int: { type: 'integer', format: 'int32' },
  Integer: { type: 'integer', format: 'int32' },
  long: { type: 'integer', format: 'int64' },
  Long: { type: 'integer', format: 'int64' },
  float: { type: 'number', format: 'float' },
  Float: { type: 'number', format: 'float' },
  double: { type: 'number', format: 'double' },
  Double: { type: 'number', format: 'double' },
  BigDecimal: { type: 'number' },
  boolean: { type: 'boolean' },
  Boolean: { type: 'boolean' },
  LocalDate: { type: 'string', format: 'date' },
  LocalDateTime: { type: 'string' },
  Instant: { type: 'string', format: 'date-time' },
  UUID: { type: 'string', format: 'uuid' },
};

const SUPPORTED = 'String, numbers, boolean, BigDecimal, LocalDate, LocalDateTime, Instant, UUID, List, Set, Map, enums and records';

class ParseError extends Error {}

/** Splits on commas that are not inside parentheses, angle brackets, braces or string literals. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inString = false;
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') {
        current += ch + (text[++i] ?? '');
        continue;
      }
      if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if ('(<{'.includes(ch)) depth++;
    else if (')>}'.includes(ch)) depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Index just after the parenthesis that closes the one at `open`. */
function closingParen(text: string, open: number): number {
  let depth = 0;
  let inString = false;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return i + 1;
  }
  throw new ParseError('A parenthesis is not closed.');
}

function parseArgs(raw: string): Record<string, string> {
  const args: Record<string, string> = {};
  const body = raw.trim();
  if (!body) return args;
  if (body.startsWith('{')) {
    args.value = body;
    return args;
  }
  for (const part of splitTopLevel(body)) {
    const eq = part.match(/^(\w+)\s*=\s*([\s\S]+)$/);
    if (eq) args[eq[1]] = eq[2].trim();
    else args.value = part;
  }
  return args;
}

const unquote = (s: string | undefined) => (s && /^"[\s\S]*"$/.test(s) ? JSON.parse(s) as string : s);

/** Reads leading annotations off a declaration, returning them and the rest of the text. */
function takeAnnotations(text: string): { annotations: Annotation[]; rest: string } {
  const annotations: Annotation[] = [];
  let rest = text.trimStart();
  while (rest.startsWith('@')) {
    const name = rest.match(/^@([\w.]+)/)![1];
    rest = rest.slice(name.length + 1).trimStart();
    let args: Record<string, string> = {};
    if (rest.startsWith('(')) {
      const end = closingParen(rest, 0);
      args = parseArgs(rest.slice(1, end - 1));
      rest = rest.slice(end).trimStart();
    }
    annotations.push({ name: name.split('.').pop()!, args });
  }
  return { annotations, rest };
}

function parseComponent(text: string): Component {
  const { annotations, rest } = takeAnnotations(text);
  // A type-use annotation such as @Nullable may also sit between modifiers and the type.
  const inner = takeAnnotations(rest.replace(/^final\s+/, ''));
  const all = [...annotations, ...inner.annotations];
  const match = inner.rest.match(/^([\w.]+(?:\s*<[\s\S]*>)?(?:\[\])?)\s+(\w+)$/);
  if (!match) throw new ParseError(`Can't read the component "${text.replace(/\s+/g, ' ')}".`);
  const type = match[1].replace(/\s+/g, '');
  const javaName = match[2];
  const find = (name: string) => all.find((a) => a.name === name);

  const jsonProperty = find('JsonProperty');
  const schema = find('Schema');
  const nullable = find('Nullable');
  let required = true;
  let reason = 'Required by default';
  if (jsonProperty) {
    required = jsonProperty.args.required === 'true';
    reason = required ? '@JsonProperty(required = true)' : '@JsonProperty without required = true';
  } else if (schema) {
    required = !/NOT_REQUIRED/.test(schema.args.requiredMode ?? '') || schema.args.required === 'true';
    reason = required ? '@Schema (required unless NOT_REQUIRED)' : '@Schema(requiredMode = NOT_REQUIRED)';
  } else if (nullable) {
    required = false;
    reason = '@Nullable type';
  }

  return {
    javaName,
    jsonName: unquote(jsonProperty?.args.value) || javaName,
    type,
    description: unquote(find('JsonPropertyDescription')?.args.value) ?? unquote(schema?.args.description),
    required,
    reason,
  };
}

function parse(source: string): Model {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const enums = new Map<string, string[]>();
  for (const m of text.matchAll(/enum\s+(\w+)\s*\{([^}]*)\}/g)) {
    const constants = m[2].split(';')[0].split(',').map((c) => c.trim()).filter((c) => /^\w+$/.test(c));
    enums.set(m[1], constants);
  }

  const records = new Map<string, RecordDecl>();
  let first: RecordDecl | undefined;
  const recordStart = /((?:@[\w.]+(?:\s*\((?:[^()"]|"(?:[^"\\]|\\.)*")*\))?\s*)*)(?:(?:public|static|final)\s+)*record\s+(\w+)\s*\(/g;
  for (const m of text.matchAll(recordStart)) {
    const open = m.index! + m[0].length - 1;
    const end = closingParen(text, open);
    const { annotations } = takeAnnotations(m[1]);
    const classDescription = annotations.find((a) => a.name === 'JsonClassDescription');
    const order = annotations.find((a) => a.name === 'JsonPropertyOrder');
    const decl: RecordDecl = {
      name: m[2],
      description: unquote(classDescription?.args.value),
      order: order ? [...(order.args.value ?? '').matchAll(/"([^"]*)"/g)].map((o) => o[1]) : undefined,
      components: splitTopLevel(text.slice(open + 1, end - 1)).map(parseComponent),
    };
    records.set(decl.name, decl);
    first ??= decl;
  }
  if (!first) throw new ParseError('Write at least one record, for example: record Answer(String text) {}');
  return { records, enums, root: first };
}

/** Properties in @JsonPropertyOrder order (by JSON or Java name), then the rest sorted by JSON name. */
function ordered(decl: RecordDecl): Component[] {
  const byName = [...decl.components].sort((a, b) => (a.jsonName < b.jsonName ? -1 : a.jsonName > b.jsonName ? 1 : 0));
  if (!decl.order) return byName;
  const listed = decl.order
    .map((name) => byName.find((c) => c.jsonName === name || c.javaName === name))
    .filter((c): c is Component => Boolean(c));
  return [...listed, ...byName.filter((c) => !listed.includes(c))];
}

function generics(type: string): { raw: string; args: string[] } {
  const lt = type.indexOf('<');
  if (lt < 0) return { raw: type, args: [] };
  return { raw: type.slice(0, lt), args: splitTopLevel(type.slice(lt + 1, type.lastIndexOf('>'))) };
}

function generate(model: Model): JsonObject {
  // Count how many places refer to each record or enum; a type referred to more than once goes to $defs.
  const uses = new Map<string, number>();
  const visited = new Set<string>();
  const countIn = (type: string) => {
    const { raw, args } = generics(type);
    if (args.length) return args.forEach(countIn);
    if (model.records.has(raw) || model.enums.has(raw)) {
      uses.set(raw, (uses.get(raw) ?? 0) + 1);
      if (raw === model.root.name) throw new ParseError(`${raw} refers to itself; this sandbox doesn't simulate recursive types.`);
      if (model.records.has(raw) && !visited.has(raw)) {
        visited.add(raw);
        model.records.get(raw)!.components.forEach((c) => countIn(c.type));
      }
    }
  };
  model.root.components.forEach((c) => countIn(c.type));
  const shared = new Set([...uses].filter(([, n]) => n > 1).map(([name]) => name));

  const objectSchema = (decl: RecordDecl, description?: string): JsonObject => {
    const node: JsonObject = { type: 'object' };
    const properties: JsonObject = {};
    for (const c of ordered(decl)) properties[c.jsonName] = typeSchema(c.type, c.description);
    node.properties = properties;
    const required = ordered(decl).filter((c) => c.required).map((c) => c.jsonName);
    if (required.length) node.required = required;
    const text = description ?? decl.description;
    if (text) node.description = text;
    node.additionalProperties = false;
    return node;
  };

  const enumSchema = (name: string): JsonObject => ({ type: 'string', enum: model.enums.get(name)! });

  function typeSchema(type: string, description?: string): JsonObject {
    const { raw, args } = generics(type);
    if (raw === 'List' || raw === 'Set' || raw.endsWith('[]')) {
      const item = raw.endsWith('[]') ? raw.slice(0, -2) : args[0];
      if (!item) throw new ParseError(`Give ${raw} an element type, such as ${raw}<String>.`);
      const node: JsonObject = {};
      if (description) node.description = description;
      node.type = 'array';
      node.items = typeSchema(item);
      return node;
    }
    if (raw === 'Map') return withDescription({ type: 'object' }, description);
    if (shared.has(raw)) return withDescription({ $ref: `#/$defs/${raw}` }, description);
    if (model.enums.has(raw)) return withDescription(enumSchema(raw), description);
    if (model.records.has(raw)) return objectSchema(model.records.get(raw)!, description);
    if (SCALARS[raw]) return withDescription({ ...SCALARS[raw] }, description);
    throw new ParseError(`The type ${raw} isn't declared here or supported by this sandbox. It understands ${SUPPORTED}.`);
  }

  const schema: JsonObject = { $schema: 'https://json-schema.org/draft/2020-12/schema' };
  if (shared.size) {
    const defs: JsonObject = {};
    for (const name of [...shared].sort()) {
      defs[name] = model.enums.has(name) ? enumSchema(name) : objectSchema(model.records.get(name)!);
    }
    schema.$defs = defs;
  }
  return Object.assign(schema, objectSchema(model.root));
}

function withDescription(node: JsonObject, description?: string): JsonObject {
  return description ? { ...node, description } : node;
}

/** Pretty-prints the way Jackson's default printer does, so the output matches getJsonSchema() character for character. */
function jacksonPretty(value: Json, indent = ''): string {
  if (Array.isArray(value)) return value.length ? `[ ${value.map((v) => jacksonPretty(v, indent)).join(', ')} ]` : '[ ]';
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return '{ }';
    const inner = indent + '  ';
    return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)} : ${jacksonPretty(v, inner)}`).join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(value);
}

/** BeanOutputConverter.getFormat() in 2.0.2, with the schema filled in. */
function formatInstructions(schema: string): string {
  return `Your response should be in JSON format.
Do not include any explanations, only provide a RFC8259 compliant JSON response following this format without deviation.
Do not include markdown code blocks in your response.
Remove the \`\`\`json markdown from the output.
Here is the JSON Schema instance your output must adhere to:
\`\`\`${schema}\`\`\``;
}

type View = 'schema' | 'format';

export default function RecordSchemaLab() {
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [source, setSource] = useState(PRESETS[0].source);
  const [view, setView] = useState<View>('schema');

  const result = useMemo(() => {
    try {
      const model = parse(source);
      return { model, schema: jacksonPretty(generate(model)), error: null };
    } catch (e) {
      if (e instanceof ParseError) return { model: null, schema: null, error: e.message };
      throw e;
    }
  }, [source]);

  // Keep the last good result on screen while the reader is mid-edit.
  const lastGood = useRef(result);
  if (result.model) lastGood.current = result;
  const shown = lastGood.current.model ? lastGood.current : null;

  const choosePreset = (id: string) => {
    setPresetId(id);
    setSource(PRESETS.find((p) => p.id === id)!.source);
  };

  return (
    <LabFrame
      title="Record to JSON Schema"
      hint="Edit the records. The first one is the type you pass to .entity(); the schema updates as you type, following BeanOutputConverter's rules."
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500 dark:text-slate-400">Example</span>
        {PRESETS.map((p) => (
          <Pill key={p.id} active={presetId === p.id && source === p.source} onClick={() => choosePreset(p.id)}>
            {p.label}
          </Pill>
        ))}
      </div>

      <div className="mt-4 grid gap-5">
        <div className="min-w-0">
          <label htmlFor="record-source" className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Records
          </label>
          <textarea
            id="record-source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            rows={12}
            aria-describedby="record-status"
            className="code-mono mt-1.5 block w-full resize-y rounded-md border border-(--code-border) bg-(--code-bg) px-3.5 py-3 text-[0.8rem] leading-[1.65] text-(--code-fg) whitespace-pre"
          />
          <p id="record-status" role="status" className={'mt-2 text-sm ' + (result.error ? 'text-rose-700 dark:text-rose-300' : 'text-slate-500 dark:text-slate-400')}>
            {result.error ?? `Generating for ${result.model!.root.name}.`}
          </p>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Output">
            <Pill active={view === 'schema'} onClick={() => setView('schema')}>
              getJsonSchema()
            </Pill>
            <Pill active={view === 'format'} onClick={() => setView('format')}>
              getFormat()
            </Pill>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {view === 'schema'
              ? 'The schema native structured output sends to the provider.'
              : 'The text appended to your last user message when the provider is not used natively.'}
          </p>
          {shown && <CodeView code={view === 'schema' ? shown.schema! : formatInstructions(shown.schema!)} className="mt-2 max-h-[26rem] overflow-y-auto" />}
        </div>
      </div>

      {shown && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <caption className="mb-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">
              Which properties of {shown.model!.root.name} the model must return
            </caption>
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <th scope="col" className="py-1.5 pr-4 font-medium">JSON property</th>
                <th scope="col" className="py-1.5 pr-4 font-medium">Java type</th>
                <th scope="col" className="py-1.5 pr-4 font-medium">Required</th>
                <th scope="col" className="py-1.5 font-medium">Why</th>
              </tr>
            </thead>
            <tbody>
              {ordered(shown.model!.root).map((c) => (
                <tr key={c.javaName} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="code-mono py-1.5 pr-4 text-slate-800 dark:text-slate-200">{c.jsonName}</td>
                  <td className="code-mono py-1.5 pr-4 text-slate-600 dark:text-slate-400">{c.type}</td>
                  <td className={'py-1.5 pr-4 font-medium ' + (c.required ? 'text-slate-800 dark:text-slate-200' : 'text-amber-700 dark:text-amber-300')}>
                    {c.required ? 'Yes' : 'No'}
                  </td>
                  <td className="py-1.5 text-slate-600 dark:text-slate-400">{c.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </LabFrame>
  );
}
