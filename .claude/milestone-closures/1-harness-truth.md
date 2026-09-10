# Milestone Closure — 1-harness-truth

## Milestone
- ID         : 1-harness-truth
- Name       : harness-truth
- PRD        : .claude/prds/codex-harness-portability.prd.md
- Plan       : .claude/plans/codex-harness-portability-m1.plan.md
- Status     : done
- Closed at  : 2026-09-09T05:40:07Z
- Closed by  : /mccp:milestone-close (run_id=6113517c-6a22-446a-9106-69be2cd6adac)

## Acceptance Condition

이 milestone의 acceptance는 산문이 아니라 두 기계가 낸다.

1. `scripts/codex-probe/report.js`의 `milestone_closeable` — 하한은 A1(로그에
   `trust_mode==='trusted'` 줄이 존재하는가)이다. 이 규칙은 리뷰 R1 invariant-HIGH의 흡수이며
   **이번 사이클에서 한 글자도 바뀌지 않았다.**
2. plan `## Acceptance`가 열거한 라이브 산출물 7종.

## Goal Loop Result

사용자 응답(grammar, verbatim):

```
goal-done:A1 measured under real trust
```

**`/goal` 루프는 돌지 않았다.** 이 milestone의 acceptance를 결정적 오라클이 판정하므로 turn마다
small model이 조건 충족을 추정할 이유가 없었다. 돌지 않은 루프를 돌았다고 적지 않는다.
사용자 지시는 이 세션의 명시 선택("A1을 실측한 뒤 닫는다")이었고, 아래가 그 실측이다.

### 기계 판정

```
A1_hook_fires        measured
A2_event_enum        measured
A3_auto_discovery    measured
A4_trust_procedure   measured
A5_env_projection    measured
A6_payload_shape     measured
revert_integrity     measured
measured: 7/7
milestone_closeable: {"ok":true,"reason":"A1_hook_fires measured"}
```

### plan Acceptance 산출물 7종 (전부 실행 확인)

| # | 요구 | 실측 |
|---|---|---|
| 1 | 프로브 로그 비어 있지 않음 | 10줄, 전부 `trust_mode=trusted` |
| 2 | truth JSON `runs` >= 1, 각 원소에 `codex_version` | runs=9, 전부 versioned |
| 3 | 7축 전부 verdict, `unmeasured`마다 사유 | 7/7 measured (`unmeasured` 0) |
| 4 | 실제 홈 mccp 귀속 투영 전후 동일 (DD3-b) | `clean=true`, added=[], removed=[] |
| 5 | `scan-coupling.js`의 `unlisted:0` | 0 |
| 6 | tracked 산출물 2종이 DD10 관문 통과 | 둘 다 `ok=true hits=0 truncated=false` |
| 7 | teardown 후 scratch home·auth 사본 부재 | `scratch_home_absent=true auth_copy_absent=true` |

단위 test 184/184 green(신규 A1 배선 4건 포함). 실제 `~/.codex`는 무변경 —
`hooks.state` 0건, plugin 캐시 무변화, 계측이 만든 auth 사본 전량 삭제.

### A1을 연 값 — 비대화형 hook trust 승인

첫 측정은 발화 6건을 보고도 A1을 접었다. 전부 `--dangerously-bypass-hook-trust`였고,
"신뢰 절차를 지나 발화한다"와 "신뢰 절차를 껐다"는 다른 사실이기 때문이다. 그때 적힌 것은
"비대화형 경로가 **없다**"가 아니라 "**찾지 못했다**"였고, 그 구분이 이 재측정을 가능하게 했다.

- 승인 기록: `config.toml`의 `[hooks.state."<key>"] { enabled = true, trusted_hash = "<currentHash>" }`.
  스키마 `HookStateToml { enabled: bool, trusted_hash: string }`는 타입 오류 역추적으로 확정했다.
- `<key>`·기대 hash·`trustStatus`(`managed|untrusted|trusted|modified`)는 **계산하지 않고**
  app-server의 `hooks/list`가 준 것을 그대로 쓴다. 계산하면 Codex의 산식이 바뀌는 날 조용히
  어긋나고, 그 어긋남은 "발화 0"과 같은 모양이라 계측기가 자기 측정을 오염시킨다.
- `-c` dotted-path override로는 적용되지 않는다 — key가 config 경로를 담아 파서가 쪼갠다.
- **음성 대조**: hash 1바이트 오류 → `trustStatus=modified` → 발화 0. 승인이 실제로 일어나야만
  hook이 돈다. 우연히 도는 경로가 아니다.

이 값은 M1의 판정 규칙을 완화해 얻은 것이 아니다. 규칙은 그대로 두고, 그 규칙을 만족하는
실행을 만들었다.

## 이 종료가 주장하지 않는 것

- **A2의 4종은 여전히 발화 미확인** — `PreCompact` · `PostCompact` · `SubagentStart` ·
  `SubagentStop`은 config가 받지만 한 턴짜리 `exec`에서 도달하지 않는다. 수용 확인, 발화 미확인.
- **대화형(TTY) 세션 미측정** — 전 측정이 `codex exec`(비대화형)다.
- **이벤트 enum 완전성 미보장** — 29개 이름을 시험해 부재를 확인했을 뿐이다.
- **결합 열거는 규칙 집합 안에서만 완전** — `scan-coupling.js`의 닫힌 규칙 4종 밖은 안 보인다.
- **선행 `mccp-plan-codex` receipt 부재** — 슬러그 불일치로 chain이 끊긴 상태는 그대로다.

위 다섯은 M1의 acceptance가 아니며 판정 문서의 `## 미측정으로 남은 것과 그 이유`에 그대로 남는다.

## Provenance
- Lock run_id        : 6113517c-6a22-446a-9106-69be2cd6adac
- Lock owner session : 5436417e-d611-44a9-9d25-7f87a07f48f6
- Codex CLI version  : 0.153.4
- mccp plugin version: 1.34.4 (브랜치는 version을 선언하지 않는다 — §3.7 우산 결정 1)
- Report oracle      : scripts/codex-probe/report.js `deriveReport().milestone_closeable`
- Raw record         : .claude/_meta/data/2026-09-09-codex-harness-truth.json
- Verdict document   : docs/codex-harness-portability/m1-harness-truth.md
