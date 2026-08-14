---
description: 조사 골격(코드 근거 → 외부 문헌 → 저장소 선례 → 판정)을 phase로 고정해 `.claude/_meta/`에 규격 산출물을 남기고 README 색인에 등재한다. PRD를 쓰기 전 단계의 메타 조사.
argument-hint: "<조사 주제>"
---

# /mccp:meta-research

> If I disappear silently, run `/mccp:trace` or check `.claude/state/hook-trace/<session_id>/`

증상이 여럿이고 서로 얽혀 있어 PRD를 바로 쓸 수 없을 때, **무엇부터 고쳐야 하는가**를 조사해 판정으로 남긴다. 산출물은 `.claude/_meta/<date>-<slug>.md`이며 `_meta/README.md`의 `## 색인`에 등재된다.

**이 커맨드가 담당하는 것과 하지 않는 것**:

- **담당** — 조사 절차의 골격 고정 · **전제 명시**(무엇을 근거로 어느 시점 코드를 보고 판정했는가) · 색인 등재 · 형식의 기계 검증.
- **하지 않음** — 조사 *품질*은 강제하지 않는다. lint는 전제가 **적혀 있고 그 경로가 실존하는지**만 본다. 내용의 정확성은 사람과 모델의 몫이다. 과대 주장하지 않는다.
- **receipt를 발행하지 않는다** — 조사는 게이트가 아니다(`GATE_IDS` 미등재). 다음 게이트를 막지도, 열지도 않는다.
- **PRD를 자동 생성하지 않는다** — 종료 시 산출물 경로를 출력하고, 사람이 그것을 `/mccp:plan-prd`에서 인용한다.

```bash
M="${CLAUDE_PLUGIN_ROOT}/scripts/lib/meta-research.js"
```

## Phase 0 — SCAFFOLD

**선행 preflight.** 산출물을 만들기 **전에** README 색인 표의 존재를 확인한다. 없이 진행해도 Phase 4의 `register`가 결국 막지만, 그때는 이미 사용자가 Phase 1~3에 시간을 쓴 뒤다. 같은 fail-closed를 가장 싼 시점으로 옮기는 것이며 새 게이트가 아니다.

```bash
grep -q '^## 색인$' .claude/_meta/README.md || {
  echo "STOP: .claude/_meta/README.md 에 '## 색인' 표가 없습니다. 색인 표를 먼저 만드세요."; exit 1; }
```

사용자와 주제(`$ARGUMENTS`)를 확정하고 slug을 정한 뒤 scaffold한다. 한국어 주제는 ASCII slug 도출이 불가하므로 `--slug`를 명시해야 한다(도출 실패 시 커맨드가 exit 1로 요구한다).

```bash
DOC=$(node "$M" scaffold --topic "<주제>" --slug "<ascii-slug>")
echo "$DOC"
```

산출된 문서는 **태어날 때 lint red**다 — `## Premises`가 비어 있기 때문이다. 이것이 의도된 설계이며, Phase 4가 통과할 유일한 길은 전제를 실제로 적는 것이다.

## Phase 1 — EVIDENCE

저장소 코드 근거를 수집한다. **각 근거를 찾는 즉시 `## Premises` 표에 기록한다** — 나중에 몰아 적지 않는다.

```bash
git rev-parse --short HEAD   # 시점 셀에 쓸 sha
```

| 열 | 무엇을 적는가 |
|---|---|
| 참조 | repo-relative 경로. `path/to/file.js:120` · `path/to/file.js:98-102` 형태 허용(줄 번호는 검사 시 무시된다) |
| 시점 | commit sha(7~40자) **또는** ISO 날짜(`YYYY-MM-DD`). 그 외 형식은 `BAD_TIMESTAMP`로 거부된다 |
| 무엇을 전제하는가 | 그 코드가 지금 이렇다는 사실 중 판정이 의존하는 부분 |

절대경로·드라이브 문자·UNC·`..`·저장소 밖으로 나가는 symlink 경유 경로는 전부 거부된다. 조사 결과가 저장소 밖 파일을 전제하면 그 전제는 재검증이 불가능하기 때문이다.

수집한 근거 본문은 `## Evidence`에 서술한다.

## Phase 2 — PRIOR ART

외부 문헌. **이 커맨드는 문헌 조사를 자동화하지 않는다** — 사용자가 `/deep-research` 등 기존 채널로 얻은 결과를 주면 `## Prior Art`에 배치하고, 없으면 그 절에 **"미조사"라고 명시**한다. 조사하지 않은 것을 조사한 것처럼 비워 두지 않는다.

## Phase 3 — PRECEDENT

저장소 내 선례와 대조한다: `.claude/_meta/` 기존 산출물 · `docs/` · `.claude/prds/` · `.claude/plans/`.

- 같은 문제를 이미 판정한 문서가 있는가. 있다면 그 판정과 이번 판정이 어긋나는가.
- **선행 문서의 전제가 무효화됐는가.** 인용한 코드가 그 뒤 바뀌었으면, 그 문서의 `**Status**`를 갱신하도록 사용자에게 **제안**한다(이 커맨드는 남의 문서를 임의로 고치지 않는다). 상태를 바꾼 문서는 `register`를 다시 돌리면 색인 행의 상태 셀이 갱신된다.

결과를 `## Precedent`에 적는다.

## Phase 4 — VERDICT + REGISTER

`## Verdict`에 판정을, 남은 불확실은 `## Open Questions`에 적은 뒤 아래 **세 호출을 순서대로** 실행한다.

**stop-at-first-failure** — 셋은 순차이며, 각 호출의 exit code를 확인해 **0이 아니면 즉시 중단하고 뒤 단계를 실행하지 않는다.** 세 호출을 모두 돌린 뒤 마지막 결과만 보는 형태는 금지다: 그 형태는 `--pre-register` 실패에도 `register`가 실행되어, 이 순서가 없애려던 **고아 색인 항목**을 정확히 되살린다.

```bash
node "$M" lint --doc "$DOC" --pre-register --json   # (1) 등재 전 형식 검사 — L1/L2/L3
node "$M" register --doc "$DOC"                     # (2) 색인 등재 (idempotent)
node "$M" lint --doc "$DOC" --json                  # (3) 전체 검사 — L4까지 확인
```

**순서가 계약이다.** (2)가 (1)보다 앞서면 lint 실패 시 색인에 무효 문서를 가리키는 고아 항목이 남고, `register`는 원자 치환이라 되돌릴 지점도 없다. (1)을 앞에 두면 **(2)에 도달한 문서는 이미 L1/L2/L3 green**이므로 고아 창이 존재하지 않는다. (3)은 L4까지 닫혔음을 확인하는 read-only 확인이다.

**실패 시 남는 것** — 조사 문서 파일은 **남긴다**(사용자의 조사 내용이므로 지우면 작업이 소실된다). 색인은 **건드리지 않는다**. 즉 "형식 미달 산출물을 남기지 않는다"의 정확한 의미는 *색인에 등재하지 않는다*이며, 되돌릴 write를 애초에 하지 않으므로 rollback 기구가 없는 것이 결함이 아니다. 실패 출력은 미충족 `code`와 문서 경로, 그리고 **뒤 단계가 실행되지 않았다는 사실**을 함께 알린다. 사람이 고쳐 재실행하면 되고, 재실행은 idempotent다.

자주 나오는 `code`:

| code | 뜻 | 고치는 법 |
|---|---|---|
| `PREMISES_EMPTY` | 전제를 안 적었다 | `## Premises`에 최소 1행 |
| `BAD_TIMESTAMP` | 시점 셀이 sha도 ISO 날짜도 아니다 | `git rev-parse --short HEAD` 또는 `YYYY-MM-DD` |
| `REF_NOT_FOUND` | 참조 경로가 실존하지 않는다 | 경로 오타 확인 |
| `REF_OUTSIDE_REPO` | 참조가 저장소 밖을 가리킨다 | repo-relative 경로로 교체 |
| `MISSING_COMPONENT` | 규격 섹션/헤더 키 누락 | 출력된 이름의 절을 복구 |
| `NOT_INDEXED` | 색인 미등재 | (2) `register` 실행 |

## 종료 출력

```
조사 산출물: <DOC>
다음 단계(선택): 이 문서를 근거로 /mccp:plan-prd 를 시작할 수 있습니다 — 경로를 Evidence 로 인용하세요.
```

PRD 자동 생성은 하지 않는다. `/mccp:plan-prd`는 사용자와의 co-creation을 요구하므로 자동 생성은 그 계약과 충돌한다.
