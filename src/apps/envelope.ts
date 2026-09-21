/**
 * The MCP App structured-content envelope: the small versioned wrapper the
 * three App-linked tools (`analyze_team`, `optimize_team`, `prepare_matchup`)
 * put around their analytics payload so a View can pick the right component
 * without parsing the raw shape. The analytics themselves are untouched — they
 * sit in `data`, filtered to the requested `detail` level exactly as the model
 * text is — so the public analytics schema is preserved and only this wrapper
 * is added on top.
 *
 *   { schemaVersion: 1, view: "teamDoctor", tool: "analyze_team",
 *     mode: "synergy", regulation: "m-c", data: { … } }
 *
 * `schemaVersion` is the migration hook: a View that does not recognise the
 * number renders the unsupported-schema state instead of guessing at fields.
 */
export const SCHEMA_VERSION = 1 as const;

/** The one bundled HTML resource every App-linked tool points at. */
export const WORKSPACE_RESOURCE_URI = 'ui://getcompetitive/workspace';

export type AppViewId = 'teamDoctor' | 'teamBuilder' | 'matchupBoard';

export interface AppEnvelope {
  /** Envelope format version. Bump on a breaking envelope change, never in place. */
  schemaVersion: typeof SCHEMA_VERSION;
  /** Which View renders this payload. */
  view: AppViewId;
  /** The compound tool that produced it, e.g. "analyze_team". */
  tool: string;
  /** The dispatch mode for compound tools, e.g. "synergy" | "diagnose". */
  mode?: string;
  /** The regulation id the call supplied (or resolved), e.g. "m-c". */
  regulation?: string;
  /** The existing analytics payload, leveled to the requested `detail`. */
  data: Record<string, unknown>;
  /** Assignable as a `CallToolResult.structuredContent` record. */
  [key: string]: unknown;
}

/** tool -> mode -> view. Modes omitted here are not App-linked. */
const VIEW_BY_TOOL: Record<string, Record<string, AppViewId>> = {
  analyze_team: { synergy: 'teamDoctor', diagnose: 'teamDoctor' },
  optimize_team: { default: 'teamBuilder' },
  prepare_matchup: { default: 'matchupBoard' },
};

/** The App view a tool/mode renders, or undefined when the tool has no App. */
export function viewFor(tool: string, mode?: string): AppViewId | undefined {
  const byMode = VIEW_BY_TOOL[tool];
  if (!byMode) return undefined;
  return byMode[mode ?? 'default'] ?? byMode.default;
}

/** Wrap a leveled analytics payload in the versioned App envelope. */
export function wrapEnvelope(
  tool: string,
  mode: string | undefined,
  data: Record<string, unknown>,
  regulation: string | undefined,
): AppEnvelope {
  const envelope: AppEnvelope = { schemaVersion: SCHEMA_VERSION, view: viewFor(tool, mode)!, tool, data };
  if (mode) envelope.mode = mode;
  if (regulation) envelope.regulation = regulation;
  return envelope;
}
