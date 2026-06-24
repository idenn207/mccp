# Plan: Dashboard Serve + Refresh Commands

**Source PRD**: .claude/prds/dashboard-serve-refresh.prd.md
**Selected Milestone**: 1 — dashboard serve + refresh commands
**Complexity**: Small

## Summary
`.claude/cache/status.html` 대시보드를 localhost로 띄우는 `/mccp:dashboard`와, derive render로 캐시를 다시 굽는 `/mccp:dashboard-refresh` 두 슬래시 명령을 추가한다. 서버는 dep-free Node `http` 모듈로 `127.0.0.1`에 바인딩하고, 서빙 시점에 status.html에 SSE live-reload 스크립트를 on-the-fly 주입해 캐시 파일은 깨끗하게 유지한다. render 경로는 기존 `derive/cli.js render`를 재사용한다.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Naming | `plugins/mccp/scripts/lib/dispatch-server`(부재) → `dispatch-watcher.js` | lib 모듈은 `scripts/lib/<kebab>.js`, `module.exports` 명시 |
| Command file | `plugins/mccp/commands/receipt-status.md` | YAML frontmatter(`description`,`argument-hint`) + `node ${CLAUDE_PLUGIN_ROOT}/scripts/...` 호출 본문 |
| Render reuse | `plugins/mccp/scripts/derive/cli.js:114` `cmdRender` | derive() → renderStatus() → atomic write to `.claude/cache/` |
| Atomic write | `derive/cli.js:108` `writeAtomic` | `tmp` write + `renameSync` |
| Loud fail-open | `scripts/lib/renderer/trigger.js` 헤더 | NEVER throw, stderr `[mccp:...] ... (allow)` + 안전 폴백 ([[feedback-loud-fail-open]]) |
| Host-aware lock | `trigger.js` `.render.lock` tri-state | PID-alive/host/mtime 기반 reclaim (서버 PID 파일에 동일 적용) |
| Tests | `plugins/mccp/scripts/lib/renderer/tests/*.test.js` | Node native `node --test`, fixture 기반 |

## Files to Change
| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/dashboard-server.js` | CREATE | dep-free HTTP 서버 + SSE live-reload + 포트 fallback + 브라우저 오픈 + PID 파일 |
| `plugins/mccp/commands/dashboard.md` | CREATE | `/mccp:dashboard` — render 1회 → 서버 기동 → 브라우저 오픈 |
| `plugins/mccp/commands/dashboard-refresh.md` | CREATE | `/mccp:dashboard-refresh` — `derive/cli.js render` wrap (서버 무관) |
| `plugins/mccp/scripts/lib/tests/dashboard-server.test.js` | CREATE | 서버 단위 테스트 (포트 fallback, reload 주입, SSE, 127.0.0.1 bind) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version 1.11.0 → 1.12.0 (minor — 신규 명령 2개) |
| `CHANGELOG.md` | UPDATE | [1.12.0] 행 추가 |
| `.gitignore` | UPDATE | `.claude/cache/.dashboard-server.pid` ignore (런타임 산출물) |

## Tasks

### Task 1: dashboard-server.js lib 모듈
- **Action**:
  - `startServer({ repoRoot, port, host='127.0.0.1', open=true })` export.
  - 포트 정책 (Codex F2 absorption — stable bookmark 보존, 조용한 fall-forward 금지): default 7333.
    - 기동 전 PID 파일 + identity probe로 7333(또는 `--port`)에서 **이 repo의 dashboard 서버**가 이미 떠 있는지 확인 → 있으면 재기동 안 하고 기존 URL 보고 + (open 시) 브라우저만 재오픈.
    - 7333이 **다른(foreign) 프로세스**에 점유됐으면 `EADDRINUSE`를 조용히 +1 fall-forward 하지 않고 **loud stderr 충돌 안내 + `--port <n>` override 요구**. bookmark가 가리키는 7333에 엉뚱한 서버가 뜨는 stale 대시보드를 차단.
    - `--port <n>` 명시 override는 항상 우선.
  - 라우트:
    - `GET /` → `.claude/cache/status.html` 읽어 `</body>` 직전에 SSE reload `<script>` 주입 후 서빙. 파일 부재 시 안내 HTML(“`/mccp:dashboard-refresh` 먼저 실행”) + 200.
    - `GET /__mccp_reload` → `text/event-stream` SSE. `fs.watch`(또는 watchFile 폴백)로 `status.html` mtime 변경 감지 시 `data: reload\n\n` push.
    - `GET /__mccp_identity` → `application/json` `{ server:'mccp-dashboard', repoRoot, statusPath }` (Codex F1/F2 absorption — PID 파일이 stale/판독불가여도 점유 서버가 *이 repo의 우리 서버*인지 식별 가능).
    - 그 외 → 404.
  - reload 스크립트: `new EventSource('/__mccp_reload'); es.onmessage = () => location.reload();` (인라인, 외부 의존 0).
  - 브라우저 오픈: win32 `start ""`, darwin `open`, linux `xdg-open` 분기. spawn 실패해도 throw 금지 — URL을 stdout으로 출력(loud fail-open).
  - PID 파일 (Codex F1 absorption — repo/cache scope): `.claude/cache/.dashboard-server.pid`에 `{pid, host, port, started_at, repoRoot, statusPath}` 기록. `repoRoot`/`statusPath`는 절대경로. 재사용 판정은 **same-host live PID AND repoRoot 일치 AND statusPath 일치** 3중 AND일 때만 — 하나라도 불일치(예: worktree 간 복사된 stale PID)면 그 PID 파일을 무시/reclaim하고 신규 기동 또는 충돌 처리. trigger.js tri-state mirror 위에 repo-identity 축을 추가.
  - `127.0.0.1` 고정 바인딩 — 외부 노출 차단.
- **Mirror**: `trigger.js` host-aware tri-state lock + loud fail-open; `derive/cli.js writeAtomic`.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/dashboard-server.test.js`

### Task 2: /mccp:dashboard 명령 파일
- **Action**:
  - frontmatter `description`, `argument-hint: "[--port <n>] [--no-open]"`.
  - 본문 절차: (1) `node ${CLAUDE_PLUGIN_ROOT}/scripts/derive/cli.js render`로 최신화, (2) `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/dashboard-server.js`를 background로 기동, (3) URL + PID + 정지 방법(PID kill) 출력.
  - render 실패해도 서버는 기동(stale라도 서빙) — loud fail-open 안내.
- **Mirror**: `receipt-status.md` 본문 구조 + `${CLAUDE_PLUGIN_ROOT}` 경로 컨벤션.
- **Validate**: 명령 파일 frontmatter lint + 본문에 `${CLAUDE_PLUGIN_ROOT}` 절대경로 하드코드 없음 확인.

### Task 3: /mccp:dashboard-refresh 명령 파일
- **Action**: frontmatter + 본문은 `node ${CLAUDE_PLUGIN_ROOT}/scripts/derive/cli.js render` 호출 + 결과(STATUS.md/status.html 경로, stale 여부) 보고. 서버와 무관.
- **Mirror**: `receipt-status.md`.
- **Validate**: 본문 명령이 `derive/cli.js render`와 정합.

### Task 4: dashboard-server.test.js
- **Action**: reload 스크립트 주입 검증(`GET /` 응답에 `EventSource` 포함), SSE 헤더(`content-type: text/event-stream`), `GET /__mccp_identity` JSON(repoRoot/statusPath) 검증, 127.0.0.1 bind, status.html 부재 시 안내 HTML, PID 파일 write(repoRoot+statusPath 포함), **repo-identity 재사용**(같은 repoRoot/statusPath PID → 재기동 안 함) + **stale PID 거부**(다른 repoRoot가 기록된 PID → 무시/신규 기동), foreign 포트 점유 시 loud 충돌(조용한 fall-forward 안 함). `http.get`으로 실제 요청. 임시 디렉토리 fixture.
- **Mirror**: `renderer/tests/cli.test.js` 스타일.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/dashboard-server.test.js` 전부 PASS.

### Task 5: plugin.json + CHANGELOG + .gitignore
- **Action**: plugin.json `1.11.0`→`1.12.0`. CHANGELOG [1.12.0] 행. `.gitignore`에 `.claude/cache/.dashboard-server.pid`.
- **Mirror**: 기존 CHANGELOG 행 포맷.
- **Validate**: `node -e "require('./plugins/mccp/.claude-plugin/plugin.json').version==='1.12.0'||process.exit(1)"`

## Validation
```bash
# 1. 단위 테스트
node --test plugins/mccp/scripts/lib/tests/dashboard-server.test.js
# 2. refresh 경로 (기존 render 재사용)
node plugins/mccp/scripts/derive/cli.js render
# 3. 서버 smoke (background 기동 후 curl, 그다음 종료)
node plugins/mccp/scripts/lib/dashboard-server.js --port 7333 &
SVPID=$!; sleep 1
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:7333/   # 기대 200
curl -s http://127.0.0.1:7333/ | grep -q EventSource             # reload 주입 확인
kill $SVPID
# 4. plugin.json 버전
node -e "process.exit(require('./plugins/mccp/.claude-plugin/plugin.json').version==='1.12.0'?0:1)"
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| 포트 7333이 foreign 프로세스에 점유 | 중 | 조용한 +1 fall-forward 금지 → loud 충돌 안내 + `--port` override (Codex F2) |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| worktree 간 stale PID로 다른 checkout 서버 URL 반환 | 중 | PID 파일에 repoRoot+statusPath 기록, 3중 AND 일치 시만 재사용 (Codex F1) |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| Windows `start ""` 브라우저 오픈 차이 | 중 | OS 분기 + spawn 실패해도 URL stdout 출력(수동 오픈 가능) |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| `fs.watch` OS별 불안정 | 중 | watchFile(폴링) 폴백 + watch 실패 시 정적 서빙만 유지(자동 갱신 best-effort, loud fail-open) |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| background 서버 좀비 프로세스 | 저 | PID 파일 + 재기동 시 same-host live PID + repo-identity 감지 후 기존 재사용, 정지 안내 |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| reload 스크립트가 status.html 디자인 오염 | 저 | 서빙 시점 on-the-fly 주입만 — 캐시 파일은 byte-pristine 유지 |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->

## Design Critique
> 본 plan은 서빙·갱신 *경로*만 추가한다. 서버가 주입하는 SSE reload `<script>`는 비가시 plumbing이며, 캐시된 `status.html`은 디스크상 byte-pristine으로 유지된다(서버가 응답 시점에만 주입). 대시보드의 시각/레이아웃/색/타이포그래피 surface는 v1.4.2에서 확정됐고 본 작업은 변경하지 않는다 — 신규 visual surface 0. impeccable `## Output Constraints` 4항(정보 위계/강조색/raw marker/항목 수 상한)은 렌더 산출물에 이미 적용돼 있으며 본 plan이 재생산하지 않는다.

## Acceptance
- [ ] 모든 Task 완료
- [ ] Validation 통과 (단위 테스트 + smoke + 버전)
- [ ] 패턴 재사용 (render 경로/atomic write/loud fail-open/tri-state lock) — 재발명 없음
- [ ] 캐시 파일 pristine (reload 주입은 서빙 시점만)
- [ ] 127.0.0.1 바인딩 고정 (외부 노출 0)

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.11.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1 (R1 absorption으로 HIGH/MEDIUM 모두 해소 → cap=1 내 종료)
- 합치 결론: needs-attention → 2 findings 모두 ACCEPT_NOW로 R1에서 plan 수정 흡수. PID/포트 정책에 repo-identity 축 추가.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 PID 재사용이 repo/cache로 scope 안 됨 | HIGH | ACCEPT_NOW | multi-worktree dogfood repo라 stale PID로 다른 checkout 서버 URL 반환 실제 위험. PID에 repoRoot+statusPath 기록 + 3중 AND 재사용으로 해소 |
  | F2 포트 +1 fallback이 bookmark 안정성 파괴 | MEDIUM | ACCEPT_NOW | 조용한 fall-forward 제거 → 우리 서버면 재사용, foreign이면 loud 충돌+`--port`. cheap + F1과 정합 |
- Deferred to backlog: 0
- Open Questions: 없음 (CRITICAL/HIGH 잔여 0)
- Codex session 참조: threadId 019eedd6-6b05-7f80-b48c-7cefab9fb129

## Design Critique (impeccable)

- SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints` Read 완료.
- Rounds: 1 · Verdict: **converged**
- 본 plan은 신규 visual surface 0 (서버 주입 SSE reload `<script>`는 비가시, 렌더 HTML은 기존 산출물 그대로). 4개 Output Constraints(정보 위계/강조색/raw marker/항목 수 상한) 모두 N/A — 위반 finding 없음.

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review (PID repo-identity scope, port conflict policy, 127.0.0.1 binding, SSE live-reload). No new implement-time decisions detected. Cross-gate dedupe applied. 보안 note: 서버는 고정 라우트(`/`,`/__mccp_reload`,`/__mccp_identity`)만 처리하고 `req.url` 기반 파일 경로 매핑이 없어 path-traversal surface 없음; 127.0.0.1 bind로 외부 노출 0.
