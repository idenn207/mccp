# Security Review — multi-session-work-loop M6

- 대상      : commit `a0427ca` (B1 status drift adjudication)
- 리뷰어    : `Task(mccp:security-reviewer)` — review-only invocation
- 실행 시각 : 2026-08-17
- 게이트    : `mccp-implement-codex` / decision `multi-session-work-loop-m6`
- 판정      : **CLEAN** — CRITICAL 0 · HIGH 0 · MEDIUM 0 · LOW 0

## 왜 이 문서가 존재하는가

implement 게이트는 최초 실행 시 security-reviewer를 **띄우지 못했고**, 구현은 그것을
조용히 approving으로 만들지 않고 `meta.security_skipped=true`로 fail-closed 봉인했다.
그 봉인이 `/mccp:pr`을 차단했고(`STRICT_SECURITY_GATES`에 implement 포함, env 우회 없음),
차단을 푸는 두 경로 중 **실제 심사**를 택한 결과가 이 문서다. 나머지 경로(감사 override)는
기록만 남기고 심사는 0회로 두는 선택이었으므로, 이 파일의 존재가 곧 그 선택을 하지 않았다는
증거다.

## 심사 범위

`git show a0427ca -- plugins/mccp/scripts/` — 7개 모듈 약 2,300 LOC.

| 모듈 | 성격 |
|---|---|
| `msw-metrics/b1-status-drift.js` | 순수 판정 오라클 (설계상 I/O 없음) |
| `msw-metrics/b1-evidence-builder.js` | **유일한 I/O 지점** — `git cat-file`/`ls-tree`/`rev-parse` 호출, PRD 마크다운 표에서 plan 경로 해석 |
| `msw-metrics/b1-independence-lint.js` | 손으로 짠 주석/정규식-리터럴 stripper를 쓰는 정적 lint |
| `msw-metrics/assertion-manifest-check.js` | test 파일에서 `test()` 호출 앵커 스캔 |
| `derive/sources/milestone-evidence.js` | 활성 PRD 행 열거, 마크다운 표 파싱 |
| `archive-complete/scan.js` | **파괴적** 파일 이동 + status 편집 명령을 게이팅 |
| `renderer/sections/msw-metrics.js` | drift 항목을 `status.html`로 렌더 |

## 축별 판정 — 전부 증거로 기각됨

깨끗한 결과도 finding과 같은 수준으로 감사 가능해야 하므로, 각 축이 *왜* 성립하지 않는지를
`file:line`으로 남긴다.

### 1. Command / argument injection into git — CLEAN

plan 경로와 decision slug가 **PRD 마크다운 표 셀**에서 온다는 점이 이 축의 전제였다.

- 모든 호출이 `execFileSync` **argv 배열**이다 (`b1-evidence-builder.js:39`) — 셸 문자열이 아니다.
- pathspec 앞에 `--` 종결자가 있다 — `:184` `['ls-tree','-r','--name-only',ref,'--'].concat(PLAN_DIRS)` · `:283` 동형.
- `isSafeDecisionId()` (`:127-136`)가 `-`로 시작하는 식별자를 명시적으로 거부해 flag 흡수를 차단한다.

### 2. Path traversal — CLEAN

- `posixNormalize()`가 `..`를 접되 **선두 `..` 토큰은 보존**한다 (`:102-122`).
- 정규화 **이후** 이탈 검사가 돈다 — `resolved.indexOf('..') === 0 || resolved.indexOf('/..') !== -1` → 거부, `resolved.indexOf(PLAN_ANCHOR) !== 0` → 거부.
- 절대경로(`/etc/passwd`, `C:\Windows`)는 앵커 검사에서 탈락하고, 상대 이탈은 git 호출 **전에** 걸린다.

### 3. Dashboard HTML injection / XSS — CLEAN

milestone 이름과 파일 경로가 PRD 마크다운에서 그대로 실려 `status.html`에 들어가는 경로다.

- `renderProseHtml()` (`format-utils.js:188-191`)가 `normalizeProse()` → `renderInline(text, escapeHtml)`로 체인한다.
- `escapeHtml()` (`:109-118`)이 `&`·`<`·`>`·`"`·`'`·`` ` `` 전부를 이스케이프한다.
- drift 상세의 milestone 이름은 `renderProseHtml()`을 거친다 (`msw-metrics.js:474`).
- 가시 prose 경로와 `data-*`/drawer-JSON 직렬화 경로를 **각각** 확인했다 — 이스케이프 요건이 다른 두 경로 모두 미노출.

### 4. ReDoS — CLEAN

- `LEDGER_REQUIRE` · `IMPURE_REQUIRE` · `STATUS_LITERAL` · `RECEIPT_PRESENT_WRITE` 전부 중첩 수량자 없음, 교대(alternation) 유계.
- `stripComments` (`b1-independence-lint.js:76-146`)는 정규식 반복이 아니라 **문자 단위 상태 기계**다.

### 5. Fail-open — CLEAN

`scan.js`의 거짓 "drift 없음"이 파괴적 아카이브 명령을 먹인다는 점에서 가장 중요한 축이었다.

- git 계층 실패 → `degraded:true` (`milestone-evidence.js:114`)
- 행별 증거 구성 실패 → `VERDICT_UNDETERMINED` + 카운터 증가 (`:240-245`)
- 오라클 예외 → `evidence_verdict = VERDICT_UNDETERMINED` (`scan.js:265-268`)
- 조용히 삼키는 `catch` 없음. 모든 실패가 degraded 플래그 또는 명시 undetermined로 표면화된다.

### 6. Resource exhaustion — CLEAN

`fs.readFileSync` 대상이 전부 저장소 내부(`.claude/prds/`, `.claude/plans/`)로 저장소 소유자
통제 하에 있고, 표 파싱의 배열 증가가 구조(5열)에 유계다.

### 부수 — 단일 생산자 불변식이 기계적으로 강제됨

축으로 요청하지 않았으나 리뷰어가 확인했다. lint 축 (iv) (`b1-independence-lint.js:280-285`)가
builder 밖의 `receiptPresent` 생성 0건을, `:292`/`:296-305`가 builder의 `cat-file` 사용과
`fs.existsSync`/`ls-files` **미사용**을 정적으로 고정한다.

## 비판정 관찰 (보안 영향 없음)

`stripComments`의 정규식-vs-나눗셈 휴리스틱(`:91-95`)은 직전 문자 lookahead를 쓰고, 애매한
자리(`}` 뒤의 `/` 등)에서 **나눗셈으로 접는다**(보수적 방향). 놓친 정규식 리터럴 안의 주석이
처리된다는 뜻이지만, 대상 패턴(ledger require · fs require · status 리터럴)이 정규식 본문에
나타날 개연성이 낮고 **어떤 보안 경로도 이 edge case의 통과에 의존하지 않는다**.

## 이 심사가 주장하지 않는 것

- **단일 리뷰어 · 단일 모델이다.** cross-model 확증이 아니다 — `MCCP_CODEX_DISABLED=1` 정책으로
  Codex는 이 milestone의 어느 게이트에서도 발화하지 않았다.
- **CLEAN은 "취약점이 없다"가 아니라 "위 6축 + 부수 1축에서 발견되지 않았다"** 이다. 심사 범위는
  `a0427ca`의 `plugins/mccp/scripts/` 변경분이며 그 밖의 표면은 보지 않았다.
