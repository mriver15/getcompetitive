/**
 * Team diagnosis: "here is my team — fix it." This is the deterministic half of
 * the coaching loop: it finds the problems with evidence, and lists concrete
 * candidate changes each backed by a calculation or a usage fact. Explaining
 * them to the player is the caller's job — the server only proves.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { typeEffectiveness, TYPES18, finalStat, learnableMoveIds, resolveEvs } from '../dex.js';
import { getChampionsDex } from '../champions.js';
import { REGULATION_SETS, getRegulationSet, setStatus } from '../regulations.js';
import { THREAT_LISTS, getThreatList, findThreat } from '../threats.js';
import { ok, wrap, READ_ONLY_ANNOTATIONS } from '../result.js';
import { evaluateMatchup, ANSWER_CLASS_RANK, type AnswerClass } from '../evaluator.js';
import { parsedSetSchema, resolveMembers, type ParsedSet } from './team.js';

const problemSchema = z.object({
  statement: z.string().describe('The weakness, in one sentence.'),
  severity: z.enum(['high', 'medium', 'low']).describe('How much it matters: high is a top threat the team cannot hit or a deep stacked weakness.'),
  evidence: z.string().describe('The calculation or usage fact behind it, e.g. the best multiplier the team manages or the usage share.'),
});

const changeSchema = z.object({
  kind: z.enum(['spread', 'move', 'item', 'member']).describe('What kind of change this is.'),
  change: z.string().describe('The concrete change to make.'),
  evidence: z.string().describe('Why: exact stats, learnset facts, or the meta\u2019s usage data.'),
  confidence: z.enum(['high', 'medium', 'low']).describe('How sure the evidence makes this: high is exact math, low is a typing-only heuristic.'),
  dataUpdated: z
    .string()
    .optional()
    .describe('ISO date of the newest data point behind the evidence — the threat list\u2019s sourceAsOf, carried so a recommendation ages visibly.'),
});

export function registerDoctorTool(server: McpServer) {
  server.registerTool(
    'diagnose_team',
    {
      title: 'Diagnose a team',
      description:
        'Diagnose a team against a regulation\u2019s real meta and list concrete, evidence-backed changes: "here is my team — fix it." The engine is deterministic, built from the same primitives as the rest of the surface: each threat\u2019s actual usage-derived set (nature, EVs, Mega form), level-50 Speed math, type stacking across the 18 types, and the dataset\u2019s learnsets. `problems` carries every weakness with its evidence (an unanswered top threat, a matchup resting on one member, a stacked weakness, losing the speed race, uncovered types); `candidateChanges` carries spread changes computed to exact Speed values, learnset-legal move swaps that add super-effective coverage, item changes toward what the meta actually plays, and member swaps that resist a problem threat\u2019s STAB while hitting back super-effectively \u2014 flagged as typing-only, because usage data exists only for the ranked species. `lockedMembers` names members to keep, which removes them from member-swap suggestions only; `goal` is carried verbatim into the result. Requires a threat list, so it needs a regulation that has one (the current set does). The server proves; the caller explains.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        team: z
          .array(parsedSetSchema)
          .min(1)
          .max(6)
          .describe('The team to diagnose, in the canonical shape `parse_team` returns: species with optional moves, ability, nature, evs or championsPoints, and item.'),
        regulation: z
          .string()
          .optional()
          .describe('Regulation id to diagnose against, e.g. "m-c"; omitted, the current set is used.'),
        lockedMembers: z
          .array(z.string())
          .optional()
          .describe('Species to keep as-is; they are excluded from member-swap suggestions (spread, move and item changes still apply to them).'),
        goal: z
          .string()
          .optional()
          .describe('What the caller is trying to achieve, e.g. "improve against the current meta"; carried into the result verbatim, the analysis itself is always meta-coverage-first.'),
      },
      outputSchema: {
        regulation: z.string().describe('Display name of the regulation the diagnosis ran against.'),
        goal: z.string().optional().describe('The goal as supplied, verbatim.'),
        problems: z.array(problemSchema).describe('The weaknesses found, most severe first, each with its evidence.'),
        candidateChanges: z
          .array(changeSchema)
          .describe('Concrete changes to make, each with the calculation or usage fact behind it; ordered spread, move, item, then member swaps.'),
        unknownMoves: z
          .array(z.string())
          .optional()
          .describe('Deduplicated move names that did not resolve against the dataset, so they contributed nothing to the analysis; absent when every move resolved.'),
        note: z
          .string()
          .describe('What the engine can and cannot see: exact stats and usage, no damage-roll simulation, and member swaps that are typing-only because usage data exists only for the ranked species.'),
      },
    },
    wrap(async (args: { team: ParsedSet[]; regulation?: string; lockedMembers?: string[]; goal?: string }) => {
      const dex = getChampionsDex();
      const regulationId = args.regulation ?? (REGULATION_SETS.find((s) => setStatus(s) === 'current')?.id ?? 'm-c');
      const set = getRegulationSet(regulationId);
      if (!set) {
        throw new Error(`Unknown regulation set "${regulationId}". Available: ${REGULATION_SETS.map((s) => s.name).join(', ')}.`);
      }
      const list = getThreatList(set.id);
      if (!list) {
        throw new Error(
          `No threat list for "${set.name}", so there is no meta to diagnose against. Available: ${Object.values(THREAT_LISTS).map((l) => `${l.name} (${l.regulation})`).join(', ')}.`,
        );
      }

      const { members, unknownMoves } = resolveMembers(args.team);
      const lockedIds = new Set((args.lockedMembers ?? []).map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')));
      const fastest = [...members].sort((a, b) => b.speed - a.speed)[0];

      // --- Every threat with the team's best hit on it, plus the real battle
      // math where members supplied moves: the shared MatchupEvaluator decides
      // what an answer actually is, instead of the type multiplier alone. ---
      const threatRows = list.threats.map((threat) => {
        const form = threat.megaForm ?? threat.form ?? threat.species;
        const ts = dex.species.get(form);
        const threatSpeed = finalStat(9, 'spe', ts.baseStats.spe, 31, threat.evs?.spe ?? 0, 50, threat.nature);
        const byMember = members.map((m) => {
          let eff = 0;
          for (const atk of new Set([...m.types, ...m.moveTypes])) eff = Math.max(eff, typeEffectiveness(atk, ts.types, 9));
          return { member: m.species, eff };
        });
        let bestClass: AnswerClass | undefined;
        let classBy: string | undefined;
        let classReason: string | undefined;
        for (const m of members.filter((mem) => mem.moves.length)) {
          const result = evaluateMatchup(
            {
              species: m.species,
              ...(m.item ? { item: m.item } : {}),
              ...(m.ability ? { ability: m.ability } : {}),
              ...(m.set.nature ? { nature: m.set.nature } : {}),
              ...(m.set.evs ? { evs: m.set.evs } : {}),
              ...(m.set.championsPoints ? { championsPoints: m.set.championsPoints } : {}),
              moves: m.moves,
            },
            {
              species: form,
              item: threat.item,
              ability: threat.ability,
              nature: threat.nature,
              ...(threat.evs ? { evs: threat.evs } : {}),
              moves: threat.moves,
            },
          );
          if (!bestClass || ANSWER_CLASS_RANK[result.answerClass] < ANSWER_CLASS_RANK[bestClass]) {
            bestClass = result.answerClass;
            classBy = m.species;
            classReason = result.reason;
          }
        }
        return {
          form,
          usage: threat.usage,
          threatSpeed,
          bestMultiplier: Math.max(0, ...byMember.map((b) => b.eff)),
          answeredBy: byMember.filter((b) => b.eff >= 2).map((b) => b.member),
          bestClass,
          classBy,
          classReason,
        };
      });

      // --- Defensive stacking and coverage, same math as analyze_team ---
      const stacked: { type: string; weak: number; weakBy: string[] }[] = [];
      for (const t of TYPES18) {
        let weak = 0;
        let covered = 0;
        const weakBy: string[] = [];
        for (const m of members) {
          const eff = typeEffectiveness(t, m.types, 9);
          if (eff > 1) {
            weak++;
            weakBy.push(m.species);
          } else if (eff < 1) covered++;
        }
        if (weak >= 2 && covered === 0) stacked.push({ type: t, weak, weakBy });
      }
      const uncovered = TYPES18.filter(
        (def) => !members.some((m) => [...new Set([...m.types, ...m.moveTypes])].some((atk) => typeEffectiveness(atk, [def], 9) > 1)),
      );

      // --- Problems, most severe first ---
      const problems: { statement: string; severity: 'high' | 'medium' | 'low'; evidence: string }[] = [];
      for (const t of threatRows.filter((t) => t.bestMultiplier < 2).sort((a, b) => b.usage - a.usage).slice(0, 3)) {
        if (t.bestClass === 'UNFAVORABLE' || t.bestClass === 'UNKNOWN') {
          problems.push({
            statement: `No reliable answer to ${t.form} — the best matchup the battle math finds is ${t.bestClass}.`,
            severity: t.usage >= 10 ? 'high' : 'medium',
            evidence: `${t.classReason ?? `best hit ${t.bestMultiplier}\u00d7 from STAB or a supplied move`} (${t.form} carries ${t.usage}% usage).`,
          });
        } else if (!t.bestClass) {
          // No member supplied moves, so only the type chart can speak.
          problems.push(
            t.bestMultiplier === 0
              ? { statement: `${t.form} cannot be hit at all — every move is resisted or immune.`, severity: 'high', evidence: `${t.form} is the meta\u2019s ${t.usage}%-usage threat and every supplied move and STAB type does 0\u00d7.` }
              : { statement: `No super-effective answer to ${t.form} (best hit ${t.bestMultiplier}\u00d7).`, severity: t.usage >= 10 ? 'high' : 'medium', evidence: `${t.form} carries ${t.usage}% usage; the team\u2019s best hit is ${t.bestMultiplier}\u00d7 from STAB or a supplied move.` },
          );
        }
        // With a battle-math class of HARD/SOFT/REVENGE/SPEED_DEPENDENT/TRADE the
        // matchup is playable; the initiative problem below covers the caveats.
      }
      for (const t of threatRows
        .filter((t) => t.bestClass === 'REVENGE' || t.bestClass === 'SPEED_DEPENDENT' || t.bestClass === 'TRADE')
        .sort((a, b) => b.usage - a.usage)
        .slice(0, 2)) {
        problems.push({
          statement: `${t.form} matchup rides on ${t.bestClass === 'TRADE' ? 'rolls' : 'initiative'} (${t.bestClass})${t.classBy ? `, via ${t.classBy}` : ''}.`,
          severity: 'medium',
          evidence: t.classReason ?? 'best available exchange.',
        });
      }
      for (const t of threatRows.filter((t) => t.answeredBy.length === 1 && t.usage >= 15).slice(0, 2)) {
        problems.push({
          statement: `${t.form} matchup rests entirely on ${t.answeredBy[0]}.`,
          severity: 'medium',
          evidence: `${t.answeredBy[0]} is the only member with a super-effective hit on a threat carrying ${t.usage}% usage.`,
        });
      }
      for (const s of stacked.slice(0, 3)) {
        problems.push({
          statement: `${s.weak} of the team ${s.weak === 6 ? 'are' : s.weak === 1 ? 'is' : 'are'} weak to ${s.type} with nobody resisting or immune.`,
          severity: s.weak >= 3 ? 'high' : 'medium',
          evidence: `${s.weakBy.join(', ')} all take super-effective ${s.type} hits, and no member resists or is immune to it.`,
        });
      }
      const speedLosses = threatRows.filter((t) => t.threatSpeed > fastest.speed);
      if (speedLosses.length) {
        const names = speedLosses.sort((a, b) => b.usage - a.usage).slice(0, 3).map((t) => `${t.form} (${t.threatSpeed})`).join(', ');
        problems.push({
          statement: `${speedLosses.length} of ${list.threats.length} threats move before the team\u2019s fastest member.`,
          severity: speedLosses.length * 2 >= list.threats.length ? 'medium' : 'low',
          evidence: `${fastest.species} at ${fastest.speed} Speed; faster threats include ${names}.`,
        });
      }
      if (uncovered.length >= 3) {
        problems.push({
          statement: `No super-effective hit for ${uncovered.length} of the 18 types: ${uncovered.join(', ')}.`,
          severity: 'medium',
          evidence: 'Coverage is computed from STAB types and supplied move types across the whole team.',
        });
      }

      // --- Candidate changes, each with evidence ---
      const changes: { kind: 'spread' | 'move' | 'item' | 'member'; change: string; evidence: string; confidence: 'high' | 'medium' | 'low' }[] = [];

      const speedTargets = threatRows.filter((t) => t.threatSpeed > fastest.speed).sort((a, b) => b.usage - a.usage).slice(0, 2);
      for (const t of speedTargets) {
        const curEv = resolveEvs(fastest.set.evs, fastest.set.championsPoints).spe ?? 0;
        let hit: { ev: number; speed: number } | undefined;
        for (let ev = curEv + 4 - (curEv % 4); ev <= 252; ev += 4) {
          const speed = finalStat(9, 'spe', dex.species.get(fastest.species).baseStats.spe, 31, ev, 50, fastest.set.nature ?? 'Serious');
          if (speed > t.threatSpeed) {
            hit = { ev, speed };
            break;
          }
        }
        if (hit) {
          changes.push({
            kind: 'spread',
            change: `Give ${fastest.species} ${hit.ev} Speed EVs (${fastest.speed} \u2192 ${hit.speed}) to outrun ${t.form} (${t.threatSpeed}).`,
            evidence: `Level-50 Speed math: \u2248${Math.ceil(hit.ev / 8)} Champions stat points in Speed beats ${t.form}\u2019s real meta spread (${t.threatSpeed} with its own nature and EVs).`,
            confidence: 'high',
          });
        }
      }

      for (const def of uncovered.slice(0, 4)) {
        for (const m of members) {
          if (changes.filter((c) => c.kind === 'move').length >= 3) break;
          const learnable = await learnableMoveIds(dex, dex.species.get(m.species));
          let pick: { name: string; type: string; power: number } | undefined;
          for (const id of learnable) {
            const mv = dex.moves.get(id);
            if (!mv.exists || !(mv.basePower || 0) || typeEffectiveness(mv.type, [def], 9) <= 1) continue;
            if (m.moves.includes(mv.name)) continue;
            if (!pick || mv.basePower > pick.power) pick = { name: mv.name, type: mv.type, power: mv.basePower };
          }
          if (pick) {
            changes.push({
              kind: 'move',
              change: `Teach ${m.species} ${pick.name} to hit ${def} super-effectively.`,
              evidence: `${pick.name} (${pick.type}, ${pick.power} power) is in ${m.species}\u2019s learnset and the team currently has no super-effective hit for ${def}.`,
              confidence: 'medium',
            });
          }
        }
      }

      for (const m of members) {
        if (changes.filter((c) => c.kind === 'item').length >= 3) break;
        const hit = findThreat(m.baseSpecies, set.id);
        if (hit && m.item && m.item !== hit.threat.item) {
          changes.push({
            kind: 'item',
            change: `${m.species} holds ${m.item}; the meta plays it with ${hit.threat.item}.`,
            evidence: `${hit.threat.item} is the most-played item on ${hit.threat.species} (${hit.threat.usage}% usage, ${list.sourceAsOf}).`,
            confidence: 'medium',
          });
        }
      }

      for (const t of threatRows.filter((t) => t.bestMultiplier < 2).slice(0, 2)) {
        const ts = dex.species.get(t.form);
        const candidates: { name: string; seTypes: string[] }[] = [];
        for (const name of set.eligibleSpecies) {
          const cand = dex.species.get(name);
          if (!cand.exists) continue;
          const onTeam = members.some((m) => m.baseSpecies === cand.name) || lockedIds.has(cand.name.toLowerCase().replace(/[^a-z0-9]/g, ''));
          if (onTeam) continue;
          const resistsAll = ts.types.every((tt) => typeEffectiveness(tt, cand.types, 9) < 1);
          const seTypes = cand.types.filter((ct) => typeEffectiveness(ct, ts.types, 9) > 1);
          if (resistsAll && seTypes.length) candidates.push({ name: cand.name, seTypes });
        }
        for (const c of candidates.slice(0, 2)) {
          if (changes.filter((k) => k.kind === 'member').length >= 4) break;
          const candTypes = (dex.species.get(c.name).types ?? []).join('/');
          changes.push({
            kind: 'member',
            change: `Swap in ${c.name} to answer ${t.form}.`,
            evidence: `${c.name}\u2019s ${candTypes} resist ${t.form}\u2019s ${ts.types.join('/')} STAB and hit back super-effectively with ${c.seTypes.join('/')} \u2014 typing only, no usage data for unranked species.`,
            confidence: 'low',
          });
        }
      }

      return ok({
        regulation: set.name,
        ...(args.goal ? { goal: args.goal } : {}),
        problems: problems.slice(0, 8),
        candidateChanges: changes.map((c) => ({ ...c, dataUpdated: list.sourceAsOf })),
        ...(unknownMoves.length ? { unknownMoves: [...new Set(unknownMoves)] } : {}),
        note: 'Problems and changes come from exact stats, usage and learnsets — not simulated battles. `spread` and `move` changes are exact math or learnset facts; `item` changes follow the meta\u2019s most-played item; `member` swaps are typing-only heuristics, because usage data exists only for the ranked species, so weigh them accordingly. The goal string is carried verbatim and does not change the analysis.',
      });
    }),
  );
}
