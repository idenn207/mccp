# Plan Review Panel — release-channel-separation

**Plan**: `.claude/plans/release-channel-separation-m1.plan.md` · **Plan version**: `sha256:ff0b4df4e35b1e98194c79c2d55c174b68f4fc803e59acdc2df96bd579f167b9`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired
**Halted at**: `5.2e`

> Reason: L2 quorum not satisfied: 8 blocking finding(s): architect/HIGH, architect/FAIL, security/HIGH, security/FAIL

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | HIGH | Task 10 c는 프로덕션 배포 채널 자체를 시험대로 쓴다 — `release`를 1.33.4로 force-push하는 동안 manifest는 이미 그 ref를 가리키고 있고 `autoUpdate: true`이므로, 그 창에서 update를 도는 모든 사용자는 실제로 다운그레이드를 받는다. 이는 이 마일스톤이 선언한 불변식(사용자 가시 변화 0)을 M1 자신이 깨는 경로이고, plan의 Risks 표는 이 축을 '운영자가 1.33.4에 남는다'로만 좁게 다뤄 외부 사용자 노출을 아예 열거하지 않는다. plan은 Task 3에서 '브랜치·태그 push는 manifest가 아직 가리키지 않으므로 노출 0'이라고 단계별 노출을 명시적으로 추론하면서, 노출이 실제로 존재하는 유일한 단계에서는 침묵한다. Task 9가 이미 '노출 없이 같은 경로를 시험하는' 기법(clone을 임시로 다른 ref로 돌리기)을 확립했는데 Task 10 c는 그것을 재사용하지 않는다. | plan Task 10-3: `git push --force-with-lease origin ab6bcaa:refs/heads/release` 후 `claude plugin marketplace update mccp` + `claude plugin update mccp@mccp -y`; plan UI2 "M1은 사용자 가시 변화 0으로 착지한다" / UI9 "각 구현의 실측 테스트는 marketplace 배포가 아니라 별도 설치 경로로 진행한다"; PRD:53 "M1은 사용자 가시 변화 0으로 착지해야 한다"; PRD:113 "there is no rollback mechanism — the old cache entry is superseded"; plan Risks 5행은 실패 시 피해 주체를 운영자로만 한정 |
| architect | MEDIUM | 수용 기준이 요구하는 증거 3건 중 2건(Task 10 b·c)은 PR 머지 **이후에만** 생산되는데, 그 증거를 담을 파일(`.claude/PRPs/reports/release-channel-separation-m1-report.md`)이 `Files to Change`에 없고 그것을 main에 착지시킬 후속 vehicle(추가 커밋/PR)도 정의되지 않았다. M3이 '여기서 옮겨 적는다'고 결속된 원재료가 어디에도 커밋되지 않은 채 남을 수 있고, 다음 마일스톤이 붙을 이음매가 비어 있다. 부수적으로 CLAUDE.md §1.2가 요구하는 `Files to Change` ↔ git diff 리터럴 매칭도 이 파일에서 어긋나 residual로 떨어진다. | plan Task 10 "PR이 main에 머지된 **뒤에** 수행한다. 이 태스크가 끝나지 않으면 M1은 완료가 아니다(UI3)" + Task 11의 보고서 경로가 `Files to Change` 표(plan:60-69)에 부재; Acceptance "셋 중 하나라도 없으면 M1은 완료가 아니다" |
| architect | LOW | UI5는 릴리스를 '`release`를 fast-forward하는 행위'로 정의하는데, M1 자신이 그 브랜치를 두 번 비-fast-forward로 되감는다(`--force-with-lease`). 즉 채널의 이동 규약이 실제로는 'force-move 허용'인데 plan은 그 규약 변경을 어디에도 기록하지 않고, PRD Open Question 3(fast-forward 불가 시 처리)은 미결로 남긴 채 실행만 선행한다. | plan UI5 "`sha`를 쓰지 않고 `ref`만 둔다. 릴리스는 `release`를 fast-forward하는 행위다" vs Task 10-3/10-4의 `git push --force-with-lease origin …:refs/heads/release` 2회; PRD:88 Open Question "`release`가 fast-forward 불가가 되는 경우의 처리 … 강제 이동을 허용할 것인지" (미결) |
| security | HIGH | 플랜이 절대 사용자 경로(머신·계정명)를 git-tracked 산출물로 흘려보낸다 — 이 저장소가 이미 sanctioned re-seal까지 치른 leak 유형(§3.12 meta.cwd)을 새 표면에서 재개방한다. `.gitignore`는 `.claude/PRPs/reports/`를 무시하지 않고(receipts 규칙만 26-34행), 기존 report 코퍼스에는 `<HOME>` 문자열이 0건이라 이 leak은 신규다. | plan.md:230 `node -e "console.log(...require('<HOME>/.claude/plugins/installed_plugins.json')...)"` (플랜 파일 자체가 이미 tracked) + Task 9 5단계 "`version` · `gitCommitSha` · `installPath`를 기록한다"(plan.md:165, installPath는 `<HOME>\\.claude\\plugins\\cache\\...` 절대경로) + Task 2 "백업 경로를 구현 보고서에 적는다"(plan.md:89) + Task 10 5단계 "`installed_plugins.json` 발췌를 그대로 옮겨 적는다"(plan.md:195) + Acceptance "셋 다 …report.md에 원문으로 실려야 한다"(plan.md:255-262). 대조: write.js:46-52 `normalizeReceiptCwd` — "Storing the absolute cwd leaked the …" 주석이 같은 유형의 사고 선례. |
| security | MEDIUM | Task 10 3단계가 **사용자가 실제로 추종하는 공개 채널**을 실험 대상으로 삼아, autoUpdate:true인 외부 설치에 v1.33.4로의 사전 고지 없는 다운그레이드를 발행한다. UI2("사용자 가시 변화 0")와 정면 충돌하며, PRD가 인용한 문서상 되돌림 자동화가 없어 창 안에서 갱신한 소비자는 옛 게이트 코드에 남는다. | plan.md:186-189 "`release`를 version이 다른 이전 커밋으로 되돌린다 … `git push --force-with-lease origin ab6bcaa:refs/heads/release`" — 이 시점 manifest는 이미 `ref: release`(Task 4)이고 PRD:18은 `autoUpdate: true`, PRD:113 "there is no rollback mechanism — the old cache entry is superseded". 플랜은 이 창에 대해 어떤 통제(maintenance window·ref 격리·사전 공지)도 두지 않는다. |
| security | MEDIUM | `sha`를 버리면 사용자 측 신뢰 앵커가 **가변 브랜치 하나**가 되는데, 플랜은 태그가 그 대가를 갚는다고 주장한다. 태그는 소비자가 fetch하지 않는 좌표라 소비자 무결성을 전혀 복원하지 않는다 — origin에 대한 어떤 write(유출 토큰·Task 10이 스스로 도입한 force-push 습관)도 전 설치에 조용히 전파된다. 게다가 version 문자열이 갱신 신호이므로, 같은 version을 유지한 채 release를 옮기면 코드가 바뀌고도 사용자에게 신호가 없다. | plan.md:98 "태그는 UI5가 `sha`를 포기한 대가를 갚는 좌표다" vs PRD:111-112 "`ref`와 `sha`가 함께 있으면 `sha`가 유효 핀" · "그 문자열이 업데이트 신호이고 사용자는 그것이 바뀔 때만 업데이트를 받는다". 태그를 소비자 해소 경로에 넣는 단계는 플랜 어디에도 없다(Task 4는 `ref: release`만 쓴다). |
| security | LOW | Task 9가 운영자의 유일한 설치에 **미리뷰 feature 브랜치의 hook 코드**를 설치해 실행시키고, 안전 설정(`autoUpdate`) 복원은 Validate가 검사하지 않는다 — 세션이 중단되면 업데이트 전달이 조용히 꺼진 채 남는다. | plan.md:157-168 (2단계 `autoUpdate`를 `false`로, 3단계 feature 브랜치 체크아웃, 4단계 `claude plugin update mccp@mccp -y`, 6단계 복원) 대비 plan.md:174-176의 Validate는 `version`·`gitCommitSha` 일치만 요구하고 `autoUpdate` 복원 여부를 확인하지 않는다. |
| test | MEDIUM | UI2("M1은 사용자 가시 변화 0")를 반증할 수 있는 관측이 Task 10 c의 노출 창(window)에 대해 존재하지 않는다 — 그 태스크는 머지 후 release 채널에 1.33.4를 실제로 publish한다 | plan L188 `git push --force-with-lease origin ab6bcaa:refs/heads/release` (머지 후 실행, L179) vs plan L24 "UI2 \| M1은 사용자 가시 변화 0으로 착지한다". PRD L28은 외부 사용자 존재를 인정하고 L18은 autoUpdate:true를 실측 확인. 플랜의 Acceptance 3항(L258-262) 어디에도 이 왕복 중 외부 노출을 관측하거나 시간 상한을 두는 항목이 없다. |
| test | LOW | Task 6의 Validate 명령은 그 태스크가 바꾸는 것을 검사하지 않는다 — instruction-contract lint는 heading 이전/소실만 보므로 §3.7 안에 문단 하나를 추가하든 안 하든 항상 exit 0이다 | plan L132가 유일 Validate로 lint.js를 지목하지만 lint.js:10-22는 검사 4종을 `C1 destination exists / C2 anchor exists / C3 resident pointer / C4 no unrouted loss`로 열거한다. 문단 추가는 이 넷 중 어느 것도 건드리지 않는다. |
| test | LOW | 태그 이름 근거로 든 `claude plugin tag` 명명 규약이 저장소·PRD 어디에도 근거가 없다 — 플랜의 다른 외부 주장(L46-56)은 전부 "2026-09-01 실측" 스탬프를 다는데 이 주장만 무근거다 | plan L95-96 "`mccp--v1.33.6` 태그를 찍어 push한다(`claude plugin tag`가 만드는 이름 규약과 같은 형태)". repo 전체 grep 결과 `plugin tag`/`mccp--v` 매칭은 이 플랜 파일 5줄뿐(PRD·docs 0건). |
| test | LOW | Risk 완화 근거가 PRD가 인용한 공식 문서와 충돌한다 — 캐시 잔존을 복구 근거로 삼는데 인용 원문은 old cache entry가 superseded된다고 적는다 | plan L242 "1.33.6 캐시 디렉토리는 디스크에 남아 있다" vs PRD L113 "there is no rollback mechanism — the old cache entry is superseded". |
| test | LOW | Task 11의 Validate는 기계로 확인 불가한 판정을 명령처럼 적어 두어, 실패를 검출할 주체가 없다 | plan L206-207 "보고서가 존재하고 … 예상값을 실측처럼 적은 문장이 0건" — 대응 명령이 Validation 블록(L211-232)에 없다. |
| invariant | HIGH | 채널 분리가 marketplace 매니페스트 표면을 덮지 않는다 — main 머지가 여전히 사용자에게 즉시 도달하는 경로가 남는데 plan/PRD 어디에도 그 잔여가 기록되지 않았다. 성공 지표 3('main 머지의 사용자 도달 0')과 plan 요약의 'main 머지는 더 이상 배포가 아니게 되고'가 그 잔여만큼 거짓이 된다. | PRD .claude/prds/release-channel-separation.prd.md:18 — known_marketplaces.json의 mccp 항목은 `{source:"git", url, autoUpdate:true}`이고 `ref`가 없어 기본 브랜치(main)를 추종한다. plan은 `.claude-plugin/marketplace.json`(plan Files to Change:62)의 plugin `source`만 release로 옮기고, 그 manifest 자체를 담은 marketplace clone은 계속 main에서 갱신된다. 즉 향후 main의 marketplace.json 편집(source/ref/entry version — PRD Open Question 2가 marketplace entry version도 업데이트 신호라고 적음, prd:87/112)은 검증 없이 즉시 사용자에게 도달한다. 이 잔여가 plan의 Risks 표(plan:236-246)에도 Out-of-scope에도 없다. |
| invariant | HIGH | Task 10 c의 롤백 왕복이 라이브 릴리스 채널을 실제로 강등시키므로 UI2('사용자 가시 변화 0')가 M1 안에서 깨진다. 창(window) 경계·차단·공지 어느 것도 없다. | plan:186-194 — `git push --force-with-lease origin ab6bcaa:refs/heads/release` 후 update로 1.33.4를 관측하고 다시 647dfec로 복원한다. 그 사이 `release`를 추종하는 모든 설치(PRD:28이 존재를 명시한 Secondary 외부 사용자 포함, autoUpdate:true)는 1.33.4로 강등된다. plan:99-100은 Task 3의 브랜치/태그 push에 대해서만 '사용자 노출을 만들지 않는다'를 논증하고, 정작 노출을 만드는 Task 10 c에는 같은 논증이 없다. plan:242의 완화도 '운영자가 1.33.4에 남는' 경우만 다루고 제3자 노출을 다루지 않는다. |
| invariant | HIGH | 롤백 좌표가 실제 복구를 보장하지 않는다 — Task 2가 백업하는 것은 포인터 JSON 3개뿐이고, PRD가 인용한 CLI 의미론은 캐시 엔트리가 supersede(파기)된다고 말한다. 포인터를 되돌려도 가리키는 캐시가 없으면 복구가 성립하지 않는다. | plan:86-89 — installed_plugins.json · known_marketplaces.json · plugin-catalog-cache.json 3개만 백업하고 `cache/mccp/mccp/`는 '디렉토리 목록을 기록'만 한다(내용 백업 아님). 반면 PRD:113은 공식 문서를 그대로 인용한다: "there is no rollback mechanism — the old cache entry is superseded". plan:238의 완화('Task 2의 백업 3종이 복구 지점')는 그 인용과 정면으로 어긋나며, 캐시가 supersede된 경우의 복구 경로는 plan 어디에도 없다. |
| invariant | MEDIUM | Task 9의 환경 변조(autoUpdate=false)에 실패-경로 복원 보장이 없다. 중간 실패 시 게이트가 조용히 degrade된 상태(자동 갱신 꺼짐)로 남고, 어떤 Validate도 그것을 검사하지 않는다. | plan:158-159가 `known_marketplaces.json`의 `mccp.autoUpdate`를 false로 두고, 복원은 오직 정상 완주 경로인 6단계(plan:167-168)에만 있다. Task 9의 Validate(plan:174-176)는 `version`·`gitCommitSha`만 대조하고 `autoUpdate` 값의 복원을 확인하지 않는다. 실패 시 지시(plan:170)도 'Task 2 백업으로 복원'인데 그 백업은 변조 후가 아니라 변조 전 시점이라 우연히 맞을 뿐, 명시된 검사 항목이 아니다. |
| invariant | LOW | `--force-with-lease`의 lease 대상이 존재하지 않을 개연성이 있어 롤백 명령이 계획대로 실행되지 않는다(안전 방향이지만 Task 10의 완료 조건이 침묵으로 막힌다). | plan:94는 `release`를 로컬 브랜치 없이 SHA 직접 push로 만든다(`git push origin 647dfec...:refs/heads/release`) — 이 경로는 `refs/remotes/origin/release` 원격 추적 ref를 만들지 않는다. 그런데 plan:188·193은 인자 없는 `--force-with-lease`를 쓰며, 이는 그 추적 ref를 기대값으로 삼는다. 선행 fetch 지시가 plan 어디에도 없다. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | 인용 4건을 직접 열어 대조했다 — `html.js:1419`(page-foot에 v1.33.1 리터럴 실재), `i18n-surface.test.js:94`(기대값이 plugin.json에서 파생됨, plan 주장 그대로), `l1-check.js:229`(읽기 실패를 silent no-op이 아니라 E_READ blocking으로 표면화, 그대로), `.claude-plugin/marketplace.json:9`(현재 상대경로 source). 저장소 전체에서 `marketplace.json`/`./plugins/mccp`를 읽는 런타임 소비처를 grep해 source 타입 변경이 깨뜨릴 코드 결합이 있는지 찾았으나 0건이었고, README 설치 명령 2줄도 실제로 불변임을 확인했다(README:25 marketplace add URL 형태). Task 3→4 순서 주장(ref가 origin에 먼저 존재)도 실제로 정합했고, Task 9 리허설이 '이미 설치된 plugin의 source 타입 변경'을 진짜로 시험한다는 주장도 반증하지 못했다. 깨진 것은 셋이다: (1) Task 10 c가 프로덕션 채널을 시험대로 삼아 UI2/PRD의 노출-0 불변식을 M1 자신이 뚫고 Risks가 그 주체를 열거하지 않음, (2) 머지-이후 증거의 착지 vehicle 부재로 M3 이음매가 비어 있음, (3) fast-forward 규약과 force-push 실행의 불일치가 미기록. |
| security | fail | 플랜을 배포 신뢰경계 관점에서 공격: (1) manifest의 `url`(idenn207/mccp)이 PRD Evidence:18의 실측 known_marketplaces 값 및 marketplace owner와 어긋나는지 대조 — 일치해 finding 아님. (2) `.gitignore` 26-34행을 읽어 `.claude/PRPs/reports/`가 tracked임을 확인하고, 기존 report 코퍼스를 `Users/(Administrator\|ADMINI)`로 grep해 0건임을 확인 → Task 9/10/11이 요구하는 verbatim 발췌가 **신규** 절대경로 leak임을 확정(write.js:46-52의 선례와 동형). (3) Task 3→4 순서 주장(ref 부재로 인한 해소 실패)은 `git ls-remote` Validate로 실제 방어되므로 기각. (4) `claude plugin validate` 스키마 수용 주장은 플랜이 실측이라 표시했고 반증 수단이 없어 기각. (5) 태그가 `sha` 포기를 보상한다는 주장을 PRD References:111-113과 대조해 소비자 해소 경로에 태그가 들어가지 않음을 확인. (6) 경로 traversal·부분상태 신뢰·override 우회 축은 이 플랜이 새 필드를 만들지 않아 도달 경로를 찾지 못했다 — 그 축들은 finding으로 올리지 않았다. |
| test | pass | Task 7의 4면 동기 주장을 i18n-surface.test.js:88-105/135-139로 대조 — 기대값이 plugin.json에서 파생되고 footer 태그에 앵커돼 실제로 drift를 잡는다(반증 실패, 인용 정확). html.js:1419 인용도 리터럴 `v1.33.1 · … 통합 derive`로 정확히 존재함을 확인. marketplace.json에 repo 소비처·test가 있는지 전 저장소 grep — 소비처 0건이라 외부 `claude plugin validate`가 유일 검증인 것은 불가피(결함 아님). Task 5의 `grep -n "release" README.md`가 사전에 이미 매칭돼 무의미한지 확인 — 현재 0건이라 falsifiable(반증 실패). Task 10 b가 "업데이트 자체가 no-op"이라는 대안 가설과 구분되지 않는지 공격 — Task 10 c의 하향 관측이 positive control로 기능하므로 반증 실패. Task 1의 `origin/main...HEAD` 3-dot 의미와 §3.5.1 처방 일치 확인. 남은 것이 위 5건이며 HIGH/CRITICAL은 없다. |
| invariant | fail | plan의 게이트 순서(Task 3 → Task 4 → Task 9 → merge → Task 10)를 실행 순서대로 추적하며 각 지점에서 '알려지지 않은 입력'이 어느 쪽으로 떨어지는지 확인했다. 구체적으로: (1) manifest가 가리키는 ref 부재 경로 — Task 3 선행 + ls-remote로 실제로 닫혀 있어 반증 실패, (2) 4면 version 동기 — i18n-surface.test.js가 manifest 파생이라 리터럴 drift가 기계적으로 잡히므로 반증 실패, (3) PRD ## References 해시 앵커 대 Task 8의 PRD 편집 — 편집 대상이 Delivery Milestones 행이라 앵커 침해 없음, 반증 실패, (4) 백업/복원 경로를 '전부 실패했다' 시나리오로 완주 — 캐시 supersede 인용과 정면 충돌하는 완화 문구를 발견, (5) known_marketplaces.json이 ref 없이 main을 추종한다는 PRD 자기 증거를 plan의 '배포가 아니게 된다' 주장과 대조해 미폐쇄 경로를 발견, (6) Task 10 c의 라이브 force-push가 UI2와 충돌함을 확인, (7) Task 9의 autoUpdate 변조에 대한 복원 단언 부재 확인. |

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
  "wall_clock_ms": 321649,
  "halt_stage": "5.2e",
  "backlog_appended": null,
  "backlog_skipped_nonblocking": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:ff0b4df4e35b1e98194c79c2d55c174b68f4fc803e59acdc2df96bd579f167b9",
  "plan_path": ".claude/plans/release-channel-separation-m1.plan.md",
  "recorded_at": "2026-09-01T05:55:06.267Z"
}
```
