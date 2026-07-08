# Plan: Dashboard Action Button — obsolete 닫힌 루프 (안 F mode-gated)

**Source PRD**: `.claude/prds/dashboard-interactivity.prd.md`
**Selected Milestone**: M4 — 대시보드 액션 버튼 (PRD 마지막 milestone, MVP 완료 후속)
**Complexity**: Large (서버 최초 mutation route + 보안 표면 + 다중 subsystem)

## Summary

대시보드 드로어에서 위험/질문을 **"제외(obsolete)"** 버튼으로 직접 처리해 소스 `.md`에 비파괴 마커를 기록하고 렌더가 collapse하는 닫힌 루프를 추가한다. 단, 서버를 영구 writer로 만들지 않는다 — **안 F mode-gated**: POST 라우트는 기본 비활성이고 `/mccp:dashboard --write`로 띄운 프로세스 수명 동안만 활성화된다. 평상시 대시보드는 오늘과 동일한 read-only. 쓰기는 opaque item-id(경로 미수신) + Origin/Referer + 서버 nonce + repoRoot containment + fail-closed `apply.js` 위임으로 안전하게 닫는다.

## Design Decision Record (필요성 검토 + Codex 수렴)

- **필요성**: M4는 PRD Hypothesis(line 22-23)·Success Metric(line 33)에 명시된 닫힌 루프이므로 곁가지 아님(Codex R1 F1, conf 0.92). 단 act-loop은 `/mccp:dashboard-audit`(증거 게이트 batch)와 **상보** — M4=in-context 단건, audit=불확실/대량.
- **"최초의 POST gate" 분해**: P1(서버가 source writer가 됨, 영구 정체성 전환)·P2(localhost CSRF)·P3(증거 게이트 우회)·P4(multi-worktree scoping)·P5(fail-open→fail-closed 원칙 반전).
- **안 E(별도 write-server) 기각**: Codex R2 OVER-ENGINEERED — P1을 *이전*할 뿐 제거 못 함(F1 0.86), random-port handshake는 새 표면일 뿐 보안 이득 없음(F2 0.82), 두 번째 lifecycle이 기존 단일 repo-scoped 서버 모델과 충돌(F3 0.90), 쓰기-모드 의례가 닫힌 루프 목표를 깎음(F4 0.78).
- **안 F(단일 프로세스 mode-gated) 채택**: P1을 *해소* — 플래그 없이 띄운 기본 서버엔 POST 라우트가 **아예 미존재**(악성 페이지가 칠 mutation 표면 0). 단일 lifecycle 유지(P3/P4 코드 재사용). CSRF 노출 창은 명시적 `--write` 세션에만 한정.
- **P3 처리**: 단일-사용자 local dogfood라 사용자 판단=권위. 완화 = 필수 reason(audit-trail) + reversible(마커 삭제) + 확인 1회 + 불확실 항목은 dashboard-audit로 분기 권장. 증거-grep 강제는 안 함(Codex R1 F2 — 1인 도구엔 과한 latency).

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Serve-time 주입(cache 무변경) | `dashboard-server.js:122-127` (`injectReloadScript`) | write-mode action JS도 동일하게 serve 시점 주입, cache `status.html` byte-pristine 유지 |
| Fixed-route dispatch | `dashboard-server.js:156-195` | `req.url.split('?')[0]` 고정 라우트 매칭. 신규 POST는 method+path 둘 다 검사 후 분기 |
| repoRoot identity/lifecycle | `dashboard-server.js:91-100` (`isReusablePid`) | 단일 서버 identity 재사용 — write-mode도 같은 프로세스/PID/스코프 |
| Fail-closed mutation | `stale-audit/apply.js:59-78` (lock) · `:160-175` (CAS) | POST 핸들러는 fail-open 금지 — 검증 실패 시 즉시 reject(P5 반전 의식) |
| Ref SSoT(역매핑) | `stale-audit/enumerate.js:142-185` · ref 형태 `:9-11` | 서버가 POST 시점 re-enumerate → opaque id→ref 결정적 매핑. browser 경로 미신뢰 |
| Marker write API | `stale-audit/apply.js:259` (`apply({refs,repoRoot,now})`) | server-derived ref + reason만 전달. 신규 쓰기 코드 0 |
| Render collapse(기존) | Truthfulness M3 (`resolution-marker` reader, enumerate `:61` `r.resolved` skip) | 마커 기록 후 재-render 시 collapse 자동 — M4 렌더 측 신규 0 |
| Client event wiring | `renderer/client/explore.js:54,223,328` | 버튼 이벤트 바인딩 패턴 재사용. **단 fetch는 최초 도입**(P2 주의) |
| CLI flag parse | `dashboard-server.js:340-351` (`parseArgs`) | `--write` 플래그 추가(default false) |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/stale-audit/item-id.js` | CREATE | ref→opaque id 결정적 SSoT(sha256 of kind+source+lineNumber+norm(text)). 렌더러(embed)와 서버(resolve)가 동일 함수 공유 |
| `plugins/mccp/scripts/lib/dashboard-server.js` | UPDATE | `--write` parse + 기본-비활성 POST 라우트(`/__mccp_resolve`) + nonce 생성 + Origin/Referer 검사 + body cap/parse + id→ref re-enumerate 매핑 + containment + `apply.js` fail-closed 호출 + 성공 시 re-render trigger + write-mode action JS serve-time 주입 |
| `plugins/mccp/scripts/lib/renderer/<drawer>.js` | UPDATE | 드로어 risk/oq 항목에 inert `data-resolve-id`(item-id.js) + hidden "제외" 버튼 markup 방출(behavior는 write-mode JS만 부여). overview cross-worktree 집계 항목엔 미부여(P4) |
| `plugins/mccp/scripts/lib/renderer/client/resolve-action.js` | CREATE | write-mode 클라이언트 wiring — 버튼 노출 + reason prompt + 확인 + nonce 동봉 fetch POST + 결과 처리. 기본 cache엔 미주입 |
| `plugins/mccp/commands/dashboard.md` | UPDATE | `--write` 모드 문서화 + read-only-default 불변 + nonce/Origin 보안 모델 + reversibility 안내 |
| `plugins/mccp/scripts/lib/tests/dashboard-server.test.js` | UPDATE | POST 라우트 회귀 스위트(아래 Validation) |
| `plugins/mccp/scripts/lib/stale-audit/tests/item-id.test.js` | CREATE | id 결정성/안정성 + 렌더-서버 합치 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version bump — M4=PRD 마지막 milestone → minor(target `1.19.0`, PR 시 main forward-reconcile). footer(`html.js`/`markdown.js`) 동기 |
| `CHANGELOG.md` | UPDATE | `[1.19.0]` row |

## Tasks

### Task 1: item-id SSoT
- **Action**: `item-id.js` — `computeItemId(ref)` = sha256(`${kind}\0${source}\0${lineNumber}\0${norm(text)}`) 앞 16자. enumerate ref와 동일 필드만 사용(determinism). `norm`은 apply.js `:88` 미러(공백 collapse+trim).
- **Mirror**: `enumerate.js` ref 형태 `:9-11`, `apply.js#norm:88`.
- **Validate**: `item-id.test.js` — 같은 ref→같은 id, text 1글자 변경→다른 id, 렌더가 만든 id를 서버 re-enumerate가 재현.

### Task 2: 렌더러 inert data-id + 버튼 markup
- **Action**: 드로어 risk/oq detail에 `data-resolve-id="<id>"`와 `<button class="d-resolve" hidden>제외</button>` 방출. 기본 cache에서 버튼은 hidden+무동작(JS 없으면 inert). overview 집계(cross-worktree) 항목엔 미부여.
- **Mirror**: 기존 드로어 detail 빌더 + `explore.js`의 data-attr 컨벤션.
- **Validate**: 렌더 스냅샷에 data-resolve-id 존재 + 버튼 hidden + cache 동작 무변경(기존 렌더 테스트 green). near-monochrome·강조색 viewport당 ≤1 유지.

### Task 3: 서버 `--write` 게이트 + nonce + mode-aware identity (F2 흡수)
- **Action**: `parseArgs`에 `--write`(default false). write-mode일 때만 (a) 프로세스 1회 nonce 생성(`crypto.randomBytes`), (b) POST 라우트 등록, (c) serve-time에 `resolve-action.js` + nonce 주입(injectReloadScript 미러; **기본 cache·non-write serve에는 미주입** — 스크립트/nonce 누출 0). write-mode 아니면 POST 경로 미등록 → 405/404.
- **F2 흡수 — mode-aware reuse**: PID 파일 + `/__mccp_identity` 응답에 `writeEnabled` 비트 추가. `isReusablePid`/identity probe가 **요청 모드 == 서버 모드** 일치를 요구. 불일치(read-only 서버에 `--write` 요청 / default 요청이 writer 발견)면 reuse 거부 — loud + 별도 처리(요청 모드로 신규 bind 또는 명시 에러). default 요청이 writer를 재사용해 read-only invariant를 깨는 경로 차단.
- **Mirror**: `injectReloadScript:122`, `parseArgs:340`, `isReusablePid:91-100`, `buildIdentity:140`.
- **Validate**: 기본 서버 POST→405/404; `--write` 서버만 라우트. 주입은 write-mode만. **모드 전이 테스트**: read-only 뜬 뒤 `--write`(재사용 거부, writer 신규) + `--write` 뜬 뒤 default(writer 재사용 거부).

### Task 4: POST 핸들러 — 검증 체인(fail-closed) + Host gating(F1) + 엄격 결과해석(F3)
- **Action**: `/__mccp_resolve` POST 순서: (1) method=POST 확인, (2) **F1 — Host header allowlist**: `req.headers.host`가 loopback(`127.0.0.1`/`localhost`)+구성 포트인지 먼저 검사, 비-loopback Host면 `/`·POST 모두 serve 전 reject(DNS-rebinding 차단), (3) **F1 — Origin/Referer를 구성된 dashboard origin과 비교**(절대 `req.headers.host` 기준 아님 — rebind가 host를 위조), 불일치 reject, (4) header nonce == 프로세스 nonce(불일치 reject), (5) body size cap + JSON parse(실패 reject), (6) `{id, reason}` 추출 — reason strict(빈/1-token reject), (7) **re-enumerate(repoRoot) → id로 ref 역매핑**(미스 reject — stale id 안전 실패), (8) ref.source `.claude/**/*.md` containment(밖이면 reject), (9) `apply.js apply({refs:[ref+reason], repoRoot})` 호출.
- **F3 흡수 — 엄격 결과 해석**: apply()는 throw 안 하고 summary 반환. 핸들러는 **`applied.length===1 && errors.length===0 && aborted.length===0 && skipped.length===0`** 일 때만 success. 아니면 stale/conflict/error 응답(no-success) — no-exception을 성공으로 보지 않음(TOCTOU text-mismatch/lock-abort가 거짓 성공 안 됨). 클라는 stale 응답에 reload.
- 모든 reject/실패는 fail-closed(소스 미변경). 성공 시에만 Task 6 render.
- **Mirror**: `apply.js` fail-closed 패턴 `:59-78`·`:160-175`, summary 형태 `:273`, `enumerate.js` repoRoot 스코핑.
- **Validate**: 아래 Validation 스위트(F1 rebind/Host + F3 skipped/aborted/errored summary mock 포함).

### Task 5: 클라이언트 wiring
- **Action**: `resolve-action.js` — write-mode 주입 시 `.d-resolve` 버튼 노출, 클릭→reason prompt→확인→`fetch(POST, {headers:{nonce}, body:{id,reason}})`→성공 시 기존 SSE reload가 collapse 반영(또는 명시 reload). 실패 시 loud 안내(소스 무변경 확신). 기본 cache(주입 없음)에선 dead code 아님(아예 미로드).
- **Mirror**: `explore.js` 이벤트 바인딩.
- **Validate**: write-mode 수동 dogfood — 버튼 클릭→마커 기록→collapse. 기본 모드 버튼 무반응.

### Task 6: 단일 render-after-write API (F4 흡수)
- **Action**: POST 성공 후 **단일 render 경로**로 통일(둘 중 택일 금지). `renderer/trigger.js`의 render lock + unique-tmp 규율을 쓰되 **POST write 경로는 debounce 비활성**(triggerRender 기본 5s debounce가 직후 write를 삼켜 false 반환하는 경로 차단). render 후 **cache mtime/내용 advance를 검증**하고서야 success 보고 — write는 됐는데 status.html이 stale로 남아 "보이지 않는 durable write" + unsafe retry 유발하는 경로 차단. 검증 실패 시 success 대신 "written, render-pending" 신호.
- **Mirror**: `renderer/trigger.js`(v1.3.0-m4 render lock/tmp), `attachWatch:204`.
- **Validate**: apply 성공→status.html mtime/내용 advance 확인→collapse 노출. **concurrent-click 테스트**: 모든 성공 write가 결국 render/reload됨을 assert.

### Task 7: 문서 + 버전 + CHANGELOG
- **Action**: `dashboard.md`에 `--write` 모드/보안/reversibility 섹션. `plugin.json` minor bump(target 1.19.0, PR 시 forward-reconcile) + footer 동기. CHANGELOG row.
- **Mirror**: §3.7 bump 규칙(PRD 완료=minor).
- **Validate**: `node --test` 전체 green + footer/plugin.json version 일치.

## Validation

```bash
# 신규/회귀 테스트
node --test plugins/mccp/scripts/lib/tests/dashboard-server.test.js
node --test plugins/mccp/scripts/lib/stale-audit/tests/item-id.test.js
node --test plugins/mccp/scripts/lib/stale-audit/tests/apply.test.js
node --test plugins/mccp/scripts/lib/renderer/   # 렌더러 스위트 회귀 0

# 핵심 보안 회귀(테스트가 강제해야 할 invariant):
# 1. 기본 서버: POST /__mccp_resolve → 405/404 (라우트 미존재) + action JS 미주입
# 2. --write 서버: Origin이 구성 origin과 불일치 POST → reject, 소스 무변경
# 3. --write 서버: nonce 누락/오류 POST → reject
# 4. --write 서버: 알 수 없는/stale id → reject (re-enumerate 미스, 안전 실패)
# 5. --write 서버: id가 .claude 밖 경로로 resolve → containment reject
# 6. --write 서버: 빈/1-token reason → reject
# 7. happy path: 유효 id+reason+nonce+Origin → apply.js가 server-derived ref로 호출
# --- Codex plan-gate 흡수분 ---
# 8. [F1] Host 헤더가 attacker hostname(→loopback resolve) → / 와 POST 모두 reject (DNS-rebinding)
# 9. [F1] Origin 검사는 req.headers.host가 아니라 구성 origin 기준 (host 위조 무력)
# 10. [F2] mode 전이: read-only 뜬 뒤 --write 재사용 거부 / --write 뜬 뒤 default 재사용 거부
# 11. [F3] apply summary가 skipped|aborted|errored → 핸들러 success 아님(거짓 성공 0, mock summary)
# 12. [F3] happy: applied==1 & 0 error/abort/skip 일 때만 success
# 13. [F4] 성공 write 후 status.html mtime/내용 advance 검증 + concurrent-click 모두 render
# 14. [REJECT_YAGNI] stale-id + duplicate-text(같은 text 2행) → wrong-ref 미발생(id에 lineNumber 포함 안전가드)

# 전체
node --test
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 최초 POST 라우트가 read-only/traversal-free 불변을 약화 | 중 | mode-gated(기본 미존재) + opaque id(경로 미수신) + re-enumerate 역매핑 + `.claude/**/*.md` containment. 7개 보안 테스트로 mechanical 가드 |
| localhost CSRF + DNS-rebinding(Codex F1, auto-CRITICAL) | 중 | write-mode에만 라우트 + **Host allowlist(loopback만, 비-loopback Host는 serve 전 reject)** + Origin/Referer를 **구성 origin과 비교(req.host 미신뢰)** + 프로세스 nonce. 노출 창=`--write` 세션 한정. rebind/Host/Origin 위조 회귀 테스트(8·9) |
| 서버 reuse가 mode 무인지 → read-only 재사용으로 route 미등록 / writer 재사용으로 invariant 위반(Codex F2) | 중 | PID+identity에 `writeEnabled` 비트 + reuse 시 모드 일치 요구. 모드 전이 테스트(10) |
| apply no-exception을 success로 오인 → 거짓 성공(Codex F3) | 중 | 핸들러가 applied==1 & 0 error/abort/skip만 success, 아니면 stale/conflict 응답. summary mock 테스트(11) |
| durable write가 render 누락으로 invisible(Codex F4) | 중 | 단일 render API + POST 경로 debounce off + cache advance 검증 후 success. concurrent-click 테스트(13) |
| P5 fail-open 원칙 반전 미인지 → 조용한 소스 오염 | 중 | POST 핸들러 fail-closed 명문화 + apply.js CAS/lock 위임 + reject-path 테스트. dashboard-server의 fail-open(watch/open)과 코드 주석으로 분리 |
| multi-worktree 집계 항목에 버튼 노출 → 타 worktree 소스 쓰기 | 낮 | obsolete 버튼은 이 repoRoot enumerate 항목(드로어 risk/oq)에만. overview 집계 항목 미부여 + containment 2차 방어 |
| 증거 게이트 우회로 거짓 은퇴 | 중 | 단일-사용자 권위 수용 + 필수 reason + reversible(마커 삭제) + 확인 1회. 불확실 시 dashboard-audit 권장 |
| 렌더러 data-id/버튼 추가가 기존 렌더 테스트 회귀 | 중 | inert(hidden/무동작) markup + 스냅샷 갱신 동기 + 강조색·near-monochrome 불변 유지 |
| version drift(plugin.json만 bump, footer 누락) | 중 | Task 7에 footer 동기 명시 + §3.7 체크리스트 |

## Acceptance

- [ ] 기본 `/mccp:dashboard`는 오늘과 동일 read-only — POST 라우트 미존재(405/404), action JS 미주입
- [ ] `/mccp:dashboard --write`에서만 "제외" 버튼 활성 + POST 가능
- [ ] 버튼 클릭 → 소스 `.md`에 `<!--mccp:resolved-->` 비파괴 마커 기록(apply.js) → 재-render collapse
- [ ] 7개 보안 invariant 테스트 green(Origin/nonce/id/containment/reason/method/happy)
- [ ] 서버는 browser-supplied 경로를 절대 신뢰하지 않음(opaque id→re-enumerate 역매핑만)
- [ ] [Codex F1] Host allowlist(loopback만) + Origin은 구성 origin 기준(req.host 미신뢰) → DNS-rebinding auth bypass 차단(테스트 8·9)
- [ ] [Codex F2] PID/identity에 writeEnabled 모드 비트 + reuse 모드 일치 강제(테스트 10)
- [ ] [Codex F3] POST 핸들러는 applied==1 & 0 error/abort/skip만 success(거짓 성공 0, 테스트 11·12)
- [ ] [Codex F4] 단일 render API + cache advance 검증 후 success(invisible write 0, 테스트 13)
- [ ] obsolete는 이 repoRoot 항목에만(cross-worktree 집계 미부여) + containment 2차 방어
- [ ] reason 필수 기록(audit-trail) + 마커 삭제로 reversible
- [ ] STATUS.md plain-text 동등본 유지 + a11y(버튼 키보드/aria) + 강조색 viewport당 ≤1
- [ ] `node --test` 전체 green(렌더러 회귀 0)
- [ ] plugin.json minor bump(forward-reconcile) + footer 동기 + CHANGELOG row
- [ ] Patterns mirrored — 신규 write 엔진/reload 경로 발명 0(apply.js·SSE·render trigger 재사용)

## Design Routing Guide

routing mode: auto (effective at implement stage). 본 plan은 렌더 UI가 없어 impeccable 명령을 invoke하지 않음 — implement 단계 체크리스트.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

## Design Critique

- 호출: `Skill(impeccable, critique)` R0 (v1.3.0-m2 retry loop)
- 라운드 수: 1 (R0)
- Verdict: CONVERGED (HIGH/CRITICAL 0)
- detector baseline(status.html): em-dash-overuse(warning, source 콘텐츠 유래 기존 부채) + numbered-markers(advisory, 마일스톤 번호 false-positive) — 둘 다 M4 무관. M4는 미악화 조건.
- Findings: [P2] 버튼 색조 trap(red/accent 회피 → 중립 톤 + collapse affordance) · [P3] a11y(키보드/aria/SR announce) — 둘 다 plan에 선제 commit.

## Codex Adversarial Review

- 호출: `node codex-invoke.js adversarial-review --impeccable-available` (fail-closed wrapper, plan-gate)
- 라운드 수: 1 (R1, MCCP_GATE_ROUND_CAP=1)
- 합치 결론: **No-ship on plan as written** → 4 ACCEPT_NOW 흡수 후 ship-ready. id를 content-only로 바꾸는 건 REJECT_YAGNI(lineNumber는 brittle이 아니라 re-validation 강제 안전가드).
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 DNS-rebinding / Host gating | HIGH | ACCEPT_NOW | Origin+nonce만으론 rebind auth bypass 가능 — Host allowlist + configured-origin 비교 필수 |
  | F2 PID reuse write-mode aware | HIGH | ACCEPT_NOW | identity에 mode bit 없으면 `--write`가 기존 read-only 서버 재사용→route 미등록, 또는 default가 writer 재사용→invariant 위반 |
  | F3 apply summary 엄격 해석 | MEDIUM | ACCEPT_NOW | apply()는 throw 안 하고 summary 반환 — no-exception을 success로 보면 거짓 성공. applied==1 & 0 error/abort/skip 강제 |
  | F4 단일 render-after-write API | MEDIUM | ACCEPT_NOW | cli render vs triggerRender debounce/lock 불일치로 durable write가 invisible — 단일 API + debounce off + cache advance 검증 |
  | id를 content-only(kind+source+text)로 전환 | — | REJECT_YAGNI | lineNumber 포함은 stale 시 re-validate 강제(안전). apply.js `norm()` text-match가 2차 가드. wrong-ref 실증 전 변경 불요 |
- Deferred to backlog: 0
- Open Questions: **auth bypass (DNS-rebinding) — severity CRITICAL** — F1 흡수로 해소 명세(Host allowlist + req.host 미신뢰 + rebind 회귀 테스트). 흡수 내용은 Task 3/4 + Risks 참조.
- Codex session 참조: threadId in `.git/mccp/tmp/codex-m4-plan-gate.json`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review (R1, 4 ACCEPT_NOW absorbed: F1 Host-gating/DNS-rebinding, F2 mode-aware PID reuse, F3 strict apply summary, F4 single render-after-write API). No new implement-time decisions detected — file layout, abstraction boundaries (item-id SSoT, fail-closed POST handler, single render path), external deps (none), and concurrency model (single-process sync triggerRender + render lock) are all pre-committed in the plan body. `git diff --name-only origin/main..HEAD` ⊆ Files to Change. Cross-gate dedupe applied.
