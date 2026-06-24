'use strict';

const fs = require('fs');
const path = require('path');

// Dashboard Truthfulness M2 (Codex R1 F2/F3 absorption) — host-project version
// signal resolved at DERIVE time (not render time) so provenance is baked into
// the snapshot and reproducible. The renderer consumes model.host_version only;
// it never reads host files. Fallback ladder (authoritative meta first, F3):
//   1. host meta (package.json / pyproject.toml / Cargo.toml `version`)
//   2. CHANGELOG.md top version heading (corroborated fallback — source label)
//   3. git describe --tags --abbrev=0
//   4. latest plan cycle prefix ('최신 plan cycle' framing — not a version claim)
//   5. miss → { version: null, source: 'unknown' } (honest '미상')
// The plugin manifest (plugins/mccp/.claude-plugin/plugin.json) is intentionally
// NOT read — the PRD requires the plugin self-version stay invisible. Loud
// fail-open: every step try/catch, never throws. `source` is always surfaced so
// the user can verify the version's provenance even when meta ↔ CHANGELOG
// disagree (meta is authoritative; the label exposes which signal won).

const META_FILES = [
  { file: 'package.json', kind: 'json' },
  { file: 'pyproject.toml', kind: 'toml' },
  { file: 'Cargo.toml', kind: 'toml' },
];

// `## [1.18.3] — date` / `## v1.18.3` / `## 1.18.3` 모두 첫 매치. unreleased
// 헤딩(`## [Unreleased]`)은 \d+\.\d+\.\d+ 미포함이라 자연히 skip.
const CHANGELOG_VERSION_RE = /^##\s*\[?v?(\d+\.\d+\.\d+[^\]\s]*)\]?/m;

function defaultGitDescribe(repoRoot) {
  return () => {
    try {
      const { execFileSync } = require('child_process');
      const out = execFileSync('git', ['describe', '--tags', '--abbrev=0'], {
        cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
      });
      const s = (out || '').trim();
      return s || null;
    } catch (_) {
      return null;
    }
  };
}

function readMetaVersion(fsRead, repoRoot, file, kind) {
  const raw = fsRead(path.join(repoRoot, file)); // throws if missing → caller try/catch
  if (kind === 'json') {
    const obj = JSON.parse(raw);
    const v = obj && typeof obj.version === 'string' ? obj.version.trim() : '';
    return v || null;
  }
  // toml — naive top-level `version = "x"` first match (covers [package]/[project]
  // version key). Avoids a toml-parser dependency (derive stays dep-free).
  const m = raw.match(/^\s*version\s*=\s*["']([^"']+)["']/m);
  return m ? m[1].trim() : null;
}

function extractCyclePrefix(slug) {
  if (!slug || typeof slug !== 'string') return null;
  const m = slug.match(/^(v\d+-\d+-\d+)/);
  return m ? m[1] : null;
}

// v1-18-3 → 1.18.3 (bare, no leading v — the widget prepends the 'v').
function cycleToVersion(cycle) {
  if (!cycle) return null;
  const m = cycle.match(/^v(\d+)-(\d+)-(\d+)/);
  return m ? m[1] + '.' + m[2] + '.' + m[3] : null;
}

function planBasename(p) {
  if (!p || typeof p.path !== 'string') return null;
  return p.path.split(/[\\/]/).pop() || null;
}

// derive 시점에는 in-progress 상태가 없으므로(render-time PRD 파싱 결과) '최신'은
// 배열 마지막 항목으로 근사. cycle prefix 가 있는 마지막 plan 을 우선 채택.
function pickLatestPlan(plans) {
  let withCycle = null;
  let lastAny = null;
  for (const p of plans) {
    const base = planBasename(p);
    if (!base) continue;
    lastAny = p;
    if (extractCyclePrefix(p.slug || base)) withCycle = p;
  }
  return withCycle || lastAny;
}

function resolveHostVersion(repoRoot, opts) {
  opts = opts || {};
  const fsRead = opts.fsRead || ((p) => fs.readFileSync(p, 'utf8'));
  // git-tag rung is a child_process spawn. derive() runs under a strict perf
  // budget and is contracted spawn-free ("read-only, LLM-free, dep-free"), so
  // the derive call site passes allowGit:false → git rung skipped (no spawn).
  // The rung stays available to direct/injected callers (default allowGit:true).
  const allowGit = opts.allowGit !== false;
  const gitDescribe = allowGit ? (opts.gitDescribe || defaultGitDescribe(repoRoot)) : null;
  const plans = Array.isArray(opts.plans) ? opts.plans : [];

  const result = {
    version: null,
    source: 'unknown',
    latest_plan: null,
    degraded: false,
    error: null,
  };

  // latest_plan context — best-effort, independent of which version rung wins.
  try {
    const latest = pickLatestPlan(plans);
    result.latest_plan = latest ? planBasename(latest) : null;
  } catch (_) {
    result.latest_plan = null;
  }

  // 1. host meta — authoritative.
  for (const { file, kind } of META_FILES) {
    try {
      const v = readMetaVersion(fsRead, repoRoot, file, kind);
      if (v) {
        result.version = v;
        result.source = 'meta:' + file;
        return result;
      }
    } catch (_) {
      // file missing / unparseable → next candidate.
    }
  }

  // 2. CHANGELOG top version heading — corroborated fallback (source label says so).
  try {
    const raw = fsRead(path.join(repoRoot, 'CHANGELOG.md'));
    const m = raw.match(CHANGELOG_VERSION_RE);
    if (m) {
      result.version = m[1];
      result.source = 'changelog';
      return result;
    }
  } catch (_) {
    // no CHANGELOG → next candidate.
  }

  // 3. git describe --tags (skipped when allowGit:false — derive spawn-free path).
  if (gitDescribe) {
    try {
      const tag = gitDescribe();
      if (tag) {
        result.version = String(tag).replace(/^v/, '');
        result.source = 'git-tag';
        return result;
      }
    } catch (err) {
      result.degraded = true;
      result.error = (err && err.message) || String(err);
    }
  }

  // 4. latest plan cycle prefix — '최신 plan cycle' framing (NOT a version claim).
  try {
    const latest = pickLatestPlan(plans);
    if (latest) {
      const ver = cycleToVersion(extractCyclePrefix(latest.slug || planBasename(latest)));
      if (ver) {
        result.version = ver;
        result.source = 'plan-cycle';
        return result;
      }
    }
  } catch (_) {
    // fall through to honest unknown.
  }

  // 5. all miss → honest '미상'.
  return result;
}

module.exports = {
  resolveHostVersion,
  extractCyclePrefix,
  cycleToVersion,
  pickLatestPlan,
};
