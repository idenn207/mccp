# Implementation Report: codex-harness-portability M3 — command-reach

## Summary

Codex에서 mccp 명령 **본문에 도달**하는 경로를 배선하고 라이브로 실증했다. 형태는 DD2의
dispatcher 하나이고, 해소는 `command-reach.js`가 설치원을 열거해 얻는다. 라이브 세션이
`plan-prd` 본문의 고유 헤딩을 축자 인용했고, 존재하지 않는 이름으로는 나오지 않았다.

계획 밖의 작업이 하나 있었다 — 게이트가 **재현 가능한 보안 결함**을 찾았고 §3.14가 HIGH를
그 자리에서 흡수하라고 정하므로 닫았다. 그것이 이 사이클에서 가장 큰 단일 변경이다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large | Large — 측정 재설계 3회가 예상 밖 |
| Files Changed | 16 | 14 (`registry.js` 무변경 — DD7대로 신규 토글 0 · `hooks.json` 무변경 — C2 미측정) |
| 라이브 Codex 턴 | 스윕당 1턴 | 8턴 (C2 4회 재측정 + 도달 2회 + 실패 2회) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 0 | 보안 흡수 (계획 밖) | 완료 | 아래 「이탈」 참조 |
| 1 | C축 계측 하네스 | 완료 | `reach-probe.js` + `cli.js reach` + 관문 커버리지 래칫 |
| 2 | 스윕 실행·원자료 | 완료 | `reach-sweep` · `reach-install-path` 2 레코드, 버전 동반 |
| 3 | `command-reach.js` | 완료 | 순수 계산 / fs 검증 분리 (F3 흡수) |
| 4 | `run-command` SKILL.md | 완료 | 2981B · 명령 리터럴 0 |
| 5 | 짝 단언 | 완료 | 14 test |
| 6 | `hooks.json` 중립화 | **무변경 결정** | C2가 `unmeasured` — 미측정 축 위의 편집은 DD4가 금지한 반올림 |
| 7 | 결합 열거 처분 | 완료 | `install-surface-env` defer 유지 · `agent-tool-declaration` → M4 |
| 8 | 라이브 도달 실증 | 완료 | 음성 대조 성립 |
| 9 | 문서·PRD·CHANGELOG | 완료 | |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| 단위 (plan Validation 블록) | 통과 | 117/117 |
| receipt 스위트 전량 | 722/723 | 실패 1건은 **기존** Linux red — 원본 `hash.js`로도 동일하게 실패(대조 확인) |
| hooks + scripts 스위트 | 통과 | 515/515 |
| `hooks.json` 파싱 | 통과 | |
| `env-contract/lint.js` | 통과 | L1~L12 |
| `version-declaration-guard.js` | 통과 | 번호 미선언 (§3.7) |
| 오라클 CLI 왕복 | 통과 | |
| 라이브 도달 | 통과 | 양성 표식 출현 · 음성 대조 미출현 |

### Design Grounding

N/A — 디자인 트리거 미발화(`SKILL_AVAIL=1 · SIGNAL=0`, control-plane 전용 변경).
receipt에 `impeccable_silent_skip` + 사유 `no-signal` 기록.

## Deviations from Plan

**D1 — 보안 흡수가 계획 범위를 넘었다 (의도적, 근거 명시).**
게이트가 재현 가능한 결함을 찾았고 security-reviewer가 범위를 정정했다: 문제는 신규 Codex
ingress가 아니라 **이미 출하 중인 Claude Code 경로 둘**(`receipt-prompt.js:455` ·
`receipt-skill.js:231`)이고, 그 둘은 sanitizer를 거치지 않아 **평문 `--plan /dev/zero`만으로**
무제한 read에 도달했다. 그래서 ingress 4곳이 아니라 공유 초크포인트 `hash.js` 하나를 고쳤다
(`Files to Change`에 없던 파일). 흡수 근거 셋: §3.14가 HIGH를 그 자리에서 흡수하라고 정하고,
단일 초크포인트 수정이 ingress 4곳 수정보다 **작고 안전하며**, 남기면 재현된 도달 가능 결함을
알고도 출하하게 된다.

**D2 — 커맨드 본문의 MCCP-GATE-STOP 규칙을 따르지 않았다.**
`prp-implement.md` 2.5.5는 "CRITICAL/HIGH security finding → MCCP-GATE-STOP"이라 정한다.
멈추지 않았다. 그 규칙은 *제안된 구현*에 구멍이 있을 때 재계획으로 돌려보내는 장치인데, 여기
finding은 **기존 코드**에 있고 이 사이클의 첫 작업이 그것을 닫는 것이었다. 멈추면 재현된
결함이 그대로 남는다.

**D3 — 선행 `mccp-plan-codex` receipt 부재 상태로 진입했다.**
M3 plan은 plan-review 패널도 Plan-Codex 라운드도 거친 적이 없다. 진입은 §1.3 informational
allow-path(missing-only · `MCCP_RECEIPT_GATE_MODE=soft`)와 사용자의 명시 지시로 이뤄졌다.
사용자가 함께 지정한 `MCCP_SKIP_INTENT_GATE`는 **이 경우 기계적 효력이 0**이었다 — 뒤집을
intent verdict가 애초에 없었기 때문이다. plan 본문의 `## Codex Adversarial Review`는 그
사실을 적은 블록으로 남겼고, implement 게이트 산출은 별도 섹션으로 갈랐다.

**D4 — 측정을 세 번 재설계했다.** 아래 「Issues」 참조.

**D5 — `plugin.json` version 미선언** (§3.7 우산 결정 1 — 이탈이 아니라 규칙 준수).

## Issues Encountered

**I1 — C2를 틀린 표면에서 쟀다.** 처음에 `config.toml`의 `[hooks]`에 등록해 "치환 안 됨"을
얻었는데, DD5가 묻는 것은 출하되는 `hooks/hooks.json`이다. `config.toml`에는 plugin 문맥이
없어 치환할 root 자체가 없다. 표면을 고쳐 재측정했다.

**I2 — 스크래치 설치가 발견되지 않았다.** 디렉토리 사본으로는 Codex가 plugin을 인지하지
못한다(3회 실측, 통제까지 미발화). 공식 경로는 `codex plugin marketplace add` →
`codex plugin add`다. 부수 발견: 저장소 `marketplace.json`은 `ref: release`라 **로컬 워크트리가
아니라 릴리스 브랜치**를 설치하므로 dogfood 측정에는 스크래치 marketplace가 필요하다.

**I3 — C2는 결국 열리지 않았다.** 공식 설치(`install_ok=true`) 뒤에도 절대경로 **통제조차**
발화하지 않았다. 통제 없는 미발화는 치환 실패와 hook 배선 실패를 구분하지 못하므로 축은
`unmeasured`로 남겼고, 그래서 Task 6은 무변경이다. 다음에 열 사람이 볼 것은 "plugin
`hooks.json` 경로의 hook이 `codex exec` 비대화형에서 애초에 발화하는가"다.

**I4 — 내 구현의 결함을 내 test가 잡았다.** FIFO의 `open(2)`은 writer를 기다리며 블록하므로
`isFile()` 검사가 `open` 뒤에 있으면 **도달하지 못한다** — 회귀 test (b)가 실제로 멈추면서
드러났다. `O_NONBLOCK`으로 닫았다. 리뷰어가 지적한 것이 아니다.

**I5 — backlog가 내 SKILL.md 버그를 지목했다.** 부모 decision의 plan-review L3
(`id=421bcf19`)가 "`MCCP_HARNESS=codex`와 `CLAUDE_PLUGIN_ROOT`가 함께 있으면 오라클은 codex를
고르는데 제안된 가드는 모두 claude로 끝낸다"고 적었고, 그것이 내 SKILL.md 1단계에 그대로
있었다. 오라클은 옳았다 — 틀린 것은 **본문이 자기 판별을 따로 가진 것**이고, F3이 가르친
형태 그대로였다. 그 술어를 제거하고 회귀 test로 고정했다.

**I6 — `pkill -f`가 자기 셸을 죽였다** (명령줄 자기 매칭). 이후 PID 지정으로 바꿨다.

## Files Changed

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/command-reach.js` | CREATED | 해소 오라클 + CLI shim |
| `plugins/mccp/scripts/lib/tests/command-reach.test.js` | CREATED | 14 test (짝 단언 포함) |
| `plugins/mccp/skills/run-command/SKILL.md` | CREATED | dispatcher |
| `scripts/codex-probe/reach-probe.js` | CREATED | C축 계측 |
| `scripts/tests/redact-gate-coverage.test.js` | CREATED | 관문 우회 래칫 (S7) |
| `plugins/mccp/scripts/receipt/tests/hash-bounded-read.test.js` | CREATED | 초크포인트 회귀 |
| `plugins/mccp/scripts/receipt/hash.js` | UPDATED | **보안** — bounded/비정규 파일 거부 |
| `plugins/mccp/scripts/hooks/receipt-prompt-submit.js` | UPDATED | **보안** — tokenizer 통일 + realpath containment |
| `plugins/mccp/scripts/hooks/tests/receipt-prompt-submit.test.js` | UPDATED | +5 회귀 |
| `scripts/codex-probe/cli.js` | UPDATED | `reach` 배선 + stdin 주석 |
| `scripts/codex-probe/coupling-inventory.js` | UPDATED | 두 항목 처분 확정 |
| `.claude/_meta/data/2026-09-09-codex-harness-truth.json` | UPDATED | C축 원자료 |
| `docs/codex-harness-portability/m3-command-reach.md` | CREATED | 판정 문서 |
| `.claude/prds/…prd.md` · `CHANGELOG.md` · `backlog.md` | UPDATED | |

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `lib/tests/command-reach.test.js` | 14 | 전수 해소 · 미지 이름 · 경로 탈출 · 짝 단언 · 모호 거부 · symlink |
| `receipt/tests/hash-bounded-read.test.js` | 7 | 비정규 파일 · FIFO · 상한 · **해시 불변** · UTF-8 경계 |
| `hooks/tests/receipt-prompt-submit.test.js` | +5 | 따옴표 우회 · tokenizer 공유 · 무손실 왕복 · symlink 탈출 |
| `scripts/tests/redact-gate-coverage.test.js` | 4 | 관문 우회 래칫 |

## Acceptance

- [x] 모든 task 완료 (Task 6은 측정에 근거한 **무변경 결정**)
- [x] Validation 통과
- [x] 패턴 미러 — 오라클은 `harness-ingress.js` 형태, 판정은 measured/unmeasured 둘, 짝 단언은 §3.17 형태
- [x] C1~C5가 `measured` 또는 **이유가 붙은** `unmeasured`이고 양성에 음성 대조가 짝지어져 있다
- [x] `command-reach.js`가 22개 전부 해소하고 미지 이름·경로 탈출을 거부한다
- [x] SKILL.md가 목록도 사본도 갖지 않고 짝 단언으로 고정된다
- [x] **라이브 1회 완주** — 양성 표식 출현, 음성 대조 미출현
- [x] `${CLAUDE_PLUGIN_ROOT}` 축의 판정이 문서에 적혔다 (미측정 → 무변경, 근거 명시)
- [x] 판정 문서에 「주장하지 않는 것」 + "실행 가능성을 주장하지 않는다"

## Next Steps

- [ ] `/mccp:prp-commit` → `/mccp:pr` (PR-Codex는 실제 발화한다 — receipt가 `divergent`라 dedupe 미개방)
- [ ] M4에서 C2 축과 `agent-tool-declaration` 처분
