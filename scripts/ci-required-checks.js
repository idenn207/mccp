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

/**
 * 순수 판정층. 선언된 이름과 저장소의 required check 목록을 대조한다.
 *
 * @param {{declared: string[], required: string[]|null}} opts
 * @returns {{ok: boolean, missing: string[], extra: string[], reasons: string[]}}
 */
function diffChecks(opts) {
  const o = opts || {};
  const declared = Array.isArray(o.declared) ? o.declared.slice().sort() : [];
  const reasons = [];

  // 필수 체크 목록 자체가 없는 것(보호 미설정)은 "일치"가 아니다. 그것은 축 C가
  // 절반이라는 뜻이고, 그 사실을 통과로 접으면 진단이 아무것도 말하지 않는다.
  if (o.required == null) {
    return { ok: false, missing: declared, extra: [], reasons: ['protection_absent'] };
  }
  const required = o.required.slice().sort();

  const requiredSet = new Set(required);
  const declaredSet = new Set(declared);
  const missing = declared.filter(function (n) { return !requiredSet.has(n); });
  const extra = required.filter(function (n) { return !declaredSet.has(n); });

  if (missing.length) reasons.push('declared_not_required');
  if (extra.length) reasons.push('required_not_declared');

  return { ok: reasons.length === 0, missing: missing, extra: extra, reasons: reasons };
}

/** `gh api`로 저장소의 required status check를 읽는다. 실패는 `null`이고, `null`은
 *  `diffChecks`에서 통과가 아니라 `protection_absent`가 된다. */
function readRequiredChecks(branch) {
  const repo = execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const raw = execFileSync('gh', [
    'api', 'repos/' + repo + '/branches/' + branch + '/protection/required_status_checks',
    '-q', '.contexts[]',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return raw.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
}

module.exports = { parseJobNames, diffChecks, readRequiredChecks };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const wantJson = argv.indexOf('--json') >= 0;
  const branchIdx = argv.indexOf('--branch');
  const branch = branchIdx >= 0 ? argv[branchIdx + 1] : 'main';

  // 강제 게이트만이 required check 후보다. 측정 workflow는 머지를 막지 않는다.
  const GATE_WORKFLOW = '.github/workflows/test-suite.yml';

  try {
    const declaredParse = parseJobNames(fs.readFileSync(GATE_WORKFLOW, 'utf8'));
    let required = null;
    let readError = null;
    try {
      required = readRequiredChecks(branch);
    } catch (err) {
      readError = String((err && err.message) || err).split('\n')[0];
    }

    const verdict = diffChecks({ declared: declaredParse.resolved, required: required });
    const record = {
      workflow: GATE_WORKFLOW,
      branch: branch,
      declared: declaredParse.resolved,
      unresolved: declaredParse.unresolved,
      required: required,
      ok: verdict.ok,
      missing: verdict.missing,
      extra: verdict.extra,
      reasons: verdict.reasons,
      read_error: readError,
    };

    if (wantJson) process.stdout.write(JSON.stringify(record, null, 2) + '\n');
    else {
      process.stdout.write('declared: ' + (record.declared.join(', ') || '(none)') + '\n');
      process.stdout.write('required: ' + (required === null ? '(unreadable — branch protection may be unset)' : (required.join(', ') || '(none)')) + '\n');
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
