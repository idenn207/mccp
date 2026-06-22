'use strict';

// impeccable-routing — stage-aware impeccable command routing oracle (M1).
//
// Pure, dep-free decision function. Given a gate + routing mode + design
// signals, returns the ordered list of impeccable commands to route and the
// resolved call form for each. Mirrors design-critique-decide.js: explicit
// inputs, no side effects, enum return values.
//
// The mccp design gate historically routed a single impeccable command
// (`critique`). This oracle maps the design lifecycle (discovery → refine →
// evaluate → harden → polish) onto the impeccable command catalogue so the
// gate can route stage-appropriate commands instead of one review call.
//
// Codex Plan-Codex R1 absorptions:
//   F1 — designIntentActive input preserves the audited MCCP_DESIGN_INTENT_REASON
//        escape hatch: route on (designSignal || designIntentActive), never drop
//        a user-declared design intent into `skipped`.
//   F4 — renderingSurface selector bounds the coarse control-plane signal. When
//        no rendered surface is present (e.g. a whitelist-only hit on
//        receipt/write.js), refine/discovery commands degrade to 'recommend'
//        even under `auto`; evaluate commands (critique/audit) still invoke.

const ROUTING_MODES = Object.freeze(['auto', 'hybrid', 'recommend']);
const EVALUATE_COMMANDS = Object.freeze(['critique', 'audit']);

// gate → ordered routing entries. `callForm` is the AUTO-mode base intent;
// resolveCallForm() applies mode + renderingSurface transforms (downgrade-only,
// never upgrades a recommend base to invoke). The `pr` table is recommend-only
// by design — the PR step is review-only (§1.2 PR-phase guard) and must never
// invoke an impeccable command.
const PLAN_GUIDE = Object.freeze([
  Object.freeze({ command: 'shape', stage: 'discovery', callForm: 'recommend' }),
  Object.freeze({ command: 'layout', stage: 'refine', callForm: 'recommend' }),
  Object.freeze({ command: 'typeset', stage: 'refine', callForm: 'recommend' }),
  Object.freeze({ command: 'critique', stage: 'evaluate', callForm: 'recommend' }),
  Object.freeze({ command: 'audit', stage: 'evaluate', callForm: 'recommend' }),
  Object.freeze({ command: 'harden', stage: 'harden', callForm: 'recommend' }),
  Object.freeze({ command: 'polish', stage: 'polish', callForm: 'recommend' }),
]);

const STAGE_ROUTING = Object.freeze({
  implement: Object.freeze([
    Object.freeze({ command: 'shape', stage: 'discovery', callForm: 'background' }),
    Object.freeze({ command: 'layout', stage: 'refine', callForm: 'invoke' }),
    Object.freeze({ command: 'typeset', stage: 'refine', callForm: 'invoke' }),
    Object.freeze({ command: 'critique', stage: 'evaluate', callForm: 'invoke' }),
    Object.freeze({ command: 'audit', stage: 'evaluate', callForm: 'invoke' }),
  ]),
  pr: Object.freeze([
    Object.freeze({ command: 'polish', stage: 'polish', callForm: 'recommend' }),
    Object.freeze({ command: 'audit', stage: 'evaluate', callForm: 'recommend' }),
    Object.freeze({ command: 'harden', stage: 'harden', callForm: 'recommend' }),
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

function isEvaluate(command) {
  return EVALUATE_COMMANDS.indexOf(command) !== -1;
}

// Resolve the effective call form for one entry. Transform is downgrade-only:
// a recommend base never becomes invoke, so the pr gate stays review-only.
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

// routeCommands({gate, mode, designSignal, designIntentActive, renderingSurface})
//   → { commands: [{command, stage, callForm}], mode, skipped }
//
// skipped=true when the gate is unknown OR neither designSignal nor
// designIntentActive is set (strict gate, mirrors impeccable-detect).
function routeCommands(opts) {
  opts = opts || {};
  const gate = opts.gate;
  const mode = ROUTING_MODES.indexOf(opts.mode) !== -1 ? opts.mode : 'auto';
  const designSignal = opts.designSignal === true;
  const designIntentActive = opts.designIntentActive === true;
  const renderingSurface = opts.renderingSurface === true;

  const table = STAGE_ROUTING[gate];
  if (!table) return { commands: [], mode: mode, skipped: true };

  // F1 — trigger on detector signal OR audited design-intent override.
  if (!designSignal && !designIntentActive) {
    return { commands: [], mode: mode, skipped: true };
  }

  const commands = table.map(function (entry) {
    return {
      command: entry.command,
      stage: entry.stage,
      callForm: resolveCallForm(entry, mode, renderingSurface),
    };
  });
  return { commands: commands, mode: mode, skipped: false };
}

module.exports = {
  ROUTING_MODES,
  EVALUATE_COMMANDS,
  STAGE_ROUTING,
  parseRoutingMode,
  isEvaluate,
  resolveCallForm,
  routeCommands,
};
