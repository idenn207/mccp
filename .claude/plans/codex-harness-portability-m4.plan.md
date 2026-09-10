# Plan: codex-harness-portability M4 — reviewer-inversion

**Source PRD**: .claude/prds/codex-harness-portability.prd.md
**Selected Milestone**: 4 — reviewer-inversion
**Complexity**: Large
**Status**: IN PROGRESS — CLI measurement complete; gate integration and M4 acceptance pending

## Summary

Codex 호스트의 plan·implement·pr 게이트가 Claude 계열 리뷰어를 호출하고, 호출 불가·응답 불명·동일 계열 리뷰를 승인으로 기록하지 못하게 한다. 기존 Claude 호스트의 Codex 리뷰 경로와 receipt 식별자는 유지한다. 실제 CLI 호출, 세 게이트의 결과 소비, 실패 음성 대조까지가 M4이며 전체 decision 완주·하네스 교차 이어달리기는 M5 및 후속 PRD의 판정이다.

PRD 표에서 다음 pending인 M4를 선택했다. M3.5는 in-progress로 남아 있다. 현재 설치본 1.34.4에서 command-reach가 plan 본문을 해소한 사실은 확인했으나, 그것으로 M3.5의 배포 acceptance를 완료 처리하지 않는다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | Codex 호스트일 때 리뷰어는 Claude 계열이다. | constraint |
| UI2 | 리뷰어를 부를 수 없으면 게이트는 통과가 아니라 fail-closed다. | constraint |
| UI3 | plan implement pr 세 게이트의 cross-model 불변식을 보존한다. | direction |
| UI4 | .claude-plugin 디렉터리를 옮기지 않고 추가만 한다. | constraint |
| UI5 | plugin을 fork하지 않고 중립인 코어 식별자를 유지한다. | constraint |
| UI6 | 브랜치는 plugin.json version을 선언하지 않는다. | constraint |
| UI7 | Codex reviewer와 Codex host를 문서 코드 receipt에서 분리한다. | constraint |
| UI8 | command 본문 감량 C8은 이번 범위에 포함하지 않는다. | exclusion |
| UI9 | 채널 분리와 타 사용자 설치 UX는 이번 범위가 아니다. | exclusion |
| UI10 | 하네스 교차 이어달리기 실증은 후속 PRD가 소유한다. | exclusion |
| UI11 | 비용 모델 테이블 확장은 MVP 완주를 막지 않으면 이연한다. | exclusion |
| UI12 | 결합 지점과 각 처분을 대조 가능한 목록으로 남긴다. | constraint |
| UI13 | 이번 plan 작업은 Workflow 없이 진행한다. | exception |
| UI14 | 이번 계획 검토는 Codex 리뷰로 진행한다. | exception |
| UI15 | divergent 결과가 나오면 backlog에 기록하고 receipt를 작성한다. | direction |

UI13과 UI14는 이번 계획 검토의 실행 제약과 명시 예외다. 제품의 Workflow 제거나 향후 Codex-host 리뷰어의 Claude 계열 요구를 변경하지 않는다. UI15는 실제 divergent 판정을 보존한다는 뜻이며 converged로 바꾸라는 요구가 아니다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Naming | `plugins/mccp/scripts/lib/harness-ingress.js:115` | 순수 resolveHarness 함수로 명시 지목 우선·unknown 구분. 별도 환경변수 추측 판별자를 만들지 않는다. |
| Errors | `plugins/mccp/scripts/lib/codex-invoke.js:372` | 호출 envelope의 classification·blocking·advisory와 timeout·출력 상한을 구분한다. |
| Logging | `plugins/mccp/scripts/lib/codex-invoke.js:448` | stdout은 기계용 JSON, stderr는 이름 있는 진단. 리뷰에 답한 경우만 round를 소비한다. |
| Data access | `plugins/mccp/scripts/lib/plan-codex-runner.js:409` | 리뷰 호출부터 intent 판정·receipt 발행까지 같은 runner가 결과를 보유한다. |
| Verdict | `plugins/mccp/scripts/lib/codex-review-payload.js:45` | 구조화 응답만 승인 근거로 삼고 자유 텍스트 키워드로 승인하지 않는다. |
| Compatibility | `plugins/mccp/scripts/receipt/schema.js:1180` | 신규 감사 필드는 present-only; makeSkeleton에 넣지 않고 구 receipt를 재봉인하지 않는다. |
| Tests | `plugins/mccp/scripts/lib/tests/codex-invoke-json.test.js:24` | node:test·node:assert, 임시 디렉터리와 argv를 캡처하는 가짜 실행 파일로 실제 subprocess 경계를 검사한다. |

## Multi-Perspective Fan-out

사용자 지시에 따라 Workflow를 실행하지 않았다. 예약·에이전트 발화는 0건이며 위 인라인 조사가 grounding 근거다. 다관점 리뷰 또는 cross-model 승인을 받았다는 뜻이 아니다.

## Design Decisions

### DD1 — 측정이 transport 구현에 선행한다

Task 1에서 설치된 Claude CLI의 버전·비대화형 호출·인증·구조화 출력·모델 식별·읽기 전용 제한을 직접 측정한다. 현재 로컬 실행 파일 경로가 존재하는 것만 확인했으며 실제 리뷰 호출 가능 여부는 미측정이다. flag나 응답 구조를 가정해 제품 코드를 먼저 쓰지 않는다. 보호 파일의 전후 hash와 의도적인 쓰기 요청을 짝지어 권한 제한을 확인한다. 프롬프트의 read-only 문구만으로 제한이 있다고 주장하지 않는다.

인증 실패나 사용량 제한이면 실패 원자료와 진단을 남기고 transport 이후 구현을 보류한다. bypass 권한 플래그·자동 인증 변경·호스트 Codex로의 fallback은 없다. 정상·오류 fixture를 비밀값 제거 후 보존한다.

### DD2 — gate 전용 중립 진입점

새 reviewer-invoke facade가 기존 resolveHarness를 사용한다. claude → 기존 codex-invoke, codex → 새 claude-review-invoke, unknown/모호함 → blocking. 기존 codex-invoke 공개 API와 briefing 같은 비게이트 호출은 그대로 둔다. Codex 호스트에서도 기존 plan 모드가 multi-agent라고 해서 Codex 패널만으로 M4 승인을 만들지 않는다. 해당 호스트는 Claude 외부 리뷰를 필수로 갖는 runner 경로로 연결하고, 모드·호스트·리뷰어를 진단에 각각 기록한다.

세 게이트의 실제 호출 지점과 CLI의 닫힌 flag allowlist를 함께 바꾼다. plan runner의 단일 writer·nonce·lock·intent reference 전달을 보존한다. intent arbiter 등 부가 리뷰의 하네스 전용 도구도 호출 경로 목록에 넣고, Codex에서 필요한 경로가 없으면 게이트를 unavailable로 종료한다. 모든 명령/agent를 이식하는 작업으로 확대하지 않는다.

### DD3 — 결과·권한·정책의 경계

transport는 shell 문자열 실행 없이 argv와 stdin을 사용한다. timeout·최대 출력·process 종료를 제한하고, credential·전체 환경변수를 로그에 쓰지 않는다. 실제 응답의 모델 식별자를 검증해 Claude 계열임을 확인한다. 지정한 모델 문자열이나 리뷰어 자신의 자유 텍스트 주장은 실행 증거가 아니다. 식별 불가·상이한 계열·exit nonzero·인증 오류·timeout·빈 출력·malformed JSON·미지 verdict 모두 blocking이며 승인 receipt를 발행하지 않는다.

Claude 응답을 기존 구조화 verdict/findings 소비 계약으로 변환하되 새 transport에서 legacy 텍스트 fallback은 금지한다. intent constraint reference·finding ID·심각도·판정 vocabulary도 검증한다. 승인 단어가 섞인 오류 문자열을 approve로 해석하지 않는다.

기존 MCCP_CODEX_DISABLED 봉인은 Codex 호출에만 적용한다. 이를 지우거나 Claude 리뷰를 성공한 Codex skip으로 대체하지 않는다. MCCP_ALLOW_CODEX_UNAVAILABLE 등 기존 advisory escape로 새 Claude 실패를 승인하지 않는다. review-rounds의 gate+decision 봉인·cap·실제 응답 시 소비 규칙을 새 transport에서도 적용하고, 미호출 cap 종료는 승인 아님을 유지한다. 새 환경변수가 필요하면 registry·문서·lint를 같은 변경으로 추가한다.

### DD4 — 리뷰 증거는 M4, 일반 호스트 출처는 M5

Claude 결과를 resolution.codex_verdict에 쓰거나 review_source=codex/hybrid로 위장하지 않는다. 제안 계약은 resolution.reviewer_verdict와 resolution.reviewer_execution의 present-only 쌍이다. execution은 schema_version, gate_id, decision_id, host_family, reviewer_family, actual_model, run_nonce, subject_hash, evidence_path, evidence_hash를 갖는다. 필드와 enum은 구현에서 하나의 validator가 소유한다. family·모델 일치, 실행 성공, 현재 gate·decision·검토 대상 hash 및 상대 evidence 경로를 검증한 runner만 봉인한다. 임의 승인 JSON을 받아 새 증거를 봉인하는 CLI 경로는 추가하지 않는다.

새 쌍이 하나라도 있으면 그것이 판정 축을 소유한다. 부분·손상·동일 계열·실재하지 않는 증거·hash 불일치는 unavailable이며 legacy codex_verdict로 내려가지 않는다. 새 쌍과 legacy 승인 축의 동시 존재는 거부한다. 기존 receipt에 새 쌍이 전혀 없으면 기존 판독을 유지한다. 단 Codex 호스트의 새 gate 진입/PR dedupe에서는 legacy Codex 승인만으로 cross-model 완료를 주장하지 못한다. 하네스 정책을 entry부터 소비처까지 전달해 이 조건을 강제한다.

schema·write·validate-cmd·review-verdict·receipt-convergence·PR finalize의 호출 계약을 함께 검증한다. 새 필드는 makeSkeleton에 넣지 않고 구 corpus를 수정하거나 receiptHash에서 제외하지 않는다. 이것은 M4의 리뷰 실행 증거이며 producer_harness·session 연속성·completion-ledger 재설계 및 전체 chain 감사는 M5에 남긴다.

### DD5 — 세 게이트와 PR dedupe

plan은 Claude transport를 runner 안에서 호출하고 intent 판정 경계를 유지한다. implement는 동일 facade 결과를 받아 검토한 subject와 receipt를 결합한다. PR은 기존 lock·heartbeat·review-only·finalize/read-back을 보존한다. plan/implement의 새 증거가 모두 현재 대상에 유효하고 반대 계열에서 converged인 경우만 PR dedupe 후보가 된다. residual 검사 등 기존 조건도 모두 유지한다. 증거 누락·legacy-only·동일 계열·변조·divergent이면 실제 PR 리뷰를 실행하며, 호출할 수 없으면 출하를 막는다.

기존 gate ID와 decision ID는 바꾸지 않는다. 문서에서 gate의 역사적 이름과 실제 reviewer를 분리해 적는다. M4 실측은 dedupe가 적용되지 않는 대상을 사용해 세 게이트 모두 Claude를 실제로 호출했다는 증거를 남긴다.

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/reviewer-invoke.js` | CREATE | host 판별과 gate 전용 transport 선택, CLI 진입점 |
| `plugins/mccp/scripts/lib/claude-review-invoke.js` | CREATE | 측정된 Claude CLI 계약과 fail-closed subprocess adapter |
| `plugins/mccp/scripts/lib/review-rounds/ledger.js` | UPDATE | 실제 Claude 호출을 codex로 위장하지 않는 claude 채널 기록 |
| `plugins/mccp/scripts/lib/review-rounds/tests/ledger.test.js` | UPDATE | Claude 채널 추가에 따른 닫힌 어휘 계약 검증 |
| `plugins/mccp/scripts/lib/tests/plan-codex-runner.test.js` | UPDATE | runner의 실제 기본 의존성이 중립 facade인지 검증 |
| `plugins/mccp/scripts/lib/reviewer-evidence.js` | CREATE | 새 verdict/execution 쌍의 공통 검증 및 evidence binding |
| `plugins/mccp/scripts/lib/plan-codex-runner.js` | UPDATE | 중립 facade 연결·단일 writer·intent 보호 |
| `plugins/mccp/scripts/lib/plan-review/cli.js` | UPDATE | Codex 호스트에서 Claude 필수 경로 선택 및 진단 |
| `plugins/mccp/scripts/lib/pr-phase-helpers/codex-runner.js` | UPDATE | PR transport 선택·새 실행 증거 전달 |
| `plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js` | UPDATE | 실제 reviewer 판정 봉인과 read-back |
| `plugins/mccp/scripts/lib/review-verdict.js` | UPDATE | 새 축 우선순위와 cross-model 검증 |
| `plugins/mccp/scripts/lib/receipt-convergence.js` | UPDATE | 새로운 판정 축을 canonical helper로 소비 |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE | present-only 쌍 검증, legacy와 충돌 거부 |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | 실행 결과에서만 새 필드 생성 |
| `plugins/mccp/scripts/receipt/validate-cmd.js` | UPDATE | evidence 실재·hash·host 문맥 검사 |
| `plugins/mccp/scripts/receipt/dedupe.js` | UPDATE | 새 cross-model 증거와 legacy Codex-host 거부 |
| `plugins/mccp/commands/plan.md` | UPDATE | 호스트별 필수 reviewer 경로와 불가 시 진단 |
| `plugins/mccp/commands/prp-implement.md` | UPDATE | 중립 gate 호출 및 증거 전달 |
| `plugins/mccp/commands/pr.md` | UPDATE | reviewer 구분·dedupe·실패 설명 |
| `scripts/codex-probe/reviewer-probe.js` | CREATE | CLI 계약과 세 게이트의 정상/차단 실측 |
| `scripts/codex-probe/coupling-inventory.js` | UPDATE | M4 결합 지점 처분·M5 잔여 구분 |
| `plugins/mccp/scripts/lib/tests/reviewer-inversion.test.js` | CREATE | routing·transport·실제 자식 프로세스 실패 matrix |
| `plugins/mccp/scripts/receipt/tests/reviewer-inversion.test.js` | CREATE | 세 gate write/read·증거 변조·legacy·dedupe 회귀 |
| `scripts/tests/reviewer-probe.test.js` | CREATE | probe 음성 대조·redaction·불완전 측정 거부 |
| `docs/codex-harness-portability/m4-reviewer-inversion.md` | CREATE | 측정 버전·실행 계약·잔여 한계 및 재현 절차 |
| `.claude/_meta/data/codex-harness-portability-m4.json` | CREATE | 비밀값을 제거한 실측 원자료와 상대 evidence 참조 |
| `.claude/prds/codex-harness-portability.prd.md` | UPDATE | M4 plan 링크 및 실측 후에만 결과 기록 |
| `CLAUDE.md` | UPDATE | host/reviewer 구분 및 gate 호출 계약 갱신 |

구현 중 기존 테스트나 env registry의 추가 변경이 필요하면 구체 경로를 이 표에 먼저 추가한다. 문서 감량·version bump·배포 변경은 포함하지 않는다.

## Tasks

### Task 1: Claude reviewer 경로를 먼저 측정한다
- **Action**: 두 CLI 버전, 인증을 바꾸지 않는 정상 호출, 출력 schema, actual model, 읽기 전용 실행, timeout/실패를 측정한다. sanitized fixture와 재현 가능한 probe를 작성한다. Claude 한도 때문에 호출이 불가하면 unavailable로 기록하고 아래 의존 작업을 멈춘다.
- **Mirror**: `scripts/codex-probe/scan-coupling.js`의 관측과 선언 분리, 기존 probe의 음성 대조.
- **Validate**: 신규 probe 테스트 및 live mode가 버전·actual_model·성공/실패 쌍·보호 파일 hash를 가진 원자료를 만든다. 실행 파일 존재만으로 pass하지 않는다.

### Task 2: 순수 routing과 fail-closed transport
- **Action**: Task 1에서 확정된 계약으로 facade·Claude adapter·정규화 결과를 만든다. 하네스 양성 신호, unknown, subprocess 오류, 실제 모델 불일치, malformed 응답을 먼저 실패 테스트로 고정한다. round seal/cap을 재사용한다.
- **Mirror**: harness-ingress resolveHarness, codex-invoke envelope와 가짜 companion subprocess 테스트.
- **Validate**: 호스트 3종 × 성공/오류/모델 불일치 matrix, argv 경계, timeout, 쓰기 거부, 비밀값 미출력, 기존 Codex adapter 회귀.

### Task 3: 최소 리뷰 증거와 판정 reader
- **Action**: DD4 쌍을 공통 validator에 정의하고 writer·schema·canonical verdict·validate-cmd에 연결한다. subject는 기존 gate별 hash 계산을 재사용한다. 상대 evidence 경로·hash를 검증하고 임의 경로 파일을 읽지 않도록 기존 상대 경로 계약을 적용한다.
- **Mirror**: review-verdict의 부분 stamp fail-closed 및 schema present-only 선례.
- **Validate**: partial pair·동일 계열·gate/decision/subject 불일치·없는/변조 evidence·경로 탈출·legacy 축 혼재 거부. 구 receipt corpus hash 불변과 기존 판정 유지.

### Task 4: 세 gate의 실제 호출·봉인 경로 연결
- **Action**: plan runner, implement 명령, PR helper/finalize를 facade와 새 증거로 연결한다. Codex host의 panel-only 승인을 거부하고 Claude 필수 경로를 지목한다. intent arbiter·보안 리뷰 등 필요한 부가 단계가 native 도구에 묶인 경우 그 결합과 가능한 호출 경로를 기록하고, 미지원이면 정직한 unavailable로 종료한다. 우회해 완주했다고 주장하지 않는다.
- **Mirror**: plan runner 단일 프로세스 intent 판정, PR lock/heartbeat·review-only.
- **Validate**: 각 실제 entry에서 fake executable을 호출해 승인/거부를 receipt read-back까지 검사한다. 단순 facade 단위 테스트로 이 task를 완료하지 않는다. intent 누락·동시 writer·stale nonce·PR 쓰기 시도도 회귀 검사한다.

### Task 5: dedupe·회귀·실측으로 닫는다
- **Action**: DD5의 양방향 host 정책을 dedupe에 연결한다. 세 gate마다 실제 Claude 호출 한 건과 unavailable 음성 대조 한 건을 남긴다. probe는 임시 대상에서 gate/receipt 경로를 실행하며 PR 공개 게시를 필요로 하지 않는다. 결합 inventory 및 문서에 M4 완료와 M5 잔여를 분리한다.
- **Mirror**: receipt/dedupe의 residual+cross-model AND, probe의 보호 연산 미발생 검증.
- **Validate**: 실제 세 gate의 reviewer family가 Claude, host family가 Codex이며 결과 hash가 현재 검토 대상과 일치한다. 호출 실패 대조에서 승인 receipt와 보호 연산이 발생하지 않는다. 추가 필수 단계가 막히면 M4 acceptance를 열어 둔다.

## Validation

다음은 구현 후 실행할 명령이며, 아직 존재하지 않는 신규 테스트·probe의 인터페이스도 이 계획이 정의한다.

```bash
node --test plugins/mccp/scripts/lib/tests/reviewer-inversion.test.js
node --test plugins/mccp/scripts/receipt/tests/reviewer-inversion.test.js
node --test scripts/tests/reviewer-probe.test.js
node --test plugins/mccp/scripts/lib/tests/codex-invoke.test.js plugins/mccp/scripts/lib/tests/codex-invoke-json.test.js plugins/mccp/scripts/lib/tests/codex-review-payload.test.js plugins/mccp/scripts/lib/tests/plan-codex-runner.test.js
node --test plugins/mccp/scripts/lib/tests/pr-phase-helpers/codex-runner.test.js plugins/mccp/scripts/lib/tests/pr-phase-helpers/finalize-receipt.test.js
node --test plugins/mccp/scripts/lib/review-rounds/tests/
node --test plugins/mccp/scripts/receipt/tests/
node --test scripts/tests/codex-probe.test.js
node plugins/mccp/scripts/lib/env-contract/lint.js
node scripts/codex-probe/reviewer-probe.js --live --out .claude/_meta/data/codex-harness-portability-m4.json
git diff --check
```

live probe는 credential을 저장하지 않고 CLI 버전·검토 대상 hash·실제 모델·gate별 반환/차단 결과·evidence 상대경로를 저장한다. unavailable 축은 unmeasured로 남는다. 제품 코드 구현 전에는 plan L1 및 diff 검증만 실행한다.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Claude 예산·인증 부족으로 실제 역방향 호출 불가 | 높음 | Task 1로 먼저 측정; unavailable 차단과 미측정 기록, 다른 계열 fallback 금지 |
| transport는 작동하나 명령의 Task/Workflow 단계가 남음 | 높음 | 세 entry의 실제 실행을 acceptance로 강제; 부가 도구 결합을 측정하고 범위/잔여를 기록 |
| Claude 응답을 Codex 승인으로 오기록 | 높음 | 별도 present-only 증거 축과 canonical reader; legacy 축 혼재 거부 |
| 기존 Codex receipt만으로 Codex-host PR 리뷰가 생략됨 | 높음 | host 문맥 전달과 legacy-only 음성 대조, residual 조건 유지 |
| M4 최소 증거가 M5 provenance 재설계로 확장됨 | 중간 | 리뷰 실행에 필요한 정보만 추가; producer/session/ledger 변경은 M5 |
| CLI 읽기 전용 제한을 프롬프트로 오인 | 중간 | 보호 파일 변조 음성 대조와 process 제한 실측, 미검증 시 사용 불가 |

## Acceptance

- [x] Task 1에서 Claude CLI 호출·actual model·읽기 전용·실패 경로를 실측했다.
- [ ] Codex-host plan·implement·pr 세 gate가 각각 실제 Claude 응답을 소비하고 현재 subject에 결합된 증거를 남겼다.
- [ ] 세 gate의 unavailable 음성 대조에서 승인 receipt 및 보호 대상 연산이 발생하지 않는다.
- [ ] 동일 계열·모델 식별 불가·응답 손상·부분 stamp·증거 변조·legacy-only Codex-host dedupe가 모두 fail-closed다.
- [ ] 기존 Claude-host Codex 경로, intent gate·round cap·PR lock 및 구 receipt hash의 회귀 검증을 통과했다.
- [ ] command-only 정적 검사나 adapter 단위 테스트를 실제 gate 완주로 세지 않는다.
- [ ] 결합 목록과 M5 잔여를 기록했고 M3.5 또는 전체 PRD의 완료를 자동 주장하지 않았다.
- [ ] 위 검증 명령이 통과하고 실측 원자료와 문서가 서로 대조된다.

## Open Questions

- Claude CLI의 현재 설치에서 모델 식별·구조화 응답·읽기 전용 리뷰를 함께 만족하는가: Task 1의 구현 착수 조건. 미측정이며 승인으로 간주하지 않는다.
- gate 부가 단계의 Claude 전용 도구 결합이 세 경로 실측을 막는가: Task 4에서 경로별 확인. 미지원이면 M4 완료를 선언하지 않는다.

## Codex Adversarial Review

- 호출: 설치본 1.34.4의 plan-codex-runner.js → codex-invoke.js adversarial-review.
- 라운드 수: 1 (봉인된 cap=1).
- 합치 결론: DIVERGENT_UNRESOLVED — 기존 subjectHash는 미커밋 구현 내용의 동일성을 증명하지 못한다. 사용자 요청에 따라 수정 없이 backlog에 이연하며 실제 Codex 판정은 runner가 receipt에 봉인한다.
- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1: Existing subject hashes cannot bind uncommitted implementation content | HIGH | DEFER_TO_BACKLOG | subjectHash는 HEAD·plan 등이 같으면 미커밋 변경을 구별하지 못한다. 별도 reviewed-content digest 또는 불변 commit 대상을 정의하고 review 전후·봉인·재사용 시 검증해야 한다. 이번 요청은 divergent 지적을 backlog에 보존하는 것이므로 해결했다고 주장하지 않는다. |

- Deferred to backlog: 1 → `.claude/plans/codex-findings-backlog.md`.
- Open Questions: HIGH — staged·unstaged·관련 untracked 변경을 포함한 검토 대상 binding 또는 불변 commit 정책; HEAD와 plan을 고정한 변경 회귀 테스트 필요. secret exposure·data loss·irreversible migration·auth bypass·external destination change·crypto key handling의 auto-CRITICAL 항목은 이 finding에 없다.
- 원문 증거: `.claude/reviews/codex-harness-portability-m4-codex-r1.json`.
- Run nonce: `4e230e13-3319-4289-9c3e-f57398cdf94b`.
- Intent adjudication: Task 도구 부재로 author fallback (arbiter_degraded 기록). F1의 개선안 수용은 UI3의 cross-model 불변식을 강화하며 사용자 제약과 충돌하지 않는다. reviewer의 UI3 표기는 문제의 관련 요구로 이해하며 conflict=none 판정의 근거를 intent_dispute_reason에 남긴다.
- 이 리뷰는 동일 Codex 계열의 별도 프로세스 검토다. 향후 M4의 Claude reviewer acceptance 충족 증거가 아니다.

## Codex Implementation Review

- 호출: 설치본 1.34.4의 `scripts/lib/codex-invoke.js adversarial-review` (run-command resolver가 검증한 prp-implement 본문).
- 라운드 수: 1 (봉인된 cap=1).
- 합치 결론: DIVERGENT_UNRESOLVED — 구조화 verdict `needs-attention`을 canonical helper가 `divergent`로 판독했다. 기존 F1 외 추가 HIGH/CRITICAL finding은 없었다.
- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | 기존 F1: uncommitted implementation content binding | HIGH | DEFER_TO_BACKLOG | Plan-Codex에서 이미 이연한 미해결 항목이다. 이번 리뷰도 해결 또는 승인을 주장하지 않는다. |

- Deferred to backlog: 기존 1건 유지 → `.claude/plans/codex-findings-backlog.md`; 신규 finding 0건.
- Open Questions: HIGH — 기존 F1의 검토 대상 binding. auto-CRITICAL 신규 항목 없음.
- Codex session 참조: `01a089d3-876c-7110-9dd7-894bc3312020`.
- 원문 증거: `.claude/reviews/codex-harness-portability-m4-implement-codex-r1.json`.
- 이 동일 계열 리뷰는 M4의 Claude reviewer acceptance 증거가 아니다.

### Security Reviewer

- 2026-09-10 재개: 사용자가 "codex가 대신 해당 역할을 진행해줘"라고 명시하여 `Task(security-reviewer)`를 별도 Codex 에이전트 `/root/security_review`로 대체했다. 네이티브 Task 호출 또는 Claude 계열 리뷰로 기록하지 않는다.
- 결과: 신규 HIGH/CRITICAL blocker 없음. 기존 F1 HIGH는 미해결·이연 상태 유지. 제안 구현의 보안 설계 검토이며 제품 코드 또는 실제 Claude acceptance 검증은 아니다.
- 구현 시 적용: evidence 상대 경로는 문자열 검사뿐 아니라 realpath containment로 symlink 탈출도 거부한다(`scripts/lib/path-containment.js` 패턴). 보호 파일은 임시 fixture로 한정하고 stdout/stderr 모두 저장 전에 비밀값을 제거한다. runner의 원자적 봉인 및 nonce·gate·decision 음성 대조를 유지한다.
- 디자인 탐지: `skill_available=true`, `design_signal=false`, `silent_skip=true`, `silent_skip_reason=no-signal`. 디자인 intent override 없음. 명령의 no-signal 분기를 적용하며 디자인 승인은 주장하지 않는다.

아래는 재개 전 중단 이력이다.

- 2026-09-10 Phase 2.5.5에서 중단: 권한 제한·입력 검증·상대 evidence 경로 검증 변경은 필수 `Task(subagent_type="security-reviewer")` 대상이나 이 Codex 세션에는 Task 도구가 없다.
- run-command 스킬의 "When you reach one, say which tool is missing and stop at that step rather than improvising a substitute."에 따라 대체 호출 없이 중단했다. 보안 리뷰는 미실행이며 Phase 2.5.6 receipt 발행과 Phase 3 Task 1 측정·제품 구현에 진입하지 않았다.
- 진입 시 선행 receipt validator는 exit 0이었다. 기존 미커밋 변경으로 remote rebase는 거부되었으며 기존 변경을 보존했다.

## External Research Provenance

- Source PRD: .claude/prds/codex-harness-portability.prd.md
- References section sha256: 418212b71a4c1719a2686c561b4ccfa35258753ea632cf71be75fe0fc9d96efa
- Stamped at: 2026-09-10T05:01:49.963Z
- Anchor: References digest captured for the pending plan receipt; no approval receipt has been issued.

## Execution Status

- 구현 checkpoint: `docs/codex-harness-portability/m4-reviewer-inversion.md`. Task 1 실측 통과, adapter/routing 및 evidence writer/reader 기반 구현과 plan runner 초기 연결까지 진행했다. implement/PR 최종 봉인 연결 및 세 gate 실제 호출 acceptance는 미완료다.
- 사용자가 승인한 `MCCP_SKIP_INTENT_GATE` 사유는 CLI 최소 길이 조건에 맞춰 기존 검증과 hash 변경 복구 설명을 덧붙였다. 재봉인 당시 `divergent`와 `intent_gate_verdict=incomplete`를 유지했고 진입 검증은 통과했다. 이후 구현 커밋/계획 추가로 이전 receipt는 최종 구현 증거가 아니다.
- 후속 Codex 보안 리뷰 HIGH 2건(증거 실재 검증 누락·최초 대상 본문 전달 누락)은 코드와 테스트에 흡수했다. 기존 F1은 미해결이며 전체 M4 승인을 주장하지 않는다.
- 회귀 실행은 `MCCP_BRIEFING=off`로 격리한다. Node 22의 `node --test <directory>` 대신 `*.test.js`를 명시한다. Windows 형식 plan 경로가 POSIX에서 실패한 기존 테스트는 writer의 경로 정규화로 복구했다.
- 2026-09-10 재개: 사용자가 Codex 리뷰 및 divergent 결과의 backlog·receipt 기록을 명시 요청했다. 기존 M4 초안을 재검토하며 M5를 새로 선택하지 않는다.
- Review mode: codex (이번 요청에 한정). Workflow는 미실행.
- 독립 Codex 프로세스 리뷰는 동일 모델 계열의 검토다. M4 제품 acceptance의 Claude 계열 리뷰 실측을 대신하지 않는다.
- 이전 실행은 Skill 도구 부재로 디자인 단계에서 멈췄고 승인 receipt를 발행하지 않았다. 이번 실행은 요청된 Codex 리뷰를 진행하며 미지원 디자인 호출을 skip 사유로 전달한다.

## Design Critique

> impeccable unavailable, skipped: resolved impeccable:impeccable but this Codex session has no Skill invocation tool; proceeding with the explicitly requested Codex review and recording the unavailable design invocation. No design approval is claimed.
