# Milestone Closure — 4-residual-closure

## Milestone

- ID         : 4-residual-closure
- Name       : residual-closure
- PRD        : .claude/prds/release-channel-separation.prd.md (Delivery Milestones row 4)
- Plan       : .claude/plans/release-channel-separation-m4.plan.md
- Status     : done
- Closed at  : 2026-09-04T08:00:33.341Z
- Closed by  : /mccp:milestone-close (run_id=1be678eb-8c59-4501-8b57-60299bb398c4)

## Acceptance Condition

사용자가 `/goal`에 전달한 조건 원문:

```
M4 acceptance is met: (1) release-manifest-guard.js + its test + release-manifest-gate.yml
exist and the guard exits 0, (2) renderer html.js and markdown.js derive the version from
plugin-version.js with no literal, (3) i18n-surface.test.js and release-manifest-guard.test.js
both pass, (4) plugins/mccp/.claude-plugin/plugin.json has zero diff against origin/main,
(5) the release ref has not moved. Or stop after 8 turns.
```

## Goal Loop Result

**판정 위임.** 사용자는 grammar 대신 "claude 판단으로 진행해줘"로 응답했다. 아래 5축
실측을 근거로 `goal-done`으로 판정한다. 사용자가 타이핑하지 않은 grammar 문자열을 이
자리에 인용하지 않는다 — 없었던 문장을 인용하면 audit trail 자체가 거짓이 된다.

판정 요약 (secret mask 적용 — 치환 0건):

```
five acceptance axes verified: guard trio landed and exits zero with no
violations, both renderer footers derive from plugin-version.js with zero
literals, both test suites re-executed at twenty two passing zero failing,
plugin.json declares nothing, release ref unmoved at 647dfec
```

### 조건 5축 실측

| 축 | 조건 | 결과 | 근거 |
|---|---|---|---|
| 1 | 좌표 가드 3산출물 실재 + 가드 exit 0 | 충족 (**실행 확인**) | 3산출물 실재. lock 해제 후 `node scripts/release-manifest-guard.js --json` 실행 — `ok:true` · `violations: []` · **exit 0** |
| 2 | 렌더러 두 면이 리터럴 없이 파생 | 충족 | `html.js:1425` · `markdown.js:170` 모두 `footerVersionLabel()` (`require('./plugin-version')`). 두 파일에 `1.34.4` 리터럴 0건 |
| 3 | test 2종 통과 | 충족 (**실행 확인**) | lock 해제 후 재실행 — `release-manifest-guard.test.js` **11/11** · `i18n-surface.test.js` **11/11** · 합산 **22/22 · fail 0** |
| 4 | `plugin.json` diff 0줄 | 충족 (직접) | `git diff origin/main...HEAD -- plugins/mccp/.claude-plugin/plugin.json` 출력 없음 (우산 결정 1) |
| 5 | `release` ref 무이동 | 충족 (직접) | `origin/release` = `647dfecba75eecd9287ee538ca5f7056c7ba71da` — M1이 못박은 커밋 그대로 (UI4) |

### 축 1의 7좌표 대조 (가드 상수 ↔ manifest 실측)

| 축 | `release-manifest-guard.js` 기대 | `marketplace.json` 실측 | 판정 |
|---|---|---|---|
| 엔트리 유일성 | `mccp` 정확히 1건 | `plugins[]` 1건 (`name: mccp`) | 일치 |
| `source` 객체성 | 객체 | 객체 | 일치 |
| `source.source` | `git-subdir` | `git-subdir` | 일치 |
| `source.url` | `https://github.com/idenn207/mccp.git` | 동일 | 일치 |
| `source.path` | `plugins/mccp` | 동일 | 일치 |
| `source.ref` | `release` | 동일 | 일치 |
| `sha` 키 | 부재 | 부재 | 일치 |

7축 전건 일치이므로 `violations` 0 — 가드는 exit 0이다. 이는 실행 결과가 아니라
**가드가 무엇을 재는지 읽고 그 입력을 직접 대조한 결과**다.

### 격리 창의 한정과 그 해소 — 두 단계로 검증했다

**1단계 (lock 활성 중, 실행 불가).** goal-phase 격리 lock의 Bash allowlist는 `git` 읽기 ·
`ls`/`cat`/`echo` · lock CLI · `goal-detect`뿐이라 `node`가 default-deny다(M3 closure가
같은 한정을 기록했고, 이는 이 명령의 구조적 성질이다). 그 창에서는 둘을 했다:

1. **독립 재확인** — 가드의 판정 입력(7좌표)을 가드 소스의 상수와 manifest 값으로 직접
   비교했다. 실행 결과에 의존하지 않으므로 전사 신뢰와 무관한 별개 증거다.
2. **전사 + 무변경 증명** — 보고서가 검사 1~13 전건 `exit 0`, 커밋 후 14~16 `ok`를
   전사했다. 그 전사가 잰 트리는 구현 커밋 `82535d0`이고 closure 시점 HEAD는 `a911732`라
   그 사이 4커밋이 있다. `git diff --stat 82535d0..HEAD`로 델타를 읽었다 — 변경 5파일이
   전부 docs/state(`release-channel-separation-m4-report.md` · `codex-findings-backlog.md` ·
   `STATE.md` · `fix-task-applied.md` · `fix-task.md`)이고 `scripts/` · `plugins/` ·
   `.github/workflows/` **무접촉**이다.

**2단계 (lock 해제 후, 실제 실행).** acceptance 조건이 문자 그대로 "exits 0"과 "both
pass"를 요구하므로, Phase 4에서 lock을 해제한 직후 실행해 그 문장을 실제로 성립시켰다:

| 명령 | 결과 |
|---|---|
| `node scripts/release-manifest-guard.js --json` | `ok:true` · `violations: []` · **exit 0** |
| `node --test scripts/tests/release-manifest-guard.test.js` | **11/11 pass · fail 0** |
| `node --test .../renderer/tests/i18n-surface.test.js` | **11/11 pass · fail 0** |
| 위 둘 합산 | **22/22 pass · fail 0** |
| `node scripts/version-declaration-guard.js` | `ok: no version declaration on this branch` · **exit 0** |

보고서의 검사 5(`19/19`)·6(`14/14`)과 위 수치는 모순이 아니다 — 검사 5의 명령은
`i18n-surface.test.js`와 `plugin-version.test.js`를 **함께** 돌리고(11+8=19), 검사 6은
`version-declaration-guard.test.js`(14)다. 두 scope를 그대로 재현해 각각 19/19 · 14/14를
확인했다.

**남는 잔여**: 1단계의 델타 대조는 검사기가 아니라 사람이 읽었다. 다만 2단계가 실행으로
축 1·3을 직접 닫았으므로 그 잔여는 더 이상 판정의 근거가 아니다. 축 4·5는 애초에 이
한정을 받지 않았다 — 둘 다 closure 시점에 `git`으로 직접 측정했다.

### 부수 관측 (이 사이클에서 실측된 명령 본문 drift 2건)

- **Phase 0의 tier 금액 기준이 stale** — 명령 본문은 `critical=$100+` · `warning=$80+`로
  적지만 이 저장소는 `MCCP_HANDOFF_THRESHOLDS_USD=500,800,1000`을 명시 설정했다.
  `cost_usd=548.678179`는 그 설정에서 `notice`이며 enum 이름으로 판정해 continue했다.
  금액이 아니라 enum이 계약이므로 판정은 옳지만, 본문의 괄호 숫자는 더 이상 참이 아니다.
- **Phase 4의 mask 호출 형태가 stale** — 본문은 `mask(...).text`를 쓰지만
  `derive/mask.js#applySecretMask`는 **문자열을 직접 반환**한다(`typeof === 'string'`
  실측). 본문대로 쓰면 `undefined`가 closure에 실린다.

두 건 모두 이 PRD의 소유 축이 아니므로(UI3) 여기 기록만 남긴다.

## Provenance

- Lock run_id        : 1be678eb-8c59-4501-8b57-60299bb398c4
- Lock owner session : ad8b584f-6539-434e-bfd2-b83e9f8e68e8
- Lock path          : .claude/state/goal-phase.lock (lease 90s · exit cleared=true)
- Plan source        : .claude/plans/release-channel-separation-m4.plan.md
- Detection signal   : {"row":4,"name":"residual-closure","plan":".claude/plans/release-channel-separation-m4.plan.md","status":"in-progress"}
- Detection reason   : ok (availability=available · goal_signal=true)
- HEAD at closure    : a9117324255ea460c2b4f0fadab409e4ae380513
- origin/release     : 647dfecba75eecd9287ee538ca5f7056c7ba71da
- Cost tier at entry : notice (cost_usd=548.678179 · 임계 500/800/1000)
- mccp version       : 1.34.4
- Secret mask        : plugins/mccp/scripts/derive/mask.js#applySecretMask (치환 0건)

### Gate note

본 cut은 별도 `mccp-milestone-close-codex` receipt를 발행하지 않는다 (option B). 이 문서
본문과 plan body의 `## Milestone Closure Provenance` sha256 stamp가 다음 `/mccp:pr`의
plan_hash anchor 계산에 포함되어, 변조 시 plan_hash mismatch로 검출된다.
