#!/usr/bin/env node
'use strict';

// 커버리지 순수 오라클과 로컬 진단 CLI (DD2 · DD9의 floor 축).
// mirror는 `enumerate.js:1-12`의 순수층 분리와 `run.js:265-330`의 fail-closed 검증이다.
//
// ── 분모가 어디서 오는가 ────────────────────────────────────────────────────
// 분모는 **tracked `*.test.js` 파일 수**이고, 이 순수층은 그것을 `tracked` 인자로
// **받는다**(I/O는 CLI층에만 둔다). measurement에서 파생하는 것은 **금지**다 —
// `files_total`은 `files.length` = 격리 적용 **후** included 개수이므로
// (`run.js:577-578`) 그것을 분모로 삼으면 `unexplained`가 정의상 항상 0이고
// floor는 격리가 늘 때마다 함께 내려가 래칫이 **반대로** 작동한다. 그 금지는
// 산문이 아니라 짝 단언으로 고정된다(test 분기 12).
//
// **해소의 계약 소유자는 `gate.js`다.** 이 CLI는 같은 해소를 로컬 진단용으로
// `inputs.js`를 통해 **재사용**할 뿐이고, 차단 권한은 CI가 부르는 `gate.js` 단독이다.
// 두 진입점이 같은 헬퍼를 공유하는 것이지 두 번째 구현이 아니다 — 구현이 갈라지면
// 짝 단언이 gate 경로에만 걸려 있어 붉어질 검사가 없다.
//
// ── `fully_skipped`는 없다 ──────────────────────────────────────────────────
// DD2가 철회했다. 전 test가 skip인 파일은 실재하는 위험이지만 그것을 말할 수 있는
// 데이터가 측정 경로에 없다(`run.js`에 skip 개념 0건 · `reporter.mjs`가 `nesting !== 0`
// 이벤트를 버린다). 합성 fixture로만 단언되는 필드를 스키마에 올리면 실제 CI에서 그
// 값이 영원히 부재여도 test는 항상 green이다. 허위 커버리지 축은 backlog가 소유한다.

const { enumerateTests, exclusionsDigest, toPosix } = require('./enumerate.js');

/**
 * 커버리지 판정. 순수 함수 — I/O도 git 호출도 없다.
 *
 * @param {{
 *   tracked: string[],
 *   measurement: object,
 *   exclusions: Array<{pattern: string, reason: string}>,
 *   floor?: number|null,
 *   maxExcludedFiles?: number|null,
 * }} opts
 * @returns {{denominator:number, numerator:number, excluded:string[], unexplained:string[],
 *            coverage_pct:number|null, tracked:number, ok:boolean, reasons:string[]}}
 */
function computeCoverage(opts) {
  const o = opts || {};
  const reasons = [];

  const tracked = Array.isArray(o.tracked) ? o.tracked.map(toPosix) : null;
  if (tracked === null) {
    throw new TypeError('computeCoverage: tracked must be an array (the denominator channel)');
  }
  // 분모 0은 커버리지 100퍼센트가 아니라 **측정 실패**다.
  if (tracked.length === 0) {
    reasons.push('tracked_empty');
  }

  const m = o.measurement;
  if (!m || typeof m !== 'object' || Array.isArray(m)) {
    throw new TypeError('computeCoverage: measurement must be an object');
  }

  const exclusions = Array.isArray(o.exclusions) ? o.exclusions : [];
  const enumerated = enumerateTests({ trackedFiles: tracked, exclusions: exclusions });
  const excludedPaths = enumerated.excluded.map((e) => e.path);
  const excludedSet = new Set(excludedPaths);

  // `per_file`의 부재 모양은 **`null`**이다 — `[]`가 아니다. `run.js:213-214`가
  // "`ok:false`일 때 `per_file`은 `null`이지 `[]`가 아니다 — 모름을 0으로 쓰지 않는다"를
  // 명시한다. 러너가 모름과 0을 의도적으로 구분하므로 이 오라클도 같은 구분을 지킨다:
  // 부재는 "적음"이 아니라 **차단**이다. `[]`는 방어적 분기다.
  const perFile = m.per_file;
  let measured = [];
  if (perFile == null) {
    if (tracked.length > 0) reasons.push('per_file_absent');
  } else if (!Array.isArray(perFile)) {
    reasons.push('per_file_absent');
  } else if (perFile.length === 0 && tracked.length > 0) {
    reasons.push('per_file_absent');
  } else {
    measured = perFile
      .map((e) => (e && e.file != null ? toPosix(e.file) : null))
      .filter((f) => f !== null);
  }
  const measuredSet = new Set(measured);

  // 버킷 완전성 — tracked 파일 각각은 정확히 한 버킷에 든다.
  const unexplained = tracked
    .filter((f) => f.endsWith('.test.js'))
    .filter((f) => !measuredSet.has(f) && !excludedSet.has(f))
    .sort();

  const trackedTests = tracked.filter((f) => f.endsWith('.test.js'));
  const denominator = trackedTests.length;
  const numerator = trackedTests.filter((f) => measuredSet.has(f)).length;
  const coveragePct = denominator === 0 ? null : (numerator / denominator) * 100;

  if (unexplained.length > 0) reasons.push('unexplained');

  // 격리 상한 — 세는 단위는 **glob 확장 결과의 파일 수**다. 줄 수로 세면
  // `{pattern:"**/*.test.js"}` 한 줄이 상한 1을 유지한 채 저장소 전체를 덮는다.
  const maxExcluded = o.maxExcludedFiles;
  if (maxExcluded != null) {
    if (excludedPaths.length > maxExcluded) reasons.push('excluded_over_cap');
  }

  // 앵커링 — 격리 없이 돈 측정과 큰 격리 목록의 짝짓기를 막는다. 러너가 이미
  // `exclusions_digest`를 산출물에 봉인하므로(`run.js:580`) 새 앵커를 만들지 않는다.
  if (m.exclusions_digest != null) {
    const recomputed = exclusionsDigest(exclusions);
    if (recomputed !== m.exclusions_digest) reasons.push('digest_mismatch');
  }

  // 삭제 축의 backstop. 정본 래칫은 base 집합 차이고(gate.js) 이것은 그 아래의
  // 절대 하한이다.
  if (o.floor != null) {
    if (denominator < o.floor) reasons.push('below_floor');
  }

  return {
    denominator: denominator,
    numerator: numerator,
    excluded: excludedPaths,
    unexplained: unexplained,
    coverage_pct: coveragePct,
    tracked: denominator,
    ok: reasons.length === 0,
    reasons: reasons,
  };
}

module.exports = { computeCoverage };

// ─────────────────────────────────────────────────────────────────────────────
// CLI — 로컬 진단 전용. 차단 권한은 `gate.js` 단독이다(DD3).
// ─────────────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const inputs = require('./inputs.js');
  try {
    const flags = inputs.parseFlags(process.argv.slice(2));
    const resolved = inputs.resolveInputs(flags, {
      cwd: process.cwd(),
      // `--assert-accounted`는 래칫 판정이므로 floor 입력이 **필수**다. 없으면
      // 조건의 후반절이 조용히 사라지고 모든 단위 test와 CI가 green이다(DD9 1번).
      // `--assert-full`은 로컬 진단이라 이 요구를 받지 않는다.
      requireFloor: flags['assert-accounted'] === true,
    });
    if (resolved.reasons.length) {
      process.stderr.write('[coverage] REFUSED: ' + resolved.reasons.join(', ') + '\n');
      resolved.messages.forEach((msg) => process.stderr.write('  - ' + msg + '\n'));
      process.exitCode = 1;
    } else {
      const cov = computeCoverage({
        tracked: resolved.tracked,
        measurement: resolved.measurement,
        exclusions: resolved.exclusions,
        floor: resolved.floor ? resolved.floor.tracked : null,
        maxExcludedFiles: resolved.floor ? resolved.floor.max_excluded_files : null,
      });
      if (flags.json) process.stdout.write(JSON.stringify(cov, null, 2) + '\n');
      else {
        process.stdout.write('coverage_pct=' + (cov.coverage_pct == null ? 'null' : cov.coverage_pct.toFixed(2)) +
          ' numerator=' + cov.numerator + ' denominator=' + cov.denominator +
          ' excluded=' + cov.excluded.length + ' unexplained=' + cov.unexplained.length + '\n');
      }
      // 순수층의 판정이 종료코드에 도달한다. `ok=false`인데 exit 0이면 소비처가
      // 그것을 못 본다.
      let failed = false;
      if (flags['assert-accounted'] && !cov.ok) {
        process.stderr.write('[coverage] --assert-accounted FAILED: ' + cov.reasons.join(', ') + '\n');
        failed = true;
      }
      if (flags['assert-full'] && cov.coverage_pct !== 100) {
        process.stderr.write('[coverage] --assert-full FAILED: coverage_pct=' +
          (cov.coverage_pct == null ? 'null' : cov.coverage_pct.toFixed(2)) + '\n');
        failed = true;
      }
      process.exitCode = failed ? 1 : 0;
    }
  } catch (err) {
    process.stderr.write('[coverage] ' + String((err && err.message) || err) + '\n');
    process.exitCode = 1;
  }
}
