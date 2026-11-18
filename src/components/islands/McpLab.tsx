import { useState } from 'react';
import { CodeView, LabFrame, Pill } from './LabFrame';

/*
 * The support app's MCP client talking to the shipping server over Streamable HTTP (Spring AI 2.0.2, MCP protocol 2025-11-25),
 * as the lesson configures them. Checked against the real classes, end to end:
 * - Without spring.ai.mcp.server.protocol a WebMVC server starts the SSE transport, so the client's POST /mcp gets a 404 and,
 *   with initialized: true (the default), the support app fails to start.
 * - A missing or rejected token fails the client's initialize with McpHttpClientTransportAuthorizationException.
 * - A token with scope mcp but not shipments.read lists the tools; @PreAuthorize turns the call into isError "Access Denied".
 * - The default ToolContextToMcpMetaConverter copies the whole ToolContext into _meta; noOp() sends {}.
 * - McpToolFilter decides which listed tools reach ChatClient. One connection keeps the tool names as they are.
 * The client info, protocol version and message shapes are the ones the probe recorded; the ids are shortened.
 */

type Scopes = 'both' | 'mcp' | 'none';

interface Exchange {
  from: 'support' | 'shipping' | 'login';
  title: string;
  json?: string;
  note?: string;
  bad?: boolean;
}

const SHIPMENT = `{"trackingNumber":"1Z999AA10123456784","carrier":"UPS","status":"IN_TRANSIT","lastScan":"Leipzig hub","lastScanAt":"2026-11-17T21:04:00Z","estimatedDelivery":"2026-11-19"}`;

const TOOLS_LIST = `{"jsonrpc":"2.0","id":"1","result":{"tools":[
  {"name":"track_shipment","title":"track_shipment",
   "description":"Current status, last scan and estimated delivery of a parcel",
   "inputSchema":{"type":"object","properties":{"trackingNumber":{"type":"string",
     "description":"The carrier tracking number, such as 1Z999AA10123456784"}},"required":["trackingNumber"]},
   "annotations":{"readOnlyHint":true,"destructiveHint":false,"idempotentHint":true,"openWorldHint":false}},
  {"name":"reroute_shipment","title":"reroute_shipment",
   "description":"Send a parcel to a different address",
   "inputSchema":{"type":"object","properties":{"trackingNumber":{"type":"string"},"address":{"type":"string"}},
     "required":["trackingNumber","address"]},
   "annotations":{"readOnlyHint":false,"destructiveHint":true,"idempotentHint":false,"openWorldHint":true}}]}}`;

function exchanges(streamable: boolean, scopes: Scopes, metaNoOp: boolean, allowList: boolean): { steps: Exchange[]; outcome: string; ok: boolean } {
  const steps: Exchange[] = [];
  if (scopes !== 'none') {
    steps.push({
      from: 'support',
      title: 'POST /oauth2/token to the login server',
      note: 'Basic auth with the client id and secret. The token is cached and reused until it expires.',
      json: `grant_type=client_credentials&scope=${scopes === 'both' ? 'mcp shipments.read' : 'mcp'}`,
    });
    steps.push({ from: 'login', title: '200 OK', json: `{"access_token":"eyJhbGciOiJSUzI1NiJ9…","token_type":"Bearer","expires_in":300,"scope":"${scopes === 'both' ? 'mcp shipments.read' : 'mcp'}"}` });
  }
  steps.push({
    from: 'support',
    title: `POST /mcp initialize${scopes === 'none' ? ', no Authorization header' : ', Authorization: Bearer eyJ…'}`,
    json: `{"jsonrpc":"2.0","method":"initialize","id":"0","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"spring-ai-mcp-client-shipping","title":"shipping","version":"1.0.0"}}}`,
  });
  if (scopes === 'none') {
    steps.push({ from: 'shipping', title: '401 Unauthorized', note: 'Spring Security rejects the request before it reaches the MCP server.', bad: true });
    return { steps, outcome: 'McpHttpClientTransportAuthorizationException: Authorization error when sending message. The support app fails to start.', ok: false };
  }
  if (!streamable) {
    steps.push({ from: 'shipping', title: '404 Not Found', note: 'The server started the SSE transport, which serves /sse and /mcp/message, not POST /mcp.', bad: true });
    return { steps, outcome: 'McpTransportException: Server Not Found. Status code:404. The support app fails to start.', ok: false };
  }
  steps.push({
    from: 'shipping',
    title: '200 OK',
    json: `{"jsonrpc":"2.0","id":"0","result":{"protocolVersion":"2025-11-25","capabilities":{"tools":{"listChanged":true},"resources":{"listChanged":true},"prompts":{"listChanged":true},"completions":{},"logging":{}},"serverInfo":{"name":"shipping","version":"1.4.0"}}}`,
  });
  steps.push({ from: 'support', title: 'POST /mcp notifications/initialized', json: `{"jsonrpc":"2.0","method":"notifications/initialized"}` });
  steps.push({ from: 'support', title: 'POST /mcp tools/list', json: `{"jsonrpc":"2.0","method":"tools/list","id":"1"}` });
  steps.push({ from: 'shipping', title: '200 OK, two tools', json: TOOLS_LIST });
  steps.push({
    from: 'support',
    title: allowList ? 'McpToolFilter keeps track_shipment' : 'Every listed tool goes to ChatClient',
    note: allowList
      ? 'reroute_shipment is not on support.mcp.allowed-tools, so the model never sees it.'
      : 'The shipping team added reroute_shipment last week. The model can now send a parcel to any address a customer types.',
    bad: !allowList,
  });
  steps.push({
    from: 'support',
    title: 'The model asks for track_shipment: POST /mcp tools/call',
    note: metaNoOp ? undefined : 'The default converter copied the ToolContext into _meta: the shipping server now learns which customer is asking.',
    json: `{"jsonrpc":"2.0","method":"tools/call","id":"2","params":{"name":"track_shipment","arguments":{"trackingNumber":"1Z999AA10123456784"},"_meta":${metaNoOp ? '{}' : '{"customerId":"alice"}'}}}`,
    bad: !metaNoOp,
  });
  if (scopes === 'mcp') {
    steps.push({
      from: 'shipping',
      title: '200 OK, isError',
      note: '/mcp only needs SCOPE_mcp, so the call gets through; @PreAuthorize on the tool needs SCOPE_shipments.read.',
      json: `{"jsonrpc":"2.0","id":"2","result":{"content":[{"type":"text","text":"Access Denied"}],"isError":true}}`,
      bad: true,
    });
    return {
      steps,
      outcome: 'The client throws ToolExecutionException, and ModelSafeToolErrors tells the model: "The track_shipment tool is unavailable right now. Say so and do not guess the answer."',
      ok: false,
    };
  }
  steps.push({
    from: 'shipping',
    title: '200 OK',
    note: 'The record comes back as JSON inside a text content block.',
    json: `{"jsonrpc":"2.0","id":"2","result":{"content":[{"type":"text","text":${JSON.stringify(SHIPMENT)}}],"isError":false}}`,
  });
  return { steps, outcome: 'The model reads the shipment and answers: "Your parcel is in transit with UPS and should arrive on 19 November."', ok: true };
}

function javaFor(metaNoOp: boolean, allowList: boolean): string {
  const beans: string[] = [];
  if (metaNoOp)
    beans.push(`@Bean
ToolContextToMcpMetaConverter noToolContextForMcpServers() {
    return ToolContextToMcpMetaConverter.noOp();
}`);
  if (allowList)
    beans.push(`@Bean
McpToolFilter reviewedToolsOnly(SupportMcpProperties properties) {
    return (connection, tool) -> properties.allowedTools().contains(tool.name());
}`);
  return beans.length ? beans.join('\n\n') : '// No beans: the default converter and no tool filter.';
}

const FROM: Record<Exchange['from'], string> = {
  support: 'Support app',
  shipping: 'Shipping MCP server',
  login: 'Login server',
};

export default function McpLab() {
  const [streamable, setStreamable] = useState(true);
  const [scopes, setScopes] = useState<Scopes>('both');
  const [metaNoOp, setMetaNoOp] = useState(true);
  const [allowList, setAllowList] = useState(true);

  const { steps, outcome, ok } = exchanges(streamable, scopes, metaNoOp, allowList);

  return (
    <LabFrame
      title="What crosses the wire"
      hint="The support app starts, connects to the shipping server and answers one tracking question. Change a setting on either side and read the messages."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="min-w-0">
          <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">Shipping server: spring.ai.mcp.server.protocol</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <Pill active={streamable} onClick={() => setStreamable(true)}>
              STREAMABLE
            </Pill>
            <Pill active={!streamable} onClick={() => setStreamable(false)}>
              Not set
            </Pill>
          </div>
        </fieldset>
        <fieldset className="min-w-0">
          <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">Scopes the support app's client may request</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <Pill active={scopes === 'both'} onClick={() => setScopes('both')}>
              mcp shipments.read
            </Pill>
            <Pill active={scopes === 'mcp'} onClick={() => setScopes('mcp')}>
              mcp
            </Pill>
            <Pill active={scopes === 'none'} onClick={() => setScopes('none')}>
              No registration
            </Pill>
          </div>
        </fieldset>
        <fieldset className="min-w-0">
          <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">Support app: ToolContext to _meta</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <Pill active={!metaNoOp} onClick={() => setMetaNoOp(false)}>
              Default
            </Pill>
            <Pill active={metaNoOp} onClick={() => setMetaNoOp(true)}>
              noOp()
            </Pill>
          </div>
        </fieldset>
        <fieldset className="min-w-0">
          <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">Support app: McpToolFilter</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <Pill active={!allowList} onClick={() => setAllowList(false)}>
              None
            </Pill>
            <Pill active={allowList} onClick={() => setAllowList(true)}>
              Allow-list
            </Pill>
          </div>
        </fieldset>
      </div>

      <div className="mt-4">
        <h4 className="text-xs font-medium text-slate-600 dark:text-slate-400">Support app beans</h4>
        <CodeView code={javaFor(metaNoOp, allowList)} lang="java" className="mt-1.5" />
      </div>

      <ol className="mt-5 space-y-2">
        {steps.map((step, i) => (
          <li
            key={i}
            className={
              'rounded-md border p-3 text-sm ' +
              (step.from === 'support' ? 'sm:mr-10 ' : 'sm:ml-10 ') +
              (step.bad ? 'border-rose-300 bg-rose-50 dark:border-rose-800/70 dark:bg-rose-950/30' : 'border-slate-200 dark:border-slate-700/70')
            }
          >
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{FROM[step.from]}</span>
              <span className="font-medium text-slate-900 [overflow-wrap:anywhere] dark:text-slate-100">{step.title}</span>
            </p>
            {step.note && <p className="mt-1 text-slate-700 dark:text-slate-300">{step.note}</p>}
            {step.json && <CodeView code={step.json} lang="json" className="mt-2 whitespace-pre-wrap [overflow-wrap:anywhere]" />}
          </li>
        ))}
      </ol>
      <p
        role="status"
        className={
          'mt-3 rounded-md border p-3 text-sm [overflow-wrap:anywhere] ' +
          (ok
            ? 'border-brand-300 bg-brand-50 text-brand-900 dark:border-brand-700/60 dark:bg-brand-900/20 dark:text-brand-100'
            : 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800/70 dark:bg-rose-950/30 dark:text-rose-100')
        }
      >
        {outcome}
      </p>
    </LabFrame>
  );
}
