#!/usr/bin/env node
'use strict';

// multi-session-work-loop M6 — 단언 매니페스트 대조기.
//
// **왜 필요한가.** Validation 은 `node --test <디렉토리>` 라 "돌린 test 가 통과했다" 만
// 말하고 "요구한 test 가 있다" 는 말하지 않는다. 그래서 Acceptance 가 요구하는 개별
// 단언(`decisionFromBasename` 동치 · `receiptPresent` 커밋 도달성 · lint 음성 fixture
// 4종 · computeB1 4분기 …)은 **사람이 읽고 지키는 규율**이었지 게이트가 아니었다.
// 이 대조기가 그 간극을 닫는다 — 누락 id 가 있으면 비영점 exit.
//
// **REQUIRED_IDS 를 하드코딩하는 이유.** manifest 에 있는 것만 검사하면 "manifest 에서
// id 를 빼면 통과" 가 되어 강제가 무의미해진다. 그래서 두 검사를 분리한다:
//   1. manifest 가 REQUIRED_IDS 를 **전부 담고 있는가** (missing-from-manifest)
//   2. 각 항목의 test_title 이 test_file 에 **실재하는가**   (absent-in-tests)
// 둘은 서로 다른 실패이므로 종류별로 열거한다.
//
// **이 대조기 자신도 test 된다** — `echo ok && exit 0` 짜리 대조기도 Validation 을
// 통과시킨다는 것이 이 축의 급소다. tests/assertion-manifest-check.test.js 참조.
// 그 test 는 manifest 에 넣지 **않는다**(자기 참조 순환이 되고, 대조기가 죽으면 그
// 사실도 못 잡는다).

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

// Acceptance 가 요구하는 단언의 **하한**이다(상한이 아니다 — 구현 중 늘면 manifest 에
// 추가한다). plan Task 7 의 평면 열거 블록과 1:1 이어야 한다.
// Acceptance 가 요구하는 단언의 **하한**이다(상한이 아니다 — 구현 중 늘면 manifest 에
// 추가한다). 각 plan 의 `## Assertion Roster` 평면 열거와 1:1 이어야 한다.
//
// **milestone 별로 나눠 둔다.** 하나의 평면 목록이면 M6 manifest 는 C1 id 가 없어서,
// M7 manifest 는 B1 id 가 없어서 서로를 영구히 붉힌다 — 즉 milestone 이 하나 더
// 생기는 순간 이 대조기가 어느 manifest 도 통과시키지 못한다. 하한의 목적("manifest
// 에서 id 를 빼면 통과"를 막는 것)은 **milestone 범위 안에서** 그대로 유지된다.
//
// 미등록 milestone 은 **UsageError 로 fail-closed** 다. 빈 하한을 주면 floor 를
// 등록하지 않은 manifest 가 곧 무검사 통과가 되어, 이 대조기가 막으려는 바로 그
// 우회가 열린다.
const REQUIRED_IDS_BY_MILESTONE = {
  'multi-session-work-loop-m6': [
    'B1-EQ-BASENAME',
    'B1-EVIDENCE-SCHEMA',
    'B1-SHIPPED-ON-DIVERGENT',
    'B1-MUTATION-EVIDENCE',
    'B1-MUTATION-DRIFT',
    'B1-FIXTURE-SANITY',
    'B1-GIT-TRACKED',
    'B1-RECEIPT-COMMITTED',
    'B1-GIT-FALLBACK',
    'B1-DUP-DECISION',
    'B1-LINT-NEG-LEDGER',
    'B1-LINT-NEG-FS',
    'B1-LINT-NEG-STATUS',
    'B1-LINT-NEG-EVIDENCE-SOURCE',
    'B1-LADDER-DEGRADED',
    'B1-LADDER-INDEPENDENCE',
    'B1-LADDER-EMPTY',
    'B1-LADDER-COMPUTED',
    'B1-ARCHIVE-DEGRADED',
    'B1-ARCHIVE-INVARIANT',
    'B1-RENDER-CONSTRAINTS',
    'B1-JOINKEY-RESOLVE',
    'B1-BUILDER-GUARD',
    'B1-ARCHIVE-JOINKEY',
    'B1-ARCHIVE-JOINKEY-REL',
    'B1-ARCHIVE-DUPKEY',
    'B1-ARCHIVE-PLUMBING',
    'B1-ARCHIVE-NOGIT',
  ],
  'multi-session-work-loop-m7': [
    'C1-REGISTRY-APPEND',
    'C1-REGISTRY-ALLOWLIST',
    'C1-REGISTRY-TRACKED',
    'C1-ID-SECONDARY-KEY',
    'C1-REGISTRY-PATH-NORMALIZED',
    'C1-DEGRADED-MARKER',
    'C1-BATCH-ATOMIC',
    'C1-MERGE-UNION',
    'C1-TYPE-SEPARATION-CONTRACT',
    'C1-TYPE-COLLAPSE-REJECTED',
    'C1-DEFER-NOT-CLOSURE',
    'C1-SOURCE-REGISTERED-COPRESENT',
    'C1-SOURCE-WIRED',
    'C1-TYPE-SEPARATION-DERIVED',
    'C1-EMIT-PLAN-REVIEW',
    'C1-EMIT-PLAN-CODEX',
    'C1-EMIT-SANTA',
    'C1-EMIT-FAILOPEN',
    'C1-EMIT-LOSS-VISIBLE',
    'C1-PROMOTE-THRESHOLD',
    'C1-PROMOTE-CONSTANT',
    'C1-PROMOTE-BOUNDED',
    'C1-A4-DENOMINATOR-REPORTED',
    'C1-PROMOTE-SANITIZED',
    'C1-RENDER-SPLIT',
    'C1-COVERAGE-STATIC',
    'C1-COVERAGE-REGISTRY-WRITER',
    'C1-ACCEPTANCE-MECHANIZED',
    'C1-COVERAGE-RUNTIME',
    'C1-CONTRACT-COPRESENT',
    'C1-GATE-MERGE-UNION',
    'C1-ACCEPTANCE-PROMOTED',
  ],
};

// test 제목은 `id: ` 접두로 시작해야 한다 — 표현 차이로 리터럴 매칭이 깨지는 것을
// 없애기 위함이다. manifest 의 test_title 이 계약이고 test 가 그것을 따른다.
// M7 — C1 계열이 합류하면서 접두 검사가 계열을 열거한다. 와일드카드로 넓히지 않는
// 이유는 그 순간 이 검사가 "id 로 시작한다" 는 규약만 남고 **어느 지표의 단언인지**를
// 잃기 때문이다(오타 계열이 조용히 통과한다).
const TITLE_PREFIX = /^(?:B1|C1)-[A-Z0-9-]+: /;

// 제목이 **test 호출의 인자로** 등장하는지 본다 (local review M3).
//
// 이전 구현은 `body.indexOf(title) !== -1` 이었다 — 파일 어디든 그 문자열이 있으면
// 통과이므로 **주석 한 줄로 21개 필수 단언을 전부 "존재"하게** 만들 수 있었다. 이 모듈
// 서문이 지목한 급소("`echo ok && exit 0` 짜리 대조기")가 한 층 아래에 그대로 남아
// 있던 셈이다. 여기서 닫는 것은 *제목이 어딘가 적혀 있다* 와 *그 제목의 test 가 실재한다*
// 의 구분이며, **test 본문이 실제로 무엇을 단언하는지는 여전히 보지 않는다** — 그것은
// 정적 대조로 답할 수 있는 질문이 아니고, 그 한계는 설계 문서 비보증 절이 소유한다.
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasTestTitle(body, title) {
  // `test('<title>'` · `it("<title>"` · 백틱, 그리고 `test(\n  '<title>'` 같은 줄바꿈 허용.
  const re = new RegExp('\\b(?:test|it)\\s*\\(\\s*([\'"`])' + escapeRegExp(title) + '\\1');
  return re.test(body);
}

class UsageError extends Error {}

function readManifest(manifestPath) {
  let raw;
  try {
    raw = fs.readFileSync(manifestPath, 'utf8');
  } catch (e) {
    throw new UsageError('manifest unreadable: ' + manifestPath + ' (' + e.message + ')');
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new UsageError('manifest is not valid JSON: ' + e.message);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new UsageError('manifest must be a JSON object');
  }
  if (typeof parsed.milestone !== 'string' || !parsed.milestone) {
    throw new UsageError('manifest.milestone must be a non-empty string');
  }
  if (typeof parsed.contract !== 'string' || !parsed.contract) {
    throw new UsageError('manifest.contract must be a non-empty string');
  }
  if (!Array.isArray(parsed.assertions) || parsed.assertions.length === 0) {
    throw new UsageError('manifest.assertions must be a non-empty array');
  }
  parsed.assertions.forEach((a, i) => {
    const at = 'manifest.assertions[' + i + ']';
    if (!a || typeof a !== 'object' || Array.isArray(a)) throw new UsageError(at + ' must be an object');
    for (const k of ['id', 'assertion', 'test_file', 'test_title']) {
      if (typeof a[k] !== 'string' || !a[k]) throw new UsageError(at + '.' + k + ' must be a non-empty string');
    }
    if (!TITLE_PREFIX.test(a.test_title)) {
      throw new UsageError(at + '.test_title must start with "<id>: " (got: ' + JSON.stringify(a.test_title) + ')');
    }
    if (a.test_title.indexOf(a.id + ': ') !== 0) {
      throw new UsageError(at + '.test_title must be prefixed with its own id "' + a.id + ': "');
    }
  });
  return parsed;
}

function check(opts) {
  const o = opts || {};
  const repoRoot = o.repoRoot || REPO_ROOT;
  const manifest = readManifest(o.manifest);

  const floor = REQUIRED_IDS_BY_MILESTONE[manifest.milestone];
  if (!Array.isArray(floor)) {
    throw new UsageError('no REQUIRED_IDS floor registered for milestone "' + manifest.milestone +
      '" — register one in assertion-manifest-check.js. An unregistered milestone would ' +
      'otherwise pass with no floor at all, which is the bypass this checker exists to close.');
  }

  const declared = new Set(manifest.assertions.map((a) => a.id));
  const missingFromManifest = floor.filter((id) => !declared.has(id));

  const missingFile = [];
  const absentInTests = [];
  const fileCache = new Map();

  for (const a of manifest.assertions) {
    const abs = path.isAbsolute(a.test_file) ? a.test_file : path.join(repoRoot, a.test_file);
    if (!fileCache.has(abs)) {
      let body = null;
      try { body = fs.readFileSync(abs, 'utf8'); } catch (_) { body = null; }
      fileCache.set(abs, body);
    }
    const body = fileCache.get(abs);
    if (body === null) {
      missingFile.push({ id: a.id, test_file: a.test_file });
      continue;
    }
    // manifest 의 test_title 이 계약이므로 test 제목이 그것을 그대로 담아야 한다.
    // 검사는 **test 호출 앵커** 기준이다 — 주석/문자열 등장은 존재 증명이 아니다.
    if (!hasTestTitle(body, a.test_title)) {
      absentInTests.push({ id: a.id, test_file: a.test_file, test_title: a.test_title });
    }
  }

  const duplicates = [];
  const seen = new Set();
  for (const a of manifest.assertions) {
    if (seen.has(a.id)) duplicates.push(a.id);
    seen.add(a.id);
  }

  const ok = missingFromManifest.length === 0
    && missingFile.length === 0
    && absentInTests.length === 0
    && duplicates.length === 0;

  return {
    ok: ok,
    checked: manifest.assertions.length,
    required: floor.length,
    missing_from_manifest: missingFromManifest,
    missing_test_file: missingFile,
    absent_in_tests: absentInTests,
    duplicate_ids: duplicates,
  };
}

function main(argv) {
  const args = argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--manifest') opts.manifest = args[++i];
    else if (args[i] === '--repo-root') opts.repoRoot = args[++i];
    else if (args[i] === '--json') opts.json = true;
    else {
      process.stderr.write('[assertion-manifest-check] unknown argument: ' + args[i] + '\n');
      process.exit(2);
    }
  }
  if (!opts.manifest) {
    process.stderr.write('[assertion-manifest-check] --manifest <path> is required\n');
    process.exit(2);
  }

  let result;
  try {
    result = check(opts);
  } catch (e) {
    if (e instanceof UsageError) {
      process.stderr.write('[assertion-manifest-check] ' + e.message + '\n');
      process.exit(2);
    }
    throw e;
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    // 침묵 통과 금지 — 무엇을 몇 개 검사했는지 항상 낸다.
    process.stdout.write('[assertion-manifest-check] checked ' + result.checked
      + ' assertion(s); required floor ' + result.required + '\n');
  }

  if (!result.ok) {
    // 종류별로 열거한다 — `missing-from-manifest` 와 `absent-in-tests` 는 서로 다른
    // 실패이고, 뭉뚱그리면 원인이 단언 누락인지 매핑 오류인지 구분되지 않는다.
    result.missing_from_manifest.forEach((id) => {
      process.stderr.write('[assertion-manifest-check] missing-from-manifest: ' + id
        + ' (REQUIRED_IDS floor)\n');
    });
    result.duplicate_ids.forEach((id) => {
      process.stderr.write('[assertion-manifest-check] duplicate-id: ' + id + '\n');
    });
    result.missing_test_file.forEach((m) => {
      process.stderr.write('[assertion-manifest-check] missing-test-file: ' + m.id
        + ' → ' + m.test_file + '\n');
    });
    result.absent_in_tests.forEach((m) => {
      process.stderr.write('[assertion-manifest-check] absent-in-tests: ' + m.id
        + ' → ' + m.test_file + ' has no test() call titled ' + JSON.stringify(m.test_title) + '\n');
    });
    process.exit(1);
  }
  process.exit(0);
}

if (require.main === module) main(process.argv);

module.exports = { check, readManifest, hasTestTitle, REQUIRED_IDS_BY_MILESTONE, UsageError, TITLE_PREFIX };
