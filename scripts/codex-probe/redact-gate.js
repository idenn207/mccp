'use strict';

// DD10 — git-tracked 산출물의 **쓰기 전 단일 관문** (security R1 C1 흡수).
//
// **왜 producer 안이 아니라 여기인가.** 초안은 redaction을 `probe-hook.js`의 env·event 두
// 필드에만 걸었다. 그러면 tracked 산출물에 절대경로를 싣는 다른 두 생산자가 무검사로 남는다 —
// `snapshot.js`의 `plugin_cache_entries`(DD3-b가 보고하려는 잔여물이 곧 그 경로다)와
// `probe-hook.js` 자신의 `argv`(매 줄 `argv[0]` node 경로·`argv[1]` worktree 절대경로).
// 생산자마다 거는 방식은 생산자가 늘 때마다 같은 구멍이 다시 열린다. 관문이 하나면
// 그 구멍은 **구조적으로 존재하지 않는다**.
//
// **fail-closed인 이유.** 유출을 막는 것과 유출을 쓰고 경고하는 것은 다르고, 후자는 git
// 이력에 남아 되돌릴 수 없다(§3.12가 `meta.cwd`로 이미 한 번 갚았다).
//
// **관문은 판정만 하고 값을 고치지 않는다.** 조용한 치환은 무엇이 새려 했는지를 지우고,
// 그러면 생산자의 결함이 영원히 안 보인다. 고치는 것은 생산자의 책임이다.
//
// `scanResidual`의 반환은 `{hits, truncated}`이고 두 조건을 **함께** 봐야 한다 —
// 빈 배열 하나로 "깨끗함"과 "상한에 걸려 못 봤음"을 같이 표현하면 후자가 전자로 읽힌다
// (그 모듈 자신의 계약, `scripts/test-suite/redact.js`).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createRedactor } = require('../test-suite/redact');

function serialize(data) {
  return typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n';
}

function makeGate(opts) {
  const o = opts || {};
  const redactor = o.redactor || createRedactor({ repoRoot: o.repoRoot || process.cwd() });

  // 구조를 훑는다. 객체면 `scanResidual`이 값과 **키**를 함께 보고, 문자열이면 통째로 본다.
  function inspect(value) {
    const target = typeof value === 'string' ? { body: value } : value;
    const r = redactor.scanResidual(target);
    return {
      ok: r.hits.length === 0 && !r.truncated,
      hits: r.hits,
      truncated: r.truncated,
      ruleCount: redactor.ruleCount,
      degraded: redactor.degraded,
    };
  }

  // **두 형태를 함께 본다** (코드 리뷰 M6).
  //
  // 이 자리에는 `inspect(typeof s.data === 'string' ? s.data : s.data)`가 있었다 — 양 분기가
  // 같은 값이라 삼항이 아무 일도 하지 않았고, 바로 위 주석은 "판정 대상은 직렬화된 최종
  // 형태"라고 적혀 있는데 실제로 넘어가는 것은 객체였다. 주석이 약속한 검사가 없었다.
  //
  // 둘 중 하나만 보면 각각 사각이 있다. 구조만 보면 `scanResidual`이 순회하지 않는 축
  // (`toJSON`·`Map`·`Set` — 그 모듈이 backlog에 열거해 둔 미커버 목록)이 **직렬화될 때
  // 되살아나** 디스크에 남는다. 직렬화만 보면 `matchRule`이 문자열당 첫 매치만 돌려주므로
  // 진단이 한 건으로 접히고 필드 위치를 잃는다. 그래서 둘 다 보고 **하나라도 걸리면 막는다**.
  function inspectPayload(data, serialized) {
    const structural = inspect(data);
    if (typeof data === 'string') return structural;   // 두 형태가 같은 문자열이다
    const flat = inspect(serialized == null ? serialize(data) : serialized);
    return {
      ok: structural.ok && flat.ok,
      hits: structural.hits.concat(flat.hits.map(function (h) {
        return { at: '<serialized>' + h.at, rule: h.rule, length: h.length };
      })),
      truncated: structural.truncated || flat.truncated,
      ruleCount: structural.ruleCount,
      degraded: structural.degraded,
    };
  }

  // 통과하면 쓰고, 아니면 **쓰지 않는다**. 반환의 `written`이 곧 Acceptance 6의 증거다 —
  // 산출물의 존재 자체가 관문 통과를 뜻한다.
  //
  // 쓰기는 **원자적**이다(tmp + rename — §3.6의 evidence write 관용구). 직접
  // `writeFileSync`하면 중간에 죽은 실행이 부분 파일을 남기고, 그 파일은 관문을 통과한
  // 산출물과 디스크에서 구분되지 않는다 — `written:true`가 뜻하는 바가 흐려진다.
  // tmp 이름에 pid + nonce를 넣는 이유도 같은 절이 정한다: 고정 이름이면 동시 writer가
  // tmp에서 충돌한다.
  function writeGuarded(spec) {
    const s = spec || {};
    if (!s.path) throw new Error('writeGuarded: path required');
    const serialized = serialize(s.data);
    const verdict = inspectPayload(s.data, serialized);
    if (!verdict.ok) {
      return Object.assign({ written: false, path: s.path }, verdict);
    }
    fs.mkdirSync(path.dirname(s.path), { recursive: true });
    const tmp = s.path + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
    try {
      fs.writeFileSync(tmp, serialized);
      fs.renameSync(tmp, s.path);
    } catch (err) {
      try { fs.unlinkSync(tmp); } catch (_) { /* best effort */ }
      throw err;
    }
    return Object.assign({ written: true, path: s.path }, verdict);
  }

  // 이미 디스크에 있는 산출물을 검사한다(Validation 9). JSON이면 파싱해 키까지 훑고,
  // 아니면 본문 문자열로 본다 — `scanResidual`은 경로를 **키로** 쓰는 맵도 검사한다.
  function checkFile(p) {
    let raw;
    try {
      raw = fs.readFileSync(p, 'utf8');
    } catch (err) {
      return { ok: false, missing: true, hits: [], truncated: false, error: err.code || 'READ_FAIL' };
    }
    let parsed = null;
    if (/\.json$/i.test(p)) {
      try { parsed = JSON.parse(raw); } catch (_) { parsed = null; }
    }
    // 디스크의 원문이 곧 직렬화 형태이므로 그것을 그대로 두 번째 축으로 넘긴다.
    return Object.assign({ missing: false }, inspectPayload(parsed === null ? raw : parsed, raw));
  }

  return { inspect, inspectPayload, writeGuarded, checkFile };
}

module.exports = { makeGate, serialize };

if (require.main === module) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--check');
  if (i === -1 || !args[i + 1]) {
    process.stderr.write('usage: redact-gate.js --check <file>\n');
    process.exit(2);
  }
  const target = args[i + 1];
  const res = makeGate({ repoRoot: process.cwd() }).checkFile(target);
  // 진단에도 경로 원문을 싣지 않는다 — `hits[i]`는 `{at, rule, length}`뿐이다.
  process.stdout.write(JSON.stringify({
    file: path.basename(target),
    ok: res.ok,
    missing: !!res.missing,
    hit_count: (res.hits || []).length,
    truncated: !!res.truncated,
    hits: res.hits || [],
  }, null, 2) + '\n');
  process.exit(res.ok ? 0 : 1);
}
