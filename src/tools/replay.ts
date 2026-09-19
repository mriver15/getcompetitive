/**
 * Replay analysis: a Showdown-format battle log in, a deterministic post-match
 * read out. Pure text parsing over the bundled dataset — the caller pastes the
 * log (the server does no network I/O, so it cannot fetch replay URLs; a client
 * that has the URL can fetch and paste it). What the log proves is extracted
 * exactly: both teams, every KO with the move that caused it, the Speed order
 * observed turn by turn, the damage percentages taken, and a type-coverage read
 * of the matchup. Everything the log does not prove is stated as such.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getDex, typeEffectiveness, TYPES18 } from '../dex.js';
import { ok, wrap, READ_ONLY_ANNOTATIONS } from '../result.js';

interface ParsedReplay {
  players: Record<string, string>;
  winner?: string;
  turns: number;
  teamSize: Record<string, number>;
  teams: Record<string, string[]>;
  kos: { turn: number; move: string; attacker: string; defender: string }[];
  speed: { turn: number; faster: string; slower: string }[];
  damage: { turn: number; move: string; attacker: string; defender: string; percent: number }[];
  unresolved: string[];
}

function parseReplay(log: string): ParsedReplay {
  const dex = getDex(9);
  const players: Record<string, string> = {};
  const species: Record<string, string> = {};
  const seen = { p1: new Set<string>(), p2: new Set<string>() };
  const teamSize: Record<string, number> = {};
  const kos: ParsedReplay['kos'] = [];
  const speed: ParsedReplay['speed'] = [];
  const damage: ParsedReplay['damage'] = [];
  const unresolved: string[] = [];
  const lastMoveOn: Record<string, { turn: number; move: string; attacker: string }> = {};
  const moveOrder: { turn: number; pos: string; side: string }[] = [];
  let winner: string | undefined;
  let currentTurn = 0;

  const recordSpecies = (posKey: string, display: string) => {
    const name = display.split(',')[0].trim();
    species[posKey] = name;
    if (!dex.species.get(name).exists && !unresolved.includes(name)) unresolved.push(name);
    const side = posKey.startsWith('p1') ? 'p1' : 'p2';
    if (name) seen[side as 'p1'].add(name);
  };

  for (const raw of log.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    const [event, ...args] = line.split('|').slice(1);
    switch (event) {
      case 'player':
        players[args[0]] = args[1] ?? args[0];
        break;
      case 'teamsize':
        // |teamsize|p1|6|p2|6
        for (let i = 0; i < args.length; i += 2) teamSize[args[i]] = Number(args[i + 1]);
        break;
      case 'poke': {
        const side = args[0];
        const name = (args[1] ?? '').split(',')[0].trim();
        if (name && (side === 'p1' || side === 'p2')) seen[side].add(name);
        break;
      }
      case 'switch': {
        // |switch|p1a: Sneasler|Sneasler, F|100/100
        const posKey = args[0].split(':')[0];
        recordSpecies(posKey, args[1] ?? '');
        break;
      }
      case 'turn':
        currentTurn = Number(args[0]);
        break;
      case 'move': {
        // |move|p1a: Sneasler|Close Combat|p2a: Rillaboom
        const posKey = args[0].split(':')[0];
        const move = args[1] ?? '';
        const targetKey = (args[2] ?? '').split(':')[0];
        moveOrder.push({ turn: currentTurn, pos: args[0], side: args[0].startsWith('p1') ? 'p1' : 'p2' });
        if (targetKey && targetKey !== '') lastMoveOn[targetKey] = { turn: currentTurn, move, attacker: args[0] };
        break;
      }
      case '-damage': {
        // |-damage|p2a: Rillaboom|71/100|[from] Close Combat
        const targetKey = (args[0] ?? '').split(':')[0];
        const match = (args[1] ?? '').match(/^(\d+)\/(\d+)$/);
        const att = lastMoveOn[targetKey];
        if (match && att) {
          const percent = Number(((Number(match[1]) / Number(match[2])) * 100).toFixed(1));
          damage.push({ turn: currentTurn, move: att.move, attacker: att.attacker, defender: args[0], percent });
        }
        break;
      }
      case 'faint': {
        const targetKey = (args[0] ?? '').split(':')[0];
        const att = lastMoveOn[targetKey];
        kos.push({
          turn: currentTurn,
          move: att?.move ?? '',
          attacker: att?.attacker ?? '',
          defender: args[0] ?? '',
        });
        break;
      }
      case 'win':
        winner = args[0];
        break;
    }
  }

  // Speed order within a turn: moves appear in execution order, so of two
  // opposing movers the earlier one was faster. Caveats are on the caller.
  for (let i = 1; i < moveOrder.length; i++) {
    const a = moveOrder[i - 1];
    const b = moveOrder[i];
    if (a.turn === b.turn && a.side !== b.side && speed.length < 24) {
      speed.push({ turn: a.turn, faster: a.pos, slower: b.pos });
    }
  }

  return {
    players,
    winner,
    turns: currentTurn,
    teamSize,
    teams: { p1: [...seen.p1], p2: [...seen.p2] },
    kos,
    speed,
    damage,
    unresolved,
  };
}

export function registerReplayTool(server: McpServer) {
  server.registerTool(
    'analyze_replay',
    {
      title: 'Analyze a battle replay',
      description:
        'Turn a Showdown-format battle log into a deterministic post-match read: both teams, every KO with the move that caused it, the Speed order observed turn by turn (with the caveats that come with it), the damage percentages taken per hit, and a type-coverage read of the matchup from STAB and the moves actually seen. The log is parsed text, so replay URLs must be fetched and pasted client-side \u2014 the server does no network I/O. A log only proves what it contains: Speed order is read off execution order (priority, Tailwind, Trick Room and paralysis all distort it), damage is reported as the percentage the target showed, and a species the dataset cannot resolve is reported in `unresolvedSpecies` rather than guessed at. Feed the output to `calculate_damage` to check whether an observed roll fits a suspected spread, and `check_speed` to test the speed races it reveals. Read-only and offline.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        log: z
          .string()
          .describe('The battle log text, exactly as exported (lines beginning with |), e.g. from Showdown or a Champions client export.'),
      },
      outputSchema: {
        players: z.array(z.string()).describe('The two players, in side order (p1, p2).'),
        winner: z.string().optional().describe('Winning side; absent when the log ends before a win line.'),
        turns: z.number().int().describe('How many turns the log reached.'),
        teamSize: z.record(z.string(), z.number()).optional().describe('Declared team sizes by side; present only when the log carried a teamsize line.'),
        teams: z
          .object({
            p1: z.array(z.string()).describe('Species seen on side p1, in first-seen order.'),
            p2: z.array(z.string()).describe('Species seen on side p2, in first-seen order.'),
          })
          .describe('The teams as the log revealed them.'),
        kos: z
          .array(
            z.object({
              turn: z.number().int().describe('Turn the faint happened on.'),
              move: z.string().describe('The move that last hit the fainted member; empty when the log does not attribute it.'),
              attacker: z.string().describe('The attacker position, e.g. "p2a: Sneasler"; empty when unattributed.'),
              defender: z.string().describe('The fainted member.'),
            }),
          )
          .describe('Every faint, with the move that caused it.'),
        speedConstraints: z
          .array(
            z.object({
              turn: z.number().int().describe('Turn the pair was observed on.'),
              faster: z.string().describe('The member that moved first.'),
              slower: z.string().describe('The member that moved after it.'),
            }),
          )
          .describe('Speed order read off execution order within each turn, at most 24 pairs; see the note for the caveats.'),
        damageEvents: z
          .array(
            z.object({
              turn: z.number().int().describe('Turn the damage happened on.'),
              move: z.string().describe('The move that dealt it.'),
              attacker: z.string().describe('The attacker.'),
              defender: z.string().describe('The target.'),
              percent: z.number().describe('Damage as a percentage of the target\u2019s shown HP, e.g. 71 for "71/100".'),
            }),
          )
          .describe('Damage events with observed percentages, at most 24.'),
        typeRead: z
          .object({
            p1: z.object({
              uncovered: z.array(z.string()).describe('Types side p1 never hit super-effectively with STAB or observed moves.'),
            }),
            p2: z.object({
              uncovered: z.array(z.string()).describe('Types side p2 never hit super-effectively with STAB or observed moves.'),
            }),
          })
          .describe('Which types each side was never able to answer, from the species and moves the log showed.'),
        unresolvedSpecies: z
          .array(z.string())
          .optional()
          .describe('Species names the dataset could not resolve; present only when the log contained any.'),
        note: z.string().describe('What the log can and cannot prove: Speed order is distorted by priority and field effects, damage percentages are as shown, and the coverage read only knows the moves that appeared.'),
      },
    },
    wrap(async (args: { log: string }) => {
      const parsed = parseReplay(args.log);
      const dex = getDex(9);

      // Type read: per side, the types nothing hits super-effectively, from
      // STAB types and the types of moves the log showed.
      const readSide = (side: 'p1' | 'p2') => {
        const atkTypes = new Set<string>();
        for (const name of parsed.teams[side]) {
          const sp = dex.species.get(name);
          if (sp.exists) for (const t of sp.types) atkTypes.add(t);
        }
        for (const m of parsed.kos.concat(parsed.damage.map((d) => ({ move: d.move })) as never[]).map((k) => k.move)) {
          const mv = dex.moves.get(m);
          if (mv.exists) atkTypes.add(mv.type);
        }
        const uncovered = TYPES18.filter((def) => ![...atkTypes].some((atk) => typeEffectiveness(atk, [def], 9) > 1));
        return { uncovered };
      };

      return ok({
        players: ['p1', 'p2'].map((s) => parsed.players[s] ?? s),
        ...(parsed.winner ? { winner: parsed.winner } : {}),
        turns: parsed.turns,
        ...(Object.keys(parsed.teamSize).length ? { teamSize: parsed.teamSize } : {}),
        teams: parsed.teams,
        kos: parsed.kos,
        speedConstraints: parsed.speed,
        damageEvents: parsed.damage.slice(0, 24),
        typeRead: { p1: readSide('p1'), p2: readSide('p2') },
        ...(parsed.unresolved.length ? { unresolvedSpecies: [...new Set(parsed.unresolved)] } : {}),
        note: 'What a log proves is bounded by what it contains. Speed order is read off execution order, so priority moves, Tailwind, Trick Room and paralysis all distort it — treat each pair as evidence, not proof. Damage percentages are exactly what the target showed. The type read only knows the species and moves that appeared in the log.',
      });
    }),
  );
}
