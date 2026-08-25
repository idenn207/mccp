# Implementation Report: impeccable 탐지 계약 M6 — 이연 정리와 질문 종결

> plan: `.claude/plans/impeccable-detection-contract-m6.plan.md`
> 게이트 산출물·실측·라이브 관측은 `.claude/notes/impeccable-detection-contract-m6.md`가 소유한다.
> version `1.32.0 → 1.32.1` (patch — PRD 안의 단일 milestone ship).

## Summary

M1~M5가 탐지·판정·이름·발화·문서를 고치는 동안 자기 축에 쌓인 이연을 닫고, PRD가 연 채로 둔
질문 3건을 측정으로 답했다. **새 능력은 없다** — 게이트가 발화하는 대상도 판정 결과도 바뀌지
않았고, 바뀐 것은 *잘못된 입력을 거부하는 자리*와 *거짓으로 적혀 있던 주장*뿐이다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium — 다만 문서 축이 plan 예상보다 컸다(정정 3면 + M6 절) |
| Confidence | — | 코드 축 높음(전건 test 고정), 라이브 축 낮음(아래 미충족 참조) |
| Files Changed | 23 UPDATE + 1 CREATE | 23 UPDATE + 2 CREATE(노트 · 이 보고서) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 0 | 착수 전 실측 기록 | 완료 | 5건 전부 plan 기재와 일치. **plan V7 검증 명령의 결함 1건 발견** |
| 1 | schema 여분 키 거부 | 완료 | `ROUTED_ENTRY_KEYS` whitelist + `req(...)`. legacy 예외 없음 |
| 2 | write 경로 정규화 + canonical | 완료 | `path.resolve(cwd,…)` + `canonicalRoutedEntry` throw. 부재는 여전히 조용 |
| 3 | 죽은 `.claude/cache/` 분기 제거 | 완료 | 2곳(`:471`·`:1218`). 제거 전후 `renderingSurface` 동일을 실측으로 확인 |
| 4 | 래칫 증가 방향 가시화 | 완료 | `EVIDENCE_DEBT_CEILING=29` 로드 시점 throw + 짝 단언 |
| 5 | 창/매처 통합 | 완료 | A/B/C 기준선 불변(115/24/5/19). export 이름 유지 |
| 6 | 역방향 범위 | 완료 | 디렉토리 앵커 + `value.js` 역방향 전용 추가 + 강제되는 제외 표 |
| 7 | 거짓 주석 정정 | 완료 | 3면. 실측으로 반증 후 정정 |
| 8 | `IMPECCABLE_NO_UPDATE_CHECK` 두 면 | 완료 | **방향 정정** — 아래 Deviations 참조 |
| 9 | PRD Open Questions 3건 | 완료 | 전부 `[x]`. (a)는 잔여를 명시 |
| 10 | state 아티팩트 정합 | 완료 | `fix-task-applied.md` fingerprint `-m4 → -m5` |
| 11 | test | 완료 | 신규 11건(routing 3 · ceiling 3 · lint 5 · guard 1) |
| 12 | 문서·릴리스 정합 | 완료 | gate-design M6 절 · CLAUDE.md 1문단 · CHANGELOG · 4면 · PRD · backlog |
| 13 | 라이브 완주 | **부분** | 넷 중 둘 관측, 둘은 **관측 불가**(원인 규명 완료 — 아래) |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| V1 receipt 축 | 통과 | `impeccable-routing-fields` 12/12 (M6 신규 3건 포함) |
| V2 env-contract | 통과 | 64/64 · `lint.js` L1~L10 exit 0 · A/B/C 115/24/5/19 (기준선 동일) |
| V3 impeccable 오라클·가드 | 통과 | 137/137 |
| V4 탐지 실물 | 통과 | `available:true` · plugin 4.1.1 · `impeccable:impeccable` · `shadowed:false` |
| V5 전체 회귀 | 통과 | **3500 tests · 3484 pass · 0 fail · 16 skipped** (exit 0, 25.8분). plan이 적은 «M5 기준선 682»는 같은 명령의 산출과 맞지 않는다 — 판정 기준인 **fail 0**은 충족한다 |
| (추가) renderer suite | 통과 | 672/672 (V5 범위 밖이지만 version 4면을 건드렸으므로 확인) |
| V6 문서·릴리스 | 통과 | `i18n-surface` 10/10 · instruction-contract C1~C4 pass |
| V7 죽은 분기 봉인 | 통과 | `git ls-files .claude/cache/` 빈 출력 · 이스케이프 형태 hit **0**(변경 전 2) |
| V8 머지 삭제 검증 | 통과 | 79건 전부 M3 커밋 `66aaa19`의 의도적 project-local 사본 제거. 그 디렉토리 밖 삭제 0 · 워킹트리 삭제 0 |

### Design Grounding

**N/A (no design trigger).** 2.5.5b가 `design_signal=false`(reason `no-signal`)를 내 capture
아티팩트가 만들어지지 않았고 Phase 3.7은 완전 no-op이다. 원인은 아래 미충족 항목과 같다.

## Files Changed

| File | Action | 요지 |
|---|---|---|
| `.claude/notes/impeccable-detection-contract-m6.md` | CREATED | 실측 5건 · Open Questions 측정 · 라이브 관측 |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATED | 여분 키 거부(검증자 쪽) |
| `plugins/mccp/scripts/receipt/write.js` | UPDATED | cwd 정규화 + canonical throw(작성자 쪽) |
| `plugins/mccp/commands/prp-implement.md` | UPDATED | 죽은 cache 항 제거 2곳 + 사유 |
| `plugins/mccp/scripts/lib/env-contract/evidence-debt.js` | UPDATED | ceiling + 헤더/주석 정정 |
| `plugins/mccp/scripts/lib/env-contract/measure-evidence.js` | UPDATED | 창/매처 통합 + 주석 정정 |
| `plugins/mccp/scripts/lib/env-contract/scan.js` | UPDATED | 제외를 디렉토리 앵커로 |
| `plugins/mccp/scripts/lib/env-contract/lint.js` | UPDATED | L10 역방향 표면 정책 + 강제 |
| `plugins/mccp/scripts/lib/env-contract/registry.js` | UPDATED | evidence `:702 → :713`(Task 3 부작용 해소) |
| `docs/ENVIRONMENT.md` · `docs/environment/external.md` | UPDATED | 기본값 표기 명확화 + Node degraded 절 |
| `docs/gate-design.md` · `CLAUDE.md` · `CHANGELOG.md` | UPDATED | M6 절 · 상주 불변식 · 1.32.1 항목 |
| `plugin.json` · `renderer/html.js` · `renderer/markdown.js` | UPDATED | version 4면 동기 |
| `.claude/prds/…prd.md` · `.claude/plans/codex-findings-backlog.md` · `.claude/state/fix-task-applied.md` | UPDATED | milestone complete · 해소 9 + 이연 4 · fingerprint |
| 4개 test 파일 | UPDATED | 신규 11건 |

## Deviations from Plan

1. **plan의 V7 검증 명령이 결코 붉어질 수 없었다.** `grep -n "claude/cache" …`는 소스가
   슬래시를 이스케이프한 `/\.claude\/cache\/…/` 형태라 그 분기를 못 잡고, 산문 한 줄만
   잡는다. 변경 전에도 후에도 isSurface 안에서 0 hit이므로 **falsifiable하지 않다.**
   `grep -n 'claude..cache'`로 대체했다(변경 전 2 hit → 후 0 hit). 리뷰어 완화가 아니라
   검증 명령이 자기 주장을 측정하지 못하는 결함의 수정이다.

2. **Task 8의 해소 방향을 뒤집었다.** plan은 "사실은 상세 쪽(미설정)이므로 색인을 맞춘다"고
   지시했으나, registry의 **DD2가 `bool`/`bypass-flag`의 `default`와 `polarity`를 «같은 사실의
   두 표기»로 못박는다**(`registry.test.js`). 즉 색인의 `off`는 벤더 설정값이 아니라 **극성**
   (미설정 시 동작)이고 그 자체로 참이다. 두 면은 서로 다른 질문에 답하고 있었다. 색인·registry를
   되돌리고 상세 쪽 문구를 «`off` (= 미설정 시 동작. 벤더는 설정하지 않으므로 원문도 unset)»으로
   명확히 해 해소했다. 처음에 plan대로 고쳤을 때 DD2 test 2건이 붉어져 방향을 바로잡았다.

3. **Task 3이 registry evidence 1건을 밀어냈다.** `prp-implement.md`에 주석 12줄을 넣으며
   `IMPECCABLE_FORCE_OVERRIDE_REASON`의 evidence(`:702`)가 ±2 창 밖으로 나가 A→B가 됐다.
   impeccable 축 이름이라 면제 목록에 넣는 것이 구조적으로 금지돼 있어(M5 설계) 실제 read
   site(`:713`)로 옮기는 것이 유일한 해소였다. 이후 A/B/C가 기준선으로 복귀했다.

4. **Task 6의 근거 문장을 실측에 맞게 다시 썼다.** plan은 `value.js`를 «그 디렉토리에서
   유일하게 런타임에 env를 읽는 파일»이라 불렀는데 문자 그대로는 거짓이다 — 그 디렉토리의
   어느 파일도 `process.env`를 직접 읽지 않는다(그 이름이 나오는 3곳은 전부 주석). 포함시키는
   진짜 이유는 **값 해석 계층**이라 `IMPECCABLE_*`가 리터럴로 처음 나타날 자리라는 것이고,
   그 문장으로 코드 주석과 문서를 적었다.

5. **Task 6의 제외 표를 강제되게 만들었다.** plan은 "이름으로 열거하고 사유를 적는다"만
   요구했으나, 열거만 하면 화석이 되므로 L10이 디렉토리를 훑어 **미분류 `.js`를 problem으로**
   보고한다. 그것이 DD6이 말한 "미래의 조용한 면제를 막는다"의 유일한 실질이다.

## Issues Encountered

- **Codex 쿼터 소진으로 Implement-Codex 게이트가 fail-closed 정지.** wrapper는
  `classification=exit-nonzero`로만 보고하고 사유를 지우므로 companion을 직접 호출해 확인했다
  (`parseError: "You've hit your usage limit … try again at Aug 30th, 2026"` — 그 날짜는 확정
  시각이 아니다). 사용자 승인으로 `MCCP_ALLOW_CODEX_UNAVAILABLE=1` advisory 진행,
  receipt는 `codex_verdict=unavailable` + `advisory=true`로 **비승인**을 사실대로 봉인했다.
  → `/mccp:pr`은 Phase 0에서 advisory를 거부하므로 쿼터 복구 전까지 PR은 열리지 않는다.
- **plan-codex receipt가 부모 슬러그에 실려 체인 검증이 missing.** 패널은 **이 본문**
  (`plan_hash sha256:887fc89…`)을 읽고 `converged`(quorum 4/4)했으나 `/mccp:plan`이 슬러그를
  `-m6` 없이 도출했다. 위조(파일명 변경)도 재실행(13.4분 재지불, 새 정보 0)도 쓰지 않고,
  이미 상주하는 `MCCP_RECEIPT_GATE_MODE=soft`의 의미(**missing-only만 통과**)를 read-back에서
  지켰다. M4에서도 같은 일이 있었다.
- **security-reviewer 미발화** — 세션 운영 지침이 사용자 요청 없는 AgentTool 호출을 금지해
  명령 본문의 auto-fallback을 탔고 `security_skipped=true`가 봉인됐다.
- **Bash 도구의 백슬래시 붕괴**로 정규식을 포함한 패치 앵커가 0 match를 냈다. 라인 기반
  패치와 Write 도구 경유 스크립트로 전환해 해소했다.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `receipt/tests/impeccable-routing-fields.test.js` | 3 | 여분 키 거부(작성자·검증자) · `args.cwd` 상대 경로 해소 |
| `env-contract/tests/evidence-debt.test.js` | 3 | `CEILING === length` 짝 단언 · 초과 시 throw · 대조군 |
| `env-contract/tests/lint.test.js` | 5 | 역방향 발화·대조군 · 미분류 파일 · 디렉토리 부재 무해 · 제외 앵커 |
| `lib/tests/impeccable-guard.test.js` | 1 | 죽은 cache 항 부재 **짝** 단언 |

## 미충족 — Acceptance 중 라이브 축

plan의 Acceptance는 라이브 완주가 `impeccable_commands_routed`에 **finish 5건을 정규 3키로**
남길 것을 요구한다. **충족하지 못했고, 억지로 만들지 않았다.** 두 게이트가 독립적으로 음성이다:

- 2.5.5b는 **EXECUTE 이전** diff를 평가하므로 M6이 고칠 `receipt/write.js`·`renderer/*.js`
  (셋 다 `DESIGN_SURFACE_PATHS` 소속)를 아직 볼 수 없다 → `design_signal=false`.
  구현 완료 후 같은 탐지기를 다시 돌리면 **`true`**이고 `signal_files`가 정확히 그 셋이다.
- Phase 3.6.1의 조건 2(`FINISH_SURFACE`)는 post-EXECUTE로 재도 **0**이다 — 이 diff에는
  UI 확장자 파일이 하나도 없다(전부 control-plane `.js`와 문서).

즉 트리거를 감사 override로 켰더라도 Phase 3.6은 자기 조건에서 다시 멎는다. **plan의 Acceptance가
이 diff에 맞지 않았다**는 것이 결론이며, Task 1·2가 고친 write 경로는 실제 `write()`/`validate()`를
호출하는 신규 test 3건이 대신 덮는다(단위 통과 ≠ 경로 작동은 그대로 유효). 2.5.5b의 구조적
blind는 **신규 관측**으로 backlog에 이연했다.

## Code-review 흡수 (ship 직전, 2026-08-24)

`/mccp:code-review` Local Review Mode를 돌려 **7건**을 받았고 사용자 판단으로 **전건 흡수**했다
(§3.14는 HIGH만 즉시 흡수하도록 정하므로 MEDIUM·LOW 5건은 규율상 이연 대상이었다). plan 본문은
건드리지 않았다 — `plan_hash` 봉인 유지.

| Sev | 지적 | 흡수 |
|---|---|---|
| HIGH | `evidence-name.js:24-30`이 M6이 바꾼 **자기 판정 코어**의 동작을 부정한다(substring 제외 · 디렉토리를 영원히 못 본다 · «backlog에 있다»). 마지막 항은 backlog의 `[해소 — Task 6]` 표시와 정면 충돌 | 헤더 재작성 + 잔여 명시. 「거짓 주석 3면 정정」이 놓친 **네 번째 면** |
| MEDIUM | `write.js`/`schema.js`의 `ROUTED_ENTRY_KEYS` 복제에 일치 단언 없음 — Task 5가 `measure-evidence.js`에서 지운 결함과 동형 | 양쪽 export + 대조 test 1건. require 순환 때문에 공유 모듈은 불가하므로 단언으로 묶음 |
| MEDIUM | backlog 표가 빈 줄로 두 조각 — M6 이연 4건이 헤더 없는 표가 됨(derive 파싱은 무영향, 렌더만 파손) | 빈 줄 제거. 파싱 292건 불변 확인 |
| MEDIUM | `scan.js`·`gate-design.md`의 substring 예시(`docs/env-contract-notes.md`)가 `walkSurfaces` 범위 밖 | 범위 안 예시로 교체(양면) |
| LOW | `L10_REVERSE_SURFACE_POLICY`의 화석 방지가 **새 파일 방향뿐** — 열거된 `include:false` 파일이 사라져도 침묵 | 부재도 problem. test 2건(발화·대조군) |
| LOW | backlog 마지막 행이 자기 셀에 리터럴 파이프를 담아 **스스로 잘림** | HTML 엔티티로 표기. 파서 원인은 미해소(그 행이 기술하는 그대로) |
| LOW | CHANGELOG 헤딩 날짜 | 실제 ship 일자로 |

재검증: lint L1~L10 exit 0 · A/B/C 기준선 불변(115/24/5/19) · env-contract + guard + i18n 94/94 ·
receipt corpus 76/76 valid · backlog 파싱 292건(마지막 finding이 끝까지 온전) ·
§3.5.1 삭제 검증 79건 전부 `.claude/skills/impeccable/` 내부(그 밖 **0건**).

## Next Steps

- [ ] `/mccp:prp-commit` — 이 사이클을 커밋 (플랜 본문은 **더 이상 편집 금지** — receipt
      `plan_hash`가 디스크와 일치해야 `/mccp:pr` staleness 가드가 통과한다)
- [ ] `/mccp:pr` 진입 직전 §3.7 version **재계산**(현재 main 1.31.0 · sibling 1.30.0 → 1.32.1 유효)
- [ ] Codex 쿼터 복구 후 구현시점 결정 D1~D8의 cross-model 회수 (backlog 등재)
- [ ] AgentTool 허용 세션에서 security-reviewer 회수 (backlog 등재)
- [ ] PRD 전체 종료 시 `/mccp:archive-complete`
