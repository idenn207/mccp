#!/usr/bin/env node
'use strict';

// required status check ↔ workflow job 이름의 drift 진단 (DD6).
//
// branch protection은 **파일이 아니다.** 설정 자체는 수동 1회이고 정책 논의는 범위
// 밖이다(UI6). 그러나 실재하는 drift가 하나 있다 — required status check는 **job 이름
// 문자열**로 걸리므로, workflow의 job 이름을 바꾸면 보호가 **조용히 풀린다.** 그것이
// 정확히 우산이 경고한 실패 모드다.
//
// ── 이것은 CI가 아니라 운영자가 돌리는 진단이다 ─────────────────────────────
// `gh api`는 관리 권한 토큰을 요구하고 UI5가 운영자 진단의 CI 실행을 금지한다.
// 런북(`docs/ci-full-suite/branch-protection-runbook.md`)에 등재한다.
//
// ── 파서 계약 — 리터럴만 check 이름이 된다 ──────────────────────────────────
// job `name:`이 `${{ ... }}`를 담으면 그 문자열은 **어떤 실제 체크와도 영원히
// 일치하지 않으므로** drift를 상시 보고하게 된다. 그래서 템플릿 이름은 check 이름으로
// 내지 않고 `unresolved`로 **보고**한다. 이 milestone 자신이 같은 사이클에서
// baseline의 job `name:`을 matrix 템플릿으로 만들므로 이 분기는 가설이 아니다.
// 강제 workflow의 job 이름을 **안정 리터럴**로 고정한 Task 5의 요구가 이 계약의 짝이다.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * workflow YAML에서 job 이름을 뽑는다. 정식 YAML 파서를 끌어오지 않는 이유는
 * 이 저장소에 YAML 의존성이 없고, 여기서 필요한 것은 `jobs:` 아래 두 단계 들여쓰기의
 * `name:` 하나뿐이기 때문이다. **주석은 걷어낸 뒤** 스캔한다 — 주석 안의 `name:`이
 * check 이름으로 잡히면 이 진단이 산문을 검사하게 된다(§3.17 선례).
 *
 * @returns {{resolved: string[], unresolved: string[]}}
 */
function parseJobNames(yamlText) {
  const lines = String(yamlText).split(/\r?\n/);
  const resolved = [];
  const unresolved = [];
  let inJobs = false;
  let jobIndent = null;
  let currentJobIndent = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    // 주석 줄은 통째로 버린다. 인라인 주석은 값 안의 `#`과 구분할 수 없으므로
    // 건드리지 않는다 — job 이름에 `#`을 쓰는 것은 이 저장소 관례가 아니다.
    if (/^\s*#/.test(raw)) continue;
    if (raw.trim() === '') continue;

    const indent = raw.length - raw.replace(/^\s*/, '').length;

    if (/^jobs:\s*$/.test(raw)) { inJobs = true; jobIndent = null; continue; }
    if (!inJobs) continue;
    // `jobs:`와 같은 열로 돌아오면 블록이 끝난 것이다.
    if (indent === 0) { inJobs = false; continue; }

    const jobKey = raw.match(/^(\s+)([A-Za-z0-9_-]+):\s*$/);
    if (jobKey) {
      const thisIndent = jobKey[1].length;
      if (jobIndent === null) jobIndent = thisIndent;
      if (thisIndent === jobIndent) { currentJobIndent = thisIndent; continue; }
    }

    if (currentJobIndent === null) continue;
    // job 바로 아래 한 단계의 `name:`만 본다. step의 `name:`은 더 깊다.
    const nameKey = raw.match(/^(\s+)name:\s*(.+?)\s*$/);
    if (nameKey && nameKey[1].length > currentJobIndent && nameKey[1].length <= currentJobIndent + 4) {
      let value = nameKey[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (value.indexOf('${{') >= 0) unresolved.push(value);
      else resolved.push(value);
    }
  }
  return { resolved: resolved, unresolved: unresolved };
}

// 과거 게이트 job 이름. **오늘 비어 있다** — `test-suite.yml` 의 job `name:` 은 이력
// 전체에서 `full test suite gate` 하나였다(측정: 그 파일의 전 커밋을 훑어 확인). 그래서
// `renamed_gate` 는 이 상수로부터는 아직 발화하지 않는다. 비워 둔 채 남기는 이유는,
// job 을 개명하는 순간 **옛 이름을 여기 적는 것**이 그 개명의 짝 작업이기 때문이다.
// 포함 검사만으로는 required 쪽에 옛 이름만 남은 설정(설정이 낡음)을 구분할 수 없다.
//
// **개명 자체는 이 목록이 없어도 잡힌다** — job 을 개명하면 `missing` 이 비지 않아
// `declared_not_required` 가 그대로 발화한다(계획 R2 architect 정정). 이 상수가 더하는
// 유일한 정보는 "required 에 남은 그 이름이 **우리 게이트의 옛 이름**"이라는 것뿐이다.
const HISTORICAL_GATE_NAMES = [];

/**
 * 순수 판정층. 선언된 이름이 저장소의 required check 에 **포함되는지** 본다.
 *
 * 동등성이 아니라 포함인 이유: 선언은 `test-suite.yml` **한 파일**에서만 읽으므로,
 * 이 저장소의 다른 workflow 중 하나라도 required 로 걸리면(가장 유력한 후보는 모든 PR 에서
 * 도는 `version-declaration-gate`) 정상 설정이 drift 로 오보된다(PR-Codex R1 F2).
 * 무관한 required check 는 `unrelated` 로 **보고하되 `ok` 를 떨어뜨리지 않는다**.
 *
 * 판별자 4행 — 사유를 늘리면서 판별 규칙을 적지 않으면 그 사유는 도달 불가이거나 임의다:
 *   protected === false                  → protection_absent      (보호 없음)
 *   protected === true  ∧ contexts 배열  → 정상 비교
 *   protected === true  ∧ contexts 부재  → protection_unreadable  (권한/판독 문제)
 *   protected === undefined              → protection_unreadable  (인자 미전달·API 실패, fail-closed)
 *
 * 마지막 행이 없으면 3분화가 `undefined` 를 `protection_absent` 로 되접어, 이 함수가
 * 가르겠다고 한 혼동("보호가 없다" 대 "권한이 없어 안 보인다")으로 그대로 되돌아간다.
 *
 * @param {{declared: string[], required: string[]|null, protected: boolean|undefined, historical?: string[]}} opts
 * @returns {{ok: boolean, missing: string[], unrelated: string[], renamed: string[], reasons: string[]}}
 */
function diffChecks(opts) {
  const o = opts || {};
  const declared = Array.isArray(o.declared) ? o.declared.slice().sort() : [];
  const historical = Array.isArray(o.historical) ? o.historical : HISTORICAL_GATE_NAMES;
  const halt = function (reason) {
    return { ok: false, missing: declared, unrelated: [], renamed: [], reasons: [reason] };
  };

  if (o.protected === false) return halt('protection_absent');
  if (o.protected !== true) return halt('protection_unreadable');
  if (!Array.isArray(o.required)) return halt('protection_unreadable');

  // 빈 `declared` 에서 포함 검사는 **공허하게 참**이라 ok:true → exit 0 이 된다. 그리고
  // `declared` 는 `parseJobNames` 의 `resolved` 이므로, 누군가 job `name:` 을 matrix
  // 템플릿으로 바꾸는 순간 그것이 `unresolved` 로 가고 이 진단이 **조용히 green** 이 된다.
  // runbook 이 exit 0 을 "설정 완료의 증거" 로 삼으므로 이것은 loud red → silent green
  // 회귀다(R2 architect·security 독립 2건). 비교를 하지 않고 fail-closed 한다.
  if (declared.length === 0) return halt('declared_unresolved');

  const required = o.required.slice().sort();
  const requiredSet = new Set(required);
  const declaredSet = new Set(declared);
  const missing = declared.filter(function (n) { return !requiredSet.has(n); });
  const unrelated = required.filter(function (n) { return !declaredSet.has(n); });
  const renamed = unrelated.filter(function (n) { return historical.indexOf(n) >= 0; });

  const reasons = [];
  if (missing.length) reasons.push('declared_not_required');
  if (renamed.length) reasons.push('renamed_gate');

  return { ok: reasons.length === 0, missing: missing, unrelated: unrelated, renamed: renamed, reasons: reasons };
}

/** 저장소의 보호 상태와 required status check 를 **world-readable** 채널에서 읽는다.
 *
 *  옛 경로 `/branches/{b}/protection/required_status_checks` 는 **admin 전용**이라
 *  보호가 켜진 저장소에서도 non-admin 에게 404 를 돌려주고, 그것이 `protection_absent` 로
 *  접히면 이 계정으로는 exit 0 이 **원리상 불가능**했다 — runbook 이 exit 0 을 완료의
 *  증거로 삼으므로 축 C 의 완료 판정 자체가 도달 불가였다(fable RISK · E1x).
 *
 *  `--jq` 로 **JSON 을 받아 `JSON.parse`** 한다. 개행 분리는 체크 이름에 개행이 들어가면
 *  조용히 오분할한다(security-reviewer S6).
 *
 *  @returns {{protected: boolean, contexts: string[]|null}}
 */
function readRequiredChecks(branch) {
  const repo = execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const raw = execFileSync('gh', [
    'api', 'repos/' + repo + '/branches/' + branch,
    '--jq', '{protected: .protected, contexts: .protection.required_status_checks.contexts}',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const parsed = JSON.parse(raw);
  return {
    protected: parsed.protected === true,
    contexts: Array.isArray(parsed.contexts) ? parsed.contexts.map(String) : null,
  };
}

module.exports = { parseJobNames, diffChecks, readRequiredChecks, HISTORICAL_GATE_NAMES };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const wantJson = argv.indexOf('--json') >= 0;
  const branchIdx = argv.indexOf('--branch');
  const branch = branchIdx >= 0 ? argv[branchIdx + 1] : 'main';

  // 강제 게이트만이 required check 후보다. 측정 workflow는 머지를 막지 않는다.
  const GATE_WORKFLOW = '.github/workflows/test-suite.yml';

  try {
    const declaredParse = parseJobNames(fs.readFileSync(GATE_WORKFLOW, 'utf8'));
    // `state` 는 `{protected, contexts}` 이거나 판독 실패 시 null 이다. 판독 실패를
    // `protected:false` 로 접지 않는다 — 그것이 이 milestone 이 가르는 두 사실이다.
    let state = null;
    let readError = null;
    try {
      state = readRequiredChecks(branch);
    } catch (err) {
      readError = String((err && err.message) || err).split('\n')[0];
    }

    const verdict = diffChecks({
      declared: declaredParse.resolved,
      required: state ? state.contexts : null,
      protected: state ? state.protected : undefined,
    });
    const record = {
      workflow: GATE_WORKFLOW,
      branch: branch,
      declared: declaredParse.resolved,
      unresolved: declaredParse.unresolved,
      protected: state ? state.protected : null,
      required: state ? state.contexts : null,
      ok: verdict.ok,
      missing: verdict.missing,
      // `extra`(= required \ declared, 그 자체로 drift) 에서 `unrelated`(무관한 required
      // check, drift 아님) 로 **의미가 바뀌었다**. 키 이름을 함께 바꾸지 않으면 이 JSON 을
      // 읽는 쪽이 옛 의미로 해석한다(L2 architect LOW — 계획이 이 소비처를 빠뜨렸다).
      unrelated: verdict.unrelated,
      renamed: verdict.renamed,
      reasons: verdict.reasons,
      read_error: readError,
    };

    if (wantJson) process.stdout.write(JSON.stringify(record, null, 2) + '\n');
    else {
      process.stdout.write('declared: ' + (record.declared.join(', ') || '(none)') + '\n');
      // `required === null` 은 더는 "판독 불가" 센티널이 아니다 — `protected` 가 그 축을
      // 소유하므로 세 상태를 각각 말한다.
      const requiredLine = state === null
        ? '(unreadable — ' + (readError || 'gh call failed') + ')'
        : (state.protected === false
          ? '(branch is not protected)'
          : (state.contexts === null
            ? '(protected, but contexts are not visible to this account)'
            : (state.contexts.join(', ') || '(none)')));
      process.stdout.write('protected: ' + (state === null ? '(unknown)' : String(state.protected)) + '\n');
      process.stdout.write('required: ' + requiredLine + '\n');
      if (record.unrelated.length) {
        process.stdout.write('unrelated (required, but not this gate — not drift): ' + record.unrelated.join(', ') + '\n');
      }
      if (record.unresolved.length) {
        process.stdout.write('unresolved (template job names, never check names): ' + record.unresolved.join(', ') + '\n');
      }
      if (!verdict.ok) process.stdout.write('DRIFT: ' + verdict.reasons.join(', ') + '\n');
    }
    process.exitCode = verdict.ok ? 0 : 1;
  } catch (err) {
    process.stderr.write('[ci-required-checks] ' + String((err && err.message) || err) + '\n');
    process.exitCode = 1;
  }
}
