/**
 * Server-provided workflow prompts: discoverable recipes that chain the
 * deterministic tools, instead of a tool per workflow (which would push the
 * surface toward forty names). Prompts are static text templates — no I/O, the
 * same purity as the tools — and they all follow one doctrine: the model
 * explains, getcompetitive proves, so every number in an answer must come from
 * a tool's output.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const regulationArg = z
  .string()
  .optional()
  .describe('Regulation id to work under, e.g. "m-c"; omitted, the workflow uses the current set.');
const teamArg = z
  .string()
  .optional()
  .describe('The team as paste text (Showdown format, or plain lines); omitted, the workflow asks for it.');
const goalArg = z.string().optional().describe('What the player wants out of the change, carried into analyze_team mode "diagnose".');

export function registerPrompts(server: McpServer) {
  server.registerPrompt(
    'team-doctor',
    {
      title: 'Team Doctor',
      description: 'Diagnose a team against the meta and prescribe evidence-backed changes. "Here is my team — fix it."',
      argsSchema: { team: teamArg, regulation: regulationArg, goal: goalArg },
    },
    async (args) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Act as a Pokémon Champions team coach. The user wants their team diagnosed and improved under ${
              args.regulation ?? 'the current regulation set'
            }${args.goal ? `, with the goal: ${args.goal}` : ''}.

${args.team ? `Their team (paste text):\n\n${args.team}\n` : 'Ask the user to paste their team first.'}

Then, in order:
1. Run team_io with mode "parse" on the paste (with the regulation) and surface every warning it returns — a name that did not resolve is a fixable typo, not a dead end.
2. Run analyze_team with mode "synergy" with mode "diagnose" on the parsed team, passing the goal and any members the user wants kept.
3. Walk through the problems with their evidence, then the candidate changes with their math. Say plainly which changes are exact (spread, move) and which are typing-only heuristics (member swaps) — analyze_team with mode "synergy" with mode "diagnose" labels the confidence, repeat it.
4. If you propose a changed team, run team_io with mode "format" on it so the user can copy the paste straight into the game.

Every claim must come from the tools\u2019 output. You explain; getcompetitive proves.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'matchup-prep',
    {
      title: 'Matchup Preparation',
      description: 'Prepare a match against a known opponent: their likely sets, speed races, key rolls, bring-four, leads. "Here is my opponent — prepare me."',
      argsSchema: {
        team: teamArg,
        opponent: z
          .string()
          .optional()
          .describe('The opponent\u2019s team: paste text, or just species names if that is all the player knows.'),
        regulation: regulationArg,
      },
    },
    async (args) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Act as a Pokémon Champions match analyst. The user has a matchup coming up.
${args.team ? `Their team:\n\n${args.team}\n` : 'Ask the user for their team first.'}
${args.opponent ? `What they know about the opponent:\n\n${args.opponent}\n` : 'Ask the user what they know about the opponent (species at minimum).'}

Then, in order:
1. team_io with mode "parse" on any paste text. If the opponent is just species names, that is fine — pass them to prepare_matchup as the opponent array; it estimates what it cannot know and says so.
2. Run prepare_matchup with the team, the opponent, and ${args.regulation ?? 'the current regulation'}.
3. Deliver the dossier in plain language: their likely sets ordered by usage, the speed races that matter, the key damage rolls (quote the description lines), the recommended bring-four and why, leads to open with and watch for, win/loss conditions, and which of the user\u2019s members to preserve.
4. End with the matchupConfidence read and what it can and cannot see.

Every number comes from prepare_matchup\u2019s output — you explain; getcompetitive proves.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'build-around',
    {
      title: 'Build Around',
      description: 'Build a legal team around one or two core species: coverage gaps, candidate partners, legality, paste. "Build around Mega Salamence + Rillaboom."',
      argsSchema: {
        core: z
          .string()
          .optional()
          .describe('The species to build around, e.g. "Salamence-Mega", or two species separated by +.'),
        regulation: regulationArg,
      },
    },
    async (args) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Act as a Pokémon Champions teambuilder. Build a team around ${
              args.core ?? 'the species the user names (ask them first)'
            } for ${args.regulation ?? 'the current regulation set'}.

Workflow:
1. analyze_meta with mode "set" on the core species (batched if several) so the core is built from what the meta actually plays.
2. Run analyze_team with mode "synergy" on the partial team to see the defensive weaknesses and the types nothing hits super-effectively — those are the gaps the remaining slots must fill.
3. Run analyze_team with mode "diagnose" on the partial team and mine its candidate changes (member swaps and move changes) for gap-filling partners; prefer partners the meta has usage data for (analyze_meta with mode "threats"), and say when a pick is typing-only.
4. Assemble six members, run team_io with mode "legality" against the regulation, then team_io with mode "format" the finished squad so the user can paste it.

Explain each pick with its evidence (coverage, speed, or usage). You design; getcompetitive proves the picks.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'tournament-prep',
    {
      title: 'Tournament Preparation',
      description: 'A pre-tournament walkthrough: the rules, the meta, the threats, and a preparation checklist.',
      argsSchema: { regulation: regulationArg },
    },
    async (args) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Act as a Pokémon Champions tournament coach. Prepare the user for an event under ${
              args.regulation ?? 'the current regulation set'
            }.

Workflow:
1. team_io with mode "regulation" for the rules that shape the format: clauses, timers, bring 4 of 6, Mega rules. (Skip includeRoster unless a full legal list is actually wanted.)
2. analyze_meta with mode "threats" for the regulation and analyze_meta with mode "set" (batched) on the top threats so their real sets are in front of you.
3. Produce a tournament-prep briefing: the meta snapshot (top threats with usage, tier bands), what each top threat does, and a preparation checklist — answers for the top threats, a speed plan, and a bring-four habit.

Numbers only from the tools; the sample size and sourceAsOf from analyze_meta with mode "threats" are part of the briefing, not an afterthought.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'learn-my-team',
    {
      title: 'Learn My Team',
      description: 'A plain-language guide to the user\u2019s own team: roles, synergies, holes, and how it is meant to play.',
      argsSchema: { team: teamArg, regulation: regulationArg },
    },
    async (args) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Act as a Pokémon Champions tutor. The user wants to understand the team they already play.
${args.team ? `Their team:\n\n${args.team}\n` : 'Ask the user to paste their team first.'}

Workflow:
1. team_io with mode "parse" on the paste.
2. analyze_team with mode "synergy" for the synergy read: stacked weaknesses, coverage gaps, speed placement, and the score.
3. analyze_team with mode "synergy" with mode "diagnose" for what it would change, so the guide includes the holes.
4. For each member: analyze_meta with mode "set" if the species is ranked (batched across the team), else lookup with mode "species" plus lookup with mode "learnset" highlights.

Deliver a team guide: each member\u2019s role, the pairs and synergies between them, the holes a future change should fill, and a one-paragraph game plan. Every factual claim cites a tool\u2019s output.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'meta-report',
    {
      title: 'Meta Report',
      description: 'The current meta in one report: usage tiers, the top sets, and a data-dated read of what is good.',
      argsSchema: { regulation: regulationArg },
    },
    async (args) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Act as a Pokémon Champions metagame reporter. Produce the meta report for ${
              args.regulation ?? 'the current regulation set'
            }.

Workflow:
1. analyze_meta with mode "threats" for the usage ranking, tiers and the sample behind it.
2. analyze_meta with mode "set" (batched) on the top five threats for their real sets.
3. Write the report: the tier bands with usage shares, each top threat\u2019s standard set and what it does, and a closing read of what the meta rewards. State the list\u2019s sourceAsOf and sample size so the reader knows how current the numbers are.

The report is data journalism: every figure quoted comes from the tools, and the data date travels with it.`,
          },
        },
      ],
    }),
  );
}
