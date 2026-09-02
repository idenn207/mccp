# Notes: leadtime-observability M2 — Implement-Codex gate record

> Plan: `.claude/plans/leadtime-observability-m2.plan.md` (본문은 plan-codex receipt가
> `plan_hash`로 봉인했으므로 **편집하지 않는다** — §3.12 no-rehash. 게이트 기록은
> `/mccp:prp-implement` Phase 2.5.4가 허용하는 대체 위치인 이 노트에 둔다.)

## Codex Implementation Review

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1 (§3.16 — 캡은 3이지만 실무 기본은 1라운드. 두 finding 모두 R1에서 흡수됨)
- 합치 결론: 증인 모델의 두 경계 — (a) 긍정 방향(ship을 주장하는 쪽)에 truthful한
  버킷이 없다 (b) 각 probe의 `no` 대 `unavailable` 경계가 미정의 — 를 둘 다 R1에서
  흡수했다. DD4의 5종 닫힌 집합은 유지하되 **증인 사용이 비대칭**임을 명시하고,
  모든 probe 결과에 대한 완전한 진리표를 코드와 여기에 못박는다.
- YAGNI Triage:

| Finding | Severity | Verdict | Why |
|---|---|---|---|
| F1 긍정 증인에 truthful 버킷 없음 | HIGH | ACCEPT_NOW | 실재한다. 증인이 ship을 증언해도 반대축 앵커가 없으면 `unclassified`로 접혀 미지와 구분 불가 — plan 자신이 DD4·DD5에서 두 번 고친 '도달 불가/붕괴 버킷' 오류의 재현 |
| F2 probe의 no/unavailable 경계 미정의 | HIGH | ACCEPT_NOW | 실재한다. 환경 실패를 `no`로 접으면 만장일치 부정이 거짓 `not_shipped`를 단언한다 — DD4가 막겠다고 선언한 바로 그 결함 |

- Deferred to backlog: 0
- Open Questions: 없음 (두 HIGH 모두 R1에서 흡수)
- Codex session 참조: threadId `01a05fc0-9eb0-7602-8316-6b0772276936`

### F1 흡수 — 증인은 비대칭으로 쓴다 (DD4 정밀화, 5종 집합 무변경)

리뷰어의 권고는 "아무 자격 있는 ship 증인이나 `yes`면 `anchor_absent`로 넓혀라"였다.
**그대로 넓히면 안 된다.** 증인 (c) git-touch는 "그 plan 경로를 건드린 커밋이 있는가"인데,
이 저장소에서는 plan을 작성해 커밋하는 순간 참이 된다 — 넓히면 **커밋된 모든 plan이
ship된 것으로 보인다**. 리뷰어가 지목한 결함은 실재하지만 그 처방은 반대 방향의 같은
크기 결함을 만든다.

그래서 증인을 **방향에 따라 다르게** 쓴다. 이것은 DD4가 이미 함의하던 것을 명시한 것이다:

- **부정 방향** (`not_shipped`를 주장) — 만장일치가 필요하다. 증인 전원이 `no`.
  하나라도 `yes`거나 `unavailable`이면 성립하지 않는다. (DD4 원안 그대로)
- **긍정 방향** (`anchor_absent` = "ship됐는데 이 축의 앵커만 없다") — **자격 있는
  ship 증인**만 승격시킨다. 자격은 "그 자체로 ship의 기록인가"로 판정한다:

| 증인 | ship 자격 | 근거 |
|---|---|---|
| W0 반대축 앵커 (ledger 엔트리 / ship-gate 자격 receipt) | **있음** | 그 자체가 ship 기록이다. DD14의 오라클을 통과한 receipt이거나 completion-ledger 엔트리 |
| W1 `archived/`의 plan | **있음** | §3.11 C2 — plan은 PRD 전체 완료 후 사람이 한 번 옮긴다. archived면 ship됐다 |
| W2 `mccp-implement-codex` receipt | 없음 | 구현이 돌았다는 증거이지 ship됐다는 증거가 아니다 |
| W3 git 이력이 plan 경로를 건드림 | 없음 | plan 작성 커밋만으로 참이 된다. ship과 무관 |

W2·W3은 **부정 방향에만** 기여한다(만장일치 부정의 구성원). 그 결과:

- `yes/no/no` (어느 증인이든 `yes` 1건) → `not_shipped` **불가**. 만장일치가 깨진다.
- W1이 `yes` → `anchor_absent` (자격 있는 승격).
- W2·W3만 `yes`, W0·W1은 `no` → `unclassified`. 구현은 돌았고 plan은 커밋됐지만
  ship을 증언하는 것은 없다 — 이것이 정직한 답이다. 자격 없는 증인을 승격시켜
  "ship됐다"고 단언하는 것이 F1의 처방을 그대로 따랐을 때 생기는 거짓이다.
- `yes/unavailable/no` → 자격 있는 `yes`면 `anchor_absent`, 아니면 `unclassified`.

**미지를 미지로 남기되 구분 가능하게 한다**: `anchor_absent` 행에는 승격시킨 증인
이름(`witness`)을, `not_shipped`·`unclassified` 행에는 **증인 4종의 3-state 값 전건**을
싣는다. 그래서 "W2·W3만 yes인 unclassified"와 "전부 unavailable인 unclassified"는
출력에서 서로 다른 행으로 읽히고 재계산으로 반증 가능하다.

### F2 흡수 — probe 진리표를 전부 못박는다

리더는 `evidence-audit.js`의 것을 재사용하지 **않는다**(F2 지적대로 그것들은 `present`도
child-process 상태도 내지 않는다). `leadtime.js`가 자기 리더를 갖고 소스마다
`{dir, present, read_error, parse_failures}`를 낸다. `aggregate()`는 순수하게 유지되고
모든 witness/anchor I/O는 `opts`로 주입된다(child_process는 `audit()` 층에서만 실행).

`source_unavailable(src) := src.present === false || src.read_error === true` (DD15)를
**모든** 증인에 동일하게 건다. 완전한 진리표:

| Probe | 결과 | 판정 |
|---|---|---|
| W1 archived plan | 디렉토리 부재 | `unavailable` — 부재는 "아카이브되지 않았다"의 증거가 아니라 아카이브 색인의 부재다 |
| W1 | `readdirSync` throw | `unavailable` |
| W1 | 디렉토리 읽힘 · 해당 basename 있음 | `yes` |
| W1 | 디렉토리 읽힘 · 해당 basename 없음 | `no` (실제 부정 관측) |
| W2 implement receipt | 디렉토리 부재 | `unavailable` — §3.12상 working-tree only. DD4가 최악 시나리오로 명시한 경로 |
| W2 | `readdirSync` throw | `unavailable` |
| W2 | 디렉토리 읽힘 · 해당 slug `.json` 있음 | `yes` |
| W2 | 디렉토리 읽힘 · 해당 slug `.json` 없음 | `no` |
| W3 git log | spawn 실패 / ENOENT / 비영점 exit / timeout | `unavailable` — 환경 실패를 부정으로 접지 않는다 |
| W3 | exit 0 · 출력 비어있지 않음 | `yes` |
| W3 | exit 0 · 출력 **빈 문자열** | `no` — 성공한 빈 이력은 실제 부정 관측이며 실패와 구별된다 |
| W3 | `plan_path`가 null 또는 `NON_REPO_PATH` | `unavailable` — 물어볼 경로가 없다 |
| W0 반대축 | 그 축의 소스가 `source_unavailable` | `unavailable` (DD13의 반대축 규칙) |
| W0 | 소스 읽힘 · 매치 있음 | `yes` |
| W0 | 소스 읽힘 · 매치 없음 | `no` |

git은 `--` 이후 경로를 넘겨 인자 주입을 막고, timeout을 걸며, 이력 조회는 존재 여부만
쓴다 — **커밋 시각은 읽지 않는다**(DD3: git은 분류의 증인이지 span의 앵커가 아니다).

### Security Reviewer

> security-reviewer 미호출 (auto-fallback 아님): 이 변경은 read-only 집계 도구이고
> auth·crypto·secret·입력검증·SQL/cmd injection·SSRF·경로순회·권한상승 표면을 건드리지
> 않는다. 유일한 외부 프로세스 호출인 `git log`는 `execFileSync` + `--` 경로 구분자 +
> 고정 인자 배열이라 셸을 경유하지 않는다. 2.5.5의 트리거 조건(보안 민감 영역) 미해당.
