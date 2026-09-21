/**
 * Team import/export: turn pasted text into the canonical set shape every other
 * tool consumes, and back. One object per member — the shape `analyze_team`,
 * `diagnose_team`, `prepare_matchup`, `check_legality` and the calc tools take.
 *
 * `parse_team` understands:
 *  - Showdown/Pokepaste blocks (blank-line separated, field lines)
 *  - the paste this server emits (`get_set.paste`, Champions stat points)
 *  - one-liners: "Garchomp @ Choice Scarf | Rough Skin | Jolly | 252 Atk / 252 Spe | Earthquake / Dragon Claw"
 *
 * Parsing is forgiving by design: a paste is worth importing even when one name
 * needs fixing, so unknown species, moves, items and abilities become warnings
 * that carry the supplied spelling, never errors.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { NATURES, finalStat, resolveEvs } from '../dex.js';
import { getChampionsDex } from '../champions.js';
import { getRegulationSet } from '../regulations.js';
import { ok, wrap, requireExists, READ_ONLY_ANNOTATIONS, WRITE_ANNOTATIONS } from '../result.js';
import { recordSet, type RecordedBasis } from '../recorded-sets.js';

/** A parsed member in its canonical form — also the input shape of the team tools. */
export interface ParsedSet {
  species: string;
  item?: string;
  ability?: string;
  nature?: string;
  level?: number;
  ivs?: Record<string, number>;
  evs?: Record<string, number>;
  championsPoints?: Record<string, number>;
  moves?: string[];
}

const statToken = {
  hp: 'hp',
  atk: 'atk', attack: 'atk',
  def: 'def', defense: 'def',
  spa: 'spa', spatk: 'spa', spattack: 'spa',
  spd: 'spd', spdef: 'spd', spdefense: 'spd',
  spe: 'spe', speed: 'spe',
} as const;

const STAT_LABEL: Record<string, string> = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
const SPREAD_STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
const NATURE_KEYS = new Set((NATURES as readonly string[]).map((n) => n.toLowerCase()));

/** Split "252 HP / 252 Atk / 4 SpD" into a stat-keyed map; null on a bad token. */
function parseSpread(text: string): { map: Record<string, number>; bad: string | null } {
  const map: Record<string, number> = {};
  for (const m of text.matchAll(/(\d+)\s*([A-Za-z]+)/g)) {
    const token = String(m[2]).toLowerCase();
    const stat = (statToken as Record<string, string>)[token];
    if (!stat) return { map, bad: String(m[2]) };
    map[stat] = (map[stat] ?? 0) + Number(m[1]);
  }
  return { map, bad: null };
}

/**
 * Resolve one spread line to a scale. The server's own pastes write Champions
 * points (0-32, total 66) under the `EVs:` label, while standard Showdown pastes
 * write 0-252 EVs there — so the label alone is not decisive. The rule: an
 * explicit SP label is always points; otherwise values that all fit 0-32 and
 * total at most 66 are points, anything else is EVs.
 */
function parseSpreadLine(text: string, label: string | undefined, warnings: string[]): Partial<ParsedSet> {
  const { map, bad } = parseSpread(text);
  if (bad) {
    warnings.push(`unknown stat token "${bad}" in "${text.trim()}"`);
    return {};
  }
  const values = Object.values(map);
  const total = values.reduce((a, b) => a + b, 0);
  const isPoints = label === 'sp' || (label === 'evs' && values.every((v) => v <= 32) && total <= 66);
  if (isPoints) {
    if (total > 66) warnings.push(`stat point total ${total} exceeds 66.`);
    return { championsPoints: map };
  }
  if (total > 510) warnings.push(`EV total ${total} exceeds 510.`);
  if (values.some((v) => v % 4 !== 0)) warnings.push('EVs are not all multiples of 4.');
  return { evs: map };
}

/** Parse one Showdown-format block: "Species @ Item", field lines, "- Move" lines. */
function parseBlock(block: string, warnings: string[]): ParsedSet | null {
  const lines = block.split('\n').map((l) => l.trim());
  const head = lines[0] ?? '';
  if (!head) return null;
  const [speciesRaw, ...itemParts] = head.split('@');
  const speciesToken = speciesRaw.trim().replace(/\s*\([MF]\)$/, '');
  const set: ParsedSet = { species: speciesToken };

  const dex = getChampionsDex();
  const sp = dex.species.get(speciesToken);
  if (sp.exists) set.species = sp.name;
  else warnings.push(`unknown species "${speciesToken}"`);

  if (itemParts.length) {
    const itemToken = itemParts.join('@').trim();
    const it = dex.items.get(itemToken);
    set.item = it.exists ? it.name : itemToken;
    if (!it.exists) warnings.push(`unknown item "${itemToken}"`);
  }

  for (const line of lines.slice(1)) {
    if (!line) continue;
    const mv = line.match(/^-\s*(.+)$/);
    if (mv) {
      const m = dex.moves.get(mv[1]);
      const name = m.exists ? m.name : mv[1];
      set.moves = [...(set.moves ?? []), name];
      if (!m.exists) warnings.push(`unknown move "${mv[1]}"`);
      continue;
    }
    const ability = line.match(/^Ability:\s*(.+)$/i);
    if (ability) {
      const a = dex.abilities.get(ability[1]);
      set.ability = a.exists ? a.name : ability[1];
      if (!a.exists) warnings.push(`unknown ability "${ability[1]}"`);
      continue;
    }
    const level = line.match(/^Level:\s*(\d+)$/i);
    if (level) {
      set.level = Number(level[1]);
      continue;
    }
    const nature = line.match(/^(.+?)\s+Nature$/i);
    if (nature) {
      const key = nature[1].toLowerCase();
      const canonical = (NATURES as readonly string[]).find((n) => n.toLowerCase() === key);
      set.nature = canonical ?? nature[1];
      if (!canonical) warnings.push(`unknown nature "${nature[1]}"`);
      continue;
    }
    const ivs = line.match(/^IVs:\s*(.+)$/i);
    if (ivs) {
      const { map, bad } = parseSpread(ivs[1]);
      if (bad) warnings.push(`unknown stat token "${bad}" in IVs`);
      else set.ivs = map;
      continue;
    }
    const evs = line.match(/^EVs:\s*(.+)$/i);
    if (evs) {
      Object.assign(set, parseSpreadLine(evs[1], 'evs', warnings));
      continue;
    }
    const points = line.match(/^(?:SP|Stat Points):\s*(.+)$/i);
    if (points) {
      Object.assign(set, parseSpreadLine(points[1], 'sp', warnings));
      continue;
    }
    // Paste metadata this game has no field for: a trainer's tags, and the labels
    // other formats carry that change nothing about the set. Dropped rather than
    // warned about, so a paste from elsewhere imports quietly.
    if (/^(Shiny|OT|TID|SID|Happiness|Friendship|Language|Tera Type):/i.test(line)) continue;
    warnings.push(`unrecognized line "${line}"`);
  }
  return set;
}

/** Parse one shorthand line: "Garchomp @ Choice Scarf | Rough Skin | Jolly | 252 Atk / 252 Spe | EQ / Dragon Claw". */
function parseInline(line: string, warnings: string[]): ParsedSet | null {
  const parts = line.split('|').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  const [speciesRaw, ...itemParts] = parts[0].split('@');
  const speciesToken = speciesRaw.trim().replace(/\s*\([MF]\)$/, '');
  const set: ParsedSet = { species: speciesToken };

  const dex = getChampionsDex();
  const sp = dex.species.get(speciesToken);
  if (sp.exists) set.species = sp.name;
  else warnings.push(`unknown species "${speciesToken}"`);
  if (itemParts.length) {
    const itemToken = itemParts.join('@').trim();
    const it = dex.items.get(itemToken);
    set.item = it.exists ? it.name : itemToken;
    if (!it.exists) warnings.push(`unknown item "${itemToken}"`);
  }

  for (const tok of parts.slice(1)) {
    if (/^Ability:\s*/i.test(tok)) {
      const raw = tok.replace(/^Ability:\s*/i, '');
      const a = dex.abilities.get(raw);
      set.ability = a.exists ? a.name : raw;
      if (!a.exists) warnings.push(`unknown ability "${raw}"`);
      continue;
    }
    if (/^Tera Type:\s*/i.test(tok)) continue;
    if (/^Nature$/i.test(tok)) continue;
    if (NATURE_KEYS.has(tok.toLowerCase())) {
      set.nature = (NATURES as readonly string[]).find((n) => n.toLowerCase() === tok.toLowerCase()) ?? tok;
      continue;
    }
    const a = dex.abilities.get(tok);
    if (a.exists && !set.ability) {
      set.ability = a.name;
      continue;
    }
    if (/\d+\s*[A-Za-z]/.test(tok)) {
      const { map, bad } = parseSpread(tok);
      if (bad) {
        warnings.push(`unknown stat token "${bad}" in "${tok}"`);
        continue;
      }
      const values = Object.values(map);
      const total = values.reduce((x, y) => x + y, 0);
      Object.assign(
        set,
        values.every((v) => v <= 32) && total <= 66 ? { championsPoints: map } : { evs: map },
      );
      continue;
    }
    // Remaining: one move or a slash/comma-separated move list.
    for (const raw of tok.split(/[/,]/).map((s) => s.trim()).filter(Boolean)) {
      const m = dex.moves.get(raw);
      const name = m.exists ? m.name : raw;
      set.moves = [...(set.moves ?? []), name];
      if (!m.exists) warnings.push(`unknown move "${raw}"`);
    }
  }
  return set;
}

function looksLikeBlock(block: string): boolean {
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return false;
  return (
    lines[0].includes('@') ||
    /^(Ability|Level|IVs|EVs|SP|Stat Points|Tera Type):/i.test(lines[1]) ||
    /^.+Nature$/i.test(lines[1]) ||
    lines[1].startsWith('-')
  );
}

/** Parse pasted text into canonical sets; everything questionable becomes a warning. */
export function parseTeamText(text: string, regulation?: string): { team: ParsedSet[]; warnings: string[] } {
  const warnings: string[] = [];
  const team: ParsedSet[] = [];
  const blocks = text.split(/\n\s*\n/);

  for (const block of blocks) {
    if (!block.trim()) continue;
    const set = looksLikeBlock(block) ? parseBlock(block, warnings) : parseInline(block, warnings);
    if (set) team.push(set);
  }

  if (regulation) {
    const reg = getRegulationSet(regulation);
    if (!reg) warnings.push(`unknown regulation "${regulation}" — no legality check was run.`);
    else {
      const dex = getChampionsDex();
      const eligible = new Set(reg.eligibleSpecies.map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')));
      team.forEach((s) => {
        const sp = dex.species.get(s.species);
        const baseId = sp.exists ? (sp.baseSpecies || sp.name).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
        // Unknown species were already warned once, when the block was parsed.
        if (sp.exists && !eligible.has(baseId)) {
          warnings.push(`${s.species} is not in the ${reg.name} legal roster.`);
        }
      });
    }
  }

  return { team, warnings };
}

/** One set back to paste form; spreads come back in the scale they were given. */
function formatOne(set: ParsedSet): string {
  const lines = [set.item ? `${set.species} @ ${set.item}` : set.species];
  if (set.ability) lines.push(`Ability: ${set.ability}`);
  if (set.level) lines.push(`Level: ${set.level}`);
  if (set.nature) lines.push(`${set.nature} Nature`);
  if (set.ivs) lines.push(`IVs: ${SPREAD_STATS.filter((s) => set.ivs![s]).map((s) => `${set.ivs![s]} ${STAT_LABEL[s]}`).join(' / ')}`);
  const spread = set.evs ?? set.championsPoints;
  if (spread) {
    // Same label and scale the server's own `get_set` pastes use.
    lines.push(`EVs: ${SPREAD_STATS.filter((s) => spread[s]).map((s) => `${spread[s]} ${STAT_LABEL[s]}`).join(' / ')}`);
  }
  for (const m of set.moves ?? []) lines.push(`- ${m}`);
  return lines.join('\n');
}

export const parsedSetSchema = z.object({
  species: z
    .string()
    .describe('Species as the dataset resolves it, e.g. "Rotom-Wash", "Salamence-Mega"; the spelling supplied is kept when the species is unknown.'),
  item: z.string().optional().describe('Held item, canonical spelling when known.'),
  ability: z.string().optional().describe('Ability, canonical spelling when known.'),
  nature: z.string().optional().describe('Nature as supplied.'),
  level: z.number().int().optional().describe('Level when the paste stated one; Champions always plays at 50.'),
  ivs: z.record(z.string(), z.number()).optional().describe('IVs from an IVs line, keyed by stat id.'),
  evs: z
    .record(z.string(), z.number())
    .optional()
    .describe('EVs keyed by stat id, 0-252; present when the spread was parsed as EV-scale.'),
  championsPoints: z
    .record(z.string(), z.number())
    .optional()
    .describe(
      'Pok\u00e9mon Champions stat points keyed by stat id, 0-32 each, 66 total; present when the spread was parsed as point-scale — values that all fit 0-32 and total at most 66, or an explicit SP line.',
    ),
  moves: z.array(z.string()).optional().describe('Moves in paste order, canonical spelling when known.'),
});

export const parsedSetOutput = z.object({
  ...parsedSetSchema.shape,
});

/** A team member resolved against the dataset, with its real level-50 Speed. */
export interface ResolvedMember {
  species: string;
  baseSpecies: string;
  types: string[];
  baseSpe: number;
  speed: number;
  moveTypes: string[];
  moves: string[];
  item?: string;
  ability?: string;
  set: ParsedSet;
}

/**
 * Resolve parsed sets the way the analysis tools need them: real types, resolved
 * moves, and level-50 Speed from nature, spread and item (Choice Scarf). Unknown
 * species, items and natures throw; unknown moves are collected, not fatal.
 */
export function resolveMembers(entries: ParsedSet[]): { members: ResolvedMember[]; unknownMoves: string[] } {
  const dex = getChampionsDex();
  const members: ResolvedMember[] = [];
  const unknownMoves: string[] = [];

  for (const entry of entries) {
    const sp = dex.species.get(entry.species);
    requireExists(sp, 'Pokemon species', entry.species);
    const moves: string[] = [];
    const moveTypes: string[] = [];
    for (const mv of entry.moves ?? []) {
      const m = dex.moves.get(mv);
      if (m.exists) {
        moves.push(m.name);
        moveTypes.push(m.type);
      } else unknownMoves.push(mv);
    }
    const nature = entry.nature ?? 'Serious';
    if (entry.nature) requireExists(dex.natures.get(entry.nature), 'nature', entry.nature);
    const item = entry.item ? dex.items.get(entry.item) : undefined;
    if (item && !item.exists) throw new Error(`Unknown item "${entry.item}".`);
    const evs = resolveEvs(entry.evs, entry.championsPoints);
    const baseSpeed = finalStat(9, 'spe', sp.baseStats.spe, 31, evs.spe ?? 0, 50, nature);
    members.push({
      species: sp.name,
      baseSpecies: sp.baseSpecies || sp.name,
      types: [...sp.types],
      baseSpe: sp.baseStats.spe,
      speed: item?.name === 'Choice Scarf' ? Math.floor(baseSpeed * 1.5) : baseSpeed,
      moveTypes,
      moves,
      item: item?.name,
      ability: entry.ability,
      set: entry,
    });
  }
  return { members, unknownMoves };
}

export function registerTeamTools(server: McpServer) {
  server.registerTool(
    'parse_team',
    {
      title: 'Parse a pasted team',
      description:
        'Turn pasted team text into the canonical structured form every other tool on this server consumes, in one call instead of six hand-built JSON objects. Accepts Showdown/Pokepaste blocks separated by blank lines, the paste `get_set` returns, and one-liners like "Garchomp @ Choice Scarf | Rough Skin | Jolly | 252 Atk / 252 Spe | Earthquake / Dragon Claw". Field lines understood: `Ability`, `Level`, `Nature`, `IVs`, `EVs` (0-252), `SP`/`Stat Points` (Champions 0-32), and `- Move` lines. An `EVs:` line whose values all fit 0-32 and total at most 66 is read as Champions stat points, matching the server\u2019s own pastes. Species, moves, items and abilities resolve case- and punctuation-insensitively; anything unknown or illegal becomes a `warnings` entry that carries the supplied spelling — a paste is worth importing even when one name needs fixing. Feed the returned `team` straight into `diagnose_team`, `prepare_matchup`, `analyze_team`, `check_legality`, or the calc tools; `format_team` turns it back into paste text. Read-only and offline.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        text: z
          .string()
          .describe('The team text: one Showdown-format block per Pok\u00e9mon, separated by blank lines, or one shorthand line per Pok\u00e9mon with pipe-separated fields.'),
        regulation: z
          .string()
          .optional()
          .describe('Optional regulation id (e.g. "m-c") to check species legality against; illegal species become warnings, the team is still returned.'),
      },
      outputSchema: {
        team: z
          .array(parsedSetOutput)
          .describe('One canonical set per Pok\u00e9mon, in paste order — the shape `diagnose_team`, `prepare_matchup`, `analyze_team`, `check_legality` and the calc tools take.'),
        warnings: z
          .array(z.string())
          .optional()
          .describe('Everything the parser could not cleanly resolve: unknown species, moves, items, abilities or natures, illegal species when a regulation was given, and unrecognized lines; absent when the text parsed cleanly.'),
        note: z
          .string()
          .describe('What the parser accepts and the spread-scale rule: an EVs line whose values all fit 0-32 and total at most 66 is Champions stat points, anything else is 0-252 EVs.'),
      },
    },
    wrap(async (args: { text: string; regulation?: string }) => {
      const { team, warnings } = parseTeamText(args.text, args.regulation);
      if (!team.length) throw new Error('No Pok\u00e9mon found in the text: expected Showdown blocks or shorthand lines, e.g. "Garchomp @ Choice Scarf | Rough Skin | Jolly | 252 Atk / 252 Spe | Earthquake / Dragon Claw".');
      return ok({
        team,
        ...(warnings.length ? { warnings } : {}),
        note: 'Parsed blocks and shorthand lines into the canonical set shape. Spread scale: an EVs line whose values all fit 0-32 and total at most 66 is Champions stat points (the server\u2019s own paste convention), anything else is 0-252 EVs; an explicit SP or Stat Points line is always points.',
      });
    }),
  );

  server.registerTool(
    'format_team',
    {
      title: 'Format a team as a paste',
      description:
        'Render a canonical team back into Showdown-format paste text, one block per member: `Species @ Item`, ability, level, nature, spread and `- Move` lines — ready to copy into a team builder, a paste host, or back into `parse_team`. Spreads come back in the scale they were given: 0-252 EVs for EV-scale sets, Champions stat points under the EVs label for point-scale sets, exactly like the `get_set` paste. Read-only and offline.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        team: z
          .array(parsedSetSchema)
          .min(1)
          .max(6)
          .describe('The team to render, in the canonical shape `parse_team` and the analysis tools use: species with optional item, ability, nature, level, ivs, evs or championsPoints, and moves.'),
      },
      outputSchema: {
        paste: z.string().describe('The team as one Showdown-format paste, members separated by blank lines.'),
        note: z.string().describe('The spread-scale convention: Champions point spreads keep their 0-32 values, EV spreads keep 0-252, so the paste round-trips through `parse_team`.'),
      },
    },
    wrap(async (args: { team: ParsedSet[] }) => {
      return ok({
        paste: args.team.map(formatOne).join('\n\n'),
        note: 'Spreads keep the scale they were given (Champions points stay 0-32, EVs stay 0-252), so this paste round-trips through `parse_team` unchanged.',
      });
    }),
  );

  server.registerTool(
    'record_set',
    {
      title: 'Record a generated set',
      description:
        'File a Pok\u00e9mon Champions set the reasoning produced into the local, per-user record, so a set generated once can be read back later \u2014 `get_set` returns it under `recorded` when asked with `includeRecorded`. The usage-derived meta (`list_threats`, `get_set`) stays the only home of measured usage: a record carries no rank, no usage share and no sample, and is labelled with how it was arrived at \u2014 "inferred" (solved from battle observations) or "proposed" (generated for a team). The store is one JSON-Lines file per user, `$GETCOMPETITIVE_STORE` or `~/.getcompetitive/sets.jsonl`, created on first write; re-recording an identical set is a no-op (`created: false`) and a changed spread, item or move set is filed as a new record, so the file is the timeline of what was generated. The set is resolved against the dataset with the same rules the rest of the server uses, so an unknown species, item, nature or an illegal spread is rejected rather than filed, while unknown moves come back as `warnings` and the set is filed as given. This is the only tool on the server that writes anything; where there is no writable filesystem (the hosted endpoint) it returns an isError naming the path it could not write.',
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        set: parsedSetSchema.describe('The set to file, in the canonical shape `parse_team`, `diagnose_team`, `infer_set` and the analysis tools all consume.'),
        basis: z
          .enum(['inferred', 'proposed'])
          .describe('How the set was arrived at: "inferred" when it was solved from battle observations, "proposed" when the reasoning generated it for a team. Neither is measured usage.'),
        tool: z
          .string()
          .describe('Which part of the reasoning produced it, e.g. "infer_set", "diagnose_team", "optimize_team"; carried verbatim into the record\u2019s `origin`.'),
        note: z
          .string()
          .optional()
          .describe('Why this set exists \u2014 the question it answers or the evidence behind it; carried verbatim into the record\u2019s `origin`.'),
        regulation: z
          .string()
          .optional()
          .describe('Regulation the set was generated for, e.g. "m-c"; when given it must resolve, and it becomes part of the record\u2019s identity.'),
      },
      outputSchema: {
        created: z.boolean().describe('True when a new record was appended; false when the identical set was already on file, in which case nothing was written.'),
        id: z.string().describe('The record\u2019s canonical id: a hash of the set itself, so the same set is always one record.'),
        species: z.string().describe('Base species the record is filed under; forms collapse as they do in the usage data.'),
        basis: z.enum(['inferred', 'proposed']).describe('How the set was arrived at, as filed.'),
        regulation: z.string().optional().describe('Regulation the record was filed for; absent when none was given.'),
        origin: z
          .object({
            tool: z.string().describe('Which part of the reasoning produced the set.'),
            note: z.string().optional().describe('Why the set exists; absent when none was given.'),
          })
          .describe('Where the set came from, as filed.'),
        recordedAt: z.string().describe('ISO timestamp of the write.'),
        stored: z.number().int().describe('How many records the store holds after this call.'),
        skipped: z.number().int().describe('Lines already in the store that were not whole records and were ignored.'),
        path: z.string().describe('The store file that was read, and appended to when something was created.'),
        warnings: z
          .array(z.string())
          .optional()
          .describe('Names that did not resolve against the dataset, e.g. moves; the set was filed as given. Absent when everything resolved.'),
        note: z.string().describe('What the record means: it is not measured usage, and where it lives.'),
      },
    },
    wrap(async (args: { set: ParsedSet; basis: RecordedBasis; tool: string; note?: string; regulation?: string }) => {
      if (args.regulation && !getRegulationSet(args.regulation)) throw new Error(`Unknown regulation "${args.regulation}".`);

      // The same resolution every other tool applies: an unknown species, item,
      // nature or an illegal spread is a rejected write, not a filed record.
      const { members, unknownMoves } = resolveMembers([args.set]);
      const member = members[0];
      const warnings = unknownMoves.map((mv) => `unknown move "${mv}"`);
      const ability = args.set.ability ? getChampionsDex().abilities.get(args.set.ability) : undefined;
      if (ability && !ability.exists) warnings.push(`unknown ability "${args.set.ability}"`);

      const result = recordSet({
        set: {
          ...args.set,
          species: member.species,
          ...(member.item ? { item: member.item } : {}),
          ...(member.moves.length ? { moves: member.moves } : {}),
        },
        basis: args.basis,
        origin: { tool: args.tool, ...(args.note ? { note: args.note } : {}) },
        ...(args.regulation ? { regulation: args.regulation } : {}),
      });

      return ok({
        created: result.created,
        id: result.record.id,
        species: result.record.species,
        basis: result.record.basis,
        ...(result.record.regulation ? { regulation: result.record.regulation } : {}),
        origin: result.record.origin,
        recordedAt: result.record.recordedAt,
        stored: result.stored,
        skipped: result.skipped,
        path: result.path,
        ...(warnings.length ? { warnings } : {}),
        note: result.created
          ? `Filed under ${result.record.species} in ${result.path}. A record is not usage data \u2014 no rank, no usage share, no sample \u2014 and \`get_set\` returns it only with \`includeRecorded\`.`
          : `This exact set was already on file as ${result.record.id} (${result.record.recordedAt}); nothing was written.`,
      });
    }),
  );
}
