# Plan Review Panel — release-channel-separation-m1

**Plan**: `.claude/plans/release-channel-separation-m1.plan.md` · **Plan version**: `sha256:de602af7fa4ff017ff0d34b761ee766f62a7d8444ff6a72a7c2a2e8059c26818`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired

> Reason: L2 quorum not satisfied: 5 blocking finding(s): test/HIGH, test/HIGH, test/FAIL, invariant/HIGH — MCCP_REVIEW_SINGLE_PASS=deferred_to_prd_completion 로 진행한다. verdict는 divergent 그대로 봉인된다.

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | MEDIUM | Task 9-4가 신설한 HALT 기준(`lastUpdated` 미갱신이면 멈춘다)은 PRD가 설계상 정상으로 예측하는 상태와 구별되지 않는다. PRD References는 version 문자열이 업데이트 신호이고 '바뀔 때만' 업데이트가 발생한다고 적는데(PRD:112), M1은 release를 사용자가 이미 가진 커밋 647dfec(=1.33.6)에 두어 version 무변화를 UI2의 성공 조건으로 삼는다(PRD:53, plan:42). 즉 step 4의 기대 통과 조건(`lastUpdated` 갱신)이 성립하는지는 'source 타입 변경이 version 무변화에도 재-fetch를 강제하는가'라는 **바로 그 미검증 명제**에 의존한다(PRD:23 '미검증 1건'). 구현자는 정상 경로에서 HALT에 걸릴 수 있고, 그때 판단을 즉석에서 뒤집으면 H6 흡수가 설치하려던 가드가 소멸한다. 관문의 트립 조건과 설계상 정상 상태가 겹친다. | plan:227-231 ("재시도 후에도 update가 비영점으로 끝나거나 `lastUpdated`가 갱신되지 않으면 거기서 멈춘다") vs PRD:112 ("그 문자열이 업데이트 신호이고 사용자는 그것이 바뀔 때만 업데이트를 받는다") + PRD:53 ("`version`이 변하지 않고 … 업데이트가 발생하지 않는다") |
| architect | MEDIUM | `Files to Change` 표가 이 사이클이 실제로 수정하는 파일 하나를 빠뜨렸다 — plan 자신이 세운 규칙(§1.2 dedupe residual 회피 · 착지 vehicle 명시)을 자기 산출물에 불균등하게 적용한 것이다. plan은 L2 흡수로 MEDIUM·LOW 16건을 `.claude/plans/codex-findings-backlog.md`에 적재했고 그 파일은 이 브랜치에서 이미 modified 상태인데, 표에는 없다. 보고서 파일은 같은 근거로 표에 추가됐다(plan:88). | plan:88 ("Acceptance가 이 파일을 요구하는데 표에 없으면 착지 vehicle이 정의되지 않고 §1.2 dedupe 매칭에서 residual로 떨어진다") vs plan:533-534·572·590 (backlog 적재 서술) 및 git status `M .claude/plans/codex-findings-backlog.md`; 실제 적재 행 확인 `.claude/plans/codex-findings-backlog.md:792-798` |
| security | MEDIUM | H4의 '기계 검사'가 유출 클래스를 다 덮지 못한다 — 사용자명이 없는 절대 머신 경로(worktree 루트·툴 경로)는 grep을 통과해 git-tracked 보고서에 그대로 착지한다. plan은 §3.12 meta.cwd 선례를 인용하며 그 축을 닫았다고 주장하지만, 그 선례가 문제 삼은 것이 바로 사용자명 없는 절대 repo 경로였다. | plan Task 11 Validate: `grep -nE "C:\\\\\\\\+Users\|/Users/\|Administrator" .claude/PRPs/reports/release-channel-separation-m1-report.md` 가 0건 — 세 패턴 전부 홈/계정명 기반이다. Task 9·10은 명령 전사를 '그대로 옮겨 적'도록 요구하는데(plan:338-339, 323-324), 그 전사는 이 worktree 루트(`C:\\_project\\mccp\\.worktrees\\c0-release-channel-separation`)를 포함하며 어떤 패턴에도 걸리지 않는다. 같은 클래스가 이미 tracked 산출물에 실린 실례: PRD:23 `C:\\nvm4w\\nodejs\\claude.ps1`. 치환 토큰도 `<PLUGINS>`·`<HOME>` 둘뿐이라(plan:467) repo/툴 경로에는 대응 규칙 자체가 없다. |
| security | MEDIUM | 채널 좌표 게이트가 PR-open 시점에만 결속돼 PR-open → merge 창이 무방비다. 그 창에서 release가 움직이면 머지 순간 미리뷰 코드가 실배포되고, 다음 검사는 머지 **후**인 Task 10이라 이미 배포가 끝난 뒤다. | plan Task 9 Validate: "이 단언이 통과하지 않으면 **PR을 열지 않는다**"(plan:303-304) — 앵커가 PR-open이다. Task 10은 "PR이 main에 머지된 **뒤에** 수행한다"(plan:309). 그 사이 재작업 경로가 plan 안에 실재한다: Task 7이 "`/mccp:pr` 진입 직전에 각각 재계산"(plan:199-200)을 요구하고, Task 9 실패 시 후퇴선(6a 재실행)도 열려 있어 PR-open 이후 release를 다시 움직일 유인이 남는다. H7 흡수(plan:583)는 '세션 단절' 축만 닫았다. |
| test | HIGH | Task 10의 '쌍(pair)' 판별자 (ii)가 자기참조라 '채널 분리'와 'update 기구 사망'을 구별하지 못한다 — 즉 라운드 0에서 흡수했다고 선언한 H5(실패할 수 없는 검사)가 검증 (b)에서 여전히 열려 있다. | plan.md:327-332 — "(ii) 이 실행을 마친 시점에 marketplace clone의 HEAD가 `origin/main`과 **일치**(clone에서 `git rev-parse HEAD` == `git rev-parse origin/main`)". 여기서 `origin/main`은 그 clone 자신의 remote-tracking ref다. update/fetch 기구가 죽으면 HEAD도 tracking ref도 함께 갱신되지 않아 둘은 여전히 같고 단언이 통과한다. plan.md:318-319가 이 단언의 존재 이유로 적은 "update가 죽었다면 clone도 전진하지 않는다"는 명제는 clone 내부 비교로는 관측할 수 없다 — 판별력을 가지려면 저장소 쪽 실제 origin/main SHA(예: `git ls-remote`)와 대조해야 한다. Acceptance 5(plan.md:460-463)와 PRD 성공 지표 3(prd.md:43)이 전부 이 비교에 의존한다. |
| test | HIGH | `## Validation`의 '채널 좌표 게이트'는 셸에서 항상 비영점으로 끝난다 — 리터럴 `\\n`이 명령 안에 박혀 있어 어떤 origin/release SHA에서도 통과할 수 없다. | plan.md:386 — `[ "$(git rev-parse origin/release)" = "647dfec…" ] \\n  \|\| { echo 'HALT: …'; exit 1; }`. 파일에 실제 개행이 아니라 두 문자 `\\`+`n`이 들어 있어 셸은 `[ … ] n \|\| …`을 실행한다. `[`는 `]` 뒤의 추가 인자로 usage 오류(exit 2)를 내므로 `\|\|` 분기가 **항상** 발화한다. Acceptance 3(plan.md:453-455)과 Task 9-8(plan.md:281-289)이 'PR을 열기 전 유일한 리터럴 기대값 단언'으로 지목한 검사가 그 형태 그대로는 실행 불가능하다 — 구현자는 통과시키려면 검사를 다시 쓰게 되고, 그 순간 게이트 문구가 보증하던 것이 사라진다. |
| test | MEDIUM | Task 7이 편집하는 4면 중 CHANGELOG 축은 어떤 Validate도 검사하지 않는다. | plan.md:206 — Task 7의 Validate는 `node --test …/i18n-surface.test.js` 하나뿐인데, 그 파일이 manifest에서 파생해 단언하는 것은 html footer(i18n-surface.test.js:96-103)와 markdown footer(:139-141) 둘뿐이다. `CHANGELOG.md`의 새 항목·`currently \\`X.Y.Z\\`` 노트(plan.md:203-204에 4면으로 열거)는 어느 test에도 걸리지 않아, §3.7이 '재상향 시 다시 어긋난다'고 경고한 축이 무검증으로 남는다. |
| test | LOW | Acceptance의 완료 판정 항목 수가 본문 안에서 셋/다섯으로 엇갈려 '무엇이 있으면 완료인가'가 기계적으로 확정되지 않는다. | plan.md:442 "요구하는 **구체적 산출물**은 다음 셋이고" → 실제 목록은 1~5(plan.md:445-463) → plan.md:465 "다섯 중 하나라도 없으면" → plan.md:466 "이 세 발췌 말고는 측정할 방법이 없고". 같은 단락이 3과 5를 번갈아 쓴다. |
| invariant | HIGH | 검증 (b)의 '쌍' 판정이 실제로는 판별력이 없다 — plan 자신이 두 기구가 독립임을 이미 관측해 놓고, Task 10-3의 marketplace clone 전진을 plugin update 기구 생존의 증거로 삼는다. 두 관측이 모두 참이면서 plugin fetch 경로가 죽어 있을 수 있고, 그러면 '채널 분리 성공'으로 기록된다(성공 지표 3이 측정되는 유일한 지점). | plan:318-319 "이 값만 보면 '채널이 분리됐다'와 'update 기구가 죽었다'가 같은 모습이므로 … clone이 main의 새 커밋으로 전진했다는 관측과 반드시 함께 읽는다 — update가 죽었다면 clone도 전진하지 않는다." 그러나 같은 plan의 Task 9-4는 반대를 적는다: plan:227-228 "clone 교체를 CLI가 못 보면 plugin-catalog-cache.json을 지우고 1회 재시도한다" — clone(marketplace fetch)과 설치 fetch가 서로 독립임을 실측 기반으로 인정한 문장이다. 더해 Task 10 Validate(plan:326-335)에는 `claude plugin update mccp@mccp -y`의 종료코드·`lastUpdated` 갱신에 대한 단언이 하나도 없다(Task 9-4에는 있는 HALT가 Task 10에는 없다). 또한 plan:328-331이 (ii)를 델타가 아니라 절대 일치로 바꾼 결과, session-boot autoUpdate가 이미 전진시켜 둔 clone만으로 (ii)가 충족된다. |
| invariant | MEDIUM | `## Validation`의 채널 좌표 게이트는 문법적으로 깨져 있어 어떤 상태에서도 통과하지 못한다. plan이 '기대값을 리터럴로 갖는 단언은 여기와 Task 9-8뿐'이라고 선언한 바로 그 게이트가, 구현자가 손으로 고쳐야만 돌아가는 형태다 — 게이트를 관대한 방향으로 재작성할 유인이 생기는 지점이고 이를 고정하는 test는 없다. | plan:386 `[ "$(git rev-parse origin/release)" = "647dfec…" ] \\n  \|\| { echo 'HALT: …'; exit 1; }` — 줄바꿈이 아니라 리터럴 `\\n`이 `]` 뒤 인자로 붙어 `[`가 항상 인자 초과로 비영점 종료한다(값과 무관하게 항상 HALT). plan:289 "기대값을 리터럴로 갖는 단언은 여기와 `## Validation`뿐이다" |
| invariant | MEDIUM | Task 9-6a의 명시 HALT 경로가 `release`를 feature tip에 남기고 autoUpdate=false·운영자 설치를 미리뷰 코드에 남긴 채 태스크를 이탈한다 — 복구를 지시하는 문장이 그 분기에 없다. 6c(복원)와 7단계(clone/autoUpdate 복원)와 8단계(좌표 게이트)는 전부 그 뒤에 있다. | plan:252-253 "바뀌지 않으면 (a)는 성립하지 않으며 여기서 멈춘다 — Task 4의 `source`에 `sha`를 추가하는 것이 첫 후퇴선이다." 이 분기에서 6c(plan:262-278)·7단계(plan:279-280)·8단계(plan:281-289)로의 진입이 지시되지 않는다. plan:281은 8단계를 "이 태스크를 떠나기 전 마지막 관문"이라 부르지만 6a HALT는 그 관문을 거치지 않는 이탈 경로다. |
| invariant | LOW | 완료 판정 술어의 항목 수가 자기모순이다 — 같은 Acceptance 블록이 '셋'과 '다섯'을 동시에 주장한다. 완료 게이트의 원소 집합이 문서 안에서 확정되지 않는다. | plan:442-443 "요구하는 **구체적 산출물**은 다음 셋이고, 셋 다 … 실려야 한다" 뒤에 항목 5개(plan:445-463)가 오고, plan:465 "다섯 중 하나라도 없으면 M1은 완료가 아니다", 이어 plan:465-466 "지표 2 … 와 지표 3 … 은 이 **세 발췌** 말고는 측정할 방법이 없고" |
| invariant | LOW | Task 9-6b의 선행 조건 검사에 실패 분기가 없다. 조상이 아닐 때의 동작이 미정의라, 검사가 통과 여부와 무관하게 다음 force-push로 이어질 수 있다. | plan:255-256 "`git merge-base --is-ancestor ab6bcaa 647dfec`로 조상임을 확인한 뒤 `git push --force-with-lease origin ab6bcaa:refs/heads/release`" — 비조상일 때 무엇을 하는지에 대한 서술이 없다(대조: 9-4는 명시 HALT를 갖는다, plan:229-231). |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | 인용 3건을 직접 열어 대조했다 — html.js:1419는 실제로 `<footer … class="page-foot mono">v1.33.1 …` page-foot이고, i18n-surface.test.js:94는 `require('.../plugin.json').version` 파생이며, l1-check.js:229는 read 실패를 `inconclusive` + `E_READ` blocking으로 표면화한다. 셋 다 plan이 주장한 대로다. \\"저장소 어디에도 marketplace.json을 읽는 JS 소비처나 test가 없다\\"(Task 4)는 grep으로 경험적으로 확인했다 — `marketplace.json` 리터럴 매치 0건이라 참이고, 그래서 Task 4에 형태 직접 단언을 둔 것이 옳다. 경계 누수 가설로 `resolve-ecc-root.js:12-19`와 `hooks/bootstrap.js:19-26`의 `['marketplaces','mccp']` 후보가 채널 분리 후 main 트리로 새는지 검사했으나, 그 probe는 `<root>/scripts/lib/utils.js`이고 clone 루트는 `plugins/mccp/` 하위에 두므로 매치되지 않아 누수가 아니다(반증 실패). Task 10의 쌍(10-2 무변화 ∧ 10-3 clone 전진)이 정말 판별력을 갖는지 반례를 구성해 봤다 — manifest 편집이 미적용이면 상대경로 source가 새 번호 N을 설치해 10-2가 붉어지므로 쌍은 실제로 구별한다. Task 3→4 순서, 6a·6b가 옮긴 release를 되돌리는 8단계 좌표 게이트, 6c의 하향-무관 복원 경로(순환 차단), Task 10이 라이브 채널을 건드리지 않는다는 불변식도 각각 깨보려 했으나 노출 창 논증(머지 전에는 release 소비자가 리허설 clone 하나뿐)이 성립해 반증하지 못했다. 남은 두 건은 위 MEDIUM이다. |
| security | pass | 1) H4/H9 유출 축 재공격: `.gitignore`를 직접 읽어 plan의 두 주장(일반 `*.bak` 규칙 없음 — :185 `.gitignore.bak` 단건뿐 / `.claude/PRPs/reports/`가 tracked)이 **참임을 확인**했고, `$HOME/.claude/backup/`이 CLI 스캔 트리(`~/.claude/{plugins,skills,agents,commands}`)와 겹치지 않음도 확인했다 — 여기서는 결함을 못 찾았다. 대신 치환 오라클의 커버리지 결함을 찾아 finding 1로 냈다. 2) 신뢰 경계: `ref`만 두고 `sha`를 버리는 형태가 push 권한자에게 불변 핀 없는 배포를 준다는 축은 PRD 결정 2가 명시 수용 + 태그 좌표로 완화한 잔여라 신규 결함이 아니어서 뺐다. 3) manifest URL 위조/오타 축: `.git/config:9`의 origin이 plan Task 4의 `https://github.com/idenn207/mccp.git`와 **일치**해 반증 실패. 4) `--force-with-lease` 기대값 부재로 인한 오탈취: 6a가 tracking ref를 갱신하므로 6b/6c의 lease가 stale이 되어도 실패 방향(push 거부)이라 escalation 경로가 없다 — finding 아님. 5) `## Validation`의 installPath 치환 node 스니펫: 삼항 조건이 사실상 항상 truthy지만 출력은 여전히 `p.relative` 파생이라 절대경로가 새지 않음 — 반증 실패. 6) Task 9-6a가 운영자 설치에 미리뷰 코드를 넣는 축은 Risks가 의도된 dogfood로 명시하고 6c/8이 복원·게이트로 닫아 소비가 리허설 clone 하나뿐임(main manifest가 아직 상대경로)을 확인 — 반증 실패. 남은 것이 finding 2의 PR-open→merge 창이다. |
| test | fail | plan과 PRD 전문을 읽고 각 Task의 Validate가 그 Task가 바꾸는 것을 실제로 실행하는지 대조했다. (1) Task 4/`## Validation`의 manifest 형태 단언은 실제로 변경 전 트리에서 실패함을 `.claude-plugin/marketplace.json`(현재 `source: \\"./plugins/mccp\\"`, plugins[0] 존재)으로 확인 — 반증 실패, 유효한 검사다. (2) Task 5의 `grep -n \\"release\\" README.md`가 기존 텍스트로 이미 통과하는 비falsifiable 검사인지 의심해 README를 grep했으나 매치 0건이라 falsifiable — 반증 실패. (3) Task 7의 4면 동기를 i18n-surface.test.js:88-141로 대조해 CHANGELOG 축 미커버를 확인(finding 3). (4) 검증 (a)의 양성 대조 6a는 상향이라 CLI 다운그레이드 수용 여부와 독립하고 기대값이 변경 전 상태와 다르므로 판별력 있음 — 반증 실패. (5) 검증 (b)의 쌍 판별자를 추적해 clone 내부 tracking ref 비교의 자기참조성을 발견(finding 1). (6) Validation 블록의 명령들을 문자 단위로 읽어 채널 좌표 게이트의 리터럴 `\\\\n` 결함을 발견(finding 2). L2 흡수표(round 0·1)의 H5·H10 처방이 본문에 실제로 착지했는지도 대조했다. |
| invariant | fail | plan과 PRD 전문, 그리고 인용된 근거(PRD:113 캐시 supersede 문구, PRD Evidence의 known_marketplaces 관측, Delivery Milestones 행 상태)를 대조했다. 공격한 축: (1) 검증 (a)/(b)의 양성 대조가 실제로 판별력을 갖는지 — (b)의 '쌍' 논증이 plan 자신의 9-4 관측과 모순됨을 확인(HIGH). (2) 알려지지 않은 입력의 낙하 방향 — 9-4는 HALT가 있으나 Task 10에는 종료코드·lastUpdated 단언이 없고 6b는 비조상 분기가 없음. (3) HALT 경로의 롤백 실재성 — 6a HALT가 6c/7/8을 우회해 채널·autoUpdate·설치가 오염된 채 이탈. (4) 기대값 리터럴 게이트 2곳(Task 9-8, `## Validation`) — 후자가 항상 실패하는 형태(방향은 fail-closed라 MEDIUM). (5) 완료 술어의 원소 집합 — 셋/다섯 자기모순. (6) 순서 불변식(Task 3 → Task 4, ls-remote 확인)과 머지 후 `release`가 manifest 변경을 포함하지 않는다는 UI2 논증은 공격했으나 결함을 찾지 못했다. (7) H4 치환 규칙과 `git status --untracked-files=all` 축도 훑었으나 fail-open 경로를 찾지 못했다. |

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
    "l3": "not fired"
  },
  "quorum": {
    "responded": 4,
    "required": 3,
    "roles": 4,
    "of": 4,
    "passed": false
  },
  "wall_clock_ms": 257556,
  "halt_stage": null,
  "backlog_appended": 5,
  "backlog_skipped_nonblocking": 10,
  "granted": 4,
  "reviewed_plan_hash": "sha256:de602af7fa4ff017ff0d34b761ee766f62a7d8444ff6a72a7c2a2e8059c26818",
  "plan_path": ".claude/plans/release-channel-separation-m1.plan.md",
  "recorded_at": "2026-09-01T07:04:53.843Z"
}
```
