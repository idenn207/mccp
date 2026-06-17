'use strict';

const REQUIRED_STATE_FIELDS = [
  'dispatch_id',
  'dispatch_id_completed',
  'dispatch_attempt_count',
  'controller_session_id',
  'active_dispatch_count',
];

function minimalValidEnvelope() {
  return {
    schema_version: 'v1',
    dispatch_id: '00000000-0000-0000-0000-000000000000',
    worker_subagent_type: 'probe',
    worker_started_at: '2026-01-01T00:00:00.000Z',
    worker_ended_at: null,
    worker_exit_status: 'pending',
    receipts_added: [],
    findings: [],
    next_action: null,
    controller_session_id: '00000000-0000-0000-0000-000000000000',
    parent_cwd: '/tmp',
  };
}

function probeM0SchemaContract(opts) {
  opts = opts || {};
  const envelopeMod = opts.envelopeModule || require('../lib/dispatch-envelope');
  const stateMod = opts.stateWriterModule || require('../state/state-writer');

  // Probe 1 — envelope strict-validate accepts only KNOWN_KEYS
  const probe = Object.assign(minimalValidEnvelope(), { unknown_top_level_key: 1 });
  const result = envelopeMod.validate(probe);
  if (result && result.ok === true) {
    return {
      contract_present: false,
      evidence: 'envelope.validate accepted unknown_top_level_key — M0 Task 4a strict-validate not deployed',
    };
  }

  // Probe 2 — STATE.md frontmatter declares post-M0 dispatch field set
  let stateFmKeys;
  try {
    const empty = stateMod.emptyState();
    stateFmKeys = (empty && empty.frontmatter) ? Object.keys(empty.frontmatter) : [];
  } catch (err) {
    return {
      contract_present: false,
      evidence: 'state-writer.emptyState threw: ' + err.message,
    };
  }
  for (const field of REQUIRED_STATE_FIELDS) {
    if (stateFmKeys.indexOf(field) === -1) {
      return {
        contract_present: false,
        evidence: 'state-writer emptyState missing field: ' + field,
      };
    }
  }

  return {
    contract_present: true,
    evidence: 'M0 schema contract verified at runtime',
  };
}

module.exports = {
  probeM0SchemaContract,
  REQUIRED_STATE_FIELDS,
  _minimalValidEnvelope: minimalValidEnvelope,
};
