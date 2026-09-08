#!/usr/bin/env node
'use strict';

// 입력 해소의 **구현** 소유자 (L2 R12 architect).
//
// 계약 소유자는 `gate.js`다 — 판정과 차단 권한은 여전히 거기 있고, 이 모듈은 그
// 계약이 부르는 해소를 한 곳에 둘 뿐이다. 둘을 혼동하면 "한 불변식에 소유자가 둘"이
// 되므로 구분을 여기 적는다.
//
// 이 모듈이 없으면 `gate.js`와 `coverage.js` CLI가 서로를 require해 순환이 되거나
// (gate → coverage → gate), 구현자가 순환을 피해 두 번째 계산을 넣게 되어 계획이
// 금지한 "한 불변식에 소유자가 둘"이 재도입된다(L2 R11 architect).
//
// ── 격리 목록은 자체 파싱을 갖지 않는다 ─────────────────────────────────────
// `exclusions.js`에 **위임**한다. 그래야 ticket 필수와 MAX_EXCLUSION_ENTRIES가
// 게이트 경로에서도 강제된다 — 여기서 JSON.parse만 하면 **강제 workflow가 부르는
// 유일한 판정 명령**이 검증되지 않은 목록으로 판정하게 되고, 이 모듈의 존재 이유를
// 이 모듈이 스스로 어기는 형태가 된다(L2 R20 architect). 위임이므로 `exclusions.js`의
// throw가 그대로 이 층의 fail-closed가 된다.
//
// ── fail-closed 아홉 범주 · 코드 열두 개 ────────────────────────────────────
// git_failed · tracked_empty · measurement_unreadable · floor_unreadable ·
// floor_key_missing · floor_value_type · exclusions_unreadable ·
// exclusions_invalid · base_unresolved · base_set_empty · floor_entry_shape ·
// duplicate_flag. 범주가 아홉인데 코드가 열둘인 것은 두 범주가 원인이 다른 하위
// 분기를 갖기 때문이다 — floor는 판독 불가 · 키 부재 · **값 타입**이, 격리는 판독
// 불가와 검증 실패가 서로 다른 사실이다. 열둘 다 "판정할 자격이 없다"이지
// "통과"가 아니다.
//
// **방어적 기본값을 쓰지 않는 것이 이 층의 전부다.** `?? 0` · `?? Infinity` · `?? []`는
// 게이트 조건을 조용히 항상 참으로 만들고, 그것을 붉게 만들 단언은 0건이 된다.

const fs = require('fs');
const { execFileSync } = require('child_process');
const { validateExclusions } = require('./exclusions.js');
const { toPosix, TEST_SUFFIX } = require('./enumerate.js');

const MAX_INPUT_BYTES = 16 * 1024 * 1024;

// floor 파일이 반드시 들고 있어야 하는 다섯 키. 한 덩어리가 아니라 **키별**로
// 검사한다 — 덩어리로 두면 넷만 검사하고 하나에 기본값을 남긴 구현이 통과한다.
const FLOOR_KEYS = [
  'tracked_basis',
  'tracked',
  'max_excluded_files',
  'max_allowed_deletions',
  'allow_deletions',
];

// 존재 검사만으로는 부족하다 — `hasOwnProperty`는 **`null`을 "존재"로 읽는다.**
// 실측(2026-09-04 code-review): `{"tracked": null, "max_excluded_files": null}`은
// 이 층을 `reasons: []`로 통과하고, 그러면 `coverage.js`의 두 조건이
// (`if (o.floor != null)` · `if (maxExcluded != null)`) 조용히 건너뛰어져
// `below_floor`와 `excluded_over_cap`이 **사유 코드 없이** 사라지고 게이트가
// `blocked:false`를 낸다. 그것이 이 모듈 헤더가 금지한 "방어적 기본값"의 정확한
// 형태다 — 값이 없어서가 아니라 `null`이 있어서 조건이 참이 된다.
//
// 실효 차단이 아주 없지는 않았다: `test-suite-coverage.test.js`의 도출식 단언이
// `strictEqual(null, 383)`으로 붉어진다. 그러나 그 방어는 **다른 단언의 부수효과**이고,
// 사유는 `floor_value_type`이 아니라 "도출식이 안 맞는다"로 보고된다. fail-closed를
// 소유한다고 선언한 층이 자기 이름으로 막아야 한다.
const FLOOR_INT_KEYS = ['tracked_basis', 'tracked', 'max_excluded_files', 'max_allowed_deletions'];

/**
 * argv 파서. `run.js:613-631`의 parseArgv를 미러하되 **중복을 거부한다** —
 * 형제 파서는 last-wins로 덮어쓰므로 판정 줄의 리터럴 pin이 통째로 무력해진다:
 * `--floor-from a.json --floor-from bogus.json`이나 `--base-ref`를 HEAD로 재지정하는
 * 한 토막을 뒤에 붙이면 리터럴 쌍은 그대로 남아 오라클이 green인데 파서는 뒤의 값을
 * 쓴다. 후자는 base_set = head_set을 만들어 삭제 래칫을 항상 참으로 접는다
 * (L2 R22 invariant).
 */
function parseFlags(argv) {
  const flags = { _: [] };
  const seen = new Set();
  const duplicates = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      let key;
      if (eq > 0) {
        key = a.slice(2, eq);
        if (seen.has(key)) duplicates.push(key);
        seen.add(key);
        flags[key] = a.slice(eq + 1);
      } else {
        key = a.slice(2);
        if (seen.has(key)) duplicates.push(key);
        seen.add(key);
        const next = argv[i + 1];
        if (next && !next.startsWith('--')) { flags[key] = next; i++; } else { flags[key] = true; }
      }
    } else {
      flags._.push(a);
    }
  }
  flags.__duplicates = duplicates;
  return flags;
}

function readJsonStrict(file, label) {
  const stat = fs.statSync(file);
  if (stat.size > MAX_INPUT_BYTES) {
    throw new Error(label + ' exceeds ' + MAX_INPUT_BYTES + ' bytes (got ' + stat.size + ')');
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * NUL 구분 출력 → 정렬된 test 경로 배열. 두 git 호출이 **같은 규칙**을 쓰도록
 * 한 곳에 둔다 — 사본이 갈라지면 head 집합과 base 집합이 다른 규칙으로 만들어지고,
 * 그 차이가 그대로 삭제 래칫의 거짓 `missing`이 된다.
 *
 * **각 항목을 trim하지 않는다.** NUL 분리를 택한 이유가 개행을 담은 파일명을 지키는
 * 것인데, trim하면 정확히 그 파일명의 개행을 도로 잘라내 이 채널이 자기 목적을
 * 무효화한다. git이 NUL 사이에 넣는 것은 경로 그 자체라 다듬을 것이 없고, 마지막
 * 빈 조각만 거른다.
 */
function parseNulPaths(raw) {
  return String(raw).split('\0')
    .filter(function (s) { return s !== '' && s.endsWith(TEST_SUFFIX); })
    .map(toPosix)
    .sort();
}

/**
 * `git ls-files -z` — NUL 구분. 개행 분리는 개행을 포함한 파일명을 조용히
 * 누락시키고, **누락은 분모를 줄인다**(`run.js:404-409`의 규율 상속).
 */
function resolveTracked(cwd) {
  const raw = execFileSync('git', ['ls-files', '-z'], {
    cwd: cwd,
    encoding: 'utf8',
    maxBuffer: MAX_INPUT_BYTES,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return parseNulPaths(raw);
}

/**
 * merge base로 해소한 커밋의 test 경로 집합. **tip이 아니라 merge base**다 —
 * tip을 쓰면 base가 새로 추가한 파일이 missing에 들어와 아무것도 지우지 않은 PR이
 * deleted_without_allowance로 막힌다(L2 R17 architect).
 */
function resolveBaseSet(cwd, baseRef) {
  const mergeBase = execFileSync('git', ['merge-base', 'HEAD', String(baseRef)], {
    cwd: cwd, encoding: 'utf8', maxBuffer: MAX_INPUT_BYTES, stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  if (!mergeBase) throw new Error('merge-base resolved to an empty commit id');
  const raw = execFileSync('git', ['ls-tree', '-r', '-z', '--name-only', mergeBase], {
    cwd: cwd, encoding: 'utf8', maxBuffer: MAX_INPUT_BYTES, stdio: ['ignore', 'pipe', 'pipe'],
  });
  return parseNulPaths(raw);
}

/**
 * floor 파일의 **스칼라 값 타입** 검증. 네 키는 전부 음이 아닌 정수여야 한다.
 *
 * 문자열은 JS 강제변환 덕에 우연히 fail-closed로 떨어지지만(`6 > "0"` → true),
 * 우연에 기대지 않는다 — `"999999"`는 반대 방향으로 접히고, 무엇보다 어느 쪽이든
 * 판정이 **타입에 따라 달라진다**는 사실 자체가 래칫의 근거를 무너뜨린다.
 *
 * @returns {string[]} 위반 메시지. 비어 있으면 통과.
 */
function validateFloorValues(floor) {
  const messages = [];
  FLOOR_INT_KEYS.forEach(function (k) {
    const v = floor[k];
    if (!Number.isInteger(v) || v < 0) {
      messages.push(k + ' must be a non-negative integer, got ' + JSON.stringify(v) +
        ' - null/string silently disables the ratchet axis that reads it');
    }
  });
  return messages;
}

/**
 * floor 파일의 원소 shape 검증. allow_deletions의 각 항목은 {path, reason, ticket}
 * 이고 셋 다 비어 있지 않은 문자열이어야 한다. **path는 리터럴 경로이고 glob이
 * 아니다** — 형제 필드 pattern의 선례를 따라 glob으로 구현되면 단일 항목이 모든
 * 삭제를 면제해 래칫이 통째로 죽는다(L2 R13 security).
 */
function validateFloorShape(floor) {
  const messages = [];
  const list = floor.allow_deletions;
  if (!Array.isArray(list)) {
    messages.push('allow_deletions must be an array');
    return messages;
  }
  list.forEach(function (entry, i) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      messages.push('allow_deletions[' + i + '] must be an object {path, reason, ticket}');
      return;
    }
    ['path', 'reason', 'ticket'].forEach(function (k) {
      if (typeof entry[k] !== 'string' || entry[k].trim() === '') {
        messages.push('allow_deletions[' + i + '].' + k +
          ' is required and must be a non-empty string (literal path, never a glob)');
      }
    });
  });
  return messages;
}

// ── 입력별 해소기 넷 ─────────────────────────────────────────────────────────
// 한 덩어리였을 때의 문제는 길이가 아니라 **입력마다 다른 실패 정책이 한 스코프에
// 섞여 있었다**는 것이다: measurement는 조건부 필수, exclusions는 항상 필수, floor는
// 모드 의존, deletions는 부재가 정상이다. 넷을 이름 있는 함수로 떼면 그 차이가
// 호출부 네 줄에 드러나고, 새 입력이 생길 때 어느 정책을 따르는지 고르게 된다.
//
// 넷 다 `ctx`에 사유를 누적하고 반환값을 갖지 않는다 — 반환값을 쓰면 호출부가
// 그것을 무시할 수 있고, 무시된 fail-closed는 fail-open이다.

/** measurement — 판정의 1차 입력. 부재·부분 기록·JSON 파손 전부 차단이다. */
function resolveMeasurementInto(ctx) {
  if (ctx.opts.requireMeasurement === false) return;
  const mFile = ctx.flags.measurement;
  if (typeof mFile !== 'string' || mFile === '') {
    ctx.reasons.push('measurement_unreadable');
    ctx.messages.push('--measurement <file> is required');
    return;
  }
  try {
    const parsed = readJsonStrict(mFile, 'measurement');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('measurement must be a JSON object');
    }
    ctx.out.measurement = parsed;
  } catch (err) {
    ctx.reasons.push('measurement_unreadable');
    ctx.messages.push('--measurement: ' + String((err && err.message) || err));
  }
}

/**
 * exclusions — DD7의 통제("게이트가 그 경로만 읽는다")와 DD2의 두 조건이 매달린 입력.
 *
 * 파일은 **한 번만** 읽는다. 앞선 판본은 `readJsonStrict` → `loadExclusions`로 두 번
 * 읽어 두 판독 사이에 파일이 바뀔 수 있는 창을 열었고, 그 창에서 판정되는 목록은
 * 어느 쪽 판독의 것인지 정해지지 않는다. 판독과 검증을 갈라 두 사유 코드를 유지하되
 * (`unreadable` ≠ `invalid`), 입력은 하나로 고정한다.
 */
function resolveExclusionsInto(ctx) {
  const exFile = ctx.flags['exclude-from'];
  if (typeof exFile !== 'string' || exFile === '') {
    ctx.reasons.push('exclusions_unreadable');
    ctx.messages.push('--exclude-from <file> is required - DD7 makes the exclusions list the single tracked source');
    return;
  }
  let raw;
  try {
    raw = readJsonStrict(exFile, 'exclusions');
  } catch (err) {
    ctx.reasons.push('exclusions_unreadable');
    ctx.messages.push('--exclude-from: ' + String((err && err.message) || err));
    return;
  }
  try {
    ctx.out.exclusions = validateExclusions(raw);
  } catch (err) {
    ctx.reasons.push('exclusions_invalid');
    ctx.messages.push('--exclude-from: ' + String((err && err.message) || err));
  }
}

/** floor — 래칫 입력. requireFloor가 참일 때만 필수이며, 그때 부재는 차단이다. */
function resolveFloorInto(ctx) {
  const floorFile = ctx.flags['floor-from'];

  if (!ctx.opts.requireFloor) {
    // 진단 경로에서는 floor가 선택이다 — 차단 권한이 없으므로 판독 실패도 조용하다.
    if (typeof floorFile !== 'string' || floorFile === '') return;
    try {
      const parsed = readJsonStrict(floorFile, 'floor');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ctx.out.floor = parsed;
    } catch (_) { /* 진단 경로 */ }
    return;
  }

  if (typeof floorFile !== 'string' || floorFile === '') {
    ctx.reasons.push('floor_unreadable');
    ctx.messages.push('--floor-from <file> is required for a blocking verdict - ' +
      'a permissive default is exactly "the argument went missing and everything stayed green" (DD9)');
    return;
  }

  let parsed;
  try {
    parsed = readJsonStrict(floorFile, 'floor');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('floor must be a JSON object');
    }
  } catch (err) {
    ctx.reasons.push('floor_unreadable');
    ctx.messages.push('--floor-from: ' + String((err && err.message) || err));
    return;
  }

  const missingKeys = FLOOR_KEYS.filter(function (k) {
    return !Object.prototype.hasOwnProperty.call(parsed, k);
  });
  if (missingKeys.length) {
    ctx.reasons.push('floor_key_missing');
    ctx.messages.push('--floor-from is missing key(s): ' + missingKeys.join(', '));
    return;
  }

  // 값 타입 → 원소 shape 순. 둘 다 재고 나서 판정한다: 한쪽만 보고 return하면
  // 두 결함을 가진 파일이 한 번에 하나씩만 보고된다.
  const values = validateFloorValues(parsed);
  const shape = validateFloorShape(parsed);
  if (values.length) {
    ctx.reasons.push('floor_value_type');
    values.forEach(function (s) { ctx.messages.push('--floor-from: ' + s); });
  }
  if (shape.length) {
    ctx.reasons.push('floor_entry_shape');
    shape.forEach(function (s) { ctx.messages.push('--floor-from: ' + s); });
  }
  if (!values.length && !shape.length) ctx.out.floor = parsed;
}

/**
 * deletions — DD9의 정본 래칫 입력. `--base-ref` 부재는 PR 축 밖(로컬 진단 · 다른
 * workflow)이라 차단이 아니라 base=absent이고, 그 사실이 출력에 실린다.
 */
function resolveDeletionsInto(ctx) {
  const baseRef = ctx.flags['base-ref'];
  if (typeof baseRef !== 'string' || baseRef === '') {
    ctx.out.deletions = { base_resolved: false, base_ref: null, missing: [], allowed: [] };
    return;
  }

  let baseSet;
  try {
    baseSet = resolveBaseSet(ctx.cwd, baseRef);
  } catch (err) {
    ctx.reasons.push('base_unresolved');
    ctx.messages.push('--base-ref "' + baseRef + '": ' + String((err && err.message) || err));
    return;
  }

  // head 쪽 tracked_empty의 **대칭**이다. ref가 해소되면서도 출력이 비는 구성
  // (얕은 클론 · 트리 없는 ref)에서는 missing이 공집합이 되어 래칫이 무조건 통과한다.
  if (baseSet.length === 0) {
    ctx.reasons.push('base_set_empty');
    ctx.messages.push('--base-ref "' + baseRef + '" resolved but its tree carries no test files - ' +
      'a shallow clone would silently disable the deletion ratchet');
    return;
  }

  const headSet = new Set(ctx.out.tracked || []);
  const allowed = ctx.out.floor && Array.isArray(ctx.out.floor.allow_deletions)
    ? ctx.out.floor.allow_deletions.map(function (e) { return toPosix(String(e.path)); })
    : [];
  ctx.out.deletions = {
    base_resolved: true,
    base_ref: String(baseRef),
    // 집합 차는 **추가에 무감하고 삭제에만 반응한다**. 개수 비교면 삭제 1건과
    // 추가 1건이 상쇄되어 무검사 통과한다(L2 R8 invariant).
    missing: baseSet.filter(function (f) { return !headSet.has(f); }),
    allowed: allowed,
  };
}

/**
 * 게이트와 coverage CLI가 **공유하는** 입력 해소.
 * 판정하지 않는다 — 판정할 자격이 있는지만 답한다.
 */
function resolveInputs(flags, opts) {
  const o = opts || {};
  const cwd = o.cwd || process.cwd();
  const reasons = [];
  const messages = [];
  const out = {
    reasons: reasons, messages: messages,
    tracked: null, measurement: null, exclusions: null, floor: null, deletions: null,
  };

  if (flags.__duplicates && flags.__duplicates.length) {
    reasons.push('duplicate_flag');
    messages.push('flag(s) given more than once: ' + flags.__duplicates.join(', ') +
      ' - a last-wins parser would let a trailing token silently replace a pinned value');
    // 중복은 어느 값이 계약인지 판정 불가라는 뜻이므로 즉시 종결한다.
    return out;
  }

  // tracked — 분모 채널.
  try {
    out.tracked = resolveTracked(cwd);
  } catch (err) {
    reasons.push('git_failed');
    messages.push('git ls-files failed: ' + String((err && err.message) || err));
    return out;
  }
  if (out.tracked.length === 0) {
    reasons.push('tracked_empty');
    messages.push('git ls-files returned no test files - an empty denominator is a measurement failure, not 100%');
  }

  const ctx = { flags: flags, opts: o, out: out, reasons: reasons, messages: messages, cwd: cwd };

  // 넷은 **순서에 의존한다** — deletions가 floor의 allow_deletions를 읽으므로
  // floor보다 뒤여야 한다. 그 외에는 각자 독립이고, 넷 다 단락하지 않고 사유를
  // 누적한다(단락하면 운영자가 고칠 때마다 다시 돌려 다음 사유를 발견한다).
  resolveMeasurementInto(ctx);
  resolveExclusionsInto(ctx);
  resolveFloorInto(ctx);
  resolveDeletionsInto(ctx);

  return out;
}

module.exports = {
  parseFlags,
  resolveInputs,
  resolveTracked,
  resolveBaseSet,
  validateFloorShape,
  validateFloorValues,
  FLOOR_KEYS,
  FLOOR_INT_KEYS,
  MAX_INPUT_BYTES,
};
