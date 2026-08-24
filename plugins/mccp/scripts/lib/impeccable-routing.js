'use strict';

// impeccable-routing — stage-aware impeccable command routing oracle (M1+M2).
//
// Pure, dep-free decision function. Given a gate + routing mode + design
// signals, returns the ordered list of impeccable commands to route and the
// resolved call form for each. Mirrors design-critique-decide.js: explicit
// inputs, no side effects, enum return values.
//
// The mccp design gate historically routed a single impeccable command
// (`critique`). This oracle maps the design lifecycle (discovery → refine →
// simplify → evaluate → harden → polish) onto the impeccable command catalogue
// so the gate can route stage-appropriate commands instead of one review call.
//
// Codex Plan-Codex R1 absorptions (M1):
//   F1 — designIntentActive input preserves the audited MCCP_DESIGN_INTENT_REASON
//        escape hatch: route on (designSignal || designIntentActive).
//   F4 — renderingSurface selector bounds the coarse control-plane signal.
//
// M2 (Extended Refine/Simplify catalogue + content selection):
//   F1 — diff-signal extraction must include untracked rendered-surface files
//        and FAIL OPEN (omit diffSignals) when extraction yields nothing on a
//        rendered surface, rather than forwarding all-false signals. The oracle
//        side honours that contract: diffSignals undefined/null → no narrowing.
//   F2 — extractDiffSignals regexes cover CSS properties AND Tailwind utility
//        classes AND CSS-in-JS camelCase so absence of a match is a meaningful
//        negative, not a coverage gap.
//   F3 — mood/direction commands (bolder/quieter/overdrive/delight) cannot be
//        detected from a diff, so they are recommend-only base. The ONLY path
//        to invoke them is the audited 4-AND mood-intent upgrade
//        (auto + renderingSurface + designIntentActive + intentCommands member).
//
// Selection semantics are positive-presence narrowing: a content command
// (one with a `signal`) only degrades to recommend when its signal is KNOWN
// ABSENT. Unknown/incomplete extraction → caller omits diffSignals → no
// narrowing (M1 fail-open). Every transform is downgrade-only except the
// single audited mood-intent upgrade.

const ROUTING_MODES = Object.freeze(['auto', 'hybrid', 'recommend']);
const EVALUATE_COMMANDS = Object.freeze(['critique', 'audit']);
// Mood/direction commands: recommend-only base, audited-intent-upgradable only.
const MOOD_COMMANDS = Object.freeze(['bolder', 'quieter', 'overdrive', 'delight']);
// System commands (v1.13.0 M3): document (generate DESIGN.md) + extract (pull
// reusable tokens/components). Heavyweight generative actions, so recommend-only
// base in every gate — mirrors the harden/optimize/onboard treatment. craft/live/
// init/detect/hooks stay out of scope (PRD M3 carve-out).
const SYSTEM_COMMANDS = Object.freeze(['document', 'extract']);
// Diff-signal kinds a content command can require.
const SIGNAL_KINDS = Object.freeze(['motion', 'color', 'typography', 'responsive']);
// M4 — commands the VENDOR blocks on a multi-round interview. They cannot
// complete in a non-interactive gate: they either stop to ask, or run a
// "structured simulated-user interview" and write invented product truth into
// the user's repo. Evidence, impeccable 4.1.1:
//   scripts/command-metadata.json shape.description — "Runs a required
//     multi-round discovery interview" (unconditional; not PRODUCT.md-dependent)
//   scripts/context.mjs:1116,1132 — "For `init`, `teach`, `shape`, … create
//     PRODUCT.md with the user first"; :1121 BUILD_INIT_REQUIRED
// `init` and `teach` are NOT in the mccp routing catalogue and M4 does not add
// them (UI5). `teach` is not even in 4.1.1's own 23-command metadata — the
// vendor's blocking prose names it while the catalogue does not. The set is
// kept wider than today's intersection ({shape}) precisely so a future
// catalogue widening cannot fire an interview command silently.
const INTERVIEW_REQUIRED_COMMANDS = Object.freeze(['shape', 'init', 'teach']);
// M4 — table phase axis. `pre` entries route BEFORE Phase 3 EXECUTE (they can
// only shape direction); `finish` entries route AFTER it, against produced code.
// This is a sibling of the existing internal `signal` metadata, not a new call
// form: a `finish` callForm would drag resolveCallForm, selectByDiffSignals and
// the receipt schema's closed enum along with it. Both are stripped from the
// public return, so consumers see the M1 shape unchanged.
const ROUTING_PHASES = Object.freeze(['pre', 'finish']);

function entry(command, stage, callForm, signal, phase) {
  return Object.freeze({
    command: command,
    stage: stage,
    callForm: callForm,
    signal: signal || null,
    phase: phase || 'pre',
  });
}

// gate → ordered routing entries. `callForm` is the AUTO-mode base intent;
// resolveCallForm() applies mode + renderingSurface transforms (downgrade-only).
// `signal` (when set) gates the command on a diff content signal in auto mode.
// The `pr` table is recommend-only by design — the PR step is review-only
// (§1.2 PR-phase guard) and must never invoke an impeccable command.
const PLAN_GUIDE = Object.freeze([
  entry('shape', 'discovery', 'recommend', null),
  entry('layout', 'refine', 'recommend', null),
  entry('typeset', 'refine', 'recommend', 'typography'),
  entry('animate', 'refine', 'recommend', 'motion'),
  entry('colorize', 'refine', 'recommend', 'color'),
  entry('bolder', 'refine', 'recommend', null),
  entry('quieter', 'refine', 'recommend', null),
  entry('overdrive', 'refine', 'recommend', null),
  entry('delight', 'refine', 'recommend', null),
  entry('adapt', 'simplify', 'recommend', 'responsive'),
  entry('distill', 'simplify', 'recommend', null),
  entry('clarify', 'simplify', 'recommend', null),
  entry('critique', 'evaluate', 'recommend', null),
  entry('audit', 'evaluate', 'recommend', null),
  entry('harden', 'harden', 'recommend', null),
  entry('optimize', 'harden', 'recommend', null),
  entry('onboard', 'harden', 'recommend', null),
  entry('polish', 'polish', 'recommend', null),
  entry('document', 'system', 'recommend', null),
  entry('extract', 'system', 'recommend', null),
]);

const STAGE_ROUTING = Object.freeze({
  implement: Object.freeze([
    // M4 — demoted background → recommend: the vendor makes `shape` an
    // interview command (INTERVIEW_REQUIRED_COMMANDS above), so it could never
    // complete here. The catalogue entry stays (UI5 forbids removals); only the
    // call form moves, in the module's existing downgrade-only direction.
    entry('shape', 'discovery', 'recommend', null),
    entry('layout', 'refine', 'invoke', null),
    entry('typeset', 'refine', 'invoke', 'typography'),
    entry('animate', 'refine', 'invoke', 'motion'),
    entry('colorize', 'refine', 'invoke', 'color'),
    entry('bolder', 'refine', 'recommend', null),
    entry('quieter', 'refine', 'recommend', null),
    entry('overdrive', 'refine', 'recommend', null),
    entry('delight', 'refine', 'recommend', null),
    entry('adapt', 'simplify', 'invoke', 'responsive'),
    entry('critique', 'evaluate', 'invoke', null),
    entry('audit', 'evaluate', 'invoke', null),
    entry('document', 'system', 'recommend', null),
    entry('extract', 'system', 'recommend', null),

    // ── finish phase (post-EXECUTE, against produced code) ──────────────
    // Before M4 these ran from a hardcoded list in prp-implement.md Phase 3.6,
    // bypassing this oracle entirely — so the receipt could not record them.
    // Giving them table rows is what makes them routable AND recordable.
    // `harden` and `optimize` earn a seat because the vendor describes them as
    // FIXING produced code ("error handling, i18n, text overflow" / "Diagnoses
    // and fixes UI performance"), the same kind as polish/clarify/distill.
    // `onboard` does NOT: it builds surfaces that were never asked for
    // ("welcome screens, account setup, progressive disclosure"), so it stays
    // recommend-only in the guide tables. That line is what opens the harden
    // stage without letting scope widen.
    entry('clarify', 'simplify', 'invoke', null, 'finish'),
    entry('distill', 'simplify', 'invoke', null, 'finish'),
    entry('harden', 'harden', 'invoke', null, 'finish'),
    entry('optimize', 'harden', 'invoke', null, 'finish'),
    entry('polish', 'polish', 'invoke', null, 'finish'),
  ]),
  pr: Object.freeze([
    entry('polish', 'polish', 'recommend', null),
    entry('audit', 'evaluate', 'recommend', null),
    entry('harden', 'harden', 'recommend', null),
    entry('optimize', 'harden', 'recommend', null),
    entry('onboard', 'harden', 'recommend', null),
    entry('document', 'system', 'recommend', null),
    entry('extract', 'system', 'recommend', null),
  ]),
  // plan + prd share the guide table — neither has a rendered surface yet, so
  // every entry is recommend-only.
  plan: PLAN_GUIDE,
  prd: PLAN_GUIDE,
});

function parseRoutingMode(env) {
  const raw = (env && env.MCCP_IMPECCABLE_ROUTING_MODE) || '';
  const v = String(raw).trim().toLowerCase();
  if (ROUTING_MODES.indexOf(v) !== -1) return v;
  return 'auto';
}

// parseIntentCommands — read MCCP_IMPECCABLE_INTENT_COMMANDS as a comma list,
// keep only known mood commands (ignore unknown/empty tokens).
function parseIntentCommands(env) {
  const raw = (env && env.MCCP_IMPECCABLE_INTENT_COMMANDS) || '';
  return String(raw)
    .split(',')
    .map(function (s) { return s.trim().toLowerCase(); })
    .filter(function (s) { return MOOD_COMMANDS.indexOf(s) !== -1; });
}

function isEvaluate(command) {
  return EVALUATE_COMMANDS.indexOf(command) !== -1;
}

function isMood(command) {
  return MOOD_COMMANDS.indexOf(command) !== -1;
}

// extractDiffSignals — pure regex classifier over combined diff/file text.
// Returns { motion, color, typography, responsive } booleans. Covers CSS
// property syntax, Tailwind/utility class names, and CSS-in-JS camelCase
// (Codex M2 F2). Caller is responsible for the fail-open omission contract
// (Codex M2 F1): when a rendered surface is touched but this returns all-false,
// the caller MUST omit diffSignals rather than forward all-false.
function extractDiffSignals(text) {
  const t = String(text || '');
  return {
    motion: /@keyframes|animation[\s:-]|transition[\s:-]|transform[\s:-]|cubic-bezier|\b(?:motion|translate|scale|rotate|duration|ease)-|\b(?:animate|transition|duration|delay)\b/.test(t),
    color: /oklch\(|hsla?\(|rgba?\(|#[0-9a-fA-F]{3,8}\b|--[\w-]*colou?r|background-?[Cc]olor|\bcolor\s*:|\b(?:bg|text|border|fill|stroke|ring)-[a-z]|backgroundColor/.test(t),
    typography: /font[-A-Z]|line-?[Hh]eight|letter-?[Ss]pacing|text-(?:align|transform|decoration|xs|sm|base|lg|xl|\d)|\b(?:leading|tracking|font)-|fontSize|fontWeight|fontFamily/.test(t),
    responsive: /@media|min-width|max-width|\b(?:sm|md|lg|xl|2xl):|breakpoint|i18n|locale|dir\s*=|\brtl\b|useMediaQuery/.test(t),
  };
}

// Resolve the effective call form for one entry. Transform is downgrade-only:
// a recommend base never becomes invoke here, so the pr gate stays review-only
// and mood commands stay recommend (the only upgrade path is mood-intent, in
// routeCommands).
function resolveCallForm(entry, mode, renderingSurface) {
  const base = entry.callForm;
  if (mode === 'recommend') return 'recommend';
  if (mode === 'hybrid') {
    return isEvaluate(entry.command) ? base : 'recommend';
  }
  // auto — F4 selector: control-plane-only signal degrades refine/discovery.
  if (renderingSurface !== true && !isEvaluate(entry.command)) return 'recommend';
  return base;
}

// selectByDiffSignals(commands, diffSignals) — positive-presence narrowing
// (Codex M2 F1+F2). For each command that carries a `signal`, downgrade it to
// recommend when that signal is KNOWN ABSENT in diffSignals. When diffSignals
// is undefined/null (caller could not extract or chose to fail open), this is a
// no-op (M1 fail-open). Pure: returns a new array, never mutates input.
function selectByDiffSignals(commands, diffSignals) {
  if (!diffSignals || typeof diffSignals !== 'object') return commands.slice();
  return commands.map(function (c) {
    if (c.signal && c.callForm !== 'recommend' && diffSignals[c.signal] !== true) {
      return Object.assign({}, c, { callForm: 'recommend' });
    }
    return c;
  });
}

// routeCommands({gate, mode, designSignal, designIntentActive, renderingSurface,
//                diffSignals, intentCommands, phase})
//   → { commands: [{command, stage, callForm, signal}], mode, skipped }
//
// skipped=true when the gate is unknown OR neither designSignal nor
// designIntentActive is set (strict gate, mirrors impeccable-detect).
//
// `phase` (M4, default 'pre') selects the table slice. An UNKNOWN phase yields
// an empty command list with skipped=false — deliberately NOT a fallback to
// 'pre', because a typo that silently re-ran the pre pass after EXECUTE would
// fire those commands twice and break the duplicate-call invariant. An empty
// route is the loud-by-absence failure; a silent re-run is not.
//
// Apply order: resolveCallForm (mode/renderingSurface) → mood-intent upgrade
// (4-AND audited) → selectByDiffSignals (content narrow). All downgrade-only
// except the audited mood-intent upgrade.
function routeCommands(opts) {
  opts = opts || {};
  const gate = opts.gate;
  const mode = ROUTING_MODES.indexOf(opts.mode) !== -1 ? opts.mode : 'auto';
  const designSignal = opts.designSignal === true;
  const designIntentActive = opts.designIntentActive === true;
  const renderingSurface = opts.renderingSurface === true;
  const diffSignals = opts.diffSignals;
  const intentCommands = Array.isArray(opts.intentCommands) ? opts.intentCommands : [];
  const phase = opts.phase === undefined || opts.phase === null ? 'pre' : opts.phase;

  const table = STAGE_ROUTING[gate];
  if (!table) return { commands: [], mode: mode, skipped: true };

  // F1 — trigger on detector signal OR audited design-intent override.
  if (!designSignal && !designIntentActive) {
    return { commands: [], mode: mode, skipped: true };
  }

  // M4 — phase narrowing happens BEFORE call-form resolution so an entry that
  // belongs to another pass cannot influence anything downstream (mood upgrade,
  // content narrowing, the public list). plan/prd/pr tables are entirely 'pre',
  // so their output is byte-identical to pre-M4 (pinned by test M4-3a/M4-3b).
  let commands = table.filter(function (e) {
    return e.phase === phase;
  }).map(function (e) {
    let callForm = resolveCallForm(e, mode, renderingSurface);
    // M2 F3 — mood-intent upgrade. The single upgrade path in the oracle,
    // gated by a 4-AND: auto mode, rendered surface, audited design intent,
    // and explicit membership in intentCommands. Any one absent → stays
    // recommend.
    if (isMood(e.command) && mode === 'auto' && renderingSurface === true &&
        designIntentActive === true && intentCommands.indexOf(e.command) !== -1) {
      callForm = 'invoke';
    }
    return { command: e.command, stage: e.stage, callForm: callForm, signal: e.signal };
  });

  // M2 F1+F2 — content narrowing only applies in auto mode (hybrid/recommend
  // already downgraded non-evaluate commands). No-op when diffSignals omitted.
  if (mode === 'auto') {
    commands = selectByDiffSignals(commands, diffSignals);
  }

  // Implement-Codex M2 [1] — keep the PUBLIC return schema stable: strip the
  // internal `signal` metadata so consumers see exactly {command, stage,
  // callForm} (M1 shape). selectByDiffSignals already consumed `signal` above;
  // it stays a standalone signal-aware helper for unit testing.
  // M4 — `phase` is stripped the same way and for the same reason: it is table
  // metadata consumed by the filter above, and leaking it would change the
  // shape every consumer (and the receipt entry builder) reads.
  const out = commands.map(function (c) {
    return { command: c.command, stage: c.stage, callForm: c.callForm };
  });

  return { commands: out, mode: mode, skipped: false };
}

module.exports = {
  ROUTING_MODES,
  EVALUATE_COMMANDS,
  MOOD_COMMANDS,
  SYSTEM_COMMANDS,
  SIGNAL_KINDS,
  INTERVIEW_REQUIRED_COMMANDS,
  ROUTING_PHASES,
  STAGE_ROUTING,
  parseRoutingMode,
  parseIntentCommands,
  isEvaluate,
  isMood,
  extractDiffSignals,
  resolveCallForm,
  selectByDiffSignals,
  routeCommands,
};
