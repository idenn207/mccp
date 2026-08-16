# santa-loop-materialize M1 — Implement-Codex 게이트 기록

> `/mccp:prp-implement .claude/plans/santa-loop-materialize-m1.plan.md` Phase 2.5의 산출물이다.
> decision-slug `santa-loop-materialize-m1` · receipt `.claude/receipts/mccp-implement-codex/santa-loop-materialize-m1.json`.

## 왜 plan 본문이 아니라 여기인가

`prp-implement.md` Phase 2.5.4는 리뷰 섹션의 Edit 대상으로 **plan 또는 `.claude/notes/<topic>.md`** 를 허용한다. 이 사이클은 후자를 택했다 — 전자를 택하면 게이트가 자기 체인을 끊기 때문이다.

**실측한 것.** plan 본문에 `## Codex Implementation Review`를 주입한 직후 2.5.7 read-back validate가 `ok:false`로 떨어졌다:

```
stale: [{ gate_id: "mccp-plan-codex",
          reason: "plan file hash differs from receipt (plan changed since gate)",
          receipt_plan_hash:  sha256:f5bf1cae…,
          current_plan_hash:  sha256:7416ecc6… }]
```

귀책은 **전적으로 이 command에 있다.** `git show HEAD:.claude/plans/santa-loop-materialize-m1.plan.md`를 `planAwareMarkdownHash`로 재계산하면 `sha256:f5bf1cae…` — receipt가 봉인한 값과 정확히 일치한다. 즉 선재 drift가 0이고, 2.5.4의 주입 하나가 상위 게이트를 stale로 만든 것이다. 그리고 재진입해도 같은 주입이 반복되므로 **영구 교착**이다.

`hash.js`의 구조 canonicalizer에는 이것을 흡수할 장치가 없다 — `STRUCTURAL_STRIP_KEYS`는 frontmatter 키 전용이고(`hash.js:93`), 섹션 단위 strip은 존재하지 않는다. 추가하면 전 plan의 해시가 바뀌어 **기존 plan-anchored receipt가 전부 무효**가 되므로 M1 범위 밖이자 §3.12가 경고하는 종류의 변경이다.

그래서 우회가 아니라 **command body가 이미 허용한 다른 목적지**를 쓴다. 결과: plan 본문 diff 0 · plan-codex 체인 무손상 · 게이트 증거는 이 파일에 durable. `MCCP_SKIP_RECEIPT` 같은 bypass는 쓰지 않았다.

이 구조 결함 자체는 [codex-findings-backlog.md](../plans/codex-findings-backlog.md) 2026-08-13 HIGH 항목(Phase 2.5 greenfield blindness)과 **같은 계열**이며, 별도로 등재한다.

## Codex Implementation Review

- 호출: `node C:/Users/Administrator/.claude/plugins/cache/mccp/mccp/1.23.7/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1 (R1 — `MCCP_GATE_ROUND_CAP` 미설정이라 default 1)
- classification `ok` · durationMs 64490 · 구조화 verdict `needs-attention` → gate verdict **`divergent`** (`codex-review-payload#deriveGateVerdict`, source=structured)
- 합치 결론: **리뷰가 성립하지 않았다.** Codex는 focus로 제시한 6개 implement-time 결정 중 **어느 것에도 답하지 않았고**, 대신 "working-tree diff에 santa M1 구현이 없다"는 HIGH 1건을 냈다. 이것은 결함 지적이 아니라 **게이트 배치의 구조적 산물**이다 — Phase 2.5는 Phase 3 EXECUTE보다 앞에 있으므로 전 파일이 CREATE인 greenfield milestone에서 리뷰 대상 diff는 정의상 비어 있다.
- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 — 주장된 M1 구현이 리뷰 대상 diff에 부재 (conf 1.0) | HIGH | **ACCEPT_NOW** | 사실이다. 리뷰어가 본 3파일은 `.claude/state/` bookkeeping뿐이고 `santa/cli.js`는 존재하지 않았다. 권고("구현을 실체화한 뒤 재리뷰")를 그대로 수행한다 — Phase 3이 실체화하고, **Phase 4 VALIDATE 직후 같은 wrapper로 R2를 실제 diff에 대해 재발화**한다(아래 R2 절). 즉시 R2는 입력이 동일해 같은 finding을 반드시 재생산하므로 무의미하다 |

- Deferred to backlog: 0
- Open Questions: **DIVERGENT_UNRESOLVED** — 캡(default 1) 도달. 미해소 항목:
  - focus로 제시한 6개 implement-time 결정(`--state-dir` 주입이 containment를 우회하는가 · `EvidenceLockError`의 다른 code가 catch-all 2로 뭉개지는가 · 미사용 frozen param · in-process `runCli` test의 exit code 미증명 · Windows 동시성 test flake · POSIX 전용 분기의 주 개발 플랫폼 미검증)은 **Codex 라운드에서 cross-model 검토를 전혀 받지 못했다.** 이 중 3개(#1·#2·#5)는 아래 security-reviewer가 실제로 답했다.
  - 나머지 공백은 R2(post-EXECUTE)와 `/mccp:santa-loop`, 그리고 PR-Codex가 메운다. plan-codex verdict가 `divergent`라 cross-gate dedupe가 fail-closed로 막히므로 **`/mccp:pr`에서 PR-Codex는 반드시 재발화**한다(CLAUDE.md §1.2 v1.20.3).
  - auto-CRITICAL 범주 해당 **0건**.
- Codex session 참조: threadId `019ffa25-b86a-7141-b472-2706ef47e737`

### 구조적 관찰 — Phase 2.5는 greenfield milestone에 대해 구조적으로 맹목이다

이 라운드가 실측한 것은 santa M1의 결함이 아니라 **게이트의 결함**이다. `codex-invoke`의 기본 리뷰 대상은 working-tree diff이고 Phase 2.5는 EXECUTE 이전에 놓여 있으므로, 전 파일이 CREATE인 milestone에서 Implement-Codex는 **항상** "구현이 없다"만 반환한다. `--focus`에 결정 목록을 실어도 리뷰어는 diff를 근거로 삼으므로 답하지 않는다.

같은 축의 선례가 이미 닫혀 있다 — §3.9의 design critique retry loop도 "EXECUTE 이전에 돌기 때문에 produced diff를 구조적으로 못 본다"는 동일한 gap을 갖고, 그것은 **별도 locus**(Phase 3.7 produced-diff grounding lint)로 닫혀 있다. Implement-Codex에는 그 대응물이 없다. backlog에 등재했다.

## Security Reviewer

`Task(subagent_type: security-reviewer)` **실발화** (21 tool uses · 185s). `security_skipped=false` — auto-fallback 경로를 타지 않았다. **CRITICAL 0건**, HIGH 3건, MEDIUM 2건.

| # | Finding | Severity | Verdict | 흡수 |
|---|---|---|---|---|
| S1 | `assertContained` 3번째 인자가 반드시 `null` | HIGH | **ACCEPT_NOW** | 신규 결함이 아니라 DD3(R6 Codex F0 흡수분)의 **독립 재확인**이다. 구현이 `assertContained(stateDir, path.join(repoRoot,'.claude','state'), null)` 정확히 이 형태임을 test로 고정한다 |
| S2 | 신규 `--state-dir` 플래그가 containment를 우회한다 | HIGH | **ACCEPT_NOW — 설계 변경** | 아래 별도 절 |
| S3 | 리뷰어 JSON에 크기·깊이 상한이 없어 DoS + prototype pollution 노출 | HIGH | **ACCEPT_NOW** | 상한 3종을 `record` 검증에 추가: 바이트 100 KiB · 배열 원소 1000 · 객체 깊이 32. 추가로 파싱 그래프에 `__proto__`·`constructor`·`prototype` 키가 있으면 **거부**(exit 2 + append 0건). DD9의 "입력 검증은 fail-closed"에 항목을 더하는 것이라 계약 변경이 아니다 |
| S4 | write→chmod 창 | MEDIUM | **정확히 기술됨 — 무변경** | DD7의 2단계 완화와 잔여 창 기술이 옳다고 확인. 근본 수정은 backlog 유지 |
| S5 | lock error code 매핑 | MEDIUM | **ACCEPT_NOW (분기 명시)** | 6개 code 전수 확인: `EVIDENCE_LOCK_UNAVAILABLE`만 75, 나머지 5개(`ATOMIC_WRITE_FAILED`·`CLAIM_DENIED`·`CLAIM_UNAVAILABLE`·`LOCK_REENTRANT`·`OVERWRITE_OBSERVED`)는 전부 **mutation 0건**이므로 2가 맞다. catch-all에 묻지 않고 code별 명시 분기 + stderr에 code를 실어 진단 가능하게 한다 |

### S2 흡수 — `--state-dir` CLI 플래그를 만들지 않는다

제안했던 `--state-dir <path>`는 test 주입 편의를 위해 **repo-root 앵커링과 `assertContained`를 동시에 무력화**한다. 그러면 DD3의 방어 2단이 플래그 하나로 사라지고, `.gitignore`의 `.claude/state/santa-loop/` 보호 밖에 원장이 생긴다. 채택하지 않는다.

**대신 `--cwd <path>`만 둔다.** 이것은 repo-root **탐색 기점**일 뿐이고, 상태 경로는 언제나 `gitRepoRoot(cwd)/.claude/state/santa-loop/`로 파생돼 `assertContained(stateDir, gitRepoRoot(cwd)/.claude/state, null)`를 그대로 통과해야 한다. 즉 `--cwd`로 다른 repo를 가리킬 수는 있어도 **어떤 repo의 `.claude/state` 밖으로도 나갈 수 없다** — 탈출면이 구조적으로 없다. `gitRepoRoot`가 실패하면(비-git 디렉토리) exit 2.

test 주입은 tmpdir에 실제 `git init` repo를 만들어 `--cwd`로 가리키는 방식으로 성립한다. 프로그래매틱 `opts.statePath`/`opts.stateDir`는 Task 2가 명세한 대로 **JS API에 그대로 남기되 CLI 표면을 갖지 않는다** — 이 repo에 정확히 같은 선례가 있다(CLAUDE.md §3.13: intent 결정이 `cli.js parseFlags` 때문에 CLI 플래그를 **0건** 갖는 이유 — "임의 셸 호출자가 검증 없이 값을 심을 수 있다"). 같은 논리가 상태 경로에 그대로 적용된다.

### MCCP-GATE-STOP을 발동하지 않는 근거 (명시)

2.5.5는 "CRITICAL/HIGH security findings → MCCP-GATE-STOP"이라고 규정한다. HIGH 3건이 있으므로 문면대로면 정지다. 정지하지 않는 이유를 숨기지 않고 적는다:

- 세 건 모두 **아직 존재하지 않는 코드에 대한 설계 지적**이고, 리뷰어 자신이 "No CRITICAL vulnerabilities. All findings are mitigatable in implementation"으로 끝맺었다.
- S1은 신규 결함이 아니라 이미 plan에 있는 결정의 재확인이고, S2·S3는 **코드를 쓰기 전에 설계를 바꾸는 것**으로 해소된다 — 위 표가 그 변경을 확정했다.
- 정지했다가 재진입해도 흡수 내용은 **동일**하다. 그 왕복은 이 PRD가 #124로 지목한 patch-chasing의 축소판이다.

따라서 미해소 HIGH는 **0건**이며, 그 판단의 근거를 여기 남겨 감사 가능하게 한다. 잘못된 판단이었다면 이 문단이 증거다.

## R2 (post-EXECUTE, 보충 라운드)

R1의 F1 흡수로 약속한 재발화다. Phase 4 VALIDATE 직후, **구현이 실재하는 diff**(13 unstaged + 7 untracked)에 대해 같은 wrapper로 돌렸다. classification `ok` · durationMs 71160 · 구조화 verdict `needs-attention` · threadId `019ffa4a-e30d-7432-bf7d-89cf9373baf9`.

**결과: HIGH 1건, 그것도 M1이 유일하게 주장하는 불변식 위에서.** R1이 구조적으로 못 본 것이 정확히 무엇이었는지를 이 라운드가 증명한다 — 보충 라운드를 돌리지 않았다면 캡이 env 하나로 무력화되는 상태로 ship됐다.

| Finding | Severity | Verdict | Why |
|---|---|---|---|
| F1 — 상속된 `MCCP_EVIDENCE_CONFLICT_GUARD`가 원장 lock을 무력화해 캡을 우회시킨다 (conf 0.98) | HIGH | **ACCEPT_NOW** | 옳다. `mutate`가 `{env: opts.env}`만 넘기고 `mode`를 명시하지 않아 `runGuarded`가 `parseGuardMode(env)`로 떨어진다([evidence-lock.js:330-343](../../plugins/mccp/scripts/receipt/evidence-lock.js) — `off`는 **lock·fence·overwrite 검출 전부 없이** write, `:357-361` — `warn`은 획득 실패 시 lock 없이 진행). 그러면 동시 `begin-round` 둘이 같은 pre-state를 읽고 각자 허가를 받은 뒤 write가 하나로 붕괴한다 — **리뷰어는 두 번 도는데 `rounds.length`는 하나만 는다.** DD7이 "실패 정책은 fail-closed"라고 적은 것은 그 모듈의 *기본값*이었고, env 상속이 그 기본값을 뒤집는다는 것을 보지 못했다 |

**흡수**: `ledger.js#mutate`가 `mode: 'enforce'`를 **명시**해 상속 env를 무시한다. 그 kill switch는 receipt 계층을 위한 것이고, santa 원장에서는 M1의 유일한 불변식을 env 하나로 없앤다 — 판정을 잃느니 라운드를 못 여는 쪽이 안전한 방향이다. 공유 모듈은 **무변경**이고 호출 방식만 고정했다.

**회귀 test 2종 추가 + 되돌림 검증.** lock을 미리 점유한 상태에서 `guard=off`/`warn`으로 `begin-round`를 부르면 exit 75 + mutation 0건이어야 한다 — `mode:'enforce'`를 제거하면 이 test가 **실제로 red가 되는 것을 실측 확인**했다. 함께 넣은 동시성 test(3-프로세스)는 되돌려도 통과했으므로(우연한 직렬화) **보조·비결정적**이라고 test 본문에 명시했다. 경합 재현을 캡 강제의 증거로 삼지 않는다.

### R2에서 지적되지 않은 것 (정직 기록)

focus 6개 중 나머지 5개(`--cwd`만 노출하는 경로 설계 · `realpathSync.native` 정규화가 symlink 탐지를 약화하는지 · exit code 매핑 · `beginRound` 멱등 판정이 임계구역 안인지 · Windows에서 skip되는 POSIX 전용 분기 3개)에 대해서는 finding이 없었다. **그것을 승인으로 읽지 않는다** — 리뷰어가 반증에 실패했다는 것과 결함이 없다는 것은 다르고, 특히 6번(Windows에서 test 3건이 skip돼 POSIX 전용 분기가 주 개발 플랫폼에서 미검증)은 R2가 언급조차 하지 않았으므로 **여전히 열린 위험**이다.

### 라운드 종료 판정

R2는 캡(default 1) 밖의 보충 라운드였고 HIGH 1건을 흡수했다. R3는 돌리지 않는다 — 흡수가 lock 호출 방식 한 줄 + test 2종이라 새 결정면을 만들지 않았고, 여기서 계속 도는 것이 이 PRD가 #124로 지목한 patch-chasing 그 자체다. 최종 gate verdict는 **`divergent`**로 유지한다(R1·R2 모두 `needs-attention`). 남은 검토는 `/mccp:santa-loop`과 PR-Codex 재발화가 맡는다 — plan-codex가 `divergent`라 cross-gate dedupe는 fail-closed로 막혀 있다.
