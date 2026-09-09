'use strict';

// 하네스 결합 지점 스캐너 (Task 4, Metric 4).
//
// **왜 이 파일이 존재하는가.** 초안의 `scan-coupling`은 선언 목록을 읽어 그 목록이 가리키는
// 파일이 있는지만 봤다. 그러면 `unlisted:0`은 **구조적으로 항상 참**이고 — 목록 자신이
// 유일한 입력이므로 목록 밖의 것을 볼 눈이 없다 — plan이 없애겠다고 선언한 "사람의 성실성"이
// 그대로 남는다(리뷰 R1 architect/test HIGH).
//
// 그래서 후보는 **목록과 무관하게** 산출한다. 아래 `RULES`가 `plugins/mccp/` 트리를 직접
// 훑어 결합 표면 후보를 만들고, `unlisted = candidates − covered(declared)`가 된다.
// 목록에 없는 결합 표면이 새로 생기면 그 규칙에 걸려 즉시 붉어진다.
//
// **이 스캐너가 주장하지 않는 것.** `RULES` 자신이 닫힌 우주다. 아무도 열거하지 않은
// *형태*의 결합(예: 새 벤더 CLI 이름, 새 설정 파일 규약)은 여전히 보이지 않는다.
// 즉 "미열거 0"은 **이 규칙들이 보는 범위 안에서** 참이다. mirror인
// `env-contract/evidence-debt.js`가 registry라는 닫힌 이름 우주 위에서만 정방향 탐지를
// 성립시키는 것과 같은 한계이고, 그 파일도 "증가 방향은 기계가 아니다"라고 적는다.
// 그 한계를 없앴다고 말하지 않는 것이 이 주석의 목적이다.

const fs = require('fs');
const path = require('path');

const ROOT = 'plugins/mccp';

// glob → RegExp. `**`는 구분자를 넘고 `*`는 넘지 않는다.
// `**`를 `*`보다 먼저 소비한다 — 치환 두 번으로 하면 `**`가 `[^/]*[^/]*`가 된다
// (mirror: `scripts/test-suite/enumerate.js`).
function globToRegExp(pattern) {
  const src = String(pattern).split(/[\\/]/).join('/');
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '*') {
      if (src[i + 1] === '*') { out += '.*'; i++; } else { out += '[^/]*'; }
      continue;
    }
    if (c === '?') { out += '[^/]'; continue; }
    out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + out + '$');
}

// 순회에서 건너뛰는 디렉토리. vendored·VCS 트리는 mccp가 소유한 결합 표면이 아니고,
// 그 안을 세면 `candidates_total`이 설치 상태에 따라 흔들려 래칫이 무의미해진다.
const SKIP_DIRS = new Set(['node_modules', '.git', '.worktrees']);
// 깊이 상한. 현재 트리의 최대 깊이는 4라 이 값은 도달하지 않는다 — 무한 재귀를 막는
// 안전장치이지 정책이 아니다. `withFileTypes`의 dirent는 심볼릭 링크를 `isDirectory()`
// false로 보고하므로 링크 루프는 이미 구조적으로 불가능하고, 이 상한은 그 밖의 경우를 덮는다.
const MAX_WALK_DEPTH = 16;

function walk(dir, acc, depth) {
  const d = depth || 0;
  if (d > MAX_WALK_DEPTH) return acc;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return acc; }
  entries.forEach(function (e) {
    const p = path.posix.join(dir.split(path.sep).join('/'), e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) return;
      walk(path.join(dir, e.name), acc, d + 1);
      return;
    }
    acc.push(p);
  });
  return acc;
}

// 규칙은 **닫힌 열거**다. 각 규칙은 후보 키를 낸다 — 파일 축은 repo 상대 posix 경로,
// 이름 축은 env 변수 이름. 키의 종류가 섞이지 않도록 `kind`를 함께 싣는다.
const RULES = [
  {
    id: 'claude-home-path',
    kind: 'file',
    // **홈과 프로젝트 디렉토리를 가른다.** 초기 규칙은 `'.claude'` 리터럴 전부를 잡아 251건을
    // 냈는데, 그 대부분은 `.claude/state`·`.claude/receipts`처럼 **저장소 안** 경로다. 그것은
    // 하네스 중립 규약이라 Codex 호스트에서도 그대로 성립하므로 결합 지점이 아니다. 결합은
    // 사용자 **홈**의 Claude 설치(`homedir()/.claude`)와 플러그인 레지스트리를 조립하는 쪽이다.
    why: 'Claude 설치 홈(~/.claude)·플러그인 레지스트리 경로를 직접 조립한다 — Codex 호스트에는 그 경로가 없다',
    match: /homedir\(\)\s*,\s*['"]\.claude['"]|\.claude[\/\\]plugins|CLAUDE_CONFIG_DIR|installed_plugins\.json/,
    include: /\.(js|mjs|cjs)$/,
  },
  {
    id: 'claude-env-name',
    kind: 'name',
    why: 'CLAUDE_* env 이름에 결속한다 — Codex가 주입하는 이름은 측정되지 않았다(A5)',
    extract: /CLAUDE_[A-Z0-9_]+/g,
    include: /\.(js|mjs|cjs)$/,
  },
  {
    id: 'claude-model-vocabulary',
    kind: 'file',
    why: 'Claude 모델 id·티어 이름을 선언한다 — 리뷰어 반전(M4)에서 벤더가 갈린다',
    match: /claude-(opus|sonnet|haiku|fable)|^model:\s*(opus|sonnet|haiku)\s*$/m,
    include: /\.(js|mjs|cjs|md)$/,
  },
  {
    id: 'agent-tool-vocabulary',
    kind: 'file',
    why: 'Claude 하네스의 도구명 어휘를 frontmatter에 선언한다 — Codex의 도구 어휘와 대응이 없다',
    match: /^tools:\s*\[/m,
    include: /\.md$/,
  },
];

function candidates(opts) {
  const o = opts || {};
  const root = o.root || ROOT;
  const files = walk(root, []).sort();
  const out = [];
  const seen = new Set();
  files.forEach(function (f) {
    let text = null;
    RULES.forEach(function (rule) {
      if (rule.include && !rule.include.test(f)) return;
      if (text === null) {
        try { text = fs.readFileSync(f, 'utf8'); } catch (_) { text = ''; }
      }
      if (rule.kind === 'file') {
        if (rule.match.test(text)) {
          const key = rule.id + '::' + f;
          if (!seen.has(key)) { seen.add(key); out.push({ rule: rule.id, kind: 'file', key: f, file: f }); }
        }
        return;
      }
      // name 축: 같은 이름이 여러 파일에 나와도 후보는 **이름 하나**다.
      const m = text.match(rule.extract);
      if (!m) return;
      Array.from(new Set(m)).forEach(function (name) {
        const key = rule.id + '::' + name;
        if (!seen.has(key)) { seen.add(key); out.push({ rule: rule.id, kind: 'name', key: name, file: f }); }
      });
    });
  });
  return out;
}

// 선언 항목이 후보를 덮는가. `covers`는 규칙별 glob(파일 축) 또는 정확 이름(이름 축)이다.
function coversCandidate(entry, cand) {
  if (entry.rule !== cand.rule) return false;
  const pats = entry.covers || [];
  for (let i = 0; i < pats.length; i++) {
    if (cand.kind === 'name') {
      // 이름 축은 **정확 일치**다. 부분 문자열 일치는 접두사 충돌로 드리프트를 감춘다.
      if (pats[i] === cand.key) return true;
    } else if (globToRegExp(pats[i]).test(cand.key)) {
      return true;
    }
  }
  return false;
}

function scan(opts) {
  const o = opts || {};
  const inventory = o.inventory || require('./coupling-inventory').COUPLING_INVENTORY;
  const cands = o.candidates || candidates({ root: o.root });

  const unlisted = cands.filter(function (c) {
    return !inventory.some(function (e) { return coversCandidate(e, c); });
  });

  // 화석 — 선언에 있는데 어떤 후보도 덮지 못하는 항목. 표면이 사라졌거나 규칙이 바뀌었다.
  const fossil = inventory.filter(function (e) {
    return !cands.some(function (c) { return coversCandidate(e, c); });
  }).map(function (e) { return { name: e.name, rule: e.rule, covers: e.covers }; });

  return {
    schema: 'mccp.codex-probe.coupling-scan/1',
    rules: RULES.map(function (r) { return r.id; }),
    candidates_total: cands.length,
    declared_total: inventory.length,
    unlisted: unlisted.length,
    unlisted_items: unlisted.map(function (c) { return { rule: c.rule, key: c.key }; }),
    fossil: fossil.length,
    fossil_items: fossil,
    // 이 스캐너가 보는 범위를 산출에 함께 싣는다 — 수치만 인용되고 한계가 떨어져 나가지 않게.
    scope_note: 'unlisted:0 holds WITHIN the closed RULES set above; a coupling shape nobody enumerated is still invisible',
  };
}

module.exports = { RULES, ROOT, candidates, scan, coversCandidate, globToRegExp };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.indexOf('--list-candidates') !== -1) {
    const cands = candidates({});
    process.stdout.write(JSON.stringify(cands.map(function (c) { return c.rule + '::' + c.key; }), null, 2) + '\n');
    process.exit(0);
  }
  const res = scan({});
  process.stdout.write(JSON.stringify(res, null, 2) + '\n');
  process.exit(res.unlisted === 0 && res.fossil === 0 ? 0 : 1);
}
