# release-channel-separation — main이 곧 배포인 상태를 끝낸다

> 우산 PRD [harness-wiring-integrity](harness-wiring-integrity.prd.md)의 **자식 C0**.
> 그룹 0 — 선행조건 없음. C5·C6·C7·C8·C10의 착수 전제.
> 근거 조사: [2026-08-31-final-harness-assessment-and-umbrella-prd.md](../_meta/2026-08-31-final-harness-assessment-and-umbrella-prd.md) §7

## Problem

**main에 머지하는 행위가 곧 사용자에게 배포하는 행위다.** `.claude-plugin/marketplace.json`의 `source`가 상대 경로(`./plugins/mccp`)라 marketplace clone에 대해 해소되고, 그 clone은 `autoUpdate: true`로 기본 브랜치(main)를 추종한다. 그리고 공식 문서상 `plugin.json`의 `version` 문자열이 업데이트 신호이므로, **버전을 올리는 커밋 하나하나가 사용자에게 보내는 업데이트 신호**다.

그 결과 91일 동안 142개 버전이 사용자에게 제시됐고, 최근 14일은 26건 — 주당 약 13회다. 검증은 배포 **이후에만** 가능하고, 태그가 `v1.0.0` 하나뿐이라 되돌릴 지점이 없다.

대가는 이미 발생했다. 그리고 지금 우산 PRD의 자식 11개가 열리려 하는데 그중 다섯(C5·C6·C7·C8·C10)이 **사용자가 체감하는 게이트 동작 변경**이다. 채널을 나누지 않으면 그 다섯은 미검증 상태로 사용자에게 직행한다.

## Evidence

- **노출 케이던스 실측** — `git log origin/main -- plugins/mccp/.claude-plugin/plugin.json`: 총 **142 커밋**(2026-06-02 ~ 2026-09-01, 91일), 최근 14일 **26건**. 우산 PRD가 적은 "주 2~3회"는 *마일스톤* 수이고, 마일스톤 하나가 여러 bump를 낳으므로(§3.7 forward-only 재상향 · hot-fix bump) 실제 노출은 그 5배다.
- **배포 경로가 코드로 확정됐다** — `known_marketplaces.json`의 mccp 항목은 `{source: "git", url: "https://github.com/idenn207/mccp.git", autoUpdate: true}`이고 `ref`가 없어 기본 브랜치를 추종한다. `installed_plugins.json`은 `version: 1.33.6`, `gitCommitSha: 647dfec` — **origin/main HEAD와 정확히 일치**한다.
- **롤백 지점이 없다** — `git tag -l` 결과 `v1.0.0` 1건. 142개 버전 중 되돌아갈 수 있는 지점이 하나다.
- **실사용 회귀 1건** (운영자 증언, 2026-08~09) — 다른 프로젝트에서 mccp를 쓰던 중, 잘 동작하던 게이트가 버전업 이후 30분 걸리던 작업을 4시간으로 만들었다. **기능 파손이 아니라 소요 시간 약 8배**라 CI red가 잡지 않고 receipt에도 남지 않는다. 어느 버전에서 발생했는지는 특정되지 않았다 — 이 PRD는 그 근인을 밝히지 않고, **그런 회귀가 사용자에게 즉시 도달하는 경로**만 닫는다.
- **외부 사고 보고는 0건이다** — `gh issue list --state all` 8건 전원이 운영자 계정(`madsci207` 7 · `idenn207` 1). 사용자가 없다는 뜻이 아니라(clone·marketplace 등록은 GitHub 지표에 안 잡힌다), **외부 피해를 뒷받침하는 관측이 저장소 안에 없다**는 뜻이다. 위 회귀 1건은 운영자 자신이 사용자 역할일 때 겪은 것이다.
- **스키마가 처방을 지지한다** (공식 문서 — `## References` 참조) — `git-subdir` source는 `url`·`path`·`ref`·`sha`를 받고 `ref`는 브랜치와 태그를 모두 허용한다. 공식 marketplace 291건 중 84건이 `ref`를 쓰고, `ref: "main"` 브랜치 고정 사례가 실재한다(`adobe/skills`).
- **미검증 1건** — `/plugin marketplace update`가 이미 설치된 plugin의 `source` **타입 변경**을 실제로 어떻게 처리하는지는 실행해 보지 않았다. 문서는 "새 source에서 fetch한다"고 적지만 이 저장소에서 재현하지 않았다. `claude` CLI는 이 환경에서 사용 가능하다(`C:\nvm4w\nodejs\claude.ps1`, v2.1.252) — 근거 조사가 "PATH에 없어 실측 불가"라 적은 것은 Bash에서 `.ps1`이 해소되지 않은 것일 뿐이었다.

## Users

- **Primary**: **운영자 본인 — 역할이 둘이고, 사고는 두 번째 역할에서 났다.** (a) mccp 개발자로서 main에 머지하는 사람 (b) **다른 프로젝트에서 mccp를 설치해 쓰는 사용자**로서 그 머지를 그대로 받는 사람. 오늘 (a)의 모든 행위가 (b)에게 검증 없이 도달한다. 트리거는 "게이트를 고쳤는데 다른 프로젝트의 작업이 느려졌다"이다.
- **Secondary**: **clone 또는 marketplace 등록으로 mccp를 쓰는 외부 사용자.** 존재는 운영자 증언이며, 규모·신원·사고 이력은 **관측 불가**다 — GitHub star·fork·외부 issue가 전부 0이다. 이 PRD가 이들에게 약속하는 것은 새 기능이 아니라 **노출 빈도의 감소와 되돌릴 지점의 존재**다.
- **Not for**: mccp를 fork해 자체 개조하는 사용자. 채널 분리는 upstream을 받는 사람에게만 의미가 있다.

## Hypothesis

We believe **배포 채널을 `release` ref로 분리하고 버전 번호의 소유자를 브랜치에서 릴리스 컷으로 옮기는 것**이 **"검증되지 않은 게이트 변경이 머지 즉시 사용자에게 도달하고, 되돌릴 지점이 없다"** 는 문제를 **운영자 본인(다른 프로젝트의 사용자로서)과 외부 사용자** 에게 해소할 것이다.

We'll know we're right when **main에 머지해도 사용자 설치 버전이 변하지 않고, `release`를 이전 커밋으로 되돌린 뒤 `claude plugin update`를 돌리면 그 이전 버전이 실제로 설치되는 것이 한 번 실측될 때**.

## Success Metrics

| # | 지표 | 오늘 | 목표 | 어떻게 측정 | 읽는 주체 → 바꾸는 행동 |
|---|---|---|---|---|---|
| 1 | 사용자 노출 릴리스 수 | **주 13회** (26 / 14일) | PRD 단위 = 2~3주 1회 | `git log release -- plugins/mccp/.claude-plugin/plugin.json` | 운영자 → 초과 시 컷 기준 재검토 |
| 2 | 롤백 소요 | **불가능** (태그 1개) | manifest 편집 + `claude plugin update` 1회 | M1 라이브 검증에서 실측 | 운영자 → 회귀 발생 시 즉시 실행 |
| 3 | main 머지의 사용자 도달 | **즉시** (autoUpdate + version 신호) | **0** — 릴리스 컷 전까지 | 머지 후 `installed_plugins.json`의 `version` 무변화 확인 | 운영자 → 변했으면 채널 분리가 새는 것 |

지표 1의 오늘 값은 실측이고 목표는 §3.7의 기존 bump 기준(PRD 전체 완료 = minor)을 릴리스 경계로 승격한 것이라 **새 규칙이 아니다.** 지표 2·3은 오늘 값이 이진(불가능/즉시)이라 목표도 이진이다 — 근거 없는 숫자를 만들지 않는다.

## Scope

**MVP — M1 단독.** `marketplace.json`을 `git-subdir` + `ref: release`로 전환하고, `release` 브랜치를 **오늘 사용자가 이미 갖고 있는 커밋**(`647dfec` = v1.33.6)에 만들고, 라이브 검증을 1회 수행한다.

M1이 MVP인 이유는 **가설이 M1만으로 검증되기 때문**이다. M2(로컬 dogfood 설치 문서화)와 M3(릴리스 런북)은 채널이 실제로 켜진 뒤에 써야 상상이 아니라 기록이 된다. 특히 M3은 M1의 라이브 검증이 무엇을 했는지 본 다음에 작성한다.

**M1은 사용자 가시 변화 0으로 착지해야 한다.** `release`를 `647dfec`에 고정하면 사용자가 이미 설치한 바로 그 커밋이므로 `version`이 변하지 않고, 문서상 version 문자열이 업데이트 신호이므로 업데이트가 발생하지 않는다. 안전 장치를 켜는 일이 노출을 만들면 자기모순이다.

### 이 PRD가 못박는 결정 3건

| # | 결정 | 근거 |
|---|---|---|
| 1 | **단일 릴리스 라인.** `release` ref 하나만 두고 v1 유지 라인은 만들지 않는다 | 이원 라인은 브랜치마다 "어느 라인인가"를 선언하게 만들어 우산 결정 1이 없앤 조정 비용을 되살린다. 유지 주체가 1명인데 표면이 2배가 된다. "v1에 남고 싶은 사용자"가 실재하는 날 `release-v1` ref를 한 줄 추가하면 그때 생긴다 |
| 2 | **`sha`를 쓰지 않고 `ref`만 둔다.** 릴리스는 `release`를 fast-forward하는 행위다 | 문서상 `sha`가 있으면 `sha`가 유효 핀이 되어 매 릴리스마다 manifest 편집이 필요해진다. `ref`만 두면 브랜치 이동만으로 릴리스가 성립한다. 다만 이 선택은 **불변 핀을 포기하는 것**이므로, 특정 커밋에 못박아야 하는 사고 대응 시에는 `sha`를 일시적으로 추가한다 |
| 3 | **다음 릴리스 컷의 번호는 `2.0.0`이다.** 시점은 운영자가 정하고 내용은 그때 main에 있는 것 전부 | major의 근거는 우산의 크기가 아니라 **배달 계약의 파괴**다 — 사용자 입장에서 "main을 연속으로 받는다"에서 "고정된 릴리스를 받는다"로 바뀌는 것은 §3.7이 말하는 breaking contract이고, 거기에 C5·C6·C7·C10의 게이트 동작 변경이 얹힌다. **단 이 번호는 M1의 산출물이 아니다** — M1은 `release`를 1.33.6에 두고 끝난다 |

### Out of scope

- **v1 유지 라인** — 결정 1. 필요해지는 날 만든다.
- **§3.7 버전 체계 자체의 변경** — 이 PRD는 번호의 **소유자**만 브랜치에서 릴리스 컷으로 옮긴다. major/minor/patch 판정 기준은 그대로다.
- **in-flight worktree 5개의 기존 version 선언 회수** — 이미 선언된 1.32.x~1.33.x는 그대로 두고 dogfood 빌드 번호로 재해석한다. 소급 정리는 병렬 브랜치를 전부 건드려야 해서 비용이 이득을 넘는다.
- **30분 → 4시간 회귀의 근인 규명** — 이 PRD는 그런 회귀가 **즉시 도달하는 경로**만 닫는다. 원인 자체는 별도 축이고, 애초에 어느 버전인지 특정되지 않았다.
- **자식 C1~C10 어느 것의 구현도** — C0는 채널만 만든다.
- **CHANGELOG 구조 변경** — 릴리스 컷이 CHANGELOG를 어떻게 소유하는지는 M3이 정한다. MVP 밖이다.
- **릴리스 자동화(CI에서 tag + fast-forward)** — 수동 절차가 먼저 한 번 돌아야 자동화할 대상이 생긴다.

## Delivery Milestones
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | channel-pin | `marketplace.json`이 `git-subdir` + `ref: release`가 되고 `release` 브랜치가 `647dfec`(v1.33.6)에 선다. **라이브 검증 1회로** (a) source 타입 변경이 설치를 깨지 않고 (b) main 머지가 사용자 version을 바꾸지 않으며 (c) `release`를 되돌리면 이전 버전이 설치되는 것이 실측된다. 사용자 가시 변화 0 | in-progress | [.claude/plans/release-channel-separation-m1.plan.md](../plans/release-channel-separation-m1.plan.md) |
| 2 | dogfood-install | worktree를 가리키는 로컬 설치 절차가 문서화되어 "캐시 직접 복사" workaround(§3.7)가 은퇴한다. 다른 프로젝트에서 main을 시험할 수 있는 경로가 생긴다 | pending | — |
| 3 | release-runbook | 릴리스 컷 절차(version bump → tag → `release` fast-forward → 확인)와 **롤백 절차**가 `docs/release-channel.md`에 기록된다. M1이 실제로 수행한 것을 옮겨 적는다 | pending | — |

소유 파일: `.claude-plugin/marketplace.json` · `README.md` · `docs/release-channel.md`(신설). **어느 in-flight 브랜치도 이 파일들을 소유하지 않는다** — C1·C2·C3·C4와 완전 병렬 가능하다.

## Open Questions

- [ ] **롤백이 version 하향을 요구하는데 Claude Code가 그것을 수용하는가.** 문서는 "users only receive updates when it **changes**"라 적지 실패 조건을 말하지 않는다. 2.0.0에서 1.33.6으로 되돌릴 때 업데이트가 발생하는지 **M1의 라이브 검증이 답해야 한다.** 수용하지 않으면 롤백은 "version을 올리면서 내용을 되돌리는" 형태(예: `2.0.1` = 1.33.6의 코드)가 되고, 그건 결정 3의 번호 정책을 바꾼다.
- [ ] **버전 선언 위치를 `plugin.json`에서 marketplace entry로 옮길 것인가.** 문서상 marketplace entry의 `version`도 업데이트 신호가 될 수 있다. 옮기면 릴리스 컷이 한 파일만 고치고, `plugin.json`은 브랜치가 건드리지 않아 우산 결정 1이 **기계적으로** 강제된다. 옮기지 않으면 결정 1은 관례로만 남는다. 비용·부작용 미조사.
- [ ] **`release`가 fast-forward 불가가 되는 경우의 처리.** main이 rebase되거나 hot-fix가 release에서 먼저 나가면 fast-forward가 깨진다. 그때 강제 이동을 허용할 것인지, 아니면 release를 항상 main의 조상으로 유지할 것인지.
- [ ] **다른 프로젝트에서 운영자가 어느 채널에 있어야 하는가.** 안정을 원하면 `release`지만, 그러면 새 게이트를 실사용으로 검증할 표면이 사라진다(우산 §7.2가 "실사용자는 운영자 자신이면 된다"고 적은 지점). M2가 여기에 답해야 한다.
- [ ] **`autoUpdate: true`를 유지할 것인가.** 유지하면 릴리스가 사용자에게 자동 도달하고, 끄면 명시적 업데이트를 요구한다. 채널 분리 후에는 자동이 안전해지지만 확인 필요.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `source` 타입 변경(상대경로 → `git-subdir`)이 기존 설치를 깨뜨린다. 문서는 "새 source에서 fetch한다"고만 적고 실패 모드를 말하지 않는다 | 중 | **높음** — 운영자 자신의 다른 프로젝트 설치가 깨진다 | M1의 완료 조건이 **라이브 검증**이다. 검증 실패 시 manifest를 되돌리는 것이 곧 롤백이고, 그 시점 `release`는 이미 사용자가 가진 커밋이라 손실이 없다 |
| `ref`만 두고 `sha`를 생략해 릴리스가 되돌릴 수 없는 브랜치 이동이 된다 | 중 | 중 | 릴리스 컷마다 **태그를 함께 찍는다**(오늘 `v1.0.0` 1개뿐인 상태를 끝낸다). 태그가 있으면 `sha` 없이도 되돌릴 좌표가 남는다 |
| 롤백이 version 하향을 요구하는데 CLI가 거부한다 | 중 | **높음** — 이 PRD의 핵심 약속이 성립하지 않는다 | Open Question 1. **M1의 라이브 검증에 롤백 왕복 1회를 포함**한다 — 검증 없이 "롤백이 생겼다"고 주장하지 않는다 |
| 채널을 나눈 뒤 운영자가 릴리스 컷을 잊어 사용자가 몇 달째 1.33.6에 머문다 | **높음** | 중 | 이 위험은 실재하며 M1이 해결하지 않는다. 컷 트리거를 PRD 완료에 결속하는 것은 M3의 런북이 정한다. **"노출 감소"의 실패 모드는 "노출 0"이다** |
| 브랜치가 `plugin.json` version 선언을 멈추기로 했으나 관례로만 강제돼 계속 선언한다 | **높음** | 낮음 | Open Question 2가 기계적 강제 경로(선언 위치 이전)를 조사한다. 그 전까지는 관례이며, 관례가 깨져도 릴리스는 `release` ref가 정하므로 **사용자 피해는 없다** — 비용은 브랜치 간 충돌 재발뿐이다 |
| 우산 PRD가 이 자식을 인질로 잡는다 | 낮음 | 낮음 | 우산 표는 미러링만 한다. C0는 독립 ship·아카이브된다 |

## References

<!-- 외부 조사: 공식 문서 직접 조회 (2026-09-01). /deep-research 미경유 -->

**Claude Code plugin marketplace 스키마** — https://code.claude.com/docs/en/plugin-marketplaces

- source 타입은 상대경로 문자열 · `github` · `url` · `git-subdir` · `npm` · `archive` · `command` 7종.
- `git-subdir`는 `url`(필수) · `path`(필수) · `ref`(선택) · `sha`(선택)를 받는다. **`ref`는 브랜치 또는 태그**이며 생략 시 기본 브랜치.
- **`ref`와 `sha`가 함께 있으면 `sha`가 유효 핀**이다. Claude Code가 해당 커밋을 직접 체크아웃한다.
- **version 의미론** — marketplace entry나 `plugin.json`에 `version`이 선언돼 있으면 **그 문자열이 업데이트 신호**이고 사용자는 그것이 바뀔 때만 업데이트를 받는다. 생략하면 해소된 커밋 SHA가 신호가 되어 커밋이 바뀔 때마다 업데이트된다.
- **marketplace update 동작** — `ref`가 설정된 marketplace는 기본 브랜치가 아니라 **그 ref의 최신 커밋**으로 갱신된다. `sha`로 고정된 커밋은 불변이다. 이미 설치된 plugin의 source 타입·URL·ref가 바뀌면 다음 업데이트에서 새 source로부터 fetch하며, **"there is no rollback mechanism — the old cache entry is superseded"**.
- 즉 **자동 롤백은 존재하지 않는다.** 롤백은 manifest를 되돌리는 수동 행위이며, 그것이 실제로 이전 버전을 설치하는지는 이 저장소에서 검증되지 않았다(Open Question 1).

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-09-01.*
