# Implementation Report: codex-harness-portability M1 — harness-truth

## Summary

Codex CLI `0.153.4`에서 mccp hook이 실제로 무엇을 하는지를 **실행으로** 쟀다. 산출은 셋이다 —
재현 가능한 계측 하네스(`scripts/codex-probe/`, 7 모듈 1,317줄) · 판정 문서 · 원자료 JSON.
7축 중 **6축이 `measured`**이고, A1(hook 발화)은 규칙에 따라 `unmeasured`로 남아
**milestone은 닫히지 않았다**(`milestone_closeable.ok = false`).

가장 값나가는 결과 넷:

1. **`Stop`이 실재하고 실제로 발화한다** — PRD OQ2가 닫혔다. stop-loop · auto-handoff ·
   STATE.md 갱신 7건의 처분을 다시 정할 필요가 없다.
2. **mccp의 `hooks.json`은 발견되지만 파싱되지 않는다** — `$schema` 키 하나 때문이고, 그 실패가
   **warning이라 실행은 그대로 진행된다.** 설치는 성공으로 보이고 게이트는 전부 껍데기가 된다(UI15).
3. **`UserPromptExpansion`이 Codex에 없다** — receipt 게이트의 진입점 그 자체다. M2의 문제가 이것이다.
4. **Codex는 hook 자식에 env를 하나도 주입하지 않는다** — `CLAUDE_PLUGIN_ROOT` 미주입,
   세션 id는 env가 아니라 payload로 온다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 10 (표 기준) | 14 (`cli.js`·`redact-gate.js` 추가 + backlog·plan 갱신) |
| 결합 지점 열거 | "여섯을 최소 원소로" | 후보 161건을 **16개 선언**이 덮음. 스캐너가 plan이 놓친 1건을 실제로 찾아냄 |
| 비모델 진입점 | "있으면 그것을 쓴다" | **없다.** 5종 전부 미파싱·미발화 → DD9 fallback(`codex exec`) 사용 |
| 모델 호출 비용 | "최단 프롬프트 1회" | 6회 × 약 3.1k tokens (스키마 역추적에 반복 필요). 원자료에 기록 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | 계측 하네스 골격 | 완료 | 계획의 4파일 → **6파일**. `cli.js`(계획 본문엔 있으나 표에 누락)와 `redact-gate.js`(DD10 신설)를 추가 |
| 2 | 격리 계측 A1~A6 | 완료 | 2-0에서 비모델 경로 부재를 확인하고 `codex exec`로 전환. A1만 미승격 |
| 3 | A3 자동 발견 + A4 trust | 완료 | 둘 다 `measured`. A4가 A1을 막는 원인임을 규명 |
| 4 | 결합 지점 열거 + 스캐너 | 완료 | `unlisted:0` · `fossil:0`. 독립 규칙 4종이 후보 161건 산출 |
| 5 | 판정 문서 + 원자료 | 완료 | 둘 다 DD10 관문 통과 |
| 6 | PRD 갱신 | 완료 | milestone 1 → **`in-progress`**(complete 아님). OQ2 닫음, OQ3 절반, OQ6 사거리 축소, Evidence·Metric 5 정정 |
| 7 | 구현 보고 | 완료 | 이 문서 |

## Validation Results

| # | Check | Status |
|---|---|---|
| 1 | 단위 test (`codex-probe.test.js`) | Pass — 19/19 |
| 2 | 결합 지점 스캔 `unlisted:0` | Pass — exit 0 |
| 3 | 실제 홈 격리 (DD3-b 투영) | Pass — `comparable:true clean:true`, added/removed 0 |
| 4 | 측정 레코드 7축 | Pass — 6 measured / 1 unmeasured, 전부 verdict 있음 |
| 5 | 버전 동반 기록 (UI13) | Pass — `codex-cli 0.153.4` |
| 6 | 배포 표면 무변경 | Pass — `plugins/mccp/` diff 0, worktree 변경 0 |
| 7 | version 미선언 (UI4 · §3.7) | Pass — guard exit 0 |
| 8 | 머지 사고 검증 (§3.5.1) | Pass — 삭제 0 |
| 9 | DD10 관문 (tracked 산출물) | Pass — json clean, md clean |
| 10 | teardown 잔재 | Pass — scratch home 부재, auth 사본 0 |
| — | 저장소 회귀 (`scripts/tests/`) | Pass — 171/171 |

Design Grounding: **N/A (no design trigger)** — `impeccable-detect` `design_signal=false`(silent-skip),
산출 확장자가 `.js`·`.md`·`.json`뿐이라 렌더 surface 0개. Phase 3.6·3.7 모두 no-op.

## Files Changed

| File | Action | Lines |
|---|---|---|
| `scripts/codex-probe/cli.js` | CREATED | +426 |
| `scripts/codex-probe/coupling-inventory.js` | CREATED | +205 |
| `scripts/codex-probe/report.js` | CREATED | +210 |
| `scripts/codex-probe/scan-coupling.js` | CREATED | +193 |
| `scripts/codex-probe/probe-hook.js` | CREATED | +186 |
| `scripts/codex-probe/snapshot.js` | CREATED | +163 |
| `scripts/codex-probe/redact-gate.js` | CREATED | +142 |
| `scripts/tests/codex-probe.test.js` | CREATED | +412 |

> 줄 수는 아래 「코드 리뷰 흡수」 이후 값이다. 리뷰 전 값은 각각 317·205·198·179·161·156·101·216이었다.
| `docs/codex-harness-portability/m1-harness-truth.md` | CREATED | 판정 문서 |
| `.claude/_meta/data/2026-09-09-codex-harness-truth.json` | CREATED | 원자료 |
| `.claude/PRPs/reports/codex-harness-portability-m1-report.md` | CREATED | 이 문서 |
| `.claude/prds/codex-harness-portability.prd.md` | UPDATED | milestone·OQ·Evidence·Metric 정정 |
| `.claude/plans/codex-harness-portability-m1.plan.md` | UPDATED | 게이트 섹션 + 리뷰 흡수 5건 |
| `.claude/plans/codex-findings-backlog.md` | UPDATED | 이연 2행 |

`plugins/mccp/` 아래는 **한 파일도 건드리지 않았다**(UI12). A3에서 `$schema`를 지운 것은
스크래치 홈의 **캐시 사본**이고 저장소 사본은 무변경이다(검증됨).

## Deviations from Plan

1. **`Files to Change`에 `cli.js`가 없었다** — 계획 본문 Task 1은 그 파일을 지시하는데 표에 빠져 있었다.
   security 리뷰 H2가 지적했고, 표에 추가하면서 안전 요건 셋(argv 배열 spawn · 무조건 teardown ·
   stale 회수)을 함께 명시했다.
2. **`redact-gate.js`가 신설됐다** (DD10) — 계획에 없던 파일이다. security 리뷰 C1이
   "redaction이 producer 한 곳에만 걸려 tracked 산출물의 다른 두 생산자가 무검사"임을 지적했고,
   관문을 하나로 모으는 것이 그 구멍을 구조적으로 없애는 유일한 형태였다.
3. **결합 지점이 6개가 아니라 16개다** — 계획은 "여섯을 최소 원소로"라 적었고, 독립 스캐너를
   붙이자 후보가 161건이라 6개로는 `unlisted:0`이 성립하지 않았다. 계획의 범위 안이다.
4. **비모델 진입점 부재로 모델 호출 6회** — 계획 Risks는 "최단 프롬프트 1회"를 상한으로 걸었으나
   스키마 역추적에 반복이 필요했다. 총 약 18.6k tokens이고 원자료에 기록했다.
5. **Phase 2.5.6/2.5.7 순서** — 정상 순서대로 Phase 3 진입 **전에** 수행했다(직전 사이클의 이탈을 반복하지 않음).
6. **implement receipt를 EXECUTE 종료 후 재봉인했다** — Phase 3에서 plan Task 6을 고쳤으므로
   (H6·test-MEDIUM 흡수) 2.5.6 시점의 `plan_hash`가 어긋났다. 이 receipt는 tracked ship receipt가
   아니라 working-tree 진단용이라 재작성이 문서화된 복구 경로이고(§3.12는 ship receipt에 대한 규칙),
   **verdict는 `divergent` 그대로** 다시 봉인했다. 세탁 아님. 최종 `plan_hash`는 현행 plan과 일치한다.

## Issues Encountered

- **`redact.js`의 residual 규칙이 `mccp/tmp/` 안의 `/tmp/`를 부분 일치로 잡는다.** DD10 관문이
  정당한 산출물에 12건의 오탐을 냈다. 같은 파일이 root 패턴에는 경계를 넣어 두고(`/var/tmp` 사례)
  residual 패턴에는 넣지 않은 비대칭이다. 이번에는 **관문을 느슨하게 하지 않고 생산자를 고쳤다** —
  tracked 산출물에 로그 원문 대신 키 투영만 싣는다. 규칙 자체의 오탐은 backlog로 이연한다
  (이 저장소는 `mccp/tmp` 경로를 널리 쓰므로 `scripts/test-suite/`의 `redaction_ok`에도 같은
  오탐이 날 수 있다).
- **첫 A5 측정이 부모 env 상속으로 교란됐다.** `CLAUDE_*` 13개가 섞여 "Codex가 주입했다"와
  "부모가 갖고 있었다"를 구분할 수 없었다. `--clean-env`를 추가해 다시 쟀고, **교란된 값은 인용하지 않는다.**

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `scripts/tests/codex-probe.test.js` | 28 | 승격 관문(증거·버전 결속) · 빈 로그 positive control · env 닫힌 allowlist + secret 억제 + 도달 불가 고정 · argv 접기 · bypass 미승격 · DD10 fail-closed · producer→consumer e2e(실제 자식 프로세스) · mccp 귀속 경계 일치 · 스캐너 독립성/화석/상한 짝 · **아래 리뷰 흡수 9건의 회귀** |

## 코드 리뷰 흡수 (2026-09-09 · `/mccp:code-review` 로컬 모드)

구현 착지 후 로컬 코드 리뷰가 HIGH 1 · MEDIUM 9 · LOW 4를 냈고 **전량 흡수**했다.
§3.14는 HIGH/CRITICAL만 그 자리에서 흡수하라고 정하지만, 이번 건은 사용자 판정으로 전량
수용했다 — 이연분이 없으므로 backlog 신규 행도 없다.

**HIGH — `capture()`가 두 필드를 다르게 다뤘다.** `plugin_cache_entries`는 redactor를 지나고
`config_mccp_keys`는 지나지 않았다. 후자가 "테이블 헤더 이름"이라 경로를 담지 않는다는
**가정** 위에 있었는데, Codex가 스스로 쓰는 trust 헤더가 `[projects."<절대경로>"]`이고 그
경로에 `mccp` 세그먼트가 있으면(=이 저장소에서 프로브를 돌리면 반드시) 귀속 판정이 그것을
잡는다. 실측 재현: `config_mccp_keys -> ["projects.\"<repo 절대경로>\""]`. 결과가 둘로 갈렸다 —
`--out` 없는 기본 호출은 계정명을 stdout으로 뱉었고, `--out`을 주면 DD10 관문이 fail-closed로
거부해 **Task 1의 after 스냅샷을 아예 만들 수 없었다**. 커밋 대기 산출물 4종은 전부 관문을
통과한 상태였으므로 **실제 유출은 0이고 잠복 결함**이었다.

| # | 축 | 무엇이 거짓이었나 | 처치 |
|---|---|---|---|
| M1 | `cli.js` stdout | 관문이 `--out`에만 걸려, "관문이 하나"라는 선언이 **기본 호출 형태**에서 거짓 | `emitGuarded`로 stdout도 같은 오라클 통과 |
| M2 | `EVENT_CANDIDATES` | 측정 **전** 추측 15종이 그대로 남아 실재하는 `PostCompact`·`SubagentStart`·`SubagentStop`을 등록하지 않았다 — 재실행이 문서보다 적게 잰다 | 원자료 `fields_present` 10종으로 교체 + test가 그 JSON에서 기대값을 파생 |
| M3 | TOML 조립 | 이스케이프 없는 문자열 연결 — `\`·`"`가 config를 깨고, 그 실패가 "발화 0"과 **같은 모양**이라 계측기가 자기 측정을 오염 | `tomlBasicString` + 순수 `buildHooksConfig` |
| M4 | `try` 범위 | 0600 auth 사본 생성이 `try` **밖**이라 "모든 종료 경로에서 teardown"이 코드가 아니라 의도의 서술 | `try`를 자원 생성 전체로 확장 |
| M5 | hook 워치독 | 종료 경로가 stdin `end`/`error`뿐 — 호스트가 stdin을 안 닫으면 영원히 산다. hang은 crash보다 나쁘다 | 워치독 + `stdin_truncated` 기록 |
| M6 | DD10 판정 대상 | `typeof x === 'string' ? x : x` — 양 분기가 같아 삼항이 무효였고, 주석이 약속한 "직렬화 형태 검사"가 없었다 | 구조 + 직렬화 **둘 다** 판정 |
| M7 | run lock | `run_id`를 싣고도 대조하지 않아, finally의 `force:true`가 겹친 다른 프로브의 자원을 파괴 | `owner` 인자가 `force`를 이긴다 + 시작 전 preflight |
| M8 | `stderr_head` | 절단은 **앞부분을 남긴다** — 배너의 경로·토큰 조각이 정확히 거기 있다. 절단은 크기 상한이지 유출 통제가 아니다 | redact 후 절단 |
| M9 | test 사각 | `cli.js` 커버리지 0. **HIGH가 정확히 그 사각(`capture`) 안에 있었다** | 아래 회귀 9건 |
| LOW | `revert_integrity` 증거 | trusted 줄이 없으면 `[0]` 하나만 집어 나머지를 지웠다 — 근거 없는 축소 | 로그 전량 인용 |
| LOW | 원자적 쓰기 | `writeFileSync` 직접 — 중간에 죽으면 부분 파일이 통과 산출물과 구분되지 않는다 | tmp(pid+nonce) + rename |
| LOW | `names_only` 공개 | 측정 머신의 **전체 env 이름 목록**이 실리는데 산출물이 그 사실을 말하지 않았다 | `names_only_disclosure` 필드 |
| LOW | 스캐너 순회 | `node_modules`·깊이 무제한 — 후보 수가 설치 상태를 추종하면 래칫이 무의미 | `SKIP_DIRS` + 깊이 상한 (실측 161 불변) |

**회귀가 tautology가 아님을 음성 통제로 확인했다.** 수정을 하나씩 되돌려 해당 test가
red가 되는 것을 실행으로 봤다 — H1(`.map(redact)` 제거 → `not ok 20`) · M2(`PostCompact`
제거 → `not ok 22`) · M3(백슬래시 치환 제거 → `not ok 23`) · M7(owner 분기 제거 → `not ok 26`).
M6은 통제가 test 안에 있다(`gate.inspect(payload).ok === true`가 구조 순회의 사각을 먼저 단언한다).

## 미충족

**반올림 없이 열거한다.**

- **A1 hook 발화 — `unmeasured`.** 발화 6건을 보았으나 전부 `--dangerously-bypass-hook-trust` 하였다.
  비대화형 trust 승인 경로를 찾지 못했고, 찾기 전에는 "게이트가 신뢰 절차를 지나 발화한다"를
  주장할 수 없다. **milestone 1은 이 때문에 닫히지 않았다.**
- **발화하지 않은 이벤트 4종** — `PreCompact` · `PostCompact` · `SubagentStart` · `SubagentStop`은
  config가 받지만 한 턴짜리 `exec`에서 도달하지 않았다. 수용 확인, 발화 미확인.
- **대화형 세션 미측정** — 전 측정이 `codex exec`(비대화형)다. TTY 세션의 trust 프롬프트와
  hook 거동은 재지 않았다.
- **이벤트 enum 완전성 미보장** — 29개 이름을 시험해 부재를 확인했을 뿐, 시험하지 않은 이름이 있을 수 있다.
- **결합 지점 열거는 규칙 집합 안에서만 완전하다** — `scan-coupling.js`의 닫힌 규칙 4종이 보는
  범위 밖의 결합 형태는 여전히 보이지 않는다. 그 한계를 없앴다고 주장하지 않는다.
- **선행 `mccp-plan-codex` receipt 부재** — 슬러그 불일치(`codex-harness-portability` vs `…-m1`)로
  chain이 끊겨 있고, 이 사이클은 사용자 지정 감사 우회(`MCCP_SKIP_RECEIPT=1` ·
  `MCCP_SKIP_INTENT_GATE="implement 단계에서 검토된 6개 수정까지 진행"`)로 진입했다.
- **Implement-Codex verdict = `divergent`** — 리뷰어가 "이 tree에 구현이 없다"고 답했고(게이트가
  EXECUTE 앞에 있으므로 구조적), 그 verdict를 그대로 봉인했다. cross-gate dedupe가 닫힌 채 남으므로
  `/mccp:pr`에서 PR-Codex가 실제 diff에 대해 반드시 발화한다.

## Next Steps

- [ ] `/mccp:code-review` 또는 `/mccp:prp-commit` → `/mccp:pr`
- [ ] M2 진입 시 **첫 작업**: `plugins/mccp/hooks/hooks.json`의 `$schema` 제거 (1행, 이것 없이는 전 게이트가 껍데기)
- [ ] M2: receipt 게이트의 대체 ingress 선정 (`UserPromptExpansion` 부재)
- [ ] M2: 비대화형 trust 승인 경로 조사 — A1을 `measured`로 올려 milestone 1을 닫는다
