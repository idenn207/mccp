# Layer 2 사전 등록 — 리뷰어 발화 전 동결

동결 시각: 리뷰어 4회 발화 **이전**. 이 파일이 정한 것을 결과를 보고 고치면 M2 plan
Task 4가 유일하게 금지한 행위("규칙을 결과에 맞춰 고치는 것")에 해당한다.

## R0. 상위 규칙 (이미 동결됨 — 인용만)

`detection-corpus.js#DECISION_RULE` 축자:

> corpus 전체(4계층 합산)에서 델타의 Layer 2 발견 수가 full 대비 단 1건이라도 적으면
> default를 뒤집지 않는다. 같거나 크면 뒤집는다.

집계 대상은 corpus 결함 **D1~D4뿐**이다. fixture에 우연히 존재하는 다른 결함
(`splitRecords`의 미정의 `SEPARATOR`, `pad`의 미정의 `PADDING`)은 manifest에 없으므로
`fullFindings`/`deltaFindings` 어느 쪽에도 들어가지 않는다.

## R1. 실행 구성 (두 모드 동일 — 교란 차단)

| 축 | 값 |
|---|---|
| fixture | 동일 저장소 1개 (rev0 → fix 커밋 → round-1 anchor) |
| 라운드 | 2 (델타는 라운드 2부터) |
| 레인 배정 | `MCCP_SANTA_BLIND_LANE` default `a` → A=blind, B=bundled |
| Reviewer A | Agent `code-reviewer`, model **opus**, blind lane (경로/범위만, 파일 내용 없음) |
| Reviewer B | `codex exec --sandbox read-only -m gpt-5.4`, bundled lane (파일 내용 동봉) |
| rubric | 두 모드 **바이트 동일** |
| 변수 | `MCCP_SANTA_DELTA_SCOPE` 하나 (`off` vs `enforce`) |

## R2. finding → 결함 id 대조 알고리즘

L2 id=77fbb4db가 "미지정"으로 지적한 자리. 아래로 동결한다.

1. **위치 우선** — finding의 `locations[]` 중 `file`이 결함 경로와 일치(정규화 후
   suffix 일치)하고, `line`이 있으면 `|line − D.line| ≤ 12`이면 그 결함에 귀속한다.
   허용 오차 12는 리뷰어가 함수 머리를 가리키는 경우를 덮는다(D1 머리 14/결함 17,
   D2 머리 61/결함 62, D3 머리 12/결함 15).
2. **텍스트 대체** — `locations`가 없거나 못 쓰면 `claim + failure_scenario + evidence`를
   소문자로 이어 붙인 텍스트가 경로 basename을 포함하고 **동시에** 아래 토큰 술어를
   만족하면 귀속한다.
3. **다중 매치** — 한 finding은 최대 1개 결함에 귀속한다. 여럿에 맞으면 줄 거리가
   가까운 쪽, 동률이면 id가 작은 쪽.
4. **발견 판정** — 한 실행에서 리뷰어 **A 또는 B 중 하나라도** 귀속시킨 결함은 그
   실행에서 `found`다. **severity는 무관하다** — 재는 것은 탐지이지 게이트 통과가 아니다.
5. **비-corpus finding** — 어느 결함에도 귀속되지 않은 finding은 따로 센다. 어느 쪽에서도
   **차감하지 않는다**.

### 토큰 술어 (대소문자 무시)

| id | 계층 | 경로:줄 | 술어 |
|---|---|---|---|
| D1 | `A_IN_FIX` | `src/parser.js:17` | `takefield` 포함 **또는** (`trim` 포함 ∧ (`undefined`\|`bound`\|`out of range`\|`index`) 중 1) |
| D2 | `B_SAME_FILE_OUT_OF_RANGE` | `src/parser.js:62` | `mergecounts` 포함 **또는** (`concat` 포함 ∧ (`string`\|`type`\|`a + b`) 중 1) |
| D3 | `C_DROPPED_PATH` | `src/cache.js:15` | `expiresat` 포함 **또는** `ttl` 포함 **또는** (`cache` ∧ (`expir`\|`stale`) 중 1) |
| D4 | `D_ALWAYS_SCOPE` | `.claude/plans/corpus-fixture.plan.md:14` | `milestone` 포함 ∧ (`3`\|`three`\|`mismatch`\|`two`\|`declares`) 중 1 |

## R3. 비결정성 처리 (L2 id=e41a4325)

리뷰어는 비결정적이고 규칙은 이진이다. **규칙을 완화하지 않는다.** 대신 관측을
1회로 못 박고 그 사실을 한계로 기록한다 — 재실행 시 값이 달라질 수 있음을 노트가
명시한다. 표본을 늘려 평균을 내는 것은 규칙이 요구하지 않은 절차이고, 임의 표본 수는
방어할 근거가 없다. **모드당 1회 관측, 그대로 적용.**

## R4. 실행 증명 (L2 id=6116eeb8 · 5fb50bd9)

원시 리뷰어 JSON 4건(2 모드 × 2 리뷰어)을 산출물로 남긴다. 그 파일들이 없으면
`LAYER2_EVIDENCE`를 교체할 근거가 없다 — 부재는 `null` 유지(= `layer2-absent`)다.

---

## R5. 실행 중 이탈 기록 (동결 후 추가 — 은폐하지 않는다)

**이탈**: Reviewer B 를 `codex exec -m gpt-5.4` 에서 **Claude Agent
(`code-reviewer`, opus)** 로 교체.

**원인**: codex CLI 가 두 모드 모두 exit 1 + stdout 0바이트. stderr 축자:

> ERROR: You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage
> to purchase more credits or try again at Aug 31st, 2026 11:09 PM.

**근거**: `santa-loop.md` 가 규정한 fallback 이다 — "Launch a second Claude Agent
(subagent_type: `code-reviewer`, model: `opus`). Log a warning that both reviewers share
the same model family — true model diversity was not achieved but context isolation is
still enforced." 파라미터가 고정돼 있어 조정 여지가 없다.

**시점 정직성**: 이 이탈은 Reviewer A 의 두 모드 결과를 **이미 본 뒤에** 결정됐다.
결과를 보고 고른 것이 아니라 외부 제약(quota)이 강제한 것이고 fallback 파라미터는
명령 본문이 소유하지만, 순서 자체는 기록한다.

**대칭**: 두 모드에 **동일하게** 적용한다. 변수는 여전히
`MCCP_SANTA_DELTA_SCOPE` 하나다.

**측정에 남는 손상**: 두 레인이 같은 model family 라 **상관된 맹점이 끊기지 않는다**.
context isolation(blind vs bundled)은 유지된다. 이 손상은 델타 축이 아니라 P2(증거
다양성) 축의 것이고, 노트가 한계로 명시한다.
