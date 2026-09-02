# Implementation Report: release-channel-separation M1 — channel-pin

> **STATUS: COMPLETE — 검증 3축(a·b·c) 실측 완료 + 머지 후 배포 경로 확인 완료(2026-09-02).**
> 초판은 `PRE-MERGE — INCOMPLETE`였다. 검증 (b)를 머지 후에만 할 수 있다고 판단했기
> 때문인데, **PR-Codex R1 F1(HIGH)이 그 판단을 반박했고 옳았다** — UI9가 "각 구현의
> 실측 테스트는 marketplace 배포가 아니라 **별도 설치 경로**로 진행한다"고 이미
> 정해 두었고, 그 경로는 머지 전에 성립한다. 아래 Acceptance 5가 그 실측이다.
> 머지 후 같은 명제를 **실제 배포 경로에서** 한 번 더 확인했다(Acceptance 5 말미) —
> main이 `1.34.1`을 선언하는 시점에도 설치는 `1.33.6`/`647dfec`에 고정돼 있었고
> `origin/release`는 전후 동일했다. 확인이 끝났으므로 M1은 완료다.

경로는 전부 `<PLUGINS>` · `<HOME>` 치환형이다(H4). `version` · `gitCommitSha` · exit code ·
CLI 출력 문구는 원문 그대로다 — 치환은 경로에만 적용한다.

## Summary

`.claude-plugin/marketplace.json`의 plugin `source`를 상대 경로 `"./plugins/mccp"`에서
`git-subdir` + `url` + `path` + `ref: release`로 전환했다(`sha` 미pin — UI5). `release`
브랜치를 `647dfec`(v1.33.6)에 세우고 롤백 좌표 태그 `mccp--v1.33.6`을 함께 만들었다.
머지 전 노출 0 창에서 라이브 리허설을 완주해 **git-subdir source가 실제로 fetch한다는 양성
증거**(6a)와 **버전 하향 수용**(6b, PRD OQ1의 답)을 실측했다.

**닫히는 표면은 하나지 둘이 아니다.** `known_marketplaces.json`의 mccp 항목에는 `ref`가 없어
marketplace clone은 계속 main을 추종한다 — 이 리허설에서도 7단계의
`claude plugin marketplace update mccp`가 clone을 main의 `647dfec`로 갱신하는 것으로 같은
실행에서 확인됐다. 즉 `marketplace.json` 자체의 편집은 여전히 머지 즉시 사용자에게 도달한다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium — 다만 plan이 예상 못 한 차단 ref 1건(D1) |
| Files Changed | 9 (표 기준) | 8 변경 + 1 신규(이 보고서) |
| 라이브 검증 | 1회 (a·c 머지 전, b 머지 후) | a·b·c 전부 머지 전 완주(b는 UI9 경로) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | origin/main 병합 + 삭제 사고 검사 | 완료 | 충돌 3건 해소. 삭제 0건, 트리 오염 0건 |
| 2 | 라이브 설치 복구 지점 | 완료 | 포인터 3종 sha256 일치 · 캐시 915파일 개수 일치 · lock + CAS baseline |
| 3 | `release` 브랜치 + 롤백 태그 | 완료 | 차단 ref 1건 선행 해소 필요(D1) |
| 4 | manifest → git-subdir + ref | 완료 | 단언이 변경 전 실패 / 후 통과를 실측(판별력 확인) |
| 5 | README 채널 사실 | 완료 | 설치 명령 diff 0줄 |
| 6 | CLAUDE.md §3.7 번호 소유자 이전 | 완료 | `instruction-contract/lint.js` exit 0 (C1~C4 pass) |
| 7 | version 4면 동기 `1.33.6 → 1.33.7` | 완료 | `i18n-surface.test.js` 10/10 |
| 8 | PRD M1 행 in-progress | 완료 | `pending` 잔여 정확히 2건(M2·M3) |
| 9 | 머지 전 리허설 (검증 a·c) | 완료 | 6a 통과 · 6b 답 확보 · 6c 복원 12초 · 8단계 게이트 PASS |
| 10 | 검증 b | **UI9 별도 설치 경로로 머지 전 실측 완료** | 머지 후 배포 경로 재확인 1건 대기(증거 부재 아님) |
| 11 | 보고서 | 완료 | Acceptance 1~5 전부 실측값 수록 |

## Acceptance 산출물

### 1. Task 9-6a 상향 대조 — 검증 (a)의 유일한 양성 증거

`release`를 feature 브랜치 tip(`8af5e42`)으로 옮긴 뒤:

```
$ git push --force-with-lease=refs/heads/release:647dfecba75eecd9287ee538ca5f7056c7ba71da \
    origin 8af5e4235665a8a1c9cdfdc2f62818f66bde1e3b:refs/heads/release
   647dfec..8af5e42  8af5e4235665a8a1c9cdfdc2f62818f66bde1e3b -> release

$ git ls-remote origin refs/heads/release | cut -f1
8af5e4235665a8a1c9cdfdc2f62818f66bde1e3b

$ claude plugin update mccp@mccp -y
Checking for updates for plugin "mccp@mccp" at user scope…
Plugin "mccp" updated from 1.33.6 to 1.33.7 for scope user. Restart to apply changes.
```

`installed_plugins.json` 발췌:

```json
{ "scope": "user", "version": "1.33.7",
  "gitCommitSha": "8af5e4235665a8a1c9cdfdc2f62818f66bde1e3b",
  "installPath": "<PLUGINS>/cache/mccp/mccp/1.33.7",
  "lastUpdated": "2026-09-01T07:38:21.458Z" }
```

**`version`이 Task 7의 새 번호로, `gitCommitSha`가 feature tip으로 바뀌었다** — git-subdir
source가 실제로 fetch했다는 양성 증거다. 검증 (a) 성립.

baseline(9-5) 발췌를 함께 싣는다. **이것만으로는 이 항목을 충족하지 않는다** — 변경 전
상태와 바이트 동일하기 때문이다:

```json
{ "scope": "user", "version": "1.33.6",
  "gitCommitSha": "647dfecba75eecd9287ee538ca5f7056c7ba71da",
  "installPath": "<PLUGINS>/cache/mccp/mccp/1.33.6",
  "lastUpdated": "2026-09-01T01:12:28.872Z" }
```

### 2. Task 9-6b 하향 왕복 — PRD Open Question 1의 답

**답: CLI는 버전 하향을 수용한다.**

```
$ git merge-base --is-ancestor ab6bcaa 647dfec…      # PRECONDITION OK
$ git push --force-with-lease=refs/heads/release:8af5e4235665a8a1c9cdfdc2f62818f66bde1e3b \
    origin ab6bcaa:refs/heads/release
 + 8af5e42...ab6bcaa ab6bcaa -> release (forced update)

$ claude plugin update mccp@mccp -y
Plugin "mccp" updated from 1.33.7 to 1.33.4 for scope user. Restart to apply changes.
```

```json
{ "version": "1.33.4", "gitCommitSha": "ab6bcaa7b2b5ae975683ad4ad337d68bb3826da5",
  "installPath": "<PLUGINS>/cache/mccp/mccp/1.33.4",
  "lastUpdated": "2026-09-01T07:38:59.277Z" }
```

**이 항목은 OQ1의 답을 기록하는 것이지 (a)를 증명하지 않는다.**

**노출 0 창이었다는 증거**: 이 시점 origin/main의 `marketplace.json`은 아직 상대 경로
`"./plugins/mccp"`였다(이 브랜치는 미머지). 따라서 `release`를 해소하는 소비자는 이 리허설
clone 하나뿐이었다. 독립 확인: origin에 `release` 또는 `mccp--v*`를 트리거로 갖는 워크플로우는
0건이고 `.github/workflows/` 2종 모두 `branches: [main]` 한정이다.

### 3. Task 9-8 채널 좌표 게이트

```
$ git fetch origin release && git rev-parse origin/release
647dfecba75eecd9287ee538ca5f7056c7ba71da
GATE PASS: origin/release == 647dfecba75eecd9287ee538ca5f7056c7ba71da
```

**게이트 스니펫의 정정**: plan `## Validation`(plan.md:386)의 이 단언은 `\n`이 실제 개행이
아니라 리터럴 두 글자로 박혀 있어 `[`가 파싱 실패하고 `||` 분기가 **값과 무관하게 항상**
발화한다(Implement 게이트 security-reviewer가 직접 실행해 재현, HIGH). plan 본문은
`mccp-plan-codex` receipt의 `plan_hash`로 봉인돼 있어 고치면 guard 2가 발동하므로,
**구현이 의미상 의도된 형태를 정확히 실행했다.** 극성은 그대로다(불일치 = HALT):

```bash
git fetch origin release
ACTUAL=$(git rev-parse origin/release)
if [ "$ACTUAL" != "647dfecba75eecd9287ee538ca5f7056c7ba71da" ]; then
  echo "HALT: origin/release is not at the release coordinate (actual=$ACTUAL)"; exit 1
fi
```

plan 본문 정정은 backlog `id=d7d1f4a0`이 보유한다.

### 4. 6c 복원 경로와 소요 시간 — 성공 지표 2

- **경로: (1) `release` force-push + `claude plugin update`.** 대체 경로
  ((2) uninstall+재설치 · (3) 캐시 백업 복원)는 **사용하지 않았다.**
- **소요: 12초** (force-push → update 완료까지 실측).
- **지표 2를 만족시킨 것은 하향 롤백 그 자체다.** 6b가 하향 수용을 확인했으므로 H8이 지적한
  순환(복원이 자기가 검증하려는 가설을 전제한다)은 실측으로 해소됐다 — 대체 경로가 지표를
  대신 충족한 것이 아니다. PRD의 가설("되돌리면 이전 버전이 실제로 설치된다")은 반증되지
  않고 확인됐다.

```
$ claude plugin update mccp@mccp -y
Plugin "mccp" updated from 1.33.4 to 1.33.6 for scope user. Restart to apply changes.
ROLLBACK_ELAPSED_SECONDS=12
```

### 5. Task 10-2와 10-3의 쌍 — **UI9 별도 설치 경로로 머지 전 실측 완료**

Task 10은 이 관측을 머지 후 배포 경로에서 하도록 적었지만, **UI9는 실측을 marketplace
배포가 아니라 별도 설치 경로로 하라고 정한다.** 그 경로에서 같은 명제를 머지 전에
측정했다 — 시험 대상은 동일하다: *"manifest의 `ref: release`가, marketplace source
트리가 앞서 나가도 설치된 plugin 본문을 고정하는가."*

**10-2 — source가 전진해도 설치는 고정된다(채널이 실제로 격리한다).**

```
$ git -C "<PLUGINS>/marketplaces/mccp" rev-parse HEAD
f30316df42b4d1d18d016691b16e82cb347c3922        # source 트리가 전진
$ node -e "…" <clone>/plugins/mccp/.claude-plugin/plugin.json
1.33.7                                          # 그 트리의 plugin.json은 새 번호
$ git rev-parse origin/release
647dfecba75eecd9287ee538ca5f7056c7ba71da        # 채널은 그대로 고정

$ claude plugin update mccp@mccp -y
Checking for updates for plugin "mccp@mccp" at user scope…
mccp is already at the latest version (1.33.6).
```

```json
{ "version": "1.33.6", "gitCommitSha": "647dfecba75eecd9287ee538ca5f7056c7ba71da",
  "installPath": "<PLUGINS>/cache/mccp/mccp/1.33.6",
  "lastUpdated": "2026-09-01T07:39:27.674Z" }
```

**10-3 — 그리고 이것은 update 기구의 사망이 아니다.** 위 무변화가 "채널이 분리됐다"인지
"update가 죽었다"인지는 단독으로 구별되지 않는다. 구별자는 **같은 세션·같은 CLI**로
수행한 6a다: `release`를 feature tip으로 옮기자 같은 명령이 설치를 `1.33.6 → 1.33.7`로,
`gitCommitSha`를 `8af5e42`로 **바꿨다**. 즉 기구는 살아 있고, 10-2의 무변화는 채널이
붙잡고 있기 때문이다. **이 쌍이 성공 지표 3의 실측값이다.**

**이 실측이 재현하지 않는 것(정직한 한정).** 머지 후 시나리오에서는 marketplace clone이
`origin/main`을 따라 **자동으로** 전진한다. 위 실측은 그 전진을 손으로 만들었다(clone을
feature 브랜치로 fetch·checkout). 시험 대상인 *채널 격리*는 동일하지만, *clone이 main을
계속 추종한다*는 성질은 별도이고 그것은 이 마일스톤이 닫지 않는 잔여(H2 · Risks의 "확실
(설계상)" 행)로 이미 기록돼 있다. 머지 후 확인은 그 잔여를 재확인하는 절차로 남는다:

```bash
claude plugin marketplace update mccp && claude plugin update mccp@mccp -y
git -C "<PLUGINS>/marketplaces/mccp" rev-parse HEAD   # == origin/main 이어야 한다
git fetch origin release && git rev-parse origin/release  # 647dfec… 불변
```

**머지 후 확인 — 실행 완료(2026-09-02).** PR #168이 `origin/main`에 머지된 뒤 실제 배포
경로에서 위 블록을 1회 실행했다. 결과는 머지 전 UI9 측정보다 **강하다** — 그 사이 다른
마일스톤이 더 머지되어 main이 선언하는 번호가 `1.34.1`까지 나갔는데도 설치는 움직이지 않았다.

```
$ claude plugin marketplace update mccp
Updating marketplace: mccp...Refreshing marketplace cache (timeout: 120s)…
✔ Successfully updated marketplace: mccp                      # exit 0

$ claude plugin update mccp@mccp -y
Checking for updates for plugin "mccp@mccp" at user scope…
✔ mccp is already at the latest version (1.33.6).             # exit 0
```

관측 **쌍** — 둘을 함께 읽어야 판별력을 갖는다(L2 test HIGH 흡수):

| 축 | 실행 전 | 실행 후 | 판정 |
|---|---|---|---|
| 설치 `version` | `1.33.6` | `1.33.6` | 불변 |
| 설치 `gitCommitSha` | `647dfec…` | `647dfec…` | 불변 |
| 설치 `lastUpdated` | `2026-09-01T07:39:27.674Z` | 동일 | 쓰기조차 없었다 |
| marketplace clone HEAD | `d8aa0d5` | `d8aa0d5` | `== origin/main` |
| main이 선언한 `plugin.json` | — | `1.34.1` | 채널과 4릴리스 벌어짐 |
| `origin/release` | `647dfec…` | `647dfec…` | **전후 동일** — 채널 미접촉의 기계적 증거 |

```json
{ "version": "1.33.6", "gitCommitSha": "647dfecba75eecd9287ee538ca5f7056c7ba71da",
  "installPath": "<PLUGINS>/cache/mccp/mccp/1.33.6",
  "lastUpdated": "2026-09-01T07:39:27.674Z" }
```

`claude plugin list` = `mccp@mccp · Version 1.33.6 · enabled` · `claude plugin validate .`
= exit 0 (경고 1건은 marketplace description 부재로 이 축과 무관한 선재 항목).

**이 실행이 닫은 잔여, 그리고 닫지 않은 것.** 위 "재현하지 않는 것"이 별도로 남겨 둔 성질 —
*clone이 `origin/main`을 자동으로 추종한다* — 의 **결과**가 여기서 관측됐다. 이 세션이 어떤
명령도 내리기 전에 이미 clone HEAD `== origin/main`이었고, 전진을 손으로 만들지 않았다
(BEFORE 측정이 그 시점의 값이다). 다만 정직하게 한정하면 이 실행은 전진의 **결과**를 봤지
전이 **과정**을 지켜보지 않았다 — 언제 어느 기구가 옮겼는지는 측정하지 않았다. 그럼에도
성공 지표 3이 요구한 쌍은 성립한다: 갱신 기구는 사람 개입 없이 최신이고, 그럼에도 설치
본문은 `release`가 붙잡고 있다.

## Validation Results

| Level | Status | Notes |
|---|---|---|
| manifest 형태 단언 | 통과 | 변경 전 FAIL / 후 ok — 판별력 실측 |
| `claude plugin validate .` | 통과 | warning 1(marketplace description 부재, 선재) |
| `git ls-remote` ref 실재 | 통과 | `refs/heads/release` · `refs/tags/mccp--v1.33.6` 둘 다 |
| 채널 좌표 게이트 | 통과 | `origin/release == 647dfec…` |
| 저장소 오염 (`-uall`) | 통과 | 백업 산출물 유입 0건 |
| 4면 동기 (`i18n-surface`) | 통과 | 10/10 |
| `instruction-contract/lint.js` | 통과 | C1~C4 pass · exit 0 |
| 브랜치 삭제 검사 | 통과 | `--diff-filter=D` 0건 |

## Deviations from Plan

**D1 — `refs/heads/release` 생성이 거부됐다 (plan 미상정).** origin에
`refs/heads/release/v0.4.0-version-bump`가 있어 `release`가 ref 네임스페이스에서 디렉토리로
점유돼 있었다(`remote rejected … directory file conflict`). 사실관계: 그 브랜치는 `release/*`
중 유일했고 미머지 커밋이 정확히 1개(`e160eef` — `plugin.json` 0.3.6→0.4.0 + roadmap 항목,
2026-06-11)이며 그 부모 `3924e95`는 main에 있고 현재 main은 1.33.6이라 내용이 완전히 대체된
상태였다. **해소**: 사용자 확인 후 `e160eef`를 태그 `archive/release-v0.4.0-version-bump`로
**먼저 push해 도달성을 영구 보존**하고(태그 실재를 검증한 뒤에) 브랜치를 삭제했다. 이력 손실 0.

**D2 — Task 9 4단계의 HALT 조건이 판별력을 갖지 않아 정지하지 않았다.** 4단계는
"`lastUpdated`가 갱신되지 않으면 멈춘다"고 규정하지만(H6 흡수), 5단계는 같은 시점 기대값이
`1.33.6`/`647dfec`이며 "변경 전 상태와 바이트 동일"이라고 명시한다(H5 흡수). `release`가
바로 그 커밋을 가리키므로 **update가 no-op인 것이 정상 동작**이고, 실측도 그랬다(2회 모두
exit 0 · "already at the latest version (1.33.6)" · `lastUpdated` 불변). 즉 두 흡수가 서로
모순한다. `plan-conflict-detector.js detect` 판정은 **CONFLICT=0**(minor deviation)이었고,
커맨드 본문 규정대로 기록 후 진행했다. 근거: 4단계 HALT가 지키려던 것은 "5단계를 증거로
오독하는 것"인데 5단계는 이미 증거가 아니라고 선언돼 있고, 판별력은 전적으로 6a가 갖는다 —
그리고 6a는 통과했다. **어떤 게이트도 완화하지 않았다.**

**D3 — 모든 force-push에 명시 lease를 썼다 (Implement-Codex F1 흡수).** plan 본문은 인자
없는 `--force-with-lease`를 적었으나, 구현은 매 전이마다 `git ls-remote`로 SHA를 먼저 관측해
`--force-with-lease=refs/heads/release:<관측 SHA>`로 결속하고 push 후 결과 SHA를 다시 읽어
대조했다. 더 엄격한 쪽이다.

**D4 — 리허설 전 구간에 lock + CAS 재검증을 걸었다 (Implement-Codex F3 흡수).**
`<HOME>/.claude/backup/mccp-m1-<ts>/rehearsal.lock`에 PID·host·session·대상 3종 sha256을
봉인하고 각 변경·복원 직전에 재대조했다(불일치 = 즉시 중단). 리허설 시점 peer 세션 5개가
살아 있었다(4개 busy). 타 세션을 정지시키지는 않았다(권한 밖 · 사용자 작업 파괴). 잔여
TOCTOU는 backlog에 기록.

**D5 — `claude` CLI를 절대 경로로 호출했다.** 이 게이트가 쓰는 셸에서 `claude`는 bare
이름으로 해소되지 않는다(PowerShell alias + `<nodejs>/claude.cmd`). 실제 호출 형태는
`"<nodejs>/claude.cmd" plugin …`이다. 위 발췌의 `claude plugin …` 표기는 가독성을 위한
축약이며 실행된 명령은 절대 경로 형태였다.

**D6 — 캐시 supersede 가드를 추가했다.** peer 세션 5개와 이 게이트 자신의 명령 경로가
`<PLUGINS>/cache/mccp/mccp/1.33.6`을 가리키고, PRD가 인용한 문서는
`the old cache entry is superseded`라 적는다. 매 `claude plugin update` 직후 그 디렉토리의
존재를 확인하고 사라졌으면 Task 2 백업에서 즉시 되돌리도록 했다. **실측 결과 발동하지
않았다** — 이 CLI(2.1.252)는 옛 캐시 디렉토리를 지우지 않는다(리허설 종료 시 12개 버전
공존: 1.27.2 · 1.28.1 · 1.29.0 · 1.30.0 · 1.32.2 · 1.32.6 · 1.33.1 · 1.33.2 · 1.33.4 ·
1.33.5 · 1.33.6 · 1.33.7). Risks의 "캐시가 남아 있다고 가정하지 않는다"는 여전히 옳은
보수적 전제이되, 삭제가 관측되지 않았다는 실측을 남긴다.

**D7 — plan 본문에 `## Codex Implementation Review`를 주입하지 않았다.** 주입 즉시
`mccp-plan-codex` receipt의 `plan_hash`가 어긋나 guard 2(staleness)가 발동했다(실측:
validate `stale` 1건 → `ok:false`). 커맨드 본문이 허용하는 대체 경로인
`.claude/notes/release-channel-separation-m1.md`에 기록했고 plan 바이트를 복원해 validate가
다시 `ok:true`가 됨을 확인했다. 상류 게이트에 감사 우회를 쓰지 않는 쪽이 저렴하다.

**D8 — PR-Codex R1이 "미완성 MVP를 배포하지 말라"고 no-ship 판정했고, 그 지적을
흡수해 검증 (b)를 머지 전에 실측했다(F1 HIGH).** 초판 보고서는 Task 10을 구조적으로
이연했는데, F1의 처방이 UI9를 정확히 가리켰다 — 별도 설치 경로. 그 경로로 측정하니
검증 (b)가 머지 전에 성립했다(Acceptance 5). **receipt에는 R1의 실제 verdict인
`divergent`가 그대로 봉인된다** — 흡수를 확인한 라운드가 없으므로 `converged`로 위장하지
않는다(§3.16대로 라운드를 늘리지 않았다). ship은 audited override로 진행하며 그 사유가
PR 본문 `## PR-Codex Override`에 명시된다.

**D9 — PR-Codex R1 F2(MEDIUM)는 §3.14대로 backlog 이연.** F2는 "1.33.7 bump가 UI8(번호
소유자를 브랜치에서 릴리스 컷으로 이전)과 모순된다"고 지적한다. 실재하는 긴장이지만
plan이 의도적으로 해소한 축이다 — Task 7이 이 bump를 **성공 지표 3의 계측 도구**로
명시했고(계측 없이는 F1이 요구한 검증 (b) 자체가 불가능하다 — 두 지적이 서로를 배제한다),
Task 6이 CLAUDE.md §3.7에 "브랜치의 bump는 dogfood 빌드 번호"라고 소유자 이전을 기록했다.
MEDIUM이므로 흡수하지 않고 증거와 함께 이연한다.

## Issues Encountered

- D1의 차단 ref — 사용자 확인 후 태그 보존 + 삭제로 해소.
- plan `## Validation` 채널 좌표 게이트의 리터럴 `\n` 구문 오류 — 구현이 정정 형태로 실행,
  본문 정정은 backlog `id=d7d1f4a0`.

## Tests Written

신규 test 0건. 이 마일스톤의 산출물은 manifest 한 줄과 문서이고, 검증 축은 (i) plan이 정한
형태 직접 단언(변경 전 실패를 실측해 판별력 확인) (ii) 기존 `i18n-surface.test.js`의 4면 파생
단언 (iii) 라이브 리허설이다. `marketplace.json`을 읽는 JS 소비처가 저장소에 없어 단위 test를
걸 표면이 없다(plan Task 4가 같은 이유로 형태 단언을 택했다).

## Evidence Durability — 이력 재작성이 남긴 도달성 결손 (santa-loop R0 HIGH 흡수)

push 직전 유출 게이트를 통과시키려 `filter-branch`로 이력을 재작성하면서, 이 보고서와
ship receipt가 인용하는 커밋들이 **published ref에서 도달 불가**가 됐다. 실측:

| 커밋 | 역할 | 상태 |
|---|---|---|
| `e33a2be` | `mccp-pr-codex` receipt의 `head_sha` | 재작성 전 이력에만 존재 |
| `8af5e42` | 검증 (a) 양성 대조 — 설치 `gitCommitSha`가 이 값으로 이동 | 동일 |
| `f30316d` | 검증 (b) UI9 경로 증거 | 동일 |

셋 다 `git cat-file -t`로는 살아 있으나 `git branch -r --contains` · `git tag --contains`가
비어 있었고, 유일한 보유 ref는 **푸시되지 않은 로컬 브랜치** `backup/pre-leak-rewrite`였다.
§3.12가 ship receipt corpus를 git-tracked로 두는 목적(worktree 삭제 후에도 ledger↔receipt
대조 성립)이 그대로 무력화되는 상태다.

**흡수** — 그 브랜치 tip(`41de628`)에 annotated tag
`archive/release-channel-separation-m1-evidence`를 걸어 이름 있는 ref로 고정했다. 세 커밋
모두 `git tag --contains`로 포함을 확인했다. **receipt는 재봉인하지 않았다** — §3.12
no-rehash 불변식이 이를 금지하며 `head_sha`는 `e33a2be` 그대로다.

도달 가능 등가물(재작성으로 달라진 것은 redact된 경로 문자열뿐):

- `853fc27` ~ `8af5e42`
- `743d7f7` ~ `f30316d`

**태그는 published다 (santa-loop R1 흡수).** 최초 흡수는 태그를 **만들기만 하고 push하지
않았고**, 그럼에도 흡수로 기록돼 있었다 — round 1에서 blind·bundled 두 레인이 독립적으로
같은 HIGH를 제기해 이를 잡았다. 실측 확인:
`git ls-remote origin refs/tags/archive/release-channel-separation-m1-evidence` → `62b20f3`,
그리고 `git tag --contains`가 `e33a2be`·`8af5e42`·`f30316d` 셋 모두에 대해 이 태그를
돌려준다. 이제 fresh clone이 세 커밋을 해소할 수 있고, §3.8대로 worktree를 제거해도
마지막 사본이 사라지지 않는다.

**남는 것 하나.** `--check-ship-verdict`는 여전히
`ok:false / ship-gate-stale-head`를 낸다. 그 원인은 도달성이 아니라 **HEAD 드리프트**다
(receipt는 `e33a2be`에 봉인됐고 그 뒤 `9091831`·`4f4720a`·`df5e52e`가 착지했다). 그리고
`validate-cmd.js:788`의 stale-head 분기는 `:813`의 `pr_codex_force_override`보다 **먼저**
평가되므로 봉인된 audited override로는 풀리지 않는다 — 이 decision slug의 재-ship은 막힌
상태다. PR #168은 **이미 머지됐다**(`2bf60ad` ∈ `origin/main`, 2026-09-01T08:59Z) — 앞선
santa-loop 라운드에서 이 자리에 "아직 열려 있다"고 적은 것은 세션 초 `gh` 응답에 근거한
오기였고 실측으로 정정한다. 머지 경로 자체에는 영향이 없으나, 재-ship이 필요해지면 새
decision slug가 필요하다.

**재발 방지** — ship receipt가 봉인된 뒤에는 브랜치 이력을 재작성하지 않는다. receipt가
`head_sha`를 결속하고 ship gate가 audited override보다 **먼저** 그 결속을 검사하므로,
재작성은 되돌릴 수 없는 결손을 만든다. 유출 redaction이 필요하면 봉인 **전에** 수행한다.

## 경로 유출 — HEAD에서 흡수, 이력은 잔존 (santa-loop R2 HIGH 흡수)

R2의 bundled 레인이 이 사이클이 계정명 포함 홈 경로를 **순증**으로 실었음을 측정으로 보였고,
그 측정을 재현했다: `git grep -l "Users/Administrator" 647dfec` = **2파일**, `HEAD` = **4파일**.
순증 2건은 `.claude/reviews/plan-review-release-channel-separation.md`(인용된 증거 셀 3곳)와
`.claude/state/findings/release-channel-separation.jsonl`(`cited_path` 1곳)이고,
`git check-ignore`는 넷 중 어느 것도 무시하지 않는다.

**탐지가 실패한 이유가 핵심이다.** plan Task 11의 유일한 기계 검사는 **보고서 한 파일만**
grep하므로 0건을 보고하며 통과했다 — L2 security 패널이 backlog `57a9c7db`·`f08c78ac`로
사전에 예측한 그대로다. 즉 게이트가 뚫린 것이 아니라, 게이트가 애초에 그 파일들을 보지 않았다.

**흡수** — 두 파일의 해당 문자열을 `<HOME>` 토큰으로 치환했다(실측 4건 → 0건, JSONL 17행
유효 유지). 형제 파일 `plan-review-…-m1.md:16`이 이미 받은 처리와 동형이다.

**닫히지 않은 것 둘.** (1) PR #168이 이미 머지됐으므로(`2bf60ad` ∈ `origin/main`) **공개
이력에는 그대로 남는다**. 이력 재작성은 처방이 아니다 — 그 행위가 위 Evidence Durability의
도달성 HIGH를 만든 원인이고, §3.12가 ship receipt 봉인 후 금지한다. (2) 재발 방지는 grep
확대가 아니라 **생성물 writer의 write 시점 마스킹**이어야 한다: 유출이 착지한 두 파일은 사람이
쓴 것이 아니라 리뷰 기록 writer와 findings 원장 writer의 산출물이므로, 저자 규율을 요구하는
방식으로는 닫히지 않는다. 두 축 모두 backlog가 소유한다.

선재 2건(`.claude/notes/santa-loop-materialize-m1-implement-codex.md` ·
`plugins/mccp/scripts/lib/santa/ledger.js`)은 `647dfec`에도 존재하므로 이 마일스톤 밖이다.

## Next Steps

- [x] `/mccp:pr` — 진입 직전 §3.7 version 재계산. `1.33.7`로 확정해 PR #168로 ship, 머지 완료.
- [x] 머지 직후 배포 경로에서 Acceptance 5의 확인 블록을 1회 실행 — 완료(2026-09-02). 결과는
      Acceptance 5 말미에 표로 실었다. 설치 `1.33.6`/`647dfec` 불변 · clone HEAD `== origin/main` ·
      `origin/release` 전후 동일.
- [x] PRD M1 행을 `complete`로 올렸다.

남은 것은 이 브랜치의 santa-loop 후속 커밋을 `main`에 반영하는 일뿐이며, M1의 산출물
계약(Acceptance 1~5)은 전부 충족됐다. 다음 마일스톤은 M2(dogfood-install)다.
