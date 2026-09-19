/**
 * Scouting: replay → normalized battle observations → set inference → rematch
 * preparation, one deterministic pipeline. The player pastes their team (the
 * sets the replay cannot contain), the log, and the opponent species to
 * scout; this extracts what the log proves about it (Speed relations against
 * known members, damage it took from them, item and ability reveals) and runs
 * the shared SetInferenceEngine. The model explains the result;
 * getcompetitive proved it.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toID } from '../dex.js';
import { runInference, type BattleObservation } from '../inference.js';
import { ok, wrap, READ_ONLY_ANNOTATIONS } from '../result.js';
import { parseReplay } from './replay.js';
import { parsedSetSchema, resolveMembers, type ParsedSet } from './team.js';

export function registerScoutTool(server: McpServer) {
  server.registerTool(
    'scout_opponent',
    {
      title: 'Scout an opponent from a replay',
      description:
        'One deterministic pipeline: replay → battle observations → set inference → rematch preparation. Paste the battle log, your team with its real sets (the log cannot contain them), and the opponent species to scout; the tool extracts what the log proves about it — Speed relations against your known members, the damage it took from them, and any item or ability the log revealed — and runs the same SetInferenceEngine the "infer" mode uses, so the surviving candidate sets come with the narrowing shown. The rematch note points the result at `prepare_matchup`. A log proves only what it contains: every extracted observation is restated so the scouting is auditable. Read-only and offline.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        log: z.string().describe('The battle log text, exactly as exported (lines beginning with |).'),
        team: z
          .array(parsedSetSchema)
          .min(1)
          .max(6)
          .describe('Your team with its real sets — the Speed reference and the attackers\u2019 damage math need them.'),
        species: z.string().describe('The opponent species to scout, e.g. "Sneasler"; must appear on the opposing side of the log.'),
        regulation: z.string().optional().describe('Regulation id, e.g. "m-c"; scopes the meta prior for the inference.'),
      },
      outputSchema: {
        target: z.string().describe('The scouted species as resolved.'),
        observations: z.array(z.string()).describe('Every battle observation the log yielded, restated in order.'),
        observedMoves: z.array(z.string()).optional().describe('Moves the log shows the target using; present when it used any.'),
        inference: z
          .object({
            species: z.string().describe('The species as resolved.'),
            priorSets: z.number().int().describe('Candidate sets considered before any observation.'),
            survivingSets: z.number().int().describe('Candidates still possible after the last observation.'),
            constraints: z.array(z.object({ observation: z.string(), before: z.number().int(), after: z.number().int(), eliminated: z.number().int() })).describe('The narrowing, shown.'),
            candidates: z
              .array(
                z.object({
                  item: z.string().optional(),
                  ability: z.string(),
                  nature: z.string(),
                  evs: z.record(z.string(), z.number()),
                  speed: z.number().int(),
                  probability: z.number(),
                }),
              )
              .describe('The surviving sets, most likely first.'),
            note: z.string().describe('The engine\u2019s assumptions.'),
          })
          .describe('The set inference over the extracted observations.'),
        rematch: z.object({ note: z.string().describe('How to feed the result into prepare_matchup for the rematch.') }),
      },
    },
    wrap(async (args: { log: string; team: ParsedSet[]; species: string; regulation?: string }) => {
      const { members } = resolveMembers(args.team);
      const replay = parseReplay(args.log);

      const memberByName = new Map(members.map((m) => [toID(m.species), m]));
      const ourSide = (['p1', 'p2'] as const).find((side) => replay.teams[side].some((name) => memberByName.has(toID(name)))) ?? 'p1';
      const theirSide = ourSide === 'p1' ? 'p2' : 'p1';
      const targetKey = toID(args.species);
      if (!replay.teams[theirSide].some((name) => toID(name) === targetKey)) {
        throw new Error(
          `"${args.species}" was not seen on the opposing side (${replay.teams[theirSide].join(', ')}); your side resolved to ${ourSide}.`,
        );
      }
      const targetName = replay.teams[theirSide].find((name) => toID(name) === targetKey)!;

      const observations: BattleObservation[] = [];
      const observedMoves = new Set<string>();

      for (const s of replay.speed) {
        if (observations.filter((o) => o.kind === 'speed').length >= 4) break;
        const fasterName = (s.faster.split(':')[1] ?? '').trim();
        const slowerName = (s.slower.split(':')[1] ?? '').trim();
        const fasterIsTarget = toID(fasterName) === targetKey;
        const slowerIsTarget = toID(slowerName) === targetKey;
        const ours = fasterIsTarget ? memberByName.get(toID(slowerName)) : slowerIsTarget ? memberByName.get(toID(fasterName)) : undefined;
        if (!ours) continue;
        observations.push(
          fasterIsTarget
            ? { kind: 'speed', referenceSpeed: ours.speed, relation: 'outsped' }
            : { kind: 'speed', referenceSpeed: ours.speed, relation: 'outspeeds' },
        );
      }

      for (const d of replay.damage) {
        if (observations.filter((o) => o.kind === 'damageTaken').length >= 4) break;
        const defenderName = (d.defender.split(':')[1] ?? '').trim();
        if (toID(defenderName) !== targetKey) continue;
        const attackerName = (d.attacker.split(':')[1] ?? '').trim();
        const ours = memberByName.get(toID(attackerName));
        if (!ours) continue;
        observations.push({
          kind: 'damageTaken',
          move: d.move,
          attacker: {
            species: ours.species,
            ...(ours.set.nature ? { nature: ours.set.nature } : {}),
            ...(ours.set.evs ? { evs: ours.set.evs } : {}),
            ...(ours.set.championsPoints ? { championsPoints: ours.set.championsPoints } : {}),
            ...(ours.set.item ? { item: ours.set.item } : {}),
            ...(ours.set.ability ? { ability: ours.set.ability } : {}),
          },
          // The log reports cumulative HP; the observation needs the per-hit share.
          percentTaken: d.taken,
        });
      }

      for (const [posKey, name] of Object.entries(replay.positions)) {
        if (toID(name) !== targetKey) continue;
        const item = replay.itemReveals[posKey];
        if (item && !observations.some((o) => o.kind === 'item')) observations.push({ kind: 'item', item });
        const ability = replay.abilityReveals[posKey];
        if (ability && !observations.some((o) => o.kind === 'ability')) observations.push({ kind: 'ability', ability });
        for (const move of replay.movesByPos[posKey] ?? []) observedMoves.add(move);
      }

      if (!observations.length) {
        throw new Error(`The log contains no usable observations about ${targetName}: no Speed relations against your members, no damage it took from them, and no reveals.`);
      }

      const inference = runInference(targetName, observations.slice(0, 8), args.regulation);
      return ok({
        target: inference.species,
        observations: inference.constraints.map((c) => c.observation),
        ...(observedMoves.size ? { observedMoves: [...observedMoves] } : {}),
        inference,
        rematch: {
          note: 'Feed the surviving candidates into prepare_matchup as the opponent\u2019s sets — the top candidate is the set to prepare for, the spread across candidates is the uncertainty to respect.',
        },
      });
    }),
  );
}
