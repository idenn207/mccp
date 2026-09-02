// custom test reporter (Task 2). TAP은 다중 파일에서 **파일 귀속을 전혀 싣지
// 않으므로**(실측) reporter 이벤트의 `data.file`만이 파일 단위 분해의 유일한 경로다.
//
// ── 실측이 정정한 것 ─────────────────────────────────────────────────────────
// plan Task 2는 "`nesting===0`만 취해 `data.file`로 집계"라 적었다. 그대로 구현하면
// **이중계상**이 난다 — nesting 0에는 진짜 top-level test와 **파일 roll-up**이 둘 다
// 오기 때문이다(흡수행 A). 2026-09-02 재실측:
//
//   EV {"t":"test:complete","nesting":0,"name":"alpha one","file":"…/a.test.js","dur":2.03}
//   EV {"t":"test:complete","nesting":0,"name":"alpha two","file":"…/a.test.js","dur":0.41}
//   EV {"t":"test:complete","nesting":0,"name":"C:\\…\\a.test.js","file":"…/a.test.js","dur":270.46}
//                                          ^^^^^^^^^^^^^^^^^^^ roll-up: name === file
//
// 판별자는 추론이 아니라 **경로 동일성**이다: roll-up의 `name`은 그 파일 자신을
// 가리킨다. 휴리스틱(예: "가장 긴 duration"·"마지막 이벤트")을 쓰지 않는 이유는
// 그것이 test가 0개인 파일이나 한 개인 파일에서 조용히 뒤집히기 때문이다.
//
// **단순 문자열 동등성은 틀렸다**(2026-09-02 2차 실측). `data.file`은 **항상 절대**
// 경로지만 roll-up의 `data.name`은 **커맨드라인에 준 그대로**다. 러너는 argv 예산
// 때문에 repo-relative 경로를 넘기므로(Task 3의 21,324/32,767 산술) 두 값이 다르다:
//
//   name "plugins\\mccp\\...\\task-tool-smoke.test.js"
//   file "C:\\_project\\...\\plugins\\mccp\\...\\task-tool-smoke.test.js"   nameEqFile=false
//
// 첫 판본이 동등성을 쓴 것은 probe가 **절대 경로로** 호출했기 때문이고, 그래서
// probe에서는 맞고 실사용에서는 전부 틀렸다 — roll-up이 진짜 test로 계상돼
// (`tests` +1 · `sum_ms` +파일 벽시계) 흡수행 A가 막으려던 이중계상이 그대로
// 재현됐다(task-tool-smoke: 실제 1건인데 2건 보고). 이제 **경로 접미** 관계를
// 본다 — 절대 경로는 자기 상대 경로로 끝나므로 cwd를 몰라도 성립한다.
//
// 귀속(presence)의 정본은 `test:complete`이지 `test:summary`가 **아니다**(흡수행 B).
// 같은 실측에서 import 크래시 파일 `c.test.js`는 nesting-0 roll-up을 냈지만
// **per-file `test:summary`를 한 번도 내지 않았다** — 전역 summary 하나만 `file:null`로
// 왔다. `test:summary`로 귀속을 재면 크래시 파일이 집계에서 통째로 사라지고, 그것이
// 정확히 DD8이 유일한 치명이라 부른 방향(실행되지 않았는데 통과로 읽힘)이다.
//
// 이 파일은 **모름을 0으로 쓰지 않는다**(DD6). 귀속 불가는 명시 상태로 나가고,
// 최종 4값 판정(`complete`/`partial`/`unavailable`/`none`)은 분모(`files_total`)를
// 아는 `run.js`가 내린다 — reporter는 자기가 본 것만 센다.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createRedactor } = require('./redact.js');

// run.js가 stdout에서 이 줄을 찾는다. 한 줄 JSON이며 접두는 고정이다.
export const REPORT_MARKER = '##MCCP-SUITE-REPORT##';

// 자유 텍스트 상한. 흡수행 C-5가 "크기 상한"을 요구했고, 실패 진단은 전수 스위트에서
// 수십 MB가 될 수 있다. 잘린 사실은 `truncated: true`로 명시한다 — 조용한 절삭은
// 이 모듈 전체가 거부하는 형태다.
const MAX_ERROR_CHARS = 2000;
const MAX_FAILING = 500;

// 경로 비교용 정규화. Windows는 구분자와 대소문자를 둘 다 무시해야 한다.
function normPath(p) {
  const s = String(p).split('\\').join('/');
  return process.platform === 'win32' ? s.toLowerCase() : s;
}

/**
 * roll-up 판별. `file`(절대)이 `name`(커맨드라인 형태)을 **경로 접미로** 포함하면
 * 같은 파일을 가리킨다.
 *
 * `'/' + n`으로 붙여 비교하므로 매치는 **세그먼트 경계에서만** 일어난다 —
 * 그것이 없으면 `.../my-task-tool-smoke.test.js`가 `task-tool-smoke.test.js`를
 * roll-up으로 삼킨다.
 *
 * 잔여: top-level test의 *이름*이 자기 파일 경로의 접미와 정확히 같으면
 * roll-up으로 오분류된다(예: 파일 `a/b.test.js` 안의 `test('b.test.js', …)`).
 * 그 경우 그 test 1건이 집계에서 빠지고 `file_ms`가 그 test의 duration으로
 * 덮인다. 실재 스위트 368개에 그런 이름은 0건이고, 막으려면 이벤트 순서에
 * 의존해야 하는데 그 가정이 더 약하다 — 그래서 여기 기록만 남긴다.
 */
export function isFileRollUp(name, file) {
  if (name == null || file == null) return false;
  const n = normPath(name);
  const f = normPath(file);
  if (n === '' ) return false;
  return n === f || f.endsWith('/' + n);
}

function clip(s) {
  const str = String(s == null ? '' : s);
  return str.length > MAX_ERROR_CHARS
    ? { text: str.slice(0, MAX_ERROR_CHARS), truncated: true }
    : { text: str, truncated: false };
}

// 이벤트에서 에러 텍스트를 뽑는다. node는 층에 따라 `details.error`를 Error 인스턴스로
// 주기도 하고 평문으로 주기도 한다. `stack`을 우선하는 이유는 그쪽에 파일 경로가
// 실리고 그것이 redaction의 실제 대상이기 때문이다.
function errorText(details) {
  if (!details) return null;
  const e = details.error;
  if (e == null) return null;
  if (typeof e === 'string') return e;
  const stack = e.stack ? String(e.stack) : '';
  const msg = e.message ? String(e.message) : '';
  const cause = e.cause && e.cause.message ? ' cause: ' + String(e.cause.message) : '';
  return (stack || msg || String(e)) + cause;
}

/**
 * 순수 집계층. 합성 이벤트로 단언 가능해야 하므로 I/O도 시계도 없다 —
 * 시각은 호출자가 각 이벤트에 실어 준다(`at`).
 *
 * @param {Iterable<{type: string, data: object, at: number}>} events
 * @param {{repoRoot?: string, redactor?: object}} opts
 */
export function aggregateEvents(events, opts) {
  const o = opts || {};
  const redactor = o.redactor || createRedactor({ repoRoot: o.repoRoot });

  const byFile = new Map();
  const failing = [];
  let failingTruncated = false;

  // 4값 probe의 원자료. `run.js`가 분모와 함께 최종 판정을 내리므로 여기서는
  // **관측한 사실 둘만** 센다: nesting-0 이벤트가 왔는가 · 그중 file을 실은 것이 있는가.
  // 이 둘을 가르는 것이 `unavailable`(왔는데 필드가 없음)과 `none`(오지 않음)의 경계다.
  let nesting0Events = 0;
  let attributedEvents = 0;

  function slot(key) {
    let s = byFile.get(key);
    if (!s) {
      s = {
        file: key,
        tests: 0,
        pass: 0,
        fail: 0,
        sum_ms: 0,
        file_ms: null,
        first_at: null,
        last_at: null,
      };
      byFile.set(key, s);
    }
    return s;
  }

  for (const ev of events) {
    if (!ev || ev.type !== 'test:complete') continue;
    const d = ev.data || {};
    if (d.nesting !== 0) continue;      // 중첩 subtest는 부모 roll-up 안에 이미 있다

    nesting0Events += 1;
    const rawFile = d.file;
    if (!rawFile) continue;             // 필드 부재 — `unavailable` 축의 원자료
    attributedEvents += 1;

    const key = redactor.redactPath(rawFile);
    const s = slot(key);
    const at = typeof ev.at === 'number' ? ev.at : null;
    if (at != null) {
      if (s.first_at == null || at < s.first_at) s.first_at = at;
      if (s.last_at == null || at > s.last_at) s.last_at = at;
    }

    const dur = d.details && typeof d.details.duration_ms === 'number'
      ? d.details.duration_ms
      : 0;

    // ── roll-up 판별 ──
    // 원문끼리 비교한다 — redact 후 비교하면 두 값이 서로 다른 함수를 거쳐
    // 형태가 갈릴 수 있다.
    const isRollUp = isFileRollUp(d.name, rawFile);
    if (isRollUp) {
      s.file_ms = dur;                  // 파일의 실제 벽시계 — 상위 15개 산정의 기준
    } else {
      s.tests += 1;
      s.sum_ms += dur;
      if (d.details && d.details.error != null) s.fail += 1;
      else s.pass += 1;
    }

    const raw = errorText(d.details);
    if (raw != null) {
      if (failing.length < MAX_FAILING) {
        const clipped = clip(redactor.redactText(raw));
        failing.push({
          file: key,
          // roll-up의 `name`은 절대경로다. 그것을 그대로 실으면 redaction을 우회하므로
          // roll-up일 때는 이름 자리에 접힌 키를 쓴다.
          name: isRollUp ? key : redactor.redactText(String(d.name == null ? '' : d.name)),
          kind: isRollUp ? 'file' : 'test',
          error: clipped.text,
          error_truncated: clipped.truncated,
        });
      } else {
        failingTruncated = true;
      }
    }
  }

  const per_file = Array.from(byFile.values()).sort((a, b) =>
    a.file < b.file ? -1 : a.file > b.file ? 1 : 0
  );

  const report = {
    per_file: per_file,
    failing: failing,
    failing_truncated: failingTruncated,
    nesting0_events: nesting0Events,
    attributed_events: attributedEvents,
    redaction_degraded: redactor.degraded,
    redaction_rule_count: redactor.ruleCount,
  };

  // 2차 방어: emit 직전 산출 전체를 훑어 잔여 절대경로를 찾는다. `hits`가 비고
  // `truncated`가 거짓일 때만 통과다 — 빈 배열 하나로 "깨끗함"과 "상한에 걸려 못
  // 봤음"을 겸하면 후자가 전자로 읽힌다(redact.js `scanResidual` 주석).
  const scan = redactor.scanResidual(report);
  report.redaction_ok = scan.hits.length === 0 && !scan.truncated;
  report.redaction_hits = scan.hits;
  report.redaction_scan_truncated = scan.truncated;

  return report;
}

export default async function * mccpSuiteReporter(source) {
  const repoRoot = process.env.MCCP_SUITE_REPO_ROOT || process.cwd();
  const collected = [];

  for await (const ev of source) {
    if (!ev || ev.type !== 'test:complete') continue;
    const d = ev.data || {};
    if (d.nesting !== 0) continue;
    // 원본 이벤트를 붙들지 않는다 — 필요한 필드만 얕게 복사해 전수 스위트에서
    // 메모리가 이벤트 객체 그래프에 묶이지 않게 한다.
    collected.push({
      type: ev.type,
      at: Date.now(),
      data: {
        nesting: 0,
        name: d.name,
        file: d.file,
        details: d.details
          ? { duration_ms: d.details.duration_ms, error: d.details.error }
          : null,
      },
    });
  }

  const report = aggregateEvents(collected, { repoRoot: repoRoot });
  yield REPORT_MARKER + ' ' + JSON.stringify(report) + '\n';
}
