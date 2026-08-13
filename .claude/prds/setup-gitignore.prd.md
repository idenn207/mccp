# /mccp:setup gitignore 프로비저닝 (H1)

> 우산: [review-loop-trust.prd.md](review-loop-trust.prd.md) — day 0 병렬. 리뷰 루프 축과 의존 없음.
> 원 제기: 운영자 항목 0

## Problem

mccp를 설치하면 hook·게이트·orchestration이 즉시 런타임 산출물을 쓰기 시작한다 — receipt·lock·counter·cache·hook-trace·dispatch envelope 등. 그런데 `/mccp:setup`은 **의존성만 설치하고 `.gitignore`는 손대지 않는다**. 결과적으로 신규 설치자는 어떤 경로가 커밋 대상이고 어떤 것이 세션 로컬인지를 **스스로 재발명**해야 하고, 그 전까지 working tree가 런타임 쓰레기로 오염되거나 반대로 커밋해야 할 ship receipt를 무시해버린다.

방치 비용: 설치 직후 첫 커밋이 오염되고, 그 오염을 되돌리는 비용이 온보딩 이탈로 이어진다. 이 repo가 dogfood로 축적한 지식이 제품 표면에 전혀 노출돼 있지 않다.

## Evidence

- [setup.md](../../plugins/mccp/commands/setup.md) 5개 Phase — Detect / codex 설치 / impeccable 설치 / `/codex:setup` 체인 / 보고. **`.gitignore` 축이 어디에도 없다.**
- 반면 이 repo의 `.gitignore`(138행)는 mccp 런타임 항목만 **약 20종**을 담고 있다: `.claude/receipts/*` + ship receipt 예외 3줄 · `.claude/state/*.lock` · `loop-counter.json` · `orchestration-runaway.json` · `**/.claude/state/hook-trace/` · `hook-caps.json` · `.claude/cache/` · `.claude/state/dispatches/` · `.claude/state/evidence-claims/` · `.worktrees/` 등.
- **규칙이 자명하지 않다** — receipt는 `.claude/receipts/*`를 무시하되 `!.claude/receipts/mccp-pr-codex/`를 재포함하고 그 안의 `*.lock`·`*.tmp`만 다시 무시하는 3단 구조다(증거 내구성 계약, CLAUDE.md §3.12). 이걸 사용자가 유추할 방법은 없다.
- hook-trace는 `**/.claude/state/hook-trace/` 처럼 **root-anchored가 아닌 패턴**이어야 한다는 주석이 `.gitignore`에 붙어 있다 — worktree 하위를 놓치기 때문. 이런 함정은 문서 없이 재현 불가능.

## Users

- **Primary**: mccp를 처음 설치하는 사용자 — `/mccp:setup` 직후 첫 `git status`에서 정체 불명 파일을 보게 되는 시점.
- **Secondary**: 기존 사용자 — 새 버전이 새 런타임 경로를 추가했을 때(예: `.claude/state/dispatches/`가 v1.2.0에 신설).
- **Not for**: 이 repo 자신 — 이미 완비돼 있다. 산출물은 **다른 프로젝트에 mccp를 설치할 때** 가치가 있다.

## Hypothesis

We believe **`/mccp:setup`이 mccp 런타임 산출물의 무시 규칙을 대상 저장소의 `.gitignore`에 멱등적으로 병합하는 것**이 **신규 설치자가 규칙을 재발명하지 않고 첫 커밋을 깨끗하게 만드는 데** 유효하다 — for **mccp 신규 설치자**.
We'll know we're right when **설치 직후 `git status`에 mccp 런타임 산출물이 나타나지 않으면서, ship receipt(`mccp-pr-codex`)는 여전히 추적 대상으로 남을 때**.

## Success Metrics

| Metric | Target | How measured |
|---|---|---|
| **[primary] 설치 후 오염 0** | 설치 + 게이트 1회 실행 후 `git status`에 런타임 산출물 0건 | fresh clone 시나리오 test |
| ship receipt 보존 | `.claude/receipts/mccp-pr-codex/`가 무시되지 않음 | 동일 시나리오에서 tracked 확인 |
| 멱등성 | 재실행 시 중복 줄 추가 0 | 2회 연속 실행 diff |
| 기존 `.gitignore` 무손상 | 사용자 기존 규칙 변경·삭제 0 | 병합 전후 대조 test |
| `--dry-run` 정합 | dry-run이 실제 실행과 같은 계획을 보고 | 두 모드 출력 비교 |

## Scope

**MVP** — `/mccp:setup`에 gitignore 프로비저닝 Phase를 추가한다. mccp 런타임 규칙 블록을 **명확한 구분 마커로 감싸** 대상 `.gitignore`에 append하고, 이미 존재하면 블록 내부만 갱신한다. 사용자 기존 줄은 절대 건드리지 않는다. `--dry-run`은 추가될 줄을 보여주고 쓰지 않는다.

**Out of scope**

- **사용자 기존 규칙의 정리·중복 제거** — 남의 파일을 재작성하지 않는다. 중복이 생겨도 git이 무해하게 처리한다.
- **`.gitignore` 외 무시 채널**(`.git/info/exclude`, global gitignore) — 공유돼야 의미가 있으므로 저장소 `.gitignore`가 정본.
- **비-git 저장소 지원** — git이 아니면 skip + 보고.
- **런타임 경로 목록의 자동 도출** — 코드에서 경로를 스캔해 추론하는 것은 오탐이 크다. **정본 목록을 명시적으로 관리**하고, 새 경로 추가 시 갱신하는 것을 규율로 둔다.
- **기존 오염 파일의 untrack** — 이미 커밋된 것을 지우는 것은 파괴적. 감지 시 안내만.

## Delivery Milestones

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | gitignore 프로비저닝 Phase | 신규 설치자가 `/mccp:setup` 한 번으로 무시 규칙을 얻고, 첫 커밋이 오염되지 않음 | pending | — |

## Open Questions

- [ ] **정본 목록의 소유처** — `.gitignore` 블록을 어디서 관리할지. 후보: plugin 내 템플릿 파일 / `dep-check.js` 인접 모듈 / 이 repo의 `.gitignore`에서 마커 구간을 추출. 마지막은 dogfood와 제품이 자동 동기화되나 이 repo 고유 규칙이 새어 나갈 위험.
- [ ] **기존 오염 감지 범위** — 이미 tracked인 런타임 파일을 감지해 안내할지. 감지는 유용하나 `--dry-run` 없이 실행하면 놀랄 수 있다.
- [ ] **ship receipt 예외의 조건성** — `mccp-pr-codex` 추적은 증거 내구성 계약(§3.12)의 결정이다. 다른 프로젝트가 이 계약을 원하지 않을 수 있으므로 opt-out을 둘지.
- [ ] **버전 간 경로 추가 시 재실행 유도** — v1.2.0이 `dispatches/`를 신설했듯 새 경로가 생기면 기존 사용자는 재실행해야 안다. 알릴 채널이 없다.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 사용자 `.gitignore`를 손상시킨다 | Low | High | append + 마커 구간 갱신만. 기존 줄 파싱·재작성 금지. 쓰기 전 `.bak`(설치 명령의 기존 `settings-writer.js` 선례와 동일) |
| ship receipt까지 무시해 증거 corpus가 사라진다 | Low | **Critical** | 예외 규칙(`!.claude/receipts/mccp-pr-codex/`)을 지표로 test. 순서가 뒤바뀌면 negative pattern이 무력화되므로 **줄 순서까지 단언** |
| 정본 목록이 코드와 어긋난다 (새 경로 누락) | High | Medium | 이 repo `.gitignore`와 정본 목록을 대조하는 lint를 test에 포함. 어긋나면 red |
| 비-git / worktree 하위 설치에서 오동작 | Medium | Medium | `git rev-parse --show-toplevel` 기준으로 대상 결정. 실패 시 skip + 보고 |

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-08-12.*
