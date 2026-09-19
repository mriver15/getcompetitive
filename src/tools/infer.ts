/**
 * Set inference over hand-typed battle observations: "infer" mode of
 * `analyze_battle`. The engine itself lives in src/inference.ts and is shared
 * with the scouting pipeline, so typed observations and replay-derived ones
 * narrow candidates with identical math.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runInference, observationSchema, type BattleObservation } from '../inference.js';
import { ok, wrap, READ_ONLY_ANNOTATIONS } from '../result.js';

export function registerInferTool(server: McpServer) {
  server.registerTool(
    'infer_set',
    {
      title: 'Infer an opponent\u2019s set',
      description:
        'Reverse constraint solving for a battle observation: the player reports what they saw — who moved first, how hard a hit landed, what survived — and this tool narrows which set the opponent\u2019s Pok\u00e9mon could be running, ranked by how far each survivor is from the set the meta actually plays. The engine is the same math the forward tools use, run backwards: exact level-50 Speed (Choice Scarf included) and real damage rolls against the spread each candidate implies. Every observation is applied in order and the elimination count is reported, so the narrowing is auditable; `candidates` carries the surviving sets with a probability share. Roll variance means a damage observation keeps every candidate whose roll range contains the observed percentage, and the note lists what a battle observation cannot prove. For a ranked species the meta set anchors the prior; an unranked species gets a flat plausible pool. Read-only and offline.',
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        species: z
          .string()
          .describe('The opponent\u2019s species as observed, e.g. "Sneasler", "Salamence-Mega"; resolves case- and punctuation-insensitively.'),
        observations: z
          .array(observationSchema)
          .min(1)
          .max(8)
          .describe('What the player saw, applied in order; later observations narrow earlier results.'),
        regulation: z
          .string()
          .optional()
          .describe('Regulation id, e.g. "m-c"; scopes which curated meta set anchors the prior.'),
      },
      outputSchema: {
        species: z.string().describe('The species as resolved.'),
        regulation: z.string().optional().describe('The regulation used for the meta prior, when one matched.'),
        priorSets: z.number().int().describe('Candidate sets considered before any observation.'),
        survivingSets: z
          .number()
          .int()
          .describe('Candidates still possible after the last observation; `candidates` lists at most the top 8, so a count above 8 means the probabilities shown cover part of the mass, not all of it.'),
        constraints: z
          .array(
            z.object({
              observation: z.string().describe('The observation, restated.'),
              before: z.number().int().describe('Candidates still possible before it.'),
              after: z.number().int().describe('Candidates still possible after it.'),
              eliminated: z.number().int().describe('How many it ruled out.'),
            }),
          )
          .describe('One entry per observation, in the order they were applied — the narrowing, shown.'),
        candidates: z
          .array(
            z.object({
              item: z.string().optional().describe('Held item; absent when none is implied.'),
              ability: z.string().describe('Ability.'),
              nature: z.string().describe('Nature.'),
              evs: z.record(z.string(), z.number()).describe('The spread, keyed by stat id.'),
              speed: z.number().int().describe('Level-50 Speed with that spread, Scarf included.'),
              probability: z.number().describe('Share of surviving prior mass, in percent; the engine\u2019s confidence in this candidate.'),
            }),
          )
          .describe('The surviving sets, most likely first, at most 8.'),
        note: z.string().describe('What the engine assumed and what observations cannot prove: neutral abilities when unknown, no stat stages, roll variance, and that damage percentages are rounded by the client.'),
      },
    },
    wrap(async (args: { species: string; observations: BattleObservation[]; regulation?: string }) => {
      return ok(runInference(args.species, args.observations, args.regulation));
    }),
  );
}
