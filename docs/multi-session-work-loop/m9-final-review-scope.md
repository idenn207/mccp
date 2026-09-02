# M9 최종 검토 범위 (UI7 · UI8)

> 이 문서는 **검토 자료**이지 검토 기록이 아니다. "사람이 검토했다"고 주장하지 않는다 —
> UI7이 말한 최종 검토는 PR [#164](https://github.com/idenn207/mccp/pull/164)의 승인이고,
> 이 문서는 UI8이 요구한 그 검토의 **범위**를 실측으로 고정한다.

## 왜 이 문서가 뒤늦게 생겼는가

M9 plan의 `## User Intent` 표에 두 제약이 기록돼 있다.

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI7 | 계획은 마일스톤 표에 추가하고 최종 검토는 사람이 한다 | direction |
| UI8 | 최종 검토 대상에는 자식 PRD들도 포함한다 | direction |

**두 항목은 기록만 되고 이행되지 않았다.** plan 본문의 Task·Acceptance,
`.claude/notes/multi-session-work-loop-m9.md`, `.claude/PRPs/reports/multi-session-work-loop-m9-report.md`
어디에도 이행 흔적이 없고(전량 grep 0건), PRD 본문은 "자식 PRD"를 한 번도 열거하지 않았다.
그 상태에서 M9 행이 `complete`로 정본화됐다.

이 누락은 PR #164의 **PR-Codex R1 F1**(HIGH, `.claude/prds/multi-session-work-loop.prd.md:160`)이
지목했고 기각되지 않았다. 이 문서가 그 지적에 대한 응답이다.

**왜 M1.5 오심 탐지가 이것을 못 잡았는가**: M9 plan의 게이트는 `MCCP_PLAN_REVIEW=multi-agent`
경로로 돌아 intent 축이 패널 carve-out으로 skip됐다(CLAUDE.md §3.13.2가 "기본 모드에서 intent
축은 여전히 skip된다"고 이미 적어 둔 그 구멍이다). 즉 UI7·UI8은 adjudication을 한 번도 받지
않았다. 이것은 M9의 실수이면서 동시에 그 구멍의 실측 사례다.

## 1. 부모/자식 관계는 이 저장소에 형식화되어 있지 않다 (실측)

먼저 확인해야 할 것은 "자식 PRD가 무엇인가"이고, **측정 결과 그 관계는 선언된 적이 없다.**

- 활성 PRD 3건 중 `multi-session-work-loop`를 parent/source로 **선언한 PRD는 0건**이다.
  PRD frontmatter에도 본문에도 그런 필드가 없다.
- 아카이브된 PRD 중 `multi-session-work-loop`를 언급하는 것은 **0건**이다.
- 유일한 텍스트 참조는 `.claude/prds/diverse-agent-review.prd.md:73`인데, 내용은
  *"선례: multi-session-work-loop M2 measurement-honesty downgrade"* 라는 **선례 인용**이지
  부모 주장이 아니다.

따라서 UI8의 "자식 PRD"는 **선언된 집합으로는 공집합**이다. 그것을 "검토할 것이 없다"로
읽으면 사용자의 의도를 형식으로 회피하는 것이므로, 아래 2절은 대신 **최종 검토가 알아야 할
활성 PRD 전량**을 후보로 열거한다. 관계가 없다는 사실 자체를 함께 적는 이유는, 있다고
가정하고 만든 목록과 없어서 대신 만든 목록은 신뢰도가 다르기 때문이다.

## 2. 검토 후보와 처분 (2026-08-31 실측)

| PRD | msw와의 관계 (실측) | milestone 상태 | 이 PR과의 관계 | 처분 |
|---|---|---|---|---|
| `multi-session-work-loop.prd.md` | 본체 | 9/9 complete | **이 PR이 M9를 flip한 대상** | 검토 대상 — M9 행이 `complete`인 것이 맞는지가 이 PR 승인의 핵심 질문이다 |
| `diverse-agent-review.prd.md` | 선례 인용 1건(`:73`), 부모 주장 아님 | 11행 중 complete 5 · pending 6 | 무관. 이 PR은 이 PRD의 어느 행도 건드리지 않는다 | 검토 불필요 — 단 M2("L3 자동 트리거")·M11("패널 승인 품질 감사")이 §3.13.2가 남긴 intent-skip 구멍의 소관이고, 위에 적은 M9의 UI7·UI8 미이행이 **그 구멍의 실측 사례**다. 후속 사이클의 근거로 이 문서를 인용할 수 있다 |
| `codex-disabled-round-invariant.prd.md` | 참조 0건 | 1행 in-progress | 무관 | 검토 불필요 |

아카이브된 PRD는 검토 대상이 아니다 — 이 PR이 옮긴 2건
(`impeccable-detection-contract`, `workflow-orchestration-live-activation`)은 M9 이전에
이미 전 milestone이 종료된 상태였고, 이 PR의 변경은 **파일 이동뿐**이다
(`.claude/state/archive-journal/2026-08-27T05-06-06-685Z__686411b9.json`에 기록).

## 3. 최종 검토자가 판단해야 할 것

UI7이 사람에게 남긴 판단은 셋이다.

1. **M9 행이 `complete`인 것이 맞는가.** 완료 판정은 PRD가 스스로 정의한 대로
   "행별 선행 술어 통과 + status 정본화"이고, `m9-coverage-gate.js`가 4행 전부를
   교차 검증해 exit 0을 낸다. 그러나 그 술어 집합에 UI7·UI8은 들어 있지 않다 —
   이 문서가 그 공백을 메우지만, 술어로 기계화하지는 않았다.
2. **PR-Codex의 비승인을 감사 우회로 넘긴 판단이 타당한가.** PR #164의
   `## PR-Codex Override` 참조. 봉인된 verdict는 `divergent` 그대로다.
3. **아카이브를 실행할 것인가.** `/mccp:archive-complete`는 머지 이후 사람이 직접
   1회 실행한다(§3.11 guard 2 자기차단 회피로 이연됨). 실행하면 이 PRD와 plan 9건이
   `archived/`로 이동해 활성 대시보드에서 빠진다. 1번 판단이 부정이면 실행하지 않는다.

## 4. 이 문서가 주장하지 않는 것

- **사람이 검토를 마쳤다고 주장하지 않는다.** 검토는 PR 승인이고, 이 문서는 그 앞에 놓이는 자료다.
- **자식 PRD가 없다고 주장하지 않는다.** *선언된* 관계가 없다고만 말한다. 관계를 형식화하는
  것(예: PRD frontmatter에 `parent_prd`)은 이 milestone의 범위 밖이며, 필요하다고 판단되면
  별도 축이다.
- **UI7·UI8을 술어로 기계화했다고 주장하지 않는다.** `m9-coverage-gate.js`는 여전히 이 두
  제약을 검사하지 않는다. 사람이 하기로 한 것을 기계가 대신했다고 적는 것이 더 나쁜 거짓이다.
