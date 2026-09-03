'use strict';

// leadtime-observability M3 — `.claude/state/leadtime/distribution.json` writer.
//
// C7 이 인용할 분포를 **worktree 밖에서도 살아남게** 남긴다(UI4). 그래서 목적지가
// `.claude/cache/` 가 아니다 — `.gitignore:142` 가 그 디렉토리를 통째로 무시하므로
// 거기 쓴 파일은 worktree 정리(§3.8)와 함께 사라져 다른 세션의 C7 이 인용할 수 없다.
// `.claude/state/leadtime/` 은 어떤 ignore 규칙에도 닿지 않아 git-tracked 다(DD5).
// §3.12 가 감사 대조 corpus 를 git-tracked 로 두는 것과 같은 근거다.
//
// ── content-stable: 내용이 같으면 쓰지 않는다 (DD6) ──────────────────────────
//
// git-tracked 파일을 렌더마다 갱신하면 `/mccp:dashboard-refresh` 한 번에 diff 가
// 생겨 모든 커밋이 이 파일을 끌고 다닌다. payload 에 **어떤 시각 필드도 두지
// 않으므로** content-stability 는 구성상 성립한다(비교할 변동 필드가 없다).
// "언제 갱신됐나" 의 답은 git log 다.
//
// ── tmp 이름은 `<target>.<pid>.<rand>.tmp` 다 (§3.6) ─────────────────────────
//
// 목적지가 **tracked** 라는 것이 `derive/cli.js#writeAtomic` 과 다른 점이다. 그
// 헬퍼의 고정 이름 `<target>.tmp` 는 목적지가 gitignored 라 안전했다. 여기서
// 고정 이름을 쓰면 (a) 동시 writer 가 tmp 에서 충돌하고 (b) 크래시가 tracked
// 디렉토리 안에 부분 JSON 고아를 남겨 `/mccp:prp-commit` 의 자연어 타겟팅이
// 그것을 커밋에 쓸어 담을 수 있다. rename 실패 시 tmp 를 unlink 하는 것도
// 같은 이유다(`renderer/trigger.js#atomicWriteUnique` 형태).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REL_DIR = path.join('.claude', 'state', 'leadtime');
const FILENAME = 'distribution.json';

function distributionPath(root) {
  return path.join(root || process.cwd(), REL_DIR, FILENAME);
}

// 키 순서를 정렬해 직렬화한다. 같은 내용이 실행마다 다른 바이트로 나오면
// content-stability 가 키 순서 때문에 깨진다.
function stableStringify(value) {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map(function (k) {
      return JSON.stringify(k) + ':' + stableStringify(value[k]);
    }).join(',') + '}';
  }
  return JSON.stringify(value === undefined ? null : value);
}

function serialize(summary) {
  // 사람이 diff 를 읽는 파일이므로 정렬된 키로 다시 pretty-print 한다.
  return JSON.stringify(JSON.parse(stableStringify(summary)), null, 2) + '\n';
}

function uniqueTmp(target) {
  return target + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
}

// 반환값이 계약이다. mtime 만 보면 "정상 skip" 과 "writer 가 fail-open 으로 조용히
// 죽음" 이 구분되지 않는다 — 두 경우 다 파일이 그대로다.
//
//   { written: false, reason: 'unchanged' }  디스크 payload 와 동일 → 미기록
//   { written: true,  path }                 기록함
//   { written: false, reason: 'no-summary' } 투영이 없다(축 미계산) → 미기록
function writeDistribution(root, summary) {
  if (summary === null || summary === undefined) {
    return { written: false, reason: 'no-summary' };
  }
  const target = distributionPath(root);
  const content = serialize(summary);

  let prev = null;
  try { prev = fs.readFileSync(target, 'utf8'); } catch (_) { prev = null; }
  if (prev === content) return { written: false, reason: 'unchanged', path: target };

  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = uniqueTmp(target);
  fs.writeFileSync(tmp, content, 'utf8');
  try {
    fs.renameSync(tmp, target);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch (_) { /* 고아 tmp 를 tracked 디렉토리에 남기지 않는다 */ }
    throw err;
  }
  return { written: true, reason: prev === null ? 'created' : 'changed', path: target };
}

module.exports = {
  REL_DIR: REL_DIR,
  FILENAME: FILENAME,
  distributionPath: distributionPath,
  serialize: serialize,
  writeDistribution: writeDistribution,
};
