# Plan Review Panel — codex-harness-portability

**Plan**: `.claude/plans/codex-harness-portability-m3_5.plan.md` · **Plan version**: `sha256:818b2c4d2bb696191f340157d663c50661e93c0bbbf6ee3e106bc7736f5cd72f`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 divergent
**Halted at**: `5.2e`

> Reason: L2 quorum not satisfied: 13 blocking finding(s): architect/HIGH, architect/HIGH, architect/FAIL, security/HIGH

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | HIGH | Task 4의 '도달 검증'이 하네스를 구별하지 못한다 — Claude 쪽 캐시 사본으로 resolved:true가 나면 Codex 설치가 0건이어도 bootstrap --apply가 exit 0을 낸다. 즉 PRD Problem이 지목한 '설치는 되는데 발화하지 않는다'를 검증이 그대로 통과시킨다. | plan Task 4: "CODEX_HOME을 준 채 command-reach.js verify()를 불러 resolved:true와 commandPath 실재를 확인". 그러나 command-reach.js:82-90은 CODEX_HOME을 R-d 후보 하나로만 쓰고, verify()의 root 루프(:164-183)는 codex-cache에서 0건이면 곧바로 `R-d:claude-cache`(~/.claude/plugins/cache)로 넘어가 그것을 승자로 삼는다. 반환값(:235-244)에는 rootSource가 있으나 Task 4가 검사하는 것은 `resolved:true`와 commandPath뿐이다. |
| architect | HIGH | Task 4의 음성 대조가 그 Task가 기술한 검증 메커니즘과 무관하다 — trust hash를 틀리게 심어도 command-reach verify()는 그것을 읽지 않으므로 비영점이 될 수 없다. 성립하지 않는 음성 대조가 Acceptance 필수 산출물로 올라가 있다. | plan Task 4 Validate: "trust 블록의 hash를 한 글자 틀리게 심으면 검증이 exit 비영점일 것(음성 대조)" + Acceptance "음성 대조 1건 — hash를 틀리게 심었을 때 검증이 비영점으로 끝난 출력". command-reach.js 전문(1-275)에 hook·trust·hash·config.toml 참조가 0건이며, verify()가 잰는 것은 commands/<name>.md 파일 실재와 realpath containment뿐이다(:194-234). |
| architect | MEDIUM | verify()는 CLAUDE_PLUGIN_ROOT가 세팅된 실행에서 harness='claude'로 즉시 단락되어 절대 resolved:true를 내지 않는다. Task 4가 성공 조건을 그 함수에 결속하면서 이 분기를 다루지 않아, 운영자 환경에 따라 성공 경로가 구조적으로 도달 불가가 될 수 있고 그 실패는 '설치가 깨졌다'와 같은 모양으로 보고된다. | command-reach.js:152-157 — `if (cand.harness === 'claude') return Object.assign(base, {reason:'claude harness: use the real slash command …'})`. harness 판정은 harness-ingress.js:100-118대로 MCCP_HARNESS 또는 CLAUDE_PLUGIN_ROOT로만 정해지며 CODEX_HOME은 그 축에 영향이 없다. plan은 MCCP_HARNESS 설정을 어디에도 지시하지 않는다. |
| architect | MEDIUM | Codex 캐시 레이아웃이 verify()의 열거 규칙과 어긋날 수 있는데 plan이 그것을 측정 대상으로 두지 않았다. | command-reach.js:119-131은 `<cache>/<market>/mccp/<ver>/`를 기대한다. 실측된 Codex 경로는 docs/codex-harness-portability/m1-harness-truth.md:119의 `~/.codex/plugins/cache/mccp/`(빈 디렉토리)로, 이 규칙에 따르면 owner가 `cache/mccp/mccp`가 되어야 성립한다. plan Task 2·4는 그 레이아웃을 재는 단계를 두지 않고 verify()가 Codex 사본을 찾을 것을 전제한다. |
| architect | LOW | Patterns/Mirror의 file:line 인용이 실제 정의 범위와 어긋난다(±5행). 미러 대상을 여는 사람이 다른 함수를 본다. | plan은 `shortHookKey`를 `cli.js:141-148`, `buildTrustBlock`을 `:160-172`, `listHooks`를 `:114-127`, argv/shell:false를 `:203-210`로 인용하지만 실제는 각각 scripts/codex-probe/cli.js:136-143, 159-170, 105-127, 197-207이다. |
| security | HIGH | `bootstrap --apply`의 trust 병합이 mccp 소유 hook에 한정되지 않아, 운영자의 실제 `~/.codex/config.toml`에 존재하는 **모든** 서드파티 hook을 무차별 승인한다 — Codex의 hook trust 경계를 통째로 무력화하는 권한 상승이다. | plan Task 3: "`hooks/list` → trust 병합", Task 1: "같은 key의 기존 블록을 **교체**". 승격 원본인 `scripts/codex-probe/cli.js:119-126`의 `listHooks`는 `entries.forEach → (e.hooks\|\|[]).forEach`로 **필터 없이 전 hook을 수집**하고, `grantHookTrust`(:145-154)·`buildTrustBlock`(:159-170)이 그 전량에 `enabled = true` + `trusted_hash`를 쓴다. 프로브에서는 매 실행 새로 만드는 스크래치 home이라 무해했으나(cli.js:184 `scratchHome()`), 제품은 실사용 home을 고친다. 더욱이 `trustStatus`(`managed\|untrusted\|trusted\|modified`)를 승인 조건으로 쓰라는 지시가 plan 어디에도 없어, 사용자가 **의도적으로 미승인으로 둔 hook**과 승인 후 본문이 바뀐 `modified` hook(= Codex trust 모델이 존재하는 이유인 변조 신호)까지 함께 신뢰된다. Task 1의 '교체' 규칙은 사용자가 명시적으로 `enabled = false`로 꺼 둔 항목도 `true`로 덮는다. Task 4의 성공 조건은 mccp 도달 검증 하나뿐이라 이 초과 승인은 어떤 validation에도 걸리지 않는다. |
| security | HIGH | 신규 산출물 producer(`codex-bootstrap.js`)가 M1이 세운 DD10 단일 관문을 지나지 않는데, plan은 그 출력을 git-tracked 문서에 **붙여 넣을 것을 acceptance로 요구**한다 — §3.12가 `meta.cwd`로 이미 한 번 갚은 절대경로 유출을 새 표면에서 다시 연다. | plan Acceptance: "`node …/codex-bootstrap.js status --json`의 실행 전/후 출력 두 벌", "`bootstrap --apply` 실행 로그와 그 뒤 `~/.codex/config.toml`의 `[hooks.state.…]` 블록"을 `docs/codex-harness-portability/m3_5-codex-ship.md`(CREATE)와 report에 남기라고 지시한다. 그 값들은 정의상 절대경로를 담는다 — `cli.js:132-135`가 "key의 첫 구간은 선언원 … config hook이면 `config.toml`의 절대경로 … 전자를 그대로 레코드에 실으면 DD10 관문이 `posix-home`으로 거부한다(실측: 10건 전부) … 절대경로는 감사값이 없고 유출값만 있다"고 적었고, Task 2 (d)축이 소비하는 `command-reach.js verify`는 `root`/`commandPath`를 **realpath 절대경로**로 반환한다(`command-reach.js:235-244`). 그런데 `redact-gate.js:3-13`이 선언한 fail-closed 관문("생산자마다 거는 방식은 생산자가 늘 때마다 같은 구멍이 다시 열린다. 관문이 하나면 그 구멍은 구조적으로 존재하지 않는다")을 이 신규 producer에 적용하라는 문장이 plan에 0건이고, Validation 5개 중 어느 것도 `redact-gate.js --check`를 돌리지 않는다. Task 1은 `shortHookKey` 승격만 말하는데 그것은 hook key 축 하나만 접고 (d)축 경로는 접지 않는다. |
| security | MEDIUM | Task 4의 도달 검증이 env 제어 입력(`MCCP_PLUGIN_ROOT`/`CLAUDE_PLUGIN_ROOT`)을 최우선 root 후보로 받으므로, 개발 워크트리 env가 살아 있는 운영자 셸에서는 **설치가 도달하지 않아도** `resolved:true` → exit 0이 난다. 검증을 성공 조건에 결속한다는 Task 4의 주장이 그 조건에서 거짓이다. | plan Task 4: "`CODEX_HOME`을 준 채 `command-reach.js` `verify()`를 불러 `resolved:true`와 `commandPath` 실재를 확인". 그러나 `command-reach.js:67-91` `rootCandidates`는 `ROOT_ENV_NAMES = ['MCCP_PLUGIN_ROOT','CLAUDE_PLUGIN_ROOT','CODEX_PLUGIN_ROOT']`(:43)를 **`R-d:codex-cache`보다 먼저** 밀어 넣고, `verify`(:164-183)는 `commands/`를 가진 첫 후보에서 멈춘다. 또한 CLI shim(:266)은 `MCCP_PLUGIN_ROOT_HINT`도 R-b로 받는다. 즉 `CODEX_HOME`만 지정하고 이 셋을 비우지 않으면 검증 대상이 Codex 설치 트리가 아니라 로컬 워크트리가 된다 — plan이 재현을 막겠다고 명시한 PRD Problem의 실패 모드("설치는 성공하는데 게이트는 한 번도 발화하지 않는다")를 그대로 통과시킨다. plan에는 이 env들을 비우거나 `rootSource`가 `R-d:codex-cache`임을 요구하라는 지시가 없다. |
| security | MEDIUM | `--apply` 백업 파일의 생성 방식·권한·수명이 지정되지 않아, 이 저장소가 비밀 인접 파일에 대해 스스로 못박은 관용구를 새 표면에서 어긴다. | plan Task 3: "`--apply` 시 `config.toml`을 같은 디렉토리에 `config.toml.mccp-backup-<ISO>`로 먼저 복사한다" — 모드·정리 정책 언급 0건. 반면 같은 plan이 Mirror로 지목한 파일 `scripts/codex-probe/cli.js:436-443`은 정확히 이 지점을 이미 갚아 두었다: "`fs.copyFileSync`의 mode 보존은 이 호스트에서 실측되나 Node 공개 API의 보장이 아니라 파일시스템에 따라 갈릴 수 있다. 이 저장소가 비밀 파일마다 쓰는 원자적 관용구를 그대로 쓴다" → `fs.writeFileSync(..., { flag: 'wx', mode: 0o600 })`. 백업본은 hook trust 해시 전량과 사용자의 provider 설정을 담은 채 `~/.codex/` 안에 **무기한·무제한 누적**되며, plan Validation 4의 dry-run 무변경 검사는 `config.toml` 자신의 sha256만 보므로 백업 축은 어떤 검사에도 안 걸린다. |
| test | HIGH | Task 4의 유일한 반증 수단(음성 대조)이 검사 대상과 무관하다 — trust hash를 틀리게 심어도 인용된 검증기가 실패할 수 없다 | Plan Task 4: "검증은 `CODEX_HOME`을 준 채 `command-reach.js` `verify()`를 불러 `resolved:true`와 `commandPath` 실재를 확인하는 것" + Validate: "trust 블록의 hash를 한 글자 틀리게 심으면 검증이 exit 비영점일 것(음성 대조)". 그러나 plugins/mccp/scripts/lib/command-reach.js:138-245의 verify()는 root 후보 탐색·`commands/` readdir·realpath·statSync만 수행하며 hook trust·config.toml·hooks/list를 한 번도 읽지 않는다(:194-244). trusted_hash가 틀려도 verify()는 동일하게 resolved:true를 낸다 → 음성 대조가 구조적으로 성립 불가하며, 이 plan에서 "설치는 되는데 발화하지 않는다"를 반증할 test는 존재하지 않는다. |
| test | HIGH | 같은 오해가 Risks 표로 전파되어, 완화가 실제로는 아무 것도 막지 못한다 | Plan Risks: "`hooks/list`가 hook을 0건 보고해 승인할 것이 없다 … Task 4의 도달 검증이 독립 축이라 trust 0건이면 exit 비영점". command-reach.js verify()는 trust를 관측하지 않으므로(위 근거) trust 0건이어도 `resolved:true` → exit 0이다. 즉 PRD Problem이 지목한 실패 모드("설치는 성공하는데 게이트는 한 번도 발화하지 않는다", prd:20-23)를 이 완화가 탐지하지 못한다. |
| test | HIGH | Validation 5번 결합 인벤토리 회귀 검사가 항진(tautology)이다 — 어떤 회귀에도 항상 통과한다 | Plan Validation: `node -e '…process.exit(j.unlisted&&j.unlisted.length?1:0)'`. 그러나 scripts/codex-probe/scan-coupling.js:176은 `unlisted: unlisted.length` — 즉 **숫자**를 낸다(배열은 `unlisted_items`, :177). 숫자에 `.length`는 undefined이므로 표현식은 언제나 falsy → 항상 exit 0. 또한 :196의 자체 종료 코드가 검사하는 `fossil` 축도 파이프에서 버려진다. |
| test | MEDIUM | Task 2·3의 신규 코드(status/bootstrap 경로)를 돌리는 자동 test가 Validate 라인에 없다 | Files to Change는 `codex-bootstrap.test.js`를 "순수 함수(merge·plan·verdict) 단위 test"로만 규정하고(plan:43), Task 2·3의 Validate는 각각 실환경 1회 실행과 sha256 비교뿐이다. Validation §1도 그 test 파일만 돌린다 — dry-run이 marketplace 등록·plugin 설치 같은 config.toml 밖의 외부 상태를 쓰지 않는다는 주장(Task 3)은 sha256 검사(config.toml 한 파일)로 반증되지 않는다. |
| test | MEDIUM | 검증 경로가 실행 환경에 따라 무조건 실패하는 분기를 갖는데 그 경우를 다루는 test가 없다 | command-reach.js:153-157 — `cand.harness === 'claude'`이면 verify()는 즉시 resolved:false를 낸다. harness 판정은 harness-ingress.js:110의 `CLAUDE_PLUGIN_ROOT` 존재로만 이뤄지고 `CODEX_HOME`은 판정에 관여하지 않는다(:100-118). 따라서 Claude Code 세션/플러그인 환경에서 `bootstrap --apply`를 돌리면 Task 4의 성공 조건이 절대 성립하지 않아 exit 0이 불가능하지만, plan은 이 분기를 언급하거나 test하지 않는다. |
| invariant | HIGH | Task 4의 '도달 검증 결속'은 Codex 설치와 무관하게 만족될 수 있다 — command-reach.verify()는 root 후보를 순서대로 시도하다 Codex 캐시가 비면 **Claude 캐시**로 폴백하므로, Codex에 아무것도 설치되지 않아도 resolved:true + exit 0이 나온다. 게이트가 게이트 모양만 남는 정확한 형태다. | plan:90-93 "검증은 `CODEX_HOME`을 준 채 `command-reach.js` `verify()`를 불러 `resolved:true`와 `commandPath` 실재를 확인하는 것" vs plugins/mccp/scripts/lib/command-reach.js:82-90 (codex-cache 뒤에 `HOME`/.claude 기반 `R-d:claude-cache` 후보를 함께 열거) 및 :164-183 (첫 후보가 0건이면 다음 후보로 계속). PRD:174-176은 `~/.codex/plugins/cache/mccp/`가 **빈 디렉토리**임을 실측했고(→ expandCacheRoots 0건), 같은 호스트의 Claude 캐시에는 mccp 1.33.6이 설치돼 있다(docs/release-channel.md:34-41). CODEX_HOME 지정은 HOME 기반 claude-cache 후보를 제거하지 않는다. |
| invariant | HIGH | '설치는 되는데 발화하지 않는다' 위험의 완화가 발화 축에 결속돼 있지 않다. Task 4 검증은 **명령 본문 파일의 실재**만 재며 hook trust 승인이나 hook 발화를 전혀 관측하지 않는데, Risks 표는 그것을 'trust 0건이면 exit 비영점'의 근거로 쓴다. | plan:144 "그것을 성공으로 반올림하지 않는다 — Task 4의 도달 검증이 독립 축이라 trust 0건이면 exit 비영점" / plan:145 동일 주장. 그러나 command-reach.js:194-244의 verify()는 `commands/<name>.md`의 readdir·realpath·statSync만 수행하며 `hooks/list`·`trustStatus`·hook 발화를 참조하는 코드가 0줄이다. trust 0건이어도 명령 본문은 실재하므로 resolved:true다. |
| invariant | MEDIUM | 릴리스 컷의 롤백 경로가 잘못된 절을 가리키고, 실제 롤백은 이 컷이 넘는 경계(major 2.0.0)에서 **미측정**이라고 소유 문서가 명시한다. 즉 rollback이 assertion으로만 서 있다. | plan:146 "실패 시 §4 롤백". docs/release-channel.md:206 §4의 제목은 "fast-forward가 불가해졌을 때 — 미측정"이고 롤백 절차는 §3(:155-177)이다. 그리고 :198 "측정된 하향은 patch 범위 1건뿐이다. `2.0.0`에서 `1.x`로 되돌리는 major 경계는 측정된 바 없고" — plan Task 6이 정하는 번호가 정확히 `2.0.0`(plan:107). |
| invariant | MEDIUM | Acceptance의 배포 산출물(릴리스 컷·Codex 실측)은 이 브랜치의 ship receipt가 봉인된 **뒤**에 발생하므로 어떤 receipt에도 앵커되지 않는다. 마일스톤 종료 조건 5건 중 최소 2건이 게이트 밖에서 자기신고로만 성립한다. | plan:105 "Task 6: 릴리스 컷 (PR 머지 **후**)", plan:146 "컷은 PR 머지 뒤라 이 브랜치의 receipt와 무관", 그런데 plan:161-162는 `git ls-remote … release` 출력과 Codex 세션 stdout을 milestone 종료 필수 산출물로 요구한다. receipt 재봉인은 CLAUDE.md §3.12 no-rehash로 금지되어 사후 앵커링 경로가 없다. |
| invariant | LOW | dry-run 음성 대조가 파일 부재 시 조용히 무의미해진다 — 대상 `~/.codex/config.toml`이 없거나(초기 상태) 읽기 실패면 before 해시가 만들어지지 않아 검사가 통과·실패 어느 쪽도 주장하지 못한다. 백업 경로 역시 부재 시 동작이 미정의다. | plan:130-132 `sha256sum ~/.codex/config.toml > /tmp/cfg.before` … `sha256sum -c /tmp/cfg.before` (부재/에러 분기 없음). plan:80-81은 `--apply` 시 백업을 지시하지만 config.toml 부재 시의 처분을 적지 않는다. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | command-reach.js 전문·harness-ingress.js 전문·scripts/codex-probe/cli.js:90-219를 열어 plan의 여섯 Mirror 인용을 한 줄씩 대조했다. 공격한 축: (1) Task 4가 '검증을 성공 조건에 결속한다'는 주장이 실제로 Codex 도달을 잰는가 — verify()의 root 후보 fall-through와 rootSource 미검사로 반증됨. (2) 같은 Task의 음성 대조가 그 검증기로 성립하는가 — command-reach.js에 trust/hash 참조 0건으로 반증됨. (3) harness 판정 축과 CODEX_HOME의 관계 — 무관함 확인. (4) Codex 캐시 레이아웃 가정 대 M1 실측 경로. (5) Task 1의 멱등 병합이 append-only 프로브 함수를 승격하는 것이 맞는지 — 진단은 정확했고 결함을 찾지 못했다. (6) plugin.json 미선언 결정과 §3.7/PRD 결정 4 정합 — 일치, 결함 없음. (7) Task 6 릴리스 컷 순서(PR 머지 후)와 docs/release-channel.md §2 라벨 실재 — 확인됨, 결함 없음. |
| security | fail | 공격한 것: (1) trust 병합의 신뢰 경계 — `hooks/list` 반환 전량이 승인되는지 원본 `grantHookTrust`/`buildTrustBlock`을 읽어 필터 부재와 `trustStatus` 미검사를 확인. (2) 내구 산출물 유출 — M1이 세운 DD10 관문(`redact-gate.js`)이 신규 producer에 걸리는지, plan의 acceptance가 요구하는 붙여넣기 대상이 절대경로를 담는지를 `cli.js:132-135`·`command-reach.js:235-244`로 대조. (3) 검증 우회 — Task 4가 부르는 `verify()`의 root 후보 우선순위(R-a env > R-d cache)를 읽어 env 제어 false-success 경로를 추적. (4) 백업 파일의 권한/수명을 같은 저장소의 0600 관용구와 대조. 착지하지 못해 보고하지 않은 것: 명령 이름 경로 탈출(`NAME_RE`+realpath containment가 `command-reach.js:39,211-233`에서 이미 닫혀 있다), `-c` dotted-path 주입(PRD가 그 경로를 이미 배제), Task 6 릴리스 컷이 receipt 재봉인을 유발하는지(컷이 PR 머지 뒤라 §3.12 tracked receipt를 건드리지 않음), 프로브의 auth 사본 잔존(M3.5는 auth 사본을 만들지 않는다). |
| test | fail | plan이 인용한 command-reach.js:94-107/264-274, codex-probe/cli.js:96-99/114-127/141-148/160-172, harness-ingress.js resolveHarness, scan-coupling.js 출력 형태를 직접 읽어 인용이 실제로 그 주장을 하는지 대조했다. 두 개의 load-bearing 주장(\\"검증 없이는 exit 0이 나오지 않는다\\", \\"trust 0건이면 exit 비영점\\")을 falsify할 test를 찾다가 검증기가 trust를 전혀 관측하지 않음을 확인했고, Validation 5번 파이프가 숫자에 .length를 쓰는 항진임을 확인했다. Task 1의 멱등성 Validate(두 번 병합=한 번 병합, 무관 섹션 보존)와 Task 3의 sha256 음성 대조는 실제로 대상을 검사하므로 공격에 실패했다. 릴리스 컷(Task 6)의 Validate 명령 경로(docs/release-channel.md §2, version-declaration-guard.js) 실재도 확인했고 결함을 찾지 못했다. |
| invariant | fail | command-reach.js verify()의 후보 순서·폴백을 따라가 Task 4 '도달 검증 결속'이 Codex 미설치 상태에서 Claude 캐시로 충족되는 경로를 재구성했다. harness-ingress.resolveHarness의 unknown 폴백이 그 경로를 실제로 열어 두는지 확인(CLAUDE_PLUGIN_ROOT 미설정 시 unknown → verify 진행). Risks 표의 세 완화 주장을 각각 코드 축에 대조해 trust/발화와 검증 축이 분리돼 있음을 확인. release-channel.md §2~§4를 열어 plan이 인용한 롤백 절과 major 경계 미측정 한정을 대조. Task 3의 dry-run 음성 대조를 파일 부재·에러 입력으로 추적. 반면 mergeTrustBlocks 멱등성 요구, `--apply` 기본 관측, shell:false 인자 배열, plugin.json 미선언(가드 대조)은 공격했으나 결함을 찾지 못했다. |

## Measurement

<!-- Written by plan-review/cli.js record on EVERY exit path, pass or halt.
     Machine-readable; do not hand-edit. A null field means the axis was
     not observed, never that it was zero. -->

```json
{
  "verdict": "divergent",
  "source": "multi-agent",
  "layers": {
    "l1": "converged",
    "l2": "divergent",
    "l3": "divergent"
  },
  "quorum": {
    "responded": 4,
    "required": 3,
    "roles": 4,
    "of": 4,
    "passed": false
  },
  "wall_clock_ms": 550873,
  "halt_stage": "5.2e",
  "backlog_appended": null,
  "backlog_skipped_nonblocking": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:818b2c4d2bb696191f340157d663c50661e93c0bbbf6ee3e106bc7736f5cd72f",
  "plan_path": ".claude/plans/codex-harness-portability-m3_5.plan.md",
  "recorded_at": "2026-09-10T02:16:32.077Z"
}
```
