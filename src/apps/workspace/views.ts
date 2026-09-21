/**
 * The three Views — Team Doctor, Team Builder, Matchup Board — and the small
 * DOM surface they render through. Pure string templates over `esc()`: every
 * server-sourced value (species names, evidence, move names) is HTML-escaped,
 * so no payload can inject markup. Numbers and booleans are formatted in place.
 *
 * A View never parses the model's text; it reads `data` off the envelope the
 * server put in `structuredContent`. Where a panel needs evidence-tier detail
 * the compact payload omits, entry.ts re-calls the same tool with
 * `detail: "evidence"` and re-renders; this module only renders what is present
 * and emits `data-expand` buttons for what is not.
 */
import type {
  BuilderData,
  CandidateChange,
  DamageCalc,
  DefensiveWeakness,
  DiagnoseData,
  LikelySet,
  MatchupData,
  Problem,
  Race,
  Recommendation,
  Score,
  SynergyData,
  ThreatRow,
  ToolInput,
} from './protocol.js';

/** A minimal, SDK-agnostic view of the App bridge the Views need. */
export interface ToolCaller {
  callServerTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<{
    isError?: boolean;
    structuredContent?: unknown;
    content?: { type: string; text?: string }[];
  }>;
}

export interface BuilderState {
  team: unknown[];
  slots: number;
}

export interface ViewContext {
  tool: string;
  input: ToolInput;
  callServerTool: ToolCaller['callServerTool'];
  /** Team Builder local roster state; present only while building. */
  builder?: BuilderState;
}

export function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const SEVERITY_CLASS: Record<string, string> = { high: 'bad', medium: 'warn', low: 'ok' };
const ANSWER_CLASS: Record<string, string> = {
  HARD_ANSWER: 'ok',
  SOFT_ANSWER: 'ok',
  REVENGE: 'warn',
  SPEED_DEPENDENT: 'warn',
  TRADE: 'warn',
  UNFAVORABLE: 'bad',
  UNKNOWN: 'muted',
};

function stat(label: string, value: unknown, cls = ''): string {
  return `<div class="stat${cls ? ` ${cls}` : ''}"><span class="stat-label">${esc(label)}</span><span class="stat-value">${esc(value)}</span></div>`;
}

function chip(text: string, cls = ''): string {
  return `<span class="chip${cls ? ` ${cls}` : ''}">${esc(text)}</span>`;
}

function panel(title: string, body: string, cls = ''): string {
  return `<section class="panel${cls ? ` ${cls}` : ''}"><h2>${title}</h2>${body}</section>`;
}

function expandButton(id: string, label: string): string {
  return `<button type="button" class="expand" data-expand="${id}">${esc(label)}</button>`;
}

// --------------------------------------------------------------------------
// Team Doctor
// --------------------------------------------------------------------------

function renderScore(score: Score): string {
  const parts = [stat('Overall', `${score.overall}/100`, 'score-overall')];
  parts.push(stat('Defensive', `${score.defensive}/100`));
  parts.push(stat('Coverage', `${score.coverage}/100`));
  if (typeof score.speed === 'number') parts.push(stat('Speed', `${score.speed}/100`));
  return `<div class="stats">${parts.join('')}</div><p class="note">${esc(score.note)}</p>`;
}

function renderDefensiveWeaknesses(weaknesses: Record<string, DefensiveWeakness>): string {
  const rows = Object.entries(weaknesses)
    .map(
      ([type, w]) => `
      <tr>
        <td>${chip(type, 'type')}</td>
        <td>${w.weak}</td><td>${w.resist}</td><td>${w.immune}</td>
        <td class="muted">${w.weakBy.length ? w.weakBy.map((s) => esc(s)).join(', ') : '—'}</td>
      </tr>`,
    )
    .join('');
  return `<table class="table"><thead><tr><th>Type</th><th>Weak</th><th>Resist</th><th>Immune</th><th>Weak members</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderOffensiveCoverage(coverage: { coveredBy: Record<string, string[]>; uncoveredSuperEffectively: string[]; note: string }): string {
  const rows = Object.entries(coverage.coveredBy)
    .map(
      ([type, members]) => `
      <tr>
        <td>${chip(type, 'type')}</td>
        <td>${members.length ? members.map(esc).join(', ') : `<span class="muted">uncovered</span>`}</td>
      </tr>`,
    )
    .join('');
  const uncovered = coverage.uncoveredSuperEffectively.length
    ? `<div class="chips">${coverage.uncoveredSuperEffectively.map((t) => chip(t, 'bad')).join('')}</div>`
    : `<span class="muted">Every type is hit super-effectively.</span>`;
  return (
    `<div class="chips">${uncovered}</div>` +
    `<table class="table"><thead><tr><th>Defending type</th><th>Hit by</th></tr></thead><tbody>${rows}</tbody></table>` +
    `<p class="note">${esc(coverage.note)}</p>`
  );
}

function renderThreats(threats: ThreatRow[]): string {
  const rows = threats
    .map(
      (t) => `
      <tr>
        <td>${esc(t.species)}</td>
        <td>${t.usage.toFixed(1)}%</td>
        <td>${t.threatSpeed}</td>
        <td>${t.hitMultiplier}&times;</td>
        <td>${t.hitVia ? esc(t.hitVia) : '—'}</td>
        <td>${t.hitBy ? esc(t.hitBy) : '—'}</td>
        <td>${t.answerClass ? chip(t.answerClass, ANSWER_CLASS[t.answerClass] ?? 'muted') : chip('typing-only', 'muted')}</td>
        <td>${t.answerBy ? esc(t.answerBy) : '—'}</td>
        <td>${t.outspeed ? chip('outspeeds', 'ok') : chip('slower', 'warn')}</td>
      </tr>`,
    )
    .join('');
  return `<table class="table"><thead><tr><th>Threat</th><th>Usage</th><th>Speed</th><th>Best hit</th><th>Via</th><th>By</th><th>Verdict</th><th>Answer</th><th>Race</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderSynergy(data: SynergyData): string {
  const parts: string[] = [];

  if (data.team?.length) {
    parts.push(
      panel(
        'Team',
        `<div class="chips">${data.team
          .map((m) => chip(`${m.species} · ${m.types.join('/')} · base ${m.baseSpe}`, 'member'))
          .join('')}</div>`,
      ),
    );
  }

  parts.push(panel('Heuristic score', renderScore(data.score)));

  const weaknessBody = data.defensiveWeaknesses
    ? renderDefensiveWeaknesses(data.defensiveWeaknesses)
    : `<div class="chips">${
        data.atRiskTypes.length ? data.atRiskTypes.map((t) => chip(t, 'bad')).join('') : '<span class="muted">No stacked weakness.</span>'
      }</div><div class="expand-row">${expandButton('weakness-detail', 'Show per-type breakdown (evidence)')}</div>`;
  parts.push(panel('Weaknesses', weaknessBody));

  const speed = data.speed;
  parts.push(
    panel(
      'Speed',
      `<div class="stats">${stat('Fastest', `${speed.fastest.species} (${speed.fastest.baseSpe})`)}${stat('Slowest', `${speed.slowest.species} (${speed.slowest.baseSpe})`)}${
        typeof speed.fasterThreatCount === 'number' ? stat('Legal faster threats', speed.fasterThreatCount) : ''
      }</div>`,
    ),
  );

  if (data.threatCoverage) {
    const tc = data.threatCoverage;
    const unanswered = tc.unanswered.length
      ? tc.unanswered.map((s) => chip(s, 'bad')).join('')
      : `<span class="muted">Every threat has a super-effective hit.</span>`;
    const coverageBody = data.offensiveCoverage
      ? renderOffensiveCoverage(data.offensiveCoverage)
      : `<div class="expand-row">${expandButton('coverage-detail', 'Show per-type coverage (evidence)')}</div>`;
    parts.push(
      panel(
        `Threat coverage — ${tc.regulation} (as of ${tc.sourceAsOf})`,
        `<div class="chips">${unanswered}</div>` +
          `<p class="note">${tc.unansweredCount} of ${tc.threats.length} threats unanswered. Your fastest member: ${tc.fastestSpeed} Speed.</p>` +
          renderThreats(tc.threats) +
          coverageBody,
      ),
    );
  }

  if (data.bringFour) {
    const bf = data.bringFour;
    parts.push(
      panel(
        'Bring four',
        `<div class="chips">${bf.picks.map((p) => chip(String((p as { species?: string }).species ?? ''), 'ok')).join('')}</div>` +
          `<p class="note">${esc(bf.note)}</p>`,
      ),
    );
  }

  if (data.unknownMoves?.length) {
    parts.push(panel('Unrecognised moves', `<p class="note">${data.unknownMoves.map(esc).join(', ')}</p>`));
  }

  return parts.join('');
}

function renderDiagnose(data: DiagnoseData): string {
  const parts: string[] = [];
  parts.push(
    panel(
      `Problems — ${data.regulation}`,
      data.problems.length
        ? `<ul class="list">${data.problems
            .map(
              (p: Problem) =>
                `<li class="list-item"><span class="chip ${SEVERITY_CLASS[p.severity] ?? 'muted'}">${esc(p.severity)}</span><div><p class="strong">${esc(p.statement)}</p><p class="note">${esc(p.evidence)}</p></div></li>`,
            )
            .join('')}</ul>`
        : `<p class="muted">No problems found.</p>`,
    ),
  );

  parts.push(
    panel(
      'Candidate changes',
      data.candidateChanges.length
        ? `<ul class="list">${data.candidateChanges
            .map(
              (c: CandidateChange) =>
                `<li class="list-item"><span class="chip">${esc(c.kind)}</span><div><p class="strong">${esc(c.change)} <span class="chip ${SEVERITY_CLASS[c.confidence] ?? 'muted'}">${esc(c.confidence)}</span></p><p class="note">${esc(c.evidence)}${c.dataUpdated ? ` · data as of ${esc(c.dataUpdated)}` : ''}</p></div></li>`,
            )
            .join('')}</ul>`
        : `<p class="muted">No changes proposed.</p>`,
    ),
  );

  if (data.note) parts.push(panel('What this sees', `<p class="note">${esc(data.note)}</p>`));
  return parts.join('');
}

// --------------------------------------------------------------------------
// Team Builder
// --------------------------------------------------------------------------

function renderRoster(team: unknown[]): string {
  if (!team.length) return `<p class="muted">No members yet.</p>`;
  const names = team.map((m) => (m && typeof m === 'object' ? String((m as { species?: unknown }).species ?? '') : String(m)));
  return `<div class="chips">${names.map((n) => chip(n, 'member')).join('')}</div>`;
}

function renderRecommendation(r: Recommendation): string {
  return `
    <li class="rec">
      <div class="rec-head"><span class="strong">${r.members.map(esc).join(' + ')}</span><span class="chip ok">score ${r.score}</span>${
        r.roles?.length ? `<span class="chips">${r.roles.map((x) => chip(x, 'role')).join('')}</span>` : ''
      }</div>
      <ul class="reasons">${r.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <button type="button" class="primary" data-add="${esc(JSON.stringify(r.members))}">Add to team</button>
    </li>`;
}

function renderBuilder(data: BuilderData, ctx: ViewContext): string {
  const roster = ctx.builder?.team ?? (Array.isArray(ctx.input.team) ? (ctx.input.team as unknown[]) : []);
  const slots = ctx.builder?.slots ?? (typeof ctx.input.slots === 'number' ? (ctx.input.slots as number) : 0);
  const parts: string[] = [];

  parts.push(
    panel(
      `Current roster (${roster.length} of ${roster.length + slots})`,
      renderRoster(roster) +
        `<p class="note">${slots > 0 ? `${slots} open slot${slots === 1 ? '' : 's'}.` : 'Roster full.'}</p>` +
        `<button type="button" class="secondary" data-action="export">Export paste (team_io format)</button>`,
    ),
  );

  const constraints = data.constraints;
  parts.push(
    panel(
      `Constraints — ${data.regulation}`,
      `<div class="chips">${constraints.types.map((t) => chip(t, 'type')).join('') || '<span class="muted">No type constraints.</span>'}</div>` +
        `<p class="note">Answer these threats: ${
          constraints.threats.map((t) => (typeof t.usage === 'number' ? `${t.species} (${t.usage}%)` : t.species)).map(esc).join(', ') || '—'
        }</p>` +
        (constraints.requiredRoles?.length ? `<div class="chips">${constraints.requiredRoles.map((r) => chip(r, 'role')).join('')}</div>` : ''),
    ),
  );

  parts.push(
    panel(
      'Recommendations',
      data.recommendations.length
        ? `<ul class="recs">${data.recommendations.map(renderRecommendation).join('')}</ul>`
        : `<p class="muted">No candidates satisfy the remaining constraints.</p>`,
    ),
  );

  if (data.note) parts.push(panel('Scoring note', `<p class="note">${esc(data.note)}</p>`));
  return parts.join('');
}

// --------------------------------------------------------------------------
// Matchup Board
// --------------------------------------------------------------------------

function renderLikelySet(s: LikelySet): string {
  if (s.priority === null || s.note) {
    return `<tr><td>${esc(s.species)}</td><td colspan="7"><span class="chip muted">estimated — ${esc(s.note ?? 'no curated set')}</span></td></tr>`;
  }
  const evs = s.evs ? Object.entries(s.evs).map(([k, v]) => `${k.toUpperCase()} ${v}`).join(' / ') : '—';
  return `<tr>
    <td>${esc(s.species)}</td><td>${s.priority}</td><td>${typeof s.usage === 'number' ? s.usage.toFixed(1) + '%' : '—'}</td>
    <td>${esc(s.item ?? '—')}</td><td>${esc(s.ability ?? '—')}</td><td>${esc(s.nature ?? '—')}</td>
    <td>${esc(evs)}</td><td>${(s.moves ?? []).map(esc).join(', ') || '—'}</td>
  </tr>`;
}

function renderRaces(races: Race[]): string {
  if (!races.length) return `<p class="muted">No races computed.</p>`;
  const rows = races
    .map(
      (r) => `<tr>
        <td>${esc(r.ours)}</td><td>${r.ourSpeed}</td>
        <td>${esc(r.theirs)}${r.estimated ? ' <span class="chip muted">est.</span>' : ''}</td><td>${r.theirSpeed}</td>
        <td>${r.margin}</td><td>${r.weMoveFirst ? chip('we move first', 'ok') : chip('they move first', 'warn')}</td>
      </tr>`,
    )
    .join('');
  return `<table class="table"><thead><tr><th>Ours</th><th>Speed</th><th>Theirs</th><th>Speed</th><th>Margin</th><th>Race</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderCalcs(calcs: DamageCalc[]): string {
  if (!calcs.length) return `<p class="muted">No damage rolls computed.</p>`;
  const rows = calcs
    .map(
      (c) => `<tr>
        <td>${esc(c.attacker)}</td><td>${esc(c.move)}</td><td>${esc(c.defender)}</td>
        <td>${c.damageRange[0]}–${c.damageRange[1]}%</td><td>${esc(c.koChance ?? '—')}</td>
      </tr>`,
    )
    .join('');
  return `<table class="table"><thead><tr><th>Attacker</th><th>Move</th><th>Defender</th><th>Damage</th><th>KO chance</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderLeads(label: string, pairs: { support: string; attacker: string; why: string }[], note: string): string {
  const body = pairs.length
    ? `<ul class="list">${pairs
        .map((p) => `<li class="list-item"><span class="strong">${esc(p.support)} + ${esc(p.attacker)}</span><p class="note">${esc(p.why)}</p></li>`)
        .join('')}</ul>`
    : `<p class="muted">None detected.</p>`;
  return panel(`${label} <span class="chip muted">heuristic</span>`, body + `<p class="note">${esc(note)}</p>`);
}

function renderMatchup(data: MatchupData): string {
  const parts: string[] = [];
  parts.push(
    panel(
      `Opponent sets — ${data.regulation}`,
      `<table class="table"><thead><tr><th>Species</th><th>Priority</th><th>Usage</th><th>Item</th><th>Ability</th><th>Nature</th><th>EVs</th><th>Moves</th></tr></thead><tbody>${data.likelySets
        .map(renderLikelySet)
        .join('')}</tbody></table>`,
    ),
  );

  const bf = data.recommendedBringFour;
  parts.push(
    panel(
      `Bring four <span class="chip muted">type-scored</span>`,
      `<div class="chips">${bf.picks.map((p) => chip(`${p.species} (${p.score})`, 'ok')).join('')}</div>` +
        `<div class="chips">${bf.leftBehind.map((p) => chip(`${p.species}`, 'muted')).join('') || '<span class="muted">nothing left behind</span>'}</div>` +
        `<p class="note">${esc(bf.note)}</p>`,
    ),
  );

  parts.push(panel(`Speed tiers <span class="chip muted">calculated</span>`, renderRaces(data.speedTiers.races)));
  parts.push(panel(`Relevant damage <span class="chip muted">calculated</span>`, renderCalcs(data.relevantDamageCalcs)));
  parts.push(renderLeads('Our leads', data.possibleLeads.pairs, data.possibleLeads.note));
  parts.push(renderLeads('Dangerous opponent leads', data.dangerousOpponentLeads.pairs, data.dangerousOpponentLeads.note));

  parts.push(
    panel(
      'Win conditions',
      data.winConditions.length ? `<ul class="list">${data.winConditions.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : `<p class="muted">None stated.</p>`,
    ),
  );
  parts.push(
    panel(
      'Loss conditions',
      data.lossConditions.length ? `<ul class="list">${data.lossConditions.map((w) => `<li class="bad">${esc(w)}</li>`).join('')}</ul>` : `<p class="muted">None stated.</p>`,
    ),
  );
  parts.push(
    panel(
      'Preserve',
      data.pokemonToPreserve.length
        ? `<div class="chips">${data.pokemonToPreserve.map((s) => chip(s, 'warn')).join('')}</div>`
        : `<p class="muted">No sole-answer member.</p>`,
    ),
  );

  const conf = data.matchupConfidence;
  parts.push(panel('Confidence', `<div class="stats">${stat('Matchup confidence', `${conf.score}/100`)}</div><p class="note">${esc(conf.note)}</p>`));
  if (data.note) parts.push(panel('Assumptions', `<p class="note">${esc(data.note)}</p>`));
  return parts.join('');
}

// --------------------------------------------------------------------------
// Dispatch
// --------------------------------------------------------------------------

export function renderView(
  view: 'teamDoctor' | 'teamBuilder' | 'matchupBoard',
  mode: string | undefined,
  data: Record<string, unknown>,
  ctx: ViewContext,
): string {
  if (view === 'teamDoctor') {
    if (mode === 'diagnose') return renderDiagnose(data as unknown as DiagnoseData);
    return renderSynergy(data as unknown as SynergyData);
  }
  if (view === 'teamBuilder') return renderBuilder(data as unknown as BuilderData, ctx);
  return renderMatchup(data as unknown as MatchupData);
}

export function renderShell(viewLabel: string, sub: string, body: string): string {
  return `<header class="app-header"><h1>${esc(viewLabel)}</h1><p class="app-sub">${esc(sub)}</p></header>${body}`;
}

export function renderStatus(kind: 'loading' | 'empty' | 'error' | 'unsupported', detail: string): string {
  const title =
    kind === 'loading'
      ? 'Loading…'
      : kind === 'empty'
        ? 'Nothing to show yet'
        : kind === 'unsupported'
          ? 'Unsupported result'
          : 'Something went wrong';
  return `<div class="status status--${kind}"><h1>${esc(title)}</h1><p class="note">${esc(detail)}</p></div>`;
}
