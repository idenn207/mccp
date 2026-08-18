# Codex Implementation Review — review-loop-bypass M1

> **왜 plan 본문이 아니라 이 파일인가.** `/mccp:prp-implement` Phase 2.5.4는 이 섹션을
> "plan 본문 또는 sibling note"에 쓰라고 한다. 이 cycle은 후자를 택했다 — plan 본문에
> 한 줄이라도 append하면 `planAwareMarkdownHash`가 바뀌어(실측: 봉인된
> `sha256:c8b22d99…` → `sha256:fa50eff5…`) `mccp-plan-codex` receipt가 즉시 stale이
> 되고, 그 순간 2.5.7 read-back과 `/mccp:pr`의 chain check가 함께 막힌다. 구조 해시는
> frontmatter status·체크박스·PR placeholder만 정규화하고 **신규 섹션은 정규화하지
> 않는다**(`hash.js:153-160`). 즉 게이트 기록을 남기려다 게이트를 깨는 형태라, 기록을
> 옆에 둔다.

## Codex Implementation Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed wrapper, v0.2.2)
- classification: `ok` · blocking: `false` · durationMs: 77007
- 라운드 수: 1 (`MCCP_GATE_ROUND_CAP=1`, `.claude/settings.json`)
- Codex verdict: **`divergent`** (structured `.result.verdict='needs-attention'` →
  `codex-review-payload#deriveGateVerdict`, source=`structured`)
- 합치 결론: 실재 결함 1건(HIGH)을 흡수했다 — 역불변식이 `unavailable`까지 발동해
  DD2가 "절대 완화하지 않는다"고 못 박은 verdict에 대해 *일어나지 않은 우회*를 주장하도록
  강요하고 있었다. 정방향도 같은 구멍의 반대면이었다(`unavailable` + bypass 주장을 수용).
  완화 자격을 `divergent` 하나로 좁혀 양방향을 동시에 닫았다. MEDIUM 1건은 DD8이 정의한
  계약(presence 비교)을 넘는 확장 요구라 backlog로 이연했다.

### YAGNI Triage

| Finding | Severity | Verdict | Why |
|---|---|---|---|
| F1 — 역불변식이 `unavailable`에도 발동 (`schema.js`) | HIGH | ACCEPT_NOW | DD2가 `unavailable`을 완화 대상에서 명시 제외했는데 판별자가 "non-converged"라 정직한 `unavailable` receipt가 거짓 bypass 주장을 강요받고, 정방향은 그 거짓 주장을 수용했다. 실재 결함 |
| F2 — chain drift warn이 사유 *값* 변경을 못 본다 (`write.js`) | MEDIUM | DEFER_TO_BACKLOG | 현 구현은 DD8 문언 그대로다(토글 on/off presence 비교). 값 비교로의 확장은 계약 변경이라 §3.14대로 이연 |

### F1 흡수 내용

- `schema.js` — `spNonConverged`(verdict ≠ converged)를 `spDivergent`(verdict === 'divergent')로
  교체. 정방향은 `req(spDivergent, …)`로, 역방향(plan 게이트) 진입 조건도 같은 값으로 좁혔다.
- 회귀 test 2건 추가 (`review-single-pass-fields.test.js`):
  - `unavailable` 패널 plan receipt가 bypass 플래그 **없이 유효**함 (역방향 오발동 방지)
  - `unavailable` + bypass 플래그는 **거부**됨 (정방향 위조면 폐쇄)
- 기존 negative test의 기대 메시지를 새 문언에 맞춰 갱신.

### Security Reviewer

> security-reviewer unavailable, skipped (auto-fallback): 이 세션은 사용자 요청 없이
> Agent(Task) 호출을 금지하는 운영 제약 아래 있어 `mccp:security-reviewer` 서브에이전트를
> 기동할 수 없었다. 변경은 auth·crypto·secrets를 만지지 않으나 입력 검증(env enum 파서)과
> 경로 처리(`assertSingleRound`가 argv 경로를 `path.resolve`로 해석, 읽기 전용·containment
> 검사 없음)를 포함하므로 자동 통과로 처리하지 않고 skip을 명시 기록한다. receipt에
> `security_skipped=true`가 실려 하류 `/mccp:pr`이 fail-closed로 막는다 — 해제는 이 게이트를
> security-reviewer와 함께 재실행하는 것이다.

### Open Questions

- 없음 (F1 흡수 완료, F2는 backlog 이연). `MCCP_GATE_ROUND_CAP=1`이라 R2 미진입.

### 절차 이탈 (정직한 기록)

Phase 2.5는 Phase 3 EXECUTE **이전**에 돌아야 하는데, 이 cycle은 Phase 2 → Phase 3로
직행한 뒤 전체 diff에 대해 사후 실행했다. 게이트의 가치(구현 시점 결정에 대한 cross-model
반박)는 완성된 diff를 대상으로 해도 성립하고 실제로 HIGH 1건을 잡았지만, "구현 전에 막는다"는
성질은 이번 실행에서 성립하지 않았다. 잡힌 결함이 이미 작성된 코드에 있었다는 사실이 그 대가다.
