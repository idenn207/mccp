# Plan: Dashboard Multi-Session — Worktree 진행 스캐너 (M1)

**Source PRD**: `.claude/prds/dashboard-multi-session.prd.md`
**Selected Milestone**: 1 — Worktree 진행 스캐너 (데이터 레이어)
**Complexity**: Medium

## Summary

`git worktree list`로 같은 로컬 머신의 활성 worktree를 열거하고, 각 worktree의 working-tree `.claude/`(STATE.md + receipts)를 **직접 read**해 worktree별 진행 모델(branch·현재 게이트·차단·마지막 활동·self)을 derive하는 신규 derive source `worktrees`를 추가한다. read-only · gitignore-agnostic · dep-free · loud fail-open. derive()의 spawn-free 계약을 깨지 않도록 git 호출은 **opt-in gate**(host-version `allowGit` 선례 mirror) 뒤에 두고 기본 derive에서는 no-op. M2(UI 섹션)는 본 source를 소비할 뿐 본 마일스톤은 데이터 레이어만.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Source shape | `plugins/mccp/scripts/derive/sources/ledger.js:12` | `scanX(repoRoot)` → `{ ok, count, items, invalid_count, degraded, error }` count-source projection |
| Gated git spawn | `plugins/mccp/scripts/derive/host-version.js:31,98` + `derive/index.js:105` | spawn rung은 존재하되 `allowGit:false`로 default derive에서 차단(perf budget). opt-in 선례 그대로 |
| git execFile | `plugins/mccp/scripts/state/dedupe-key.js:46` | `execFileSync('git', [...], {cwd, encoding:'utf8', stdio:['ignore','pipe','ignore'], timeout})` + try/catch → null |
| Pure cross-root read | `plugins/mccp/scripts/state/state-writer.js:174` | `readState(repoRoot)` lock-free fail-open read (missing/parse fail → emptyState). 다른 worktree path로 호출 가능 |
| self cwd match | `plugins/mccp/scripts/derive/sources/state.js:18` | `resolveSelfSessionId` — `path.resolve` 비교 + env 우선 chain |
| Additive source contract | `plugins/mccp/scripts/derive/model.js:32` + `tests/schema-drift.test.js:15` | emptyModel count-source 선언 + validateShape 강제 + drift guard test. MODEL_VERSION 'v1' 유지 |
| Outside-root masking | `plugins/mccp/scripts/derive/mask.js:53,225` | `maskPath` outside-root → `<outside-repo:basename>`; `applyPathMask`에서 per-item path key 마스킹 |
| Loud fail-open | `plugins/mccp/scripts/derive/index.js:72-89` | 모든 source try/catch + degraded flag + warning push, derive 전체는 절대 abort 안 함 ([memory: feedback-loud-fail-open]) |
| Tests | `plugins/mccp/scripts/derive/tests/ledger-source.test.js`, `state-source.test.js` | `node:test` + helpers `tmpRepo`/`gitInit`/`writeJson`/`writeText` |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/derive/sources/worktrees.js` | CREATE | 스캐너 본체 — porcelain 파서 + per-worktree 진행 derive + self-match. gate off면 no-op |
| `plugins/mccp/scripts/derive/index.js` | UPDATE | `worktrees`를 `SOURCE_SCANNERS`에 등록(opts 이미 threaded). gate 결정은 scanner 내부 |
| `plugins/mccp/scripts/derive/cli.js` | UPDATE | **(Codex F1)** `cmdRender`가 `derive(cwd, { worktreeScan:true, ... })` opt-in — 대시보드 기본 경로가 worktree 데이터를 모델에 채움. `cmdRun`은 off 유지(env honor). bare `derive()`는 default-off(perf-budget) |
| `plugins/mccp/scripts/lib/dashboard-server.js` · `lib/renderer/trigger.js` | UPDATE | **(Codex F1)** render 진입점도 동일 opt-in 전달(라이브/refresh 경로 일관). render-only — 데이터 surface만, 섹션 표시는 M2 |
| `plugins/mccp/scripts/derive/model.js` | UPDATE | `emptyModel().sources.worktrees` count-source 선언 + `validateShape` 강제 + MODEL_VERSION 주석에 additive 줄 추가(버전은 'v1' 유지) |
| `plugins/mccp/scripts/derive/mask.js` | UPDATE | `applyPathMask`가 `sources.worktrees.items[].path` + `.self_path` 마스킹(receipts cwd 미러). **(Codex F2)** error/warning 문자열의 outside-root 절대경로 scrub helper(`scrubAbsPaths`) 추가 |
| `plugins/mccp/scripts/derive/tests/worktrees-source.test.js` | CREATE | porcelain 파서 fixture + gate off no-op + gate on items + self-match + fail-open degrade + 마스킹 |
| `plugins/mccp/scripts/derive/tests/schema-drift.test.js` | UPDATE | `worktrees` count-source drift guard 추가(ledger 미러) |
| `docs/v1.3.0-observability/schema-surface.md` | UPDATE | additive `worktrees` source의 read-side schema surface 문서화(canonical 계약) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | patch bump(§3.7 단일 milestone ship). 현재값 확인 후 forward-only(+1). footer version도 동기화 |

## Tasks

### Task 1: worktree porcelain 파서 (순수 함수)
- **Action**: `worktrees.js`에 `parseWorktreePorcelain(stdout)` 구현 — `git worktree list --porcelain` 출력을 빈 줄로 블록 분리, 각 블록에서 `worktree <path>` / `HEAD <sha>` / `branch refs/heads/<name>` | `detached` / `bare` | `locked` | `prunable` 추출 → `[{ path, head, branch, detached, bare, locked, prunable }]`. git 없이 fixture 문자열로 테스트 가능.
- **Mirror**: 파싱 순수성은 `host-version.js`의 CHANGELOG/toml 정규식 추출(spawn과 분리된 pure helper) 스타일.
- **Validate**: `node --test`에서 multi-block fixture(main + 2 worktree + 1 detached + 1 bare) → 정확한 블록 수/필드.

### Task 2: per-worktree 진행 derive
- **Action**: `deriveWorktreeProgress(worktreePath, repoRoot, opts)` — 각 worktree에 대해 try/catch로:
  - **(Codex F3) diagnostic STATE read**: `stateWriter.readState`는 missing/read/parse/version 실패를 모두 `emptyState()`로 삼켜 corrupt STATE가 "absent"로 보임(loud fail-open 위반). 대신 `fs.existsSync(<wt>/.claude/state/STATE.md)` 먼저 확인 → 부재면 정상 absent; **존재하는데** `readState`가 빈 state/`state_version` mismatch 반환하면 raw read + `parseStateMd` 재시도해 missing↔unparseable 구분. unparseable → 그 item `degraded:true` + `blocked_reason='state-unparseable'`로 **행 보존**(receipts 등 다른 신호 유지). → `state_present`, `state_parseable`, `milestone_hint`(frontmatter goal/plan 또는 body 첫 줄 요약), `state_last_updated`(frontmatter last_updated).
  - 해당 worktree의 receipts: `receipt/store`의 `listReceipts(worktreePath)` + 최신(`meta.created_at` max) `readReceipt` → `current_gate`(gate_id), `gate_converged`(resolution.converged), latest receipt 파일 mtime.
  - `blocked` = (latest receipt `resolution.converged===false`) **OR** (`<worktreePath>/.claude/state/fix-task.md` 존재) **OR** (latest receipt `meta.advisory===true`). `blocked_reason` 1줄.
  - `last_activity` = max(STATE.md mtime, latest receipt mtime) ISO. 둘 다 없으면 null.
  - `has_signal` = state_present || receipts > 0.
  - `active` = `has_signal && (last_activity within MCCP_WORKTREE_ACTIVE_DAYS, default 14)`.
  - 권위 충돌(PRD OQ): **milestone_hint는 STATE.md(git-tracked, 신뢰)**, **current_gate/blocked는 receipt(최신·상세)**. 한 worktree 안에서 둘은 서로 다른 축이라 충돌 아님 — 같은 축(예: "어느 마일스톤") 신호는 STATE 우선.
- **Mirror**: receipt 투영은 `derive/sources/receipts.js extract()`; STATE 읽기는 `sources/state.js`가 아니라 `state-writer.readState`(ledger 스캔 회피 — 그건 global-scope heavy).
- **Validate**: tmpRepo에 가짜 STATE.md + receipt 심어 progress 필드 정확성 단위 테스트.

### Task 3: self / main 식별 + 정규화
- **Action**: `isSelfWorktree(worktreePath, repoRoot)` — `path.resolve` 후 비교, win32은 drive 소문자 정규화, `fs.realpathSync` try/catch로 symlink 해소(실패 시 resolve 값). `is_main`은 porcelain의 첫 블록(= primary worktree) 또는 `bare` 아닌 minimum-depth path. self는 정확히 1개(매칭 0이면 모두 false — silent degrade, `state.js resolveSelfSessionId` 미러).
- **Mirror**: `sources/state.js:18` resolveSelfSessionId(path.resolve 비교) + `mask.js` Windows drive 정규화 감수성.
- **Validate**: repoRoot === 한 worktree path → 그 항목만 `is_self:true`; 대소문자/trailing-slash 변형도 매칭.

### Task 4: 스캐너 facade + spawn gate
- **Action**: `scanWorktrees(repoRoot, opts)` — gate 판정: `opts.worktreeScan === true` **OR** `process.env.MCCP_MULTI_SESSION_SCAN === '1'`. gate off → `{ ok:true, count:0, items:[], invalid_count:0, degraded:false, error:null, scanned:false, self_path:null, truncated:false }` (no spawn, perf-budget 안전). gate on → `execFileSync('git', ['worktree','list','--porcelain'], {cwd:repoRoot, timeout:3000, ...})` try/catch:
  - spawn 실패 → `{ ok:true, ..., scanned:true, degraded:true, error:<msg> }` (loud fail-open, derive 미abort).
  - 파싱 후 `bare` 블록 제외. `worktrees.length > cap`(`MCCP_WORKTREE_SCAN_CAP` default 20)이면 첫 cap개만 처리 + `truncated:true` + warning(no silent cap).
  - 각 worktree에 Task 2/3 적용. per-worktree 예외 → 그 item `degraded:true`+error로 포함(드롭 금지, PRD OQ "skip vs error row" → **error row 유지** = fail-open 가시성). 하나라도 degrade면 source `degraded:true`.
  - **(Codex F2) error-string path scrub**: spawn 실패 메시지, per-worktree `item.error`, source `error`, push할 warning은 Node fs 에러(`ENOENT: ... C:\...\.worktrees\other\.claude\...`)에 sibling/parent **절대경로**를 흔히 담는다. `applyPathMask`의 warning 치환은 `root` substring만 지워 outside-root 경로는 통과 → masked 출력에서 raw leak. emit 전 모든 error/warning 문자열을 `mask.scrubAbsPaths(str, repoRoot)`로 통과시켜 outside-root 절대경로/드라이브/UNC를 `<outside-repo:basename>`로 치환(`maskPath` 로직 재사용). branch/head는 scrub 대상 아님.
  - `count` = 처리한 worktree 수, `invalid_count` = degraded item 수.
  - **gate kill-switch**: `MCCP_MULTI_SESSION_SCAN=0`이면 opts.worktreeScan=true여도 강제 off(loud stderr). on 판정 = `(opts.worktreeScan===true OR env==='1') AND env!=='0'`.
- **Mirror**: gate 패턴 = `host-version.js` allowGit; spawn = `dedupe-key.js:46`; fail-open = `index.js` source 루프; scrub = `mask.js maskPath` outside-root.
- **Validate**: env unset + opts 없음 → `scanned:false` no-op; `MCCP_MULTI_SESSION_SCAN=1` + tmpRepo(실제 worktree 1개) → 최소 1 item; sibling read 실패 mock → masked 출력에 raw 절대경로 부재.

### Task 4b: render 경로 opt-in (Codex F1)
- **Action**: `cli.js cmdRender`가 `derive(cwd, { worktreeScan:true, raw:wantRaw, strict })`로 호출 — 대시보드 **기본** 렌더가 worktree 데이터를 모델에 채운다(default-off가 곧 "기능 영구 invisible"이 되는 것을 차단). `cmdRun`은 off 유지(env honor — 디버그 JSON에 매번 git spawn 회피). `dashboard-server.js` 라이브 렌더 + `renderer/trigger.js` refresh 경로도 동일 opt-in 전달. bare `derive()`(validate/test/perf-budget 소비)는 default-off로 spawn-free 계약 보존.
- **Mirror**: `host-version.js`가 derive 호출부에서 `allowGit:false`로 끄고 직접 caller는 켜는 비대칭 — 여기선 render caller가 켜고 derive 기본은 끔(동형 역방향).
- **Validate**: tmpRepo + 실제 worktree 2개에서 `cli.js render` → 산출 모델(또는 `run` JSON) `sources.worktrees.scanned===true && count>=2`. bare `derive(root,{raw:true})`는 `scanned===false` 유지(perf-budget 무변).

### Task 5: derive 등록 + model/mask 배선
- **Action**:
  - `index.js`: `SOURCE_SCANNERS`에 `worktrees: (root, opts) => scanWorktrees(root, opts)` 추가(loop가 이미 `scan(root, opts)` 호출 — opts 자동 전달). degraded/warning 처리는 기존 공통 루프가 흡수.
  - `model.js`: `emptyModel().sources.worktrees = { ok:true, count:0, items:[], invalid_count:0, degraded:false, error:null }`; `validateShape` required + countSources 목록에 `worktrees` 추가; MODEL_VERSION 주석에 `dashboard-multi-session M1: sources.worktrees (additive count-source)` 줄 추가(값 'v1' 불변).
  - `mask.js applyPathMask`: `s.worktrees.items` 각 항목 `maskItem(it, root, ['path'])` + `s.worktrees.self_path`도 maskPath. **(Codex F2)** `s.worktrees.error` + `items[].error`도 `scrubAbsPaths`로 통과. branch/head는 raw 유지(ledger git_branch 선례).
  - `mask.js`에 `scrubAbsPaths(str, repoRoot)` export 신규 — 문자열 내 outside-root 절대경로/드라이브/UNC substring을 `<outside-repo:basename>`로 치환(`maskPath` 단일경로 로직을 문자열 스캔으로 확장). 스캐너가 emit 전 직접 호출(applyPathMask 도달 전에도 안전).
- **Mirror**: `model.js:32`(ledger 선언) + `mask.js:225`(receipts cwd 마스킹) + `mask.js:53`(maskPath outside-root).
- **Validate**: `node --test schema-drift.test.js` green; masked 모드에서 sibling worktree path + error 문자열 내 절대경로가 `<outside-repo:...>`로 치환.

### Task 6: 테스트 + 회귀 가드
- **Action**: `worktrees-source.test.js` 신규 — (a) 파서 fixture, (b) gate off no-op, (c) gate on items, (d) self-match, (e) per-worktree fail-open degrade(읽기 불가 디렉토리 mock), (f) cap/truncated, (g) masked 경로, **(h, Codex F2)** sibling read 실패 → masked 출력의 error/warning에 raw 절대경로 부재, **(i, Codex F3)** STATE.md 존재+corrupt → item `degraded` + 행 보존(absent 아님), **(j, Codex F1)** render 경로(`cmdRender`/derive worktreeScan:true)는 scanned=true·다중 worktree count, bare derive는 scanned=false. `schema-drift.test.js`에 worktrees count-source guard 추가(ledger 블록 복제). `perf-budget.test.js`/`no-new-deps.test.js`는 **수정 없이 green** 유지(bare derive gate off 기본 → spawn 0, dep 0)임을 확인.
- **Mirror**: `ledger-source.test.js` 구조 + `schema-drift.test.js:15` 블록.
- **Validate**: 아래 Validation 블록 전체 green + 회귀 0.

### Task 7: 문서 + 버전
- **Action**: `docs/v1.3.0-observability/schema-surface.md`에 `worktrees` source 항목(필드·gate·fail-open 의미) 추가. `plugin.json` version patch +1(현재값 확인 후 forward-only) + html.js page-foot / markdown.js derived footer version 동기화(§3.7). CHANGELOG.md 행 추가.
- **Mirror**: 기존 schema-surface.md ledger/host_version 항목 서술 톤.
- **Validate**: `node plugins/mccp/scripts/derive/cli.js version` 확인 + footer grep 일치.

## Validation

```bash
# 신규 + 핵심 가드 (Git Bash)
node --test plugins/mccp/scripts/derive/tests/worktrees-source.test.js
node --test plugins/mccp/scripts/derive/tests/schema-drift.test.js \
            plugins/mccp/scripts/derive/tests/perf-budget.test.js \
            plugins/mccp/scripts/derive/tests/no-new-deps.test.js

# 전체 derive + renderer 회귀 (0 regression 목표)
node --test plugins/mccp/scripts/derive/tests/ plugins/mccp/scripts/lib/renderer/tests/

# 도그푸드 — gate off(기본)는 no-op, on이면 worktrees 채워짐
node plugins/mccp/scripts/derive/cli.js run --json | node -e 'const m=JSON.parse(require("fs").readFileSync(0));console.log("scanned(default off):",m.sources.worktrees.scanned)'
MCCP_MULTI_SESSION_SCAN=1 node plugins/mccp/scripts/derive/cli.js run --raw | node -e 'const m=JSON.parse(require("fs").readFileSync(0));console.log("count:",m.sources.worktrees.count, m.sources.worktrees.items.map(i=>i.branch+(i.is_self?"*":"")+(i.blocked?"!":"")))'
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| derive spawn-free 계약 / perf budget 파괴 | 중 | bare derive는 gate off 유지; render caller만 opt-in(Codex F1). `perf-budget.test.js` 무수정 green이 회귀 가드 |
| **기능 영구 invisible(default-off + render 미배선, Codex F1)** | 중 | `cmdRender`/라이브/refresh 경로가 worktreeScan:true opt-in. render 다중-worktree 테스트가 가드 |
| cross-worktree read race(작성 중 STATE/receipt) | 중 | atomic single read + per-worktree try/catch degrade(전체 abort 아님) |
| **corrupt STATE가 absent로 위장(Codex F3)** | 중 | `readState` emptyState swallow 회피 — exists+unparseable 구분 diagnostic read → `degraded` 행 보존 |
| self path 매칭 실패(win32 case/UNC/symlink) | 중 | `path.resolve` + drive 소문자 + realpath try/catch. 매칭 0 → 모두 false(silent degrade, state.js 미러) |
| **sibling/parent 절대경로 leak — path 필드 + error/warning 문자열(Codex F2)** | 중 | `applyPathMask`(path 필드) + `scrubAbsPaths`(error/warning 문자열, outside-root substring). 둘 다 `<outside-repo:basename>`. read-실패 masked 출력 단위 테스트 |
| worktree 다수 → 스캔 latency | 저 | cap(default 20) + `truncated` 신호(no silent cap) + gate off 기본이라 평상시 비용 0 |
| MODEL_VERSION drift / 소비자 깨짐 | 저 | additive count-source, 'v1' 유지. `schema-drift.test.js` guard. M2 consumer는 missing-tolerant |
| PRD① ledger와 중복 표시 | 저 | M1 스캐너는 **live 활성 worktree만** emit, 완료 이력은 ledger source 그대로 — 역할 분리(M2가 병치/구분) |

## Open Questions (PRD 6개 — plan 결정)

1. **집계 범위**: `git worktree list` 전부 열거(bare 제외, main 포함 `is_main:true`), 각 항목에 `has_signal`/`active`(recency) 계산 필드 부여. 필터 정책 데이터는 M1, 표시(graceful hide)는 M2.
2. **스캔 성능**: gate off 기본(spawn 0). on일 때 cap=20 + `truncated` + per-worktree fail-open. full per-worktree derive 회피(STATE 1 read + receipts 투영만).
3. **진행 소스 권위**: milestone_hint = STATE.md(git-tracked 신뢰), current_gate/blocked = 최신 receipt(상세·최신). 서로 다른 축이라 충돌 아님.
4. **self 식별**: `path.resolve` + win32 drive 소문자 + realpath try/catch. 매칭 0이면 silent degrade.
5. **접근 불가 worktree**: **error row 유지**(skip 드롭 아님) — `degraded:true`+error로 가시화(loud fail-open).
6. **ledger 합류**: M1은 live 스캐너만. 완료 이력은 PRD① ledger source가 담당 — 병치/시각 구분은 M2 소관. M1에 merge 로직 없음.

## Acceptance

- [ ] `worktrees.js` 스캐너 — porcelain 파서 + per-worktree progress + self/main + gate(off=no-op, on=spawn) 완성
- [ ] derive 등록 + emptyModel/validateShape count-source + mask 배선 완료
- [ ] bare derive gate off 시 spawn 0 — `perf-budget.test.js`/`no-new-deps.test.js` 무수정 green
- [ ] **(Codex F1)** render 경로 opt-in — 다중 worktree에서 `cli.js render`가 `sources.worktrees` 채움(default 가시)
- [ ] **(Codex F2)** error/warning 문자열 내 outside-root 절대경로 leak 0 (`scrubAbsPaths` + 단위 테스트)
- [ ] **(Codex F3)** corrupt STATE → `degraded` 행 보존(absent 위장 아님)
- [ ] PRD 6 Open Questions 모두 plan대로 코드에 반영(권위/self/fail-open/cap/ledger 분리)
- [ ] 전체 derive + renderer suite 회귀 0
- [ ] schema-surface.md 문서화 + plugin.json patch bump + footer 동기화
- [ ] 패턴 재사용(ledger/host-version/dedupe-key/state-writer), 신규 dep 0, MODEL_VERSION 'v1' 유지

## Design Critique

- detector: `skill_available=true`, `design_signal=true` (단, file-path 토큰 매칭에 의한 false positive — `signal_files`는 전부 `derive/*.js` backend 파일, 렌더/디자인 surface 0).
- SKILL first-step: `frontend-design-direction/SKILL.md` `## Output Constraints` Read 완료.
- 판정: M1은 JSON 모델을 emit하는 순수 derive **데이터 레이어**(PRD가 명시적으로 M1=데이터, M2=UI로 분리). 4개 Output Constraints(정보 위계 / 강조색 / raw markdown / 항목 상한)는 전부 **렌더된 UI surface** 대상 — M1에는 렌더 surface가 없어 위반 대상이 존재하지 않음.
- 결과: round=1, findings=0 → `decideCritique` → **CONVERGED**. verdict=`converged`.

## Codex Adversarial Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2) · `--impeccable-available`(design-scope preamble → security/correctness/performance 집중)
- 라운드 수: 1 (R1 — 모든 finding이 R1 plan 수정으로 흡수, ACCEPT_NOW HIGH 미해소 0 → R2 불필요, cap=1)
- 합치 결론: verdict=`needs-attention` → 3 finding 전부 plan에 흡수 후 수렴. "default-off 스캐너가 render 미배선 시 영구 invisible + 실패 경로에서 outside-root 경로 leak" 핵심 지적 수용.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 default-off 스캐너에 dashboard opt-in 경로 없음 | HIGH | ACCEPT_NOW | PRD 가시성 100% 요구 위반 — `cmdRender`/라이브/refresh를 worktreeScan:true로 배선(Task 4b), bare derive는 off 유지 |
  | F2 실패 error가 sibling 절대경로 leak | HIGH | ACCEPT_NOW | applyPathMask는 root-relative만 — outside-root 미커버. scan 시점 `scrubAbsPaths`로 error/warning 문자열 정화(Task 2/5) |
  | F3 STATE read 실패가 per-worktree degrade 안 됨 | MEDIUM | ACCEPT_NOW | `readState` emptyState swallow → corrupt가 absent 위장. diagnostic read로 missing↔unparseable 구분(Task 2) |
- Deferred to backlog: 0 → `.claude/plans/codex-findings-backlog.md` (append 없음)
- Open Questions: 없음 (3 finding 모두 ACCEPT_NOW·R1 흡수 완료, DIVERGENT_UNRESOLVED 없음)
- Codex session 참조: threadId `019efdff-2bad-70f2-b249-29adb66039fc`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.
