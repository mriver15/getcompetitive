/**
 * getcompetitive MCP App bootstrap. Connects the View to the host through the
 * App bridge, receives the tool's arguments and its enveloped result, chooses
 * the View from the envelope, and wires the interactive actions (evidence
 * expansion, Team Builder add/export) back through `callServerTool` — which is
 * how App-initiated calls stay out of the model's context.
 */
import { App, applyDocumentTheme, applyHostStyleVariables, type McpUiStyles, type McpUiTheme } from '@modelcontextprotocol/ext-apps/app-with-deps';
import { parseEnvelope, type AppEnvelope, type ToolInput } from './protocol.js';
import { renderShell, renderStatus, renderView, type BuilderState, type ViewContext } from './views.js';

const app = new App({ name: 'getcompetitive', version: '1.0.0' }, undefined, { autoResize: true });

const VIEW_LABEL: Record<string, string> = {
  teamDoctor: 'Team Doctor',
  teamBuilder: 'Team Builder',
  matchupBoard: 'Matchup Board',
};

let input: ToolInput = {};
let envelope: AppEnvelope | null = null;
let builder: BuilderState | undefined;
let banner: string | null = null;
let phase: 'loading' | 'empty' | 'ready' = 'loading';

const root = document.getElementById('root')!;

// Never leave a blank frame: show a state before the host delivers anything.
setHtml(renderStatus('loading', 'Waiting for the tool result…'));

function setHtml(html: string): void {
  root.innerHTML = html;
}

function subLabel(env: AppEnvelope): string {
  const parts = [env.tool];
  if (env.mode) parts.push(env.mode);
  if (env.regulation) parts.push(env.regulation);
  return parts.join(' · ');
}

function applyTheme(ctx: { theme?: McpUiTheme; styles?: { variables?: McpUiStyles } } | undefined): void {
  if (ctx?.theme) applyDocumentTheme(ctx.theme);
  if (ctx?.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
}

function makeCtx(): ViewContext {
  return {
    tool: envelope?.tool ?? '',
    input,
    callServerTool: (params) => app.callServerTool(params),
    builder,
  };
}

function renderReady(): void {
  if (!envelope) return;
  const body = renderView(envelope.view, envelope.mode, envelope.data, makeCtx());
  const bannerHtml = banner ? `<div class="banner">${banner}</div>` : '';
  setHtml(bannerHtml + renderShell(VIEW_LABEL[envelope.view] ?? envelope.view, subLabel(envelope), body));
}

function renderError(detail: string): void {
  phase = 'ready';
  setHtml(renderStatus('error', detail));
}

function renderUnsupported(detail: string): void {
  phase = 'ready';
  setHtml(renderStatus('unsupported', detail));
}

/** Apply a tool result (from host delivery or an App-initiated call). */
function applyResult(res: { isError?: boolean; structuredContent?: unknown; content?: { type: string; text?: string }[] }): void {
  if (res.isError) {
    renderError(res.content?.find((c) => c.type === 'text')?.text ?? 'The tool reported an error.');
    return;
  }
  if (!res.structuredContent) {
    renderUnsupported('The host delivered no structured content for this tool; the compact text is all there is.');
    return;
  }
  const env = parseEnvelope(res.structuredContent);
  if (!env) {
    renderUnsupported('The result envelope is missing or uses an unsupported schemaVersion.');
    return;
  }
  envelope = env;
  if (env.tool !== 'optimize_team') builder = undefined;
  phase = 'ready';
  renderReady();
}

app.ontoolinput = (params) => {
  input = (params.arguments ?? {}) as ToolInput;
  if (Array.isArray(input.team)) {
    builder = { team: [...(input.team as unknown[])], slots: typeof input.slots === 'number' ? (input.slots as number) : 0 };
  }
  banner = null;
  phase = 'loading';
  setHtml(renderStatus('loading', 'Waiting for the tool result…'));
};

app.ontoolresult = (params) => {
  applyResult(params);
};

app.ontoolcancelled = () => {
  phase = 'ready';
  setHtml(renderStatus('empty', 'The tool call was cancelled.'));
};

app.onhostcontextchanged = (ctx) => {
  applyTheme(ctx);
};

app.onteardown = async () => {
  return {};
};

// --- Interactive actions ---------------------------------------------------

async function expandEvidence(): Promise<void> {
  if (!envelope) return;
  setHtml(renderStatus('loading', 'Fetching evidence…'));
  const res = await app.callServerTool({
    name: envelope.tool,
    arguments: { ...input, detail: 'evidence' },
  });
  applyResult(res);
}

async function addMembers(members: string[]): Promise<void> {
  if (!builder || !members.length) return;
  const added = members.map((species) => ({ species }));
  builder.team = [...builder.team, ...added];
  builder.slots = Math.max(0, builder.slots - members.length);
  banner = null;
  setHtml(renderStatus('loading', 'Re-optimizing the roster…'));

  if (builder.slots > 0) {
    const res = await app.callServerTool({
      name: 'optimize_team',
      arguments: { ...input, team: builder.team, slots: builder.slots },
    });
    applyResult(res);
    return;
  }
  await finalizeBuilder();
}

async function finalizeBuilder(): Promise<void> {
  const regulation = typeof input.regulation === 'string' ? input.regulation : undefined;
  const legalityArgs: Record<string, unknown> = { mode: 'legality', team: builder!.team };
  if (regulation) legalityArgs.regulation = regulation;

  const legality = await app.callServerTool({ name: 'team_io', arguments: legalityArgs });
  const leg = (legality.structuredContent ?? {}) as { valid?: boolean; violations?: string[]; teamSize?: number };
  const valid = leg.valid === true;
  banner = valid
    ? `Legality: valid under ${regulation ?? 'the current set'}.`
    : `Legality: ${leg.violations?.length ?? 0} violation(s) — ${(leg.violations ?? []).slice(0, 3).join('; ')}`;

  const analyzeArgs: Record<string, unknown> = { mode: 'synergy', team: builder!.team };
  if (regulation) analyzeArgs.regulation = regulation;
  const synergy = await app.callServerTool({ name: 'analyze_team', arguments: analyzeArgs });
  applyResult(synergy);
}

async function exportPaste(): Promise<void> {
  const team = builder?.team ?? (Array.isArray(input.team) ? input.team : []);
  setHtml(renderStatus('loading', 'Rendering the paste…'));
  const res = await app.callServerTool({ name: 'team_io', arguments: { mode: 'format', team } });
  const paste = (res.structuredContent as { paste?: string } | undefined)?.paste ?? '';
  const pasteHtml = `<section class="panel"><h2>Paste export</h2><textarea class="paste" readonly rows="14" spellcheck="false">${paste
    .replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`)}</textarea><p class="note">Round-trips through team_io parse.</p><button type="button" class="secondary" data-action="back">Back</button></section>`;
  setHtml(renderShell('Team Builder', 'paste export', pasteHtml));
}

document.addEventListener('click', (ev) => {
  const target = ev.target as HTMLElement | null;
  if (!target) return;
  const expand = target.closest('[data-expand]');
  if (expand) {
    void expandEvidence();
    return;
  }
  const add = target.closest('[data-add]');
  if (add) {
    let members: string[] = [];
    try {
      members = JSON.parse(add.getAttribute('data-add') ?? '[]') as string[];
    } catch {
      members = [];
    }
    void addMembers(members);
    return;
  }
  const action = target.closest('[data-action]');
  if (action?.getAttribute('data-action') === 'export') {
    void exportPaste();
    return;
  }
  if (action?.getAttribute('data-action') === 'back') {
    renderReady();
  }
});

// --- Boot ------------------------------------------------------------------

app.connect().then(() => {
  const ctx = app.getHostContext();
  if (ctx) applyTheme(ctx);
  if (phase === 'loading') setHtml(renderStatus('empty', 'No tool result has arrived yet.'));
});
