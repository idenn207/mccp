'use strict';

// dep-check — read-only inspection of mccp's external dependencies.
//
//   - codex plugin (codex@openai-codex) via ~/.claude/plugins/installed_plugins.json
//   - impeccable skill via impeccable-detect's resolveImpeccable (all install channels)
//   - impeccable CLI via PATH lookup (cross-platform: `where` on win32, `which` elsewhere)
//
// The last two answer different questions and are deliberately NOT merged.
// `impeccable_cli` says a binary named `impeccable` is on PATH; `impeccable`
// says the name our command bodies call actually resolves to a skill body.
// Only the second has decision authority — no gate branch reads the CLI probe
// (v1.0.0-baseline F-W1-2 prescribed two fields over one ambiguous one).
//
// Never throws. Returns sentinel objects so command bodies can branch with
// plain `if (!result.installed)` without try/catch noise.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const envValue = require('./env-contract/value');

const INSTALLED_PLUGINS_PATH = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json');
const CODEX_PLUGIN_KEY = 'codex@openai-codex';

// version, source and invocation all originate outside this repo — SKILL.md
// frontmatter the user installed, and a registry key written by the plugin
// installer. They reach a terminal in the printer below and in /mccp:setup's
// Phase 1 table, so a value carrying ANSI escapes or control characters would
// render as terminal control rather than as text. Print only what these labels
// can legitimately be; anything else prints as `?`, which loses the value but
// not the fact that the source resolved.
const SAFE_LABEL_RE = /^[A-Za-z0-9._+:-]{1,64}$/;

function safeLabel(value) {
  return (typeof value === 'string' && SAFE_LABEL_RE.test(value)) ? value : '?';
}

// Paths cannot pass SAFE_LABEL_RE and are not meant to: they carry separators,
// a leading tilde, and run well past 64 chars. Sanitizing them the same way
// would print '?' for every row and destroy the only thing an eclipsed row is
// for -- telling the operator WHERE the other copy is, in a form they can paste
// into a shell. So paths get their own rule: remove anything that could act as
// terminal control (C0, DEL, C1), then bound the length. The remaining
// characters are shown verbatim.
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F-\u009F]/g;
const PATH_MAX_CHARS = 200;

function safePath(value) {
  if (typeof value !== 'string' || value === '') return '?';
  const stripped = value.replace(CONTROL_CHARS_RE, '');
  if (stripped === '') return '?';
  return stripped.length > PATH_MAX_CHARS
    ? stripped.slice(0, PATH_MAX_CHARS) + '...(truncated)'
    : stripped;
}

function readInstalledPlugins(filePath) {
  const target = filePath || INSTALLED_PLUGINS_PATH;
  try {
    if (!fs.existsSync(target)) return { plugins: {} };
    const raw = fs.readFileSync(target, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.plugins && typeof parsed.plugins === 'object') {
      return parsed;
    }
    return { plugins: {} };
  } catch (_err) {
    return { plugins: {} };
  }
}

function checkCodexPlugin(options) {
  const opts = options || {};
  const manifest = readInstalledPlugins(opts.installedPluginsPath);
  const entries = manifest.plugins[CODEX_PLUGIN_KEY];
  if (!Array.isArray(entries) || entries.length === 0) {
    return { installed: false };
  }
  const first = entries[0] || {};
  return {
    installed: true,
    version: first.version || null,
    installPath: first.installPath || null,
    scope: first.scope || null,
  };
}

// Same shape resolveImpeccable returns, so a load failure is structurally
// indistinguishable from a genuine miss and callers need no second branch. It
// fails CLOSED: telling a gate that impeccable resolves when nothing was ever
// probed would turn a broken require into a silent design-review skip.
function impeccableSentinel(reason) {
  return {
    available: false,
    reason: reason,
    invocation: null,
    source: null,
    version: null,
    path: null,
    sources: [],
    shadowed: false,
    eclipsed: [],
  };
}

// impeccable-detect requires THIS module at top level, so requiring it back at
// top level would close the cycle and hand whichever side loaded second a
// partial export. The require stays inside the function body (mirror:
// auto-chain.js:109) — by call time both modules are loaded and cached.
//
// The guard is not defensive noise: this module's contract is "never throws"
// (see header), and a deferred require can fail for reasons dep-check cannot
// see from here.
function checkImpeccable(options) {
  let detect;
  try {
    detect = require('./impeccable-detect');
  } catch (_err) {
    return impeccableSentinel('detect-load-error');
  }
  if (!detect || typeof detect.resolveImpeccable !== 'function') {
    return impeccableSentinel('detect-load-error');
  }
  try {
    return detect.resolveImpeccable(options || {});
  } catch (_err) {
    return impeccableSentinel('detect-throw');
  }
}

function checkImpeccableCli(options) {
  const opts = options || {};
  const platform = opts.platform || os.platform();
  const finder = platform === 'win32' ? 'where' : 'which';
  let result;
  try {
    result = spawnSync(finder, ['impeccable'], { encoding: 'utf8' });
  } catch (_err) {
    return { installed: false };
  }
  if (!result || result.status !== 0) {
    return { installed: false };
  }
  const stdout = (result.stdout || '').trim();
  const firstLine = stdout.split(/\r?\n/)[0] || '';
  return {
    installed: true,
    path: firstLine.trim() || null,
  };
}

// Same shape resolveInstallSkew returns, for the same reason impeccableSentinel
// exists: a load failure must be structurally indistinguishable from a genuine
// "cannot tell" so callers need no second branch.
//
// It fails to `unknown`, NOT to `current`. Folding an unreadable oracle to
// `current` would turn a broken require into a silent "your install is fine" —
// the diagnostic would switch itself off exactly when it stopped working
// (install-skew.js header, DD4).
function installSkewSentinel(reason) {
  return {
    state: 'unknown',
    installed_version: null,
    installed_sha: null,
    head_sha: null,
    commits_behind: null,
    plugin_dir_override: false,
    reason: reason,
  };
}

// review-record-linkage M5 (Task 2). Lazy require + try/catch, mirroring
// checkImpeccable above. There is no require cycle to dodge here — the guard is
// this module's "never throws" contract, and the second half of the double
// defence the implement-gate security review asked for: install-skew.js wraps
// every injected effect internally, and this wraps install-skew.js. Neither
// side trusts the other's promise alone.
function checkInstallSkew(options) {
  let mod;
  try {
    mod = require('./install-skew');
  } catch (_err) {
    return installSkewSentinel('oracle_unavailable');
  }
  if (!mod || typeof mod.resolveInstallSkew !== 'function') {
    return installSkewSentinel('oracle_unavailable');
  }
  try {
    return mod.resolveInstallSkew(options || {});
  } catch (_err) {
    return installSkewSentinel('oracle_unavailable');
  }
}

// Strict superset: the five pre-existing keys keep their exact meaning and a
// sixth is added (M5 mirrors what v1.31.2 did when it appended `impeccable`).
// `options` is forwarded verbatim so resolveImpeccable's own default
// (process.cwd()) applies when no repoRoot is supplied — this module does not
// invent a second default for the same question.
function checkAll(options) {
  return {
    codex_plugin: checkCodexPlugin(options),
    impeccable_cli: checkImpeccableCli(options),
    impeccable: checkImpeccable(options),
    codex_disabled: envValue.parseBool(process.env, 'MCCP_CODEX_DISABLED'),
    install_skew: checkInstallSkew(options),
    checked_at: new Date().toISOString(),
  };
}

// One informational sentence for the SessionStart banner, or '' when there is
// nothing to say. Lives here for the same reason impeccableEclipsedNotice does:
// this module has tests and the hook does not, and the sentence is derived
// purely from a result already in hand.
//
// `behind`/`diverged` speak; `current` and `unknown` stay silent. `unknown` is
// silent on purpose — it means the oracle could not judge, and a banner that
// fires on "I don't know" is noise on every machine without git, on every
// non-repo cwd, and under every plugin-dir override we declined to judge.
// The state is still in `dep-check --json` for anyone who asks.
//
// installed_version comes from a file outside this repo, so it goes through
// safeLabel for the reason stated at that function: it reaches a terminal, and
// a value carrying ANSI escapes would render as terminal control, not text.
function installSkewNotice(skew) {
  if (!skew) return '';
  if (skew.state === 'behind') {
    const n = skew.commits_behind;
    const behind = (typeof n === 'number' && n > 0) ? n + ' commit(s) behind' : 'behind';
    return '[mccp] the mccp build that actually runs is ' + behind
      + ' this worktree (installed v' + safeLabel(skew.installed_version)
      + '). Command bodies from this branch are NOT the ones executing.'
      + ' See docs/dogfood-install.md for the --plugin-dir path.';
  }
  if (skew.state === 'diverged') {
    return '[mccp] the mccp build that actually runs (v' + safeLabel(skew.installed_version)
      + ') is not an ancestor of this worktree HEAD — it carries commits this branch does not.'
      + ' See docs/dogfood-install.md for the --plugin-dir path.';
  }
  return '';
}

// The dedupe key for the skew banner, on its own axis.
//
// It cannot share dep_check_at: that clock is re-stamped on every session that
// runs dep-check, so a 24h window keyed on it alone would show this banner once
// and never again — and a state CHANGE (newly behind, or resolved) would not
// bring it back. That is the failure this milestone exists to close, so the
// axis gets its own present-only field (dep_check_eclipsed precedent).
function installSkewKey(skew) {
  if (!skew) return null;
  if (skew.state !== 'behind' && skew.state !== 'diverged') return null;
  const n = (typeof skew.commits_behind === 'number') ? skew.commits_behind : '?';
  return skew.state + '-' + n;
}

// One table row. `unknown` prints its reason enum — the enum is a closed set by
// contract (install-skew.js REASONS), so nothing host-specific can ride in on it.
function installSkewLabel(skew) {
  if (!skew) return '?';
  const v = safeLabel(skew.installed_version);
  const where = skew.plugin_dir_override ? ' [plugin-dir override]' : '';
  if (skew.state === 'current') return 'current (running v' + v + ')' + where;
  if (skew.state === 'behind') {
    const n = (typeof skew.commits_behind === 'number') ? skew.commits_behind : '?';
    return 'BEHIND by ' + n + ' commit(s) (running v' + v + ')' + where;
  }
  if (skew.state === 'diverged') return 'DIVERGED (running v' + v + ')' + where;
  return 'unknown (' + safeLabel(skew.reason) + ')' + where;
}

function impeccableLabel(impeccable) {
  if (!impeccable || !impeccable.available) return 'missing';
  // An ambiguous winner reports nulls rather than a guess (impeccable-detect's
  // own contract), so there is no source or version to print. Say how many
  // bodies were seen instead of naming one that was never established.
  if (impeccable.shadowed) {
    return 'ambiguous (' + (impeccable.sources || []).length + ' sources)';
  }
  const base = 'available (' + safeLabel(impeccable.source) + ' v' + safeLabel(impeccable.version)
    + ', ' + safeLabel(impeccable.invocation) + ')';
  // Shadowing is not a missing dependency, so it rides along on the resolved
  // label rather than becoming its own status. The count is all that fits on
  // one row; the printer below names the rows.
  const eclipsed = (impeccable.eclipsed || []).length;
  return eclipsed > 0 ? base + ' - +' + eclipsed + ' eclipsed' : base;
}

// How many copies answer the BARE name -- the one `Skill(impeccable, ...)`
// uses. `sources` is not that number: it also carries plugin rows, and a plugin
// registers as <pluginName>:<skillDirName>, so it answers a different name and
// is never part of the ambiguity. Reporting sources.length as "copies answering
// the same name" over-counts a two-channel install and tells the operator to go
// resolve a conflict that does not exist.
function bareSourceCount(impeccable) {
  return ((impeccable && impeccable.sources) || []).filter(function (row) {
    return row && (row.source === 'project' || row.source === 'user');
  }).length;
}

// The eclipsed rows as the CLI prints them, as a pure function of the result.
// Extracted from the printer so the sanitizing can be asserted hermetically:
// building these inline would only be reachable by spawning dep-check against
// whatever is really installed on the machine running the tests.
function impeccableEclipsedRows(impeccable) {
  const eclipsed = (impeccable && impeccable.eclipsed) || [];
  return eclipsed.map(function (row) {
    return '                    eclipsed: ' + safeLabel(row.source)
      + ' v' + safeLabel(row.version) + ' as ' + safeLabel(row.invocation)
      + ' -- ' + safePath(row.path);
  });
}

// One informational sentence for the SessionStart banner, or '' when there is
// nothing to say. It lives HERE rather than in the hook because the hook has no
// test of its own and this module does -- and because the sentence is derived
// purely from a dep-check result, with no second probe.
//
// It is deliberately NOT folded into the `missing` array: an eclipsed copy is
// not an absent dependency, and putting it there would re-open the false
// 'Missing dependencies: impeccable' banner that v1.31.2 just closed.
//
// Both ambiguous states are reported, not just the eclipsed one. Under
// shadowed:true the eclipsed list is empty BY CONTRACT (no winner, so no row
// can be called eclipsed), and keying the banner on eclipsed alone would go
// silent on the state that actually needs a human -- while still speaking up
// for the benign resolved-with-a-spare case.
function impeccableEclipsedNotice(impeccable) {
  if (!impeccable || !impeccable.available) return '';
  if (impeccable.shadowed) {
    const n = bareSourceCount(impeccable);
    return '[mccp] impeccable resolves, but ' + n + ' copies answer the same name'
      + ' and mccp cannot tell which one opens. Run /mccp:setup to see the paths and pick one.';
  }
  const eclipsed = impeccable.eclipsed || [];
  if (eclipsed.length === 0) return '';
  const others = eclipsed.map(function (row) {
    return safeLabel(row.source) + ' v' + safeLabel(row.version);
  }).join(', ');
  return '[mccp] impeccable opens ' + safeLabel(impeccable.source) + ' v'
    + safeLabel(impeccable.version) + ' as ' + safeLabel(impeccable.invocation)
    + '. ' + eclipsed.length + ' other copy/copies present and NOT opened (' + others
    + '). Run /mccp:setup to review or clean up.';
}

// The dedupe key for the eclipsed banner, on its own axis.
//
// SessionStart cannot reuse `dep_check_missing` for this: that key belongs to
// the missing-deps banner, and writing an eclipsed marker into it would make a
// shadowed install read as a missing dependency to every other consumer of that
// frontmatter field. Nor can the banner ride on the 24h clock alone -- that
// clock is re-stamped on EVERY session that runs dep-check, so an operator who
// opens a session daily would see the banner once and never again, and a copy
// appearing or disappearing would not bring it back.
//
// Colons are kept out of the value on purpose: it is serialised into STATE.md
// frontmatter as `key: value`. Both halves pass safeLabel, which admits no
// separators.
const ECLIPSED_KEY_MAX_CHARS = 128;

function impeccableEclipsedKey(impeccable) {
  if (!impeccable || !impeccable.available) return null;
  if (impeccable.shadowed) return 'shadowed-' + bareSourceCount(impeccable);
  const eclipsed = impeccable.eclipsed || [];
  if (eclipsed.length === 0) return null;
  const key = 'eclipsed-' + eclipsed.map(function (row) {
    return safeLabel(row.source) + '@' + safeLabel(row.version);
  }).join('+');
  return key.length > ECLIPSED_KEY_MAX_CHARS ? key.slice(0, ECLIPSED_KEY_MAX_CHARS) : key;
}

module.exports = {
  readInstalledPlugins,
  checkCodexPlugin,
  checkImpeccable,
  checkImpeccableCli,
  checkInstallSkew,
  installSkewNotice,
  installSkewKey,
  installSkewLabel,
  checkAll,
  impeccableLabel,
  impeccableEclipsedNotice,
  impeccableEclipsedRows,
  impeccableEclipsedKey,
  bareSourceCount,
  safeLabel,
  safePath,
  INSTALLED_PLUGINS_PATH,
  CODEX_PLUGIN_KEY,
};

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--json')) {
    process.stdout.write(JSON.stringify(checkAll(), null, 2) + '\n');
    process.exit(0);
  }
  const result = checkAll();
  const lines = [
    'mccp dep-check',
    '  codex plugin    : ' + (result.codex_plugin.installed
      ? 'installed (v' + (result.codex_plugin.version || '?') + ')'
      : 'missing'),
    '  impeccable skill: ' + impeccableLabel(result.impeccable),
    '  impeccable CLI  : ' + (result.impeccable_cli.installed
      ? 'installed (' + (result.impeccable_cli.path || '?') + ')'
      : 'missing') + '  [telemetry only — no gate reads this]',
    '  codex disabled  : ' + (result.codex_disabled ? 'yes (MCCP_CODEX_DISABLED=1)' : 'no'),
    // review-record-linkage M5 — which build actually runs. Reachability, not a
    // version-string compare: since branches stopped declaring plugin.json
    // versions (CLAUDE.md §3.7), two equal numbers over different content is the
    // NORMAL state, so the number cannot answer this question.
    '  install skew    : ' + installSkewLabel(result.install_skew),
  ];
  // Eclipsed rows are printed under the skill row, one per line. Version and
  // invocation come from a SKILL.md the user installed, so they pass safeLabel;
  // the path passes safePath for the reason given at its definition.
  const skillLineIndex = lines.findIndex(function (l) { return l.indexOf('impeccable skill:') !== -1; });
  const rendered = impeccableEclipsedRows(result.impeccable);
  if (rendered.length && skillLineIndex !== -1) {
    lines.splice.apply(lines, [skillLineIndex + 1, 0].concat(rendered));
  }
  process.stdout.write(lines.join('\n') + '\n');
}
