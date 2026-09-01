# receipt 지속성·finding 정본의 설계 의도 역추적 — 직전 판정의 정정

**Status**: active
**Date**: 2026-08-31
**Topic**: receipt 지속성·finding 정본의 설계 의도 역추적 — 직전 판정의 정정

## Premises

| # | 참조 | 시점 | 무엇을 전제하는가 |
|---|---|---|---|
| 1 | .gitignore | d1db647 | `:26-34`가 `.claude/receipts/*`를 무시하고 `mccp-pr-codex/`만 해제한다. `:86-88`이 journal 무시 사유를 "per-session-append JSONL을 tracked하면 모든 PR의 충돌 표면이 된다 — §3.12가 ship receipt만 추적할 때 내린 것과 같은 판단"으로 적어, plan/implement 무시의 사유를 **귀속으로** 밝힌다 |
| 2 | docs/multi-session-work-loop/evidence-conflict-design.md | d1db647 | `:308`이 비대칭의 목적을 명문화한다 — "fresh clone이 항상 대조 대상 부재이면 저장소를 새로 받은 누구도 술어 결함(E1)을 발견할 수 없다". 목적은 **ledger↔receipt 대조 가능성**이지 finding 보존이 아니다 |
| 3 | plugins/mccp/scripts/receipt/write.js | d1db647 | `:392`가 `--findings-file`을, `:393-394`가 `defaultResolution = { converged: true, rounds: 1, ... }`를 갖는다. `:543-546`은 `MCCP_SKIP_RECEIPT` bypass 시 `skipReason`을 자동 stamp한다 |
| 4 | plugins/mccp/commands/pr.md | d1db647 | `:1294`가 PR body의 `## Codex Review` 섹션을 "Audit canonical"로 지정한다 — finding 원문의 정본이 receipt가 아니라 PR body임을 명시 |
| 5 | plugins/mccp/commands/plan.md | d1db647 | `:1883`이 패널 finding 전문의 정본을 git-tracked `.claude/reviews/`로 지정하고, `:1718-1727`이 그 설계 이유를 산문으로 적는다 |
| 6 | plugins/mccp/scripts/state/findings-registry.js | d1db647 | git-tracked `.claude/state/findings/<work_unit>.jsonl`에 구조화 finding lifecycle을 기록한다(M7 — "세션 경계 유실을 닫는다") |
| 7 | .claude/plans/codex-findings-backlog.md | d1db647 | 790줄 이연 원장. `:119`가 override receipt가 서사로만 언급한 "PR-Codex round 6" F1을 증거·이연 근거와 함께 기록한다 |
| 8 | plugins/mccp/scripts/lib/plan-review/corpus.js | d1db647 | `:112`가 quorum 자연 실험의 분할점을 `794c4de`로 적는다 |
| 9 | plugins/mccp/scripts/lib/tests/santa-seal.test.js | d1db647 | `:22` `execFileSync` · `:39` git 호출 · `:128` `process.execPath` 호출. 이 파일은 단독 실행 시 90초 안에 출력 없이 행에 걸린다(재현 확인) |

## Evidence

### 조사 방법

운영자 도전에서 출발했다 — "receipt가 gitignore된 건 의도인데, 그래서 receipt가 findings를 기록 못 한다고 판단한 것 같다. 왜 의도인지는 나도 모르겠다." 8개 렌즈(gitignore 의도 역추적 · finding 정본 · rounds 필드 · **직전 분석 파괴** · 리뷰어 프롬프트 · 관측 파이프라인 · test 실재 · 아무도 묻지 않은 질문)를 병렬 투입하고 각 렌즈를 적대적 검증자가 재검증했다. 판정 어휘를 4분류로 고정했다: **설계 의도 / 우발적 기본값 / 알고 이연 / 진짜 결함**.

### A. gitignore 3단계 이력

| 시점 | 커밋 | 무엇 | 사유 |
|---|---|---|---|
| 2026-06-02 | `375157d` "Sprint 1 scaffolding" | `.claude/receipts/` **전체** 무시 | 주석 `per plan §3.1 + Codex Q3 default`. **그 bootstrap plan은 저장소에 없다** — 원래 심의는 복원 불가. Q3가 물은 것은 *저장 위치*였지 감사 내구성이 아니었다 |
| 2026-07-23 | `f131104` `durable-evidence-substrate` | ship receipt만 선별 해제 | 전제 2. 교차 worktree 감사 모순(E1) 계기, 증거 E1~E7 + PR-Codex 4라운드를 거쳐 착지 |
| 이후 | — | plan/implement는 계속 무시 | 사유가 전제 1의 journal 주석에 **귀속으로** 적혀 있다: per-session-append 아티팩트를 tracked하면 모든 PR이 충돌 표면을 안는다 |

즉 최초 규칙은 **미검토 기본값**이었고, 2026-07-22가 그것을 증거 기반 설계로 **부분 대체**했다. 남은 절반의 사유는 churn/충돌 표면이며, 일관되고 방어 가능하다.

결정 시점 실측이 그 분류를 뒷받침한다 — 그때 receipt 125건 중 findings가 찬 것은 **1건**이었다. plan/implement를 전량 추적했어도 보존될 finding이 없었다.

### B. finding의 정본은 receipt가 아니다 — 4채널 분업

| 채널 | 무엇 | 시점 |
|---|---|---|
| PR body `## Codex Review` | PR-Codex 발화 **원문** | 전제 4가 "Audit canonical"로 명시 |
| `.claude/reviews/` | 패널 finding **전문** | **2026-06-04 `d328513`부터 git-tracked** — receipt 추적(`f131104`)보다 **7주 앞선다** |
| `codex-findings-backlog.md` | 이연분 | v0.2.9 설계, 현재 790줄 |
| `.claude/state/findings/` | 구조화 lifecycle | M7, git-tracked |

**`receipt.findings[]`는 ECC fork 상속 화석이다.** `95da614`(2026-06-03)가 기본값째 들여왔고, mccp 역사 전체에서 **어떤 게이트 본문도 `--findings-file`을 전달한 적이 없다**(`git log -S` 실측). 73건 중 찬 것은 수동 작성 1건(`v0-2-8-task-2-6-1-fix.json`, 2026-06-07)뿐이다.

### C. `resolution.rounds`도 같은 계보 — 위조가 아니라 미배선

같은 fork 커밋이 `defaultResolution` 리터럴 `rounds: 1`을 들여왔다. 채우는 경로(`--resolution-file`)는 **수동 복구 명령에만** 문서화됐고 `finalize-receipt.js`·`plan-codex-runner.js` 어느 쪽도 넘기지 않는다. `codex-runner`가 Codex 응답에서 실제 라운드 수를 파싱하지만 그 값은 PR body 산문에서 끝나고 receipt에 닿지 않는다.

읽는 쪽도 사실상 없다 — 유일 소비처인 escalate-detector rule 3은 `converged` 기본값 `true` 때문에 **구조적 도달 불가**이고 코드 주석이 그것을 자인한다. `MCCP_GATE_ROUND_CAP`은 이 필드와 **무관하다**(캡은 도입부터 산문이 소비했고, 대조할 카운터가 게이트 축에 없다 — santa만 자체 원장으로 기계 강제).

따라서 "override 사유는 round 6인데 receipt는 rounds 1"은 **참값을 아는 코드 주체가 없어서** 리터럴이 반복 봉인된 것이다.

### D. 직전 판정의 자기반박

직전 분석의 헤드라인은 "게이트가 무엇을 했는지 아무도 사후에 알 수 없다"였다. **그 판정의 근거 전부가 감사 corpus 자신에서 사후 복원됐다** — override 사유문이 여섯 결함을 실명으로 봉인했고, 라운드 수와 이연처까지 적혀 있었다. 그 문서 자신이 다른 대목에서 "receipt의 절반이 이번 분석의 최고 증거원"이라 적었다.

더 결정적으로, override receipt가 서사로만 언급한 "PR-Codex round 6" F1은 전제 7의 `backlog:119`에 기록됐고 **v1.31.0에서 실제로 수정됐다**. 발견 → 원장 → 수정 루프가 receipt 밖에서 완결됐다.

### E. test 실재 — 5,243 pass / 9 fail / 1 hang

| 축 | 값 |
|---|---|
| 전체 통과 | **5,243** |
| 실패 | **9** (전부 `receipt/tests`) |
| 행(hang) | **1** — `santa-seal.test.js`(전제 9), 배치에서 1,145,555ms 후 사망, 단독 90초 재현 |
| CI 등재 | 3 / 346 파일 (0.9%) |

**`node --test <디렉토리>`는 이 Node에서 동작하지 않는다** — 디렉토리를 모듈로 해석해 `Cannot find module`로 죽고, 17개 디렉토리 전부가 `pass 0 / fail 1`로 보고된다. 한 건도 실행되지 않았는데 실패처럼 보인다. 올바른 형식은 `node --test <dir>/*.test.js`다. CI 등재 3건은 파일을 직접 지정해 이 함정을 피하지만, 사람이 "전체 돌려보자"며 쓰는 형식은 정확히 이것이다.

### F. 이번에 처음 발견된 것

- **ECC fork 화물**: skill 47종 중 **33종**, agent 58종 중 **약 37종**이 런타임 호출처 0건이다. 기계 결선된 skill은 4종뿐이고, 트림 결정 기록이 없으며, 존재하지 않는 `react-patterns`를 가리키는 파손 포인터까지 있다. 매 세션 로스터 주입 비용을 낸다.
- **quorum 캘리브레이션의 분할점이 틀렸다**: 전제 8이 `794c4de`를 자연 실험 분할점으로 적는데, K=1 도입은 **12.4시간 뒤 `c9e941c`**(본문 공란 docs 커밋에 동승)다. 5일 전 봉인된 판정의 근거 수치가 잘못된 구간 분할 위에 있다.
- **dogfood-vanilla 비대칭**: 저자는 `soft`·캡3·K=1·gateguard off로 살고, 순정 사용자는 `hard`·캡1·K=3·gateguard on을 받는다. **기본값 구성을 저자가 상주 실측한 적이 없다.**
- **§3.7 병렬 버전 충돌이 지금 4번째로 열려 있다** — worktree 3개가 1.33.2 / 1.33.4 / 1.34.0을 각자 선언 중이고, v1.2.x에 적힌 자동화 후보 3건은 약 30 patch가 지나도록 미구현이다.
- **리뷰어 프롬프트는 병리의 원인이 아니다.** 처음으로 전문을 읽은 결과 lens 엄수·anti-pad·증거 의무가 전부 명시돼 있다. 병리를 만드는 것은 프롬프트가 **주지 않는** 넷이다: 라운드 기억(구조적 부재 — `decide.js`에 라운드 개념 0), **severity 기준 0줄**(승인을 단독 결정하는 축인데 — 같은 저장소 `code-reviewer.md`의 Pre-Report Gate가 두 달 먼저 존재했으나 미이관), 상시 불변식 주입(#128), plan 단계 보정(#127 — "CREATE될 파일이 아직 없다"가 CRITICAL로 나오는 범주 오류 실측).
- **`.claude/reviews/` 레코드는 무조건 덮어쓴다** — 라운드별 이력이 수동 pin 없이는 최종 라운드만 남는다. "채널 부재"가 아니라 "채널의 per-round 내구성 결함"이 정확한 서술이다.

## Prior Art

**미조사.** 외부 문헌을 이 사이클에서 조사하지 않았다. 판정 근거는 전부 git 이력·코드·산출물 실측이다.

## Precedent

- [2026-08-31-harness-instability-and-command-bloat.md](2026-08-31-harness-instability-and-command-bloat.md) — 본 조사가 정정하는 대상. 그 문서는 이미 한 차례 자기정정을 거쳤으나 헤드라인의 귀인이 여전히 틀렸다. **Status를 `부분 무효`로 갱신할 것을 제안한다.**
- [2026-08-31-remaining-issue-disposition.md](2026-08-31-remaining-issue-disposition.md) — 같은 날 자매 조사. #127·#128이 본 조사 F절의 리뷰어 프롬프트 진단과 정확히 만난다 — 그 두 이슈가 지목한 것이 "프롬프트가 주지 않는 넷" 중 둘이다.
- [2026-08-12-review-loop-meta-analysis.md](2026-08-12-review-loop-meta-analysis.md) — "계측 부재"를 단일 근인으로 지목했다. 본 조사는 그 계측이 **receipt가 아닌 4채널로 실제로 세워졌음**을 확인한다.

## Verdict

### 운영자 질문에 대한 답

**receipt gitignore는 설계 의도가 맞고, 그 이유는 두 겹이다.** (1) ship receipt를 추적하는 쪽의 이유는 전제 2 — fresh clone에서 ledger↔receipt 대조가 성립해야 술어 결함이 발견 가능해진다. (2) plan/implement를 무시하는 쪽의 이유는 전제 1 — per-session-append 아티팩트를 tracked하면 모든 PR이 충돌 표면을 안는다. 결정 시점 실측(125건 중 findings 1건)이 "보존할 내용이 없다"를 뒷받침했다.

**그리고 사용자의 직관이 맞았다 — 저는 설계를 결함으로 오독했습니다. 다만 오독한 설계는 gitignore가 아니라 finding 정본의 분업입니다.** finding의 집은 receipt였던 적이 없고(B절), 그 지정은 `pr.md:1294`·`plan.md:1883`에 문서화돼 있으며, `.claude/reviews/`는 receipt보다 7주 먼저 git-tracked였습니다. 저는 채널의 절반(구조화 필드)만 보고 전체를 선고했습니다.

### 4분류

| 관측 | 분류 | 근거 | 따라 나오는 행동 |
|---|---|---|---|
| plan/implement receipt gitignore | **설계 의도** | 전제 1·2, 증거 7건 + Codex 4라운드 | **손대지 않는다** |
| ship receipt만 추적 | **설계 의도** | 전제 2 (E1) | 손대지 않는다 |
| finding 정본이 4채널 분산 | **설계 의도** | 전제 4·5·6·7 | 손대지 않는다. 단 **통합 지도가 없다**(아래) |
| `receipt.findings[]` 미배선 | **우발적 기본값** | ECC 상속 화석, 게이트가 `--findings-file` 0회 전달 | 채우거나 은퇴시키거나 — **결정이 필요하다** |
| `resolution.rounds` 리터럴 1 | **알고 이연** | `backlog:682`(08-21) · `:802`(오늘) 선행 기록, `env-contract-integrity` M3가 상환 중 | 그 브랜치에 맡긴다 |
| `.claude/reviews/` 무조건 덮어쓰기 | **알고 이연** | m6-r4 머리말이 자인 | per-round 내구성은 별도 축 |
| `work.md:715` 파일명 오타 → escape 재확인 미실행 | **진짜 결함** | 참조 1건 / 작성 0건 | 고친다 (1줄) |
| `pr.md`의 "Validators cross-check" 2건 | **진짜 결함** | 대응 코드 0건, 출생부터 거짓 | 문서 정정 |
| `body-builder.js` 미배선 | **진짜 결함** | 소비처가 자기 자신 + 자기 test뿐 | 배선하거나 은퇴 |
| `santa-seal.test.js` 행 | **진짜 결함** | 90초 무출력 재현 | 고친다 — CI 확장의 선행 조건 |
| `corpus.js:112` 분할점 오기 | **진짜 결함** | 실제 K=1은 `c9e941c` | 5일 전 봉인 판정의 근거 정정 |
| skill 33 / agent 37 호출처 0 | **우발적 기본값** | `cp -r` 일괄 이관 잔재, 채택 결정 기록 없음 | 트림 후보 — 명령 본문 비대화와 동형 축 |
| dogfood-vanilla 비대칭 | **알고 이연**(부분) | CLAUDE.md는 `soft` 하나만 자인 | 나머지 완화도 자인하거나 순정 실측 |
| CI 3/346 | **알고 이연** | `gate-design.md:1116`이 자인 | 실측이 green이므로 위험도는 낮으나 hang이 선행 조건 |

### 직전 판정의 정확한 재서술

> 기록 층은 살아 있고 4채널에 분산 기록 중이다. 다만 ship receipt의 구조화 필드 2개(`rounds`·`findings`)가 바로 옆 자유 텍스트·외부 채널과 어긋난 값을 봉인하며, 그 결함은 저장소가 이미 알고 수리를 소유 중이다.

"감사 채널이 under-report한다"는 **넓은 형태로는 틀렸고 좁은 형태로만 맞으며, 그 좁은 사실조차 기지 사항이다.**

### 행동 권고

- **손대지 않을 것**: gitignore 분업, ship-only 추적, finding 4채널 분업.
- **문서만 고칠 것**: `pr.md`의 거짓 cross-check 주장 2건, `corpus.js:112` 분할점, 직전 `_meta` 문서 Status.
- **실제로 고칠 것**: `work.md:715` 오타, `santa-seal.test.js` 행.
- **결정이 필요한 것**: `receipt.findings[]`·`resolution.rounds`의 처분(채움 vs 은퇴) — 현재 어느 쪽도 결정된 바 없고, naive 독자(및 이 조사의 직전 판정)를 반복적으로 오도한다.
- **새 PRD 후보**: ECC fork 화물 트림(skill 33 + agent 37) — 명령 본문 다이어트와 같은 축이므로 그 PRD에 합류시킬 수 있다.

## Open Questions

- **finding 4채널의 통합 지도가 없다.** verdict 감사에는 receipt로 충분하지만 "무엇을 찾았나" 감사에는 4개 저장소를 항행해야 하고, 어느 문서도 그 분업을 한자리에 적지 않는다. 이 조사가 그것을 찾는 데 8개 렌즈를 썼다는 사실 자체가 비용의 증거다. CLAUDE.md 한 절이 정답인지, 아니면 지도를 만드는 것 자체가 과잉인지 미결이다.
- **`receipt.findings[]`·`resolution.rounds`의 처분.** 인터페이스(`--findings-file`·`--resolution-file`)는 배선돼 있는데 영구 미사용이다. 채우면 감사 가치가 오르지만 hash 안정성과 기존 receipt 해석 호환을 지켜야 하고, 은퇴시키면 schema 변경이다. `env-contract-integrity` M3가 `rounds` 축을 상환 중이므로 그 착지 후 `findings` 축만 남는다.
- **`santa-seal.test.js`가 무엇을 기다리는가.** `execFileSync`가 codex/briefing 경로를 타고 900초를 소진하는지, `.claude/state/santa-loop/` 부재(이 worktree에 없음)를 기다리는지, stdin을 읽는지 미확정이다. 유닛 테스트가 외부 LLM 호출에 닿는다면 CI 확장 자체가 막힌다.
- **`receipt/tests` 실패 9건의 성격.** 환경 의존인지 실제 회귀인지 미분류다. 실패 목록에 `intent-gate-fields.test.js` · `N-writer stress` · `validate-cmd: tampered meta.command → blocking` 등이 있어 최소 일부는 게이트 무결성 축이다.
- **CLAUDE.md의 "`codex-invoke.test.js` 9건 상시 실패" 주장.** 실측상 `lib/tests`의 fail은 `santa-seal` 행 1건뿐이었고 9건은 `receipt/tests`에 있다 — 파일이 다르므로 그 서술은 현재 거짓일 가능성이 높으나 단독 재실행으로 확정하지 못했다.
- **순정 사용자 경험이 한 번도 실측된 적 없다.** 기본값(`hard`·캡1·K=3·gateguard on)에서 `/mccp:plan`이 무엇을 발화하고 무엇에 막히는지 아무도 돌려본 기록이 없다.
