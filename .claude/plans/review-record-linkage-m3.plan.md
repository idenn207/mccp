# Plan: review-record-linkage M3 — bidirectional-link

**Source PRD**: `.claude/prds/review-record-linkage.prd.md`
**Selected Milestone**: M3 `bidirectional-link`
**Decision slug**: `review-record-linkage-m3` (명시 slug — Risk R1)
**Complexity**: Large

## Summary

결정층(ship receipt)과 내용층(패널 레코드)이 서로를 가리키게 한다. 링크는 **파생하지 않고 운반한다** — 두 게이트가 슬러그를 서로 다른 경로로 만들기 때문에(`/mccp:plan`은 인자에서, `/mccp:pr`은 브랜치에서) 파일명 관례의 구조적 천장이 27/75다. `/mccp:plan`이 레코드 경로를 plan receipt에 봉인하고, `/mccp:pr`이 그 값을 — **상류 receipt의 `meta.plan_path`가 이 ship의 plan 경로와 일치할 때에만** — ship receipt로 전파하며, ship이 봉인된 직후 그 해시를 레코드로 되쓴다. 앵커가 어긋나면 침묵한다(무스탬프): 이름은 주소일 뿐 신원이 아니고, 못 찾는 것보다 **잘못 찾는 것**이 위험하다. 그 결과 **이 사이클 자신의 ship은 링크를 담지 않는다** — 상류 receipt가 이 배선보다 먼저 발행돼 `meta.plan_path`를 담지 않기 때문이며, 그것은 결함이 아니라 앵커가 옳게 동작한 결과다(Acceptance 참조). 새 필드 5종은 전부 present-only(`makeSkeleton` 미포함)라 과거 receipt의 `receipt_hash`가 한 바이트도 움직이지 않는다.

같은 milestone에서 지표 2의 **분모 생산자**를 만든다. M1은 `meta.plan_review_expected`의 계약만 정의하고 생산자를 "하류 milestone"에 넘겼는데, 그 생산자가 없으면 자격 집합이 비어 `denominator: null`이 되고 M3의 산출 실값 자체가 계산 불가다. 이것이 PRD Open Question 5("receipt 안의 어떤 필드가 '이 ship에는 plan 리뷰가 없다'를 정직하게 말하는가")의 답이기도 하다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 과거 코퍼스는 소급하지 않는다 — 재봉인도 사이드카도 만들지 않는다 | exclusion |
| UI2 | 새 필드는 present-only여야 하고 `makeSkeleton`에 넣지 않는다 — 과거 receipt의 hash가 불변이어야 한다 | constraint |
| UI3 | 지표 2의 분모는 전체 ship이 아니라 리뷰 대상 ship이다 | constraint |
| UI4 | 판정 정의는 산문이 아니라 파서 코드가 소유한다 — 문서가 파서를 인용한다 | constraint |
| UI5 | 얇은 ship receipt 설계를 바꾸지 않는다 — 리뷰 내용을 receipt로 옮기지 않는다 | exclusion |
| UI6 | `defaultResolution`의 `converged` 축을 건드리지 않는다 | exclusion |
| UI7 | `meta.*_rounds` 5종의 통합·정리를 하지 않는다 | exclusion |
| UI8 | 리뷰 품질 향상·리뷰어 변경·새 게이트 추가를 하지 않는다 | exclusion |
| UI9 | `.claude/reviews/` 내용 형식을 전면 재설계하지 않는다 | exclusion |
| UI10 | backlog 표에 상태 열을 추가하지 않는다 — 우산 Open Question 2 소관이다 | exclusion |
| UI11 | 리드타임 목표치를 정하지 않는다 — C4가 소유한다 | exclusion |
| UI12 | acceptance는 producer가 아니라 산출된 실값이다 — 배선 부재를 보는 test가 없으면 완료가 아니다 | constraint |
| UI13 | 게이트 리뷰는 1라운드를 기본으로 하고 미해소 항목은 명시 이연한다 | direction |
| UI14 | `plugin.json` version은 forward-only로 상향하고 PR 진입 직전 재계산한다 | constraint |
| UI15 | M2는 dropped로 유지한다 — 상류가 이미 출시했다 | direction |
| UI16 | 링크 필드 추가가 과거 receipt의 `receipt_hash`를 흔들면 감사 코퍼스가 파손된다 | constraint |

## Multi-Perspective Fan-out

read-only 4관점(architect · security · test · explorer)이 PRD와 디스크의 M1 plan을 대상으로 돌았다. 산출은 대부분 M1 회고이므로 그중 **M3 표면으로 이월되는 것만** 옮긴다. 판정은 이 plan이 하며, 각 항목은 아래 Task/Risk 중 하나에 결속돼 있다 — 결속 없는 항목은 싣지 않는다.

| 관점 | Severity | 이월된 지적 | 결속 |
|---|---|---|---|
| security | **HIGH** | `classifyLink`의 경로 검사는 denylist이고 M1이 containment를 M3로 미뤘는데, M3가 그것을 빠뜨려도 막을 **강제 장치가 없다** | Task 4 + Task 9(정적 단언) |
| architect | MEDIUM | 같은 축 — DD4의 의무가 산문에만 있고 기계 산출물이 없다 | Task 4 |
| architect | MEDIUM | `linkage-audit`가 `corpus.js`의 4분류 taxonomy에 경성 의존하는데 계약 test가 없다. M3는 같은 이음매(레코드 파싱)를 back-patch로 다시 건드린다 | Task 3 계약 test |
| architect | MEDIUM | M3·M4가 `linkage-audit.js`를 확장할지 형제 도구를 낼지 미정 | 아래 "모듈 경계" |
| test | MEDIUM | 동결 문서의 바이트 일치 acceptance에 **CRLF/LF 발산 안전장치가 없다**. 이 환경은 Windows다 | Task 8 |
| test | MEDIUM | `--frozen-only`의 **결정성/멱등성** test가 없다 — 한 번 통과하고 조용히 갈라질 수 있다 | Task 8 |
| test | GAP | 신규 test가 `.github/workflows/`에 없어 강제가 로컬 실행에만 의존한다 | Risk R9 (이연, 사유 기록) |

**모듈 경계 (지적에 대한 이 plan의 답)**: M3는 새 standalone 도구를 만들지 않는다. 감사 축은 `linkage-audit.js`를 **확장**하고(join 전환만), 새 코드는 `plan-review/link-receipt.js` 하나다 — 변환은 순수 함수이고 I/O는 기존 `plan-review/cli.js`가 소유한다. `evidence-audit.js` 미러(standalone)는 *코퍼스를 대조하는 도구*에만 적용되며 back-patch는 게이트 단계 동작이라 그 형태가 아니다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Present-only meta 필드 | `plugins/mccp/scripts/receipt/write.js:993-1013` | round-ledger 3필드 — `if (available) { receipt.meta.x = … }`. `makeSkeleton` 미포함이 hash 안정성의 근거로 주석에 명시됨 |
| Present-only 값 파싱 | `plugins/mccp/scripts/receipt/write.js:769-788` | `(function () { const v = args['flag']; if (typeof v === 'string' && v.length > 0) return v; return null; })()` |
| Schema present-only 검증 | `plugins/mccp/scripts/receipt/schema.js:634-645` | `if (m.field !== undefined) { req(typeof …, 'meta.field must be …') }` |
| 페어링 불변식(값+사유) | `plugins/mccp/scripts/lib/plan-review/linkage-defs.js:129-140` | 부정 주장에는 사유가 붙어야 하고, 사유 없는 부정은 판정이 아니라 `undecidable` |
| 순수·dep-free 술어 | `plugins/mccp/scripts/lib/plan-review/linkage-defs.js` | `require` 0건 · 총함수 · 판독 불가는 `null`로 접음 |
| Allowlist 식별자 정규화 | `plugins/mccp/scripts/lib/plan-review/record.js:65-77` `sanitizeSlug` | denylist가 아니라 allowlist. Task 4의 containment가 미러할 대상 |
| 파생 플래그 헬퍼 | `plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js:96-215` | `deriveCodexFlags(codexResult)` — 입력 JSON을 읽어 `writeFlags` 배열을 조립. 셸에서 배열을 만들지 않음 |
| 펜스 파싱 | `plugins/mccp/scripts/lib/plan-review/corpus.js:225-273` `parseRecord` | `## Measurement` → ```json 펜스 → `JSON.parse`. 부분 성공 없음 |
| CLI 서브커맨드 | `plugins/mccp/scripts/lib/plan-review/cli.js:1141` `cmdRecord` + `:1532` dispatch | `case '<name>': return cmd<Name>(args)` |
| Staged blob 검증 | `plugins/mccp/scripts/lib/evidence-stage-guard.js` | `git show :<path>`로 **작업 트리가 아니라 인덱스**를 읽어 fail-closed 검사 |
| 감사 출력의 상한 고지 | `plugins/mccp/scripts/lib/linkage-audit.js:390-412` | 수치 옆에 `join`/`join_note`로 구조적 천장을 함께 싣는다 |
| Test | `plugins/mccp/scripts/lib/tests/linkage-{audit,defs}.test.js` | Node native runner · `MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 <files>` |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/receipt/cli.js` | UPDATE | write 플래그 **4종** 등록(다섯 번째 필드 `meta.plan_path`는 플래그를 갖지 않는다 — Task 1) + help 갱신 |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | **5필드** present-only stamp (4종은 플래그, `meta.plan_path`는 `--plan`에서 기계 파생). `makeSkeleton` 미변경 |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE | **5필드** 형태 검증 + D2 페어링 불변식 + over-permissive 거부 |
| `plugins/mccp/scripts/lib/plan-review/record.js` | UPDATE | `measurement.receipt_hash` 키 추가(작성 시점 `null`) + `plan_path`를 receipt와 **같은 헬퍼**로 정규화 (R4 MEDIUM) |
| `plugins/mccp/scripts/lib/plan-review/link-receipt.js` | CREATE | Measurement 펜스의 `receipt_hash`만 갱신하는 순수 변환 |
| `plugins/mccp/scripts/lib/plan-review/cli.js` | UPDATE | `link-receipt` 서브커맨드 + dispatch + 경로 containment |
| `plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js` | UPDATE | 상류 plan receipt를 **`meta.plan_path`(경로 신원)로 앵커 대조**한 뒤 링크·자격 파생 후 write로 전달 (축 K) |
| `plugins/mccp/scripts/lib/evidence-stage-guard.js` | UPDATE | staged 리뷰 레코드 분기 (패널 레코드 + 해시 일치 fail-closed) + **앵커 입력 채널 신설** — 현 `validateContent(relPath, raw)`는 경로별 순수 함수라 "이번 ship"을 알 수단이 없다 (축 O) |
| `plugins/mccp/scripts/lib/linkage-audit.js` | UPDATE | join을 `filename_convention` → `explicit_field`로 전환 + **라이브 파티션 신설(읽기 원천 = `HEAD` 트리, 작업 트리는 별도 진단 필드)** (축 M) |
| `plugins/mccp/commands/plan.md` | UPDATE | 5.6b가 `--review-record-path` 전달 |
| `plugins/mccp/commands/pr.md` | UPDATE | 2.5.7 back-patch 호출 + `MCCP_PR_SKIP_LINK_EVIDENCE` 읽기·플래그 전달(축 N) · 3.0 evidence commit **4중** 확장(진입 predicate `:1189` 포함 — 축 P) · **2.5.7의 `--plan` placeholder를 기계 파생 `SHIP_PLAN_PATH`로 교체 + 미해소 경로 진단 HALT(축 K-ship)** |
| `docs/review-record-linkage/frozen-baseline.md` | UPDATE | join 문자열 변경분 재생성 — **수치는 바이트 불변** |
| `plugins/mccp/scripts/lib/tests/linkage-audit.test.js` | UPDATE | explicit-field join 회귀 + 결정성 + **라이브 파티션 4종**(계수 · 미커밋 레코드 비계수 · 자격 분모 · `denominator: null`) |
| `plugins/mccp/scripts/lib/tests/linkage-frozen-baseline.test.js` | UPDATE | EOL 정규화 + 멱등성 단언 |
| `plugins/mccp/scripts/lib/tests/linkage-link-receipt.test.js` | CREATE | back-patch 변환 · containment · 멱등성 · corpus 계약 |
| `plugins/mccp/scripts/lib/tests/linkage-wiring.test.js` | CREATE | 배선 부재 정적 단언 + spawn e2e (UI12) |
| `plugins/mccp/scripts/lib/tests/pr-phase-helpers/finalize-receipt.test.js` | UPDATE | 전파·자격 파생 4분기 |
| `plugins/mccp/scripts/lib/tests/evidence-stage-guard.test.js` | UPDATE | 리뷰 레코드 분기 거부 fixture + positive-path pin |
| `plugins/mccp/scripts/lib/tests/plan-review-record.test.js` | UPDATE | `measurement.receipt_hash` 키 추가 회귀 |
| `plugins/mccp/scripts/lib/tests/plan-review-command-body.test.js` | UPDATE | 5.6b의 `--review-record-path` 전달 단언 |
| `plugins/mccp/scripts/receipt/tests/receipt-linkage-fields.test.js` | CREATE | present-only · hash 불변 · D2 페어링 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version 상향 (목표 `1.34.3`, PR 직전 재계산) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 |
| `CHANGELOG.md` | UPDATE | 새 항목 |
| `.claude/prds/review-record-linkage.prd.md` | UPDATE | M1 `in-progress`→`complete`(PR #172 머지 실측) · M3 `pending`→`in-progress` + Plan 경로 |

**변경하지 않는 파일 (의도)**: `plugins/mccp/scripts/receipt/hash.js`(carve-out 금지 — §3.12) · `plugins/mccp/scripts/receipt/schema.js`의 `makeSkeleton`(UI2) · `plugins/mccp/scripts/lib/plan-review/linkage-defs.js`(M1이 정의를 소유하고 M3는 소비만 한다 — UI4) · `plugins/mccp/scripts/lib/plan-review/corpus.js`.

## Tasks

### Task 1: receipt 계약 — present-only 5필드 (플래그 4 + 기계 파생 1)
- **Action**: `cli.js` write 플래그에 `--review-record-path <p>` · `--plan-review-expected` · `--no-plan-review-reason <text>` · `--link-evidence-skip-reason <text>`를 등록한다. `write.js`는 값이 있을 때에만 `receipt.meta.review_record_path` / `plan_review_expected` / `no_plan_review_reason` / `link_evidence_skip_reason` 키를 **생성**한다(부재가 기본 상태). **네 번째 필드는 R2 패널 HIGH 흡수다** — 초안의 Task 7은 `MCCP_PR_SKIP_LINK_EVIDENCE`의 사유를 "receipt에 봉인한다"고 적었는데 그 사유를 담을 필드도, 플래그도, schema 규칙도, test도 어디에도 없었다(반증 불가 주장). 게다가 봉인 시점이 불가능했다 — receipt는 Phase 2.5.7 finalize에서 이미 봉인되고 evidence commit은 Phase 3.0이라, 3.0에서의 receipt 편집은 §3.12 no-rehash 위반이거나 재해시 없이 쓰면 `evidence-stage-guard.js:75-77`의 `recomputed !== receipt.receipt_hash` 분기에 걸려 **모든 ship이 HALT**한다. 그래서 이 필드는 **2.5.7에서 write 플래그로** 실린다(Task 7 참조). `makeSkeleton`은 손대지 않는다. `schema.js`는 (a) 경로가 `linkage-defs.isRepoRelativePath`를 만족하고 `.claude/reviews/`로 시작할 것, (b) `plan_review_expected`가 boolean일 것, (c) `false`면 `no_plan_review_reason`이 비어있지 않은 문자열일 것, (d) `link_evidence_skip_reason`이 있으면 strict `validateReason`을 만족하는 문자열일 것을 강제한다. `schema.js`가 `linkage-defs`를 require해도 안전하다 — 그 모듈이 `require` 0건인 것이 M1의 계약이다.
- **다섯 번째 필드 `meta.plan_path`는 CLI 플래그를 갖지 않는다 (R3 흡수 — 앵커의 상류 절반).** `write.js`의 `buildReceipt`가 이미 계산하는 `planAbs`를 `relativeToRepo(planAbs, repoRoot)`로 정규화해(같은 함수가 `:438`에서 `design_doc_hash`에 이미 쓰인다) present-only로 stamp한다. **플래그를 만들지 않는 것이 설계다**: `cli.js parseFlags`는 임의 `--*`를 `write()`로 전달하므로, 플래그가 존재하면 아무 셸 호출자나 자기가 갖지 않은 plan 신원을 주장할 수 있고 그 순간 앵커는 검사가 아니라 **자기신고**가 된다(§3.13의 "intent 결정은 CLI 표면을 갖지 않는다"와 같은 논거). `makeSkeleton`은 손대지 않으므로 과거 receipt의 `receipt_hash`는 불변이다(UI2·UI16).
- **정규화가 이 필드의 본체다 (R4 architect HIGH 흡수).** 앵커의 두 끝은 결국 **저자가 타이핑한 경로**에서 온다 — `plugins/mccp/commands/plan.md`의 `--plan "<plan path>"`도 `plugins/mccp/commands/pr.md:1003`이 placeholder라 부르는 것과 같은 종류의 값이다(R4 리뷰어가 정확히 짚었다). Task 6(c)는 **ship 쪽만** 기계화하므로, 상류 쪽은 "기계 파생"이라고 주장하지 **않는다**. 대신 이 필드가 보장하는 것을 좁게 적는다: **표기 차이에 면역이다.** `write.js`가 `path.resolve(cwd, planPath)` → `relativeToRepo` → POSIX 구분자로 접으므로 절대경로 · `./` 접두 · `\` 구분자 · 중복 슬래시가 전부 **같은 canonical 문자열**로 붕괴한다. 그러므로 앵커는 "두 LLM 전사가 바이트 단위로 일치할 것"을 요구하지 않고 "두 전사가 **같은 파일을 가리킬 것**"만 요구한다. 남는 것은 저자가 *다른 파일*을 지목하는 경우이고, 그것은 이 milestone이 닫는다고 주장하지 않는다(「이 milestone이 주장하지 않는 것」에 명시).
- **schema 규칙은 형태만 본다 — 접두·확장자를 강제하지 않는다 (R4 architect HIGH 흡수, blast radius).** `write.js:414/427`의 `--plan` 파생은 **게이트 중립**이라 `meta.plan_path`는 `mccp-implement-codex`·`mccp-pr-codex` receipt에도 실린다. 그런데 그 호출처들은 plan 경로가 아닌 값을 정당하게 넘긴다 — `plugins/mccp/commands/pr.md:916`은 `--plan "<plan path or PR title>"`로 **PR 제목**을 명시 허용하고, `plugins/mccp/commands/prp-implement.md:933/1156/1207`·`plugins/mccp/commands/resume.md:210`은 `$ARGUMENTS`/`$ARGS`를 넘긴다. 초안의 (e)는 "`.claude/` 하위 + `.md` 종료"를 강제했는데, 그러면 그런 값이 실리는 순간 receipt가 **schema-invalid**가 되어 terminal ship이 fail-closed로 막힌다 — 계측 필드가 ship 차단 조건을 넓히는 것이고 이 plan의 어떤 Risk도 그것을 다루지 않았다. 그러므로: **(e) 값이 있으면 repo-relative + POSIX 구분자 + `..` 미포함 + 비어있지 않은 문자열**일 것만 강제한다. 그리고 **stamp 자체를 좁힌다** — 해소된 `planAbs`가 repo 루트 하위의 **실재 파일**일 때만 stamp하고, 아니면 키를 만들지 않는다(present-only의 정직한 부재). 앵커 쪽에서 `.claude/plans/` 여부를 요구할 필요가 없다: 앵커는 `SHIP_PLAN_PATH`와의 **동등**으로 성립하지 접두로 성립하지 않는다.
- **Mirror**: `write.js:993-1013` round-ledger · `schema.js:634-645` · `linkage-defs.js:129-140` 페어링
- **Validate**: (i) 플래그 미공급 시 네 키가 전부 **부재**(+ `meta.plan_path`는 `--plan`에서 항상 파생되므로 이 항목의 대상이 아니다)이고 기존 fixture의 `receipt_hash`가 동일함 · (ii) **over-permissive 방향의 거부 test**(R0 패널 MEDIUM 흡수) — `.claude/reviews/` 밖 경로 · 비-boolean `plan_review_expected` · `false`인데 사유 부재 · 빈 `link_evidence_skip_reason`이 각각 schema에서 거부되는지. 수용 test만 두면 형태 검증이 통째로 빠져도 green이다 · (iii) `meta.plan_path`가 `--plan`에서만 파생되고 **어떤 CLI 플래그로도 주입되지 않음**(임의 `--plan-path` 전달이 receipt를 오염시키지 않는지) · (iv) Windows 경로(``)로 호출해도 봉인값이 POSIX 구분자인지

### Task 2: 레코드에 `receipt_hash` 자리를 만든다
- **Action**: `record.js`의 `measurement`에 `receipt_hash: null`을 더한다. 값은 여기서 절대 채우지 않는다 — 레코드는 receipt보다 먼저 쓰이므로 작성 시점에 해시가 존재하지 않는다. `null`은 "아직 봉인되지 않음", 키 부재는 "이 빌드에 축이 없음"이라 감사에서 M3 이전/이후가 갈린다.
- **Mirror**: `record.js`의 `backlog_appended` — "부재는 0이 아니라 null" 규율
- **Validate**: `corpus.parseRecord`가 새 키를 그대로 통과시키고 `kind==='record'`가 유지되는지

### Task 3: back-patch 변환 (`link-receipt.js`) + corpus 계약 test
- **Action**: 레코드 원문과 해시를 받아 `## Measurement` 펜스의 JSON을 파싱 → `receipt_hash`만 설정 → **다른 키를 한 글자도 바꾸지 않고** 같은 2-space 들여쓰기로 재직렬화한 markdown을 돌려주는 순수 함수. 실패(펜스 부재 · 패널 레코드 아님 · JSON 파손)는 throw가 아니라 `{ok:false, reason}`. 펜스 탐색은 `corpus.js`의 규칙을 **재구현하지 않고** 그 모듈을 소비한다(M1의 DD1a와 같은 이유).
- **Mirror**: `corpus.js#parseRecord` · `linkage-defs.js`의 총함수 규율
- **Validate**: 멱등성(두 번 적용 = 한 번) · 비-패널 파일 거부 · 기존 키 바이트 보존 · **corpus 계약 test**(back-patch 산출물이 `parseRecord`에서 `kind==='record'`를 유지)

### Task 4: `link-receipt` 서브커맨드 + 경로 containment
- **Action**: `plan-review/cli.js`에 `link-receipt --record <repo-relative> --receipt-hash <hex> [--cwd <p>]`를 더한다. **M1 보고서 S3 인계와 fan-out security HIGH를 여기서 갚는다**: `isRepoRelativePath`는 형태 검사이지 안전 게이트가 아니므로, `fs.realpathSync`로 해소한 절대경로가 repo 루트 하위이고 `.claude/reviews/` 하위인지 확인하고 아니면 exit 12. 해시는 `^[0-9a-f]{64}$`로 검증한다. 쓰기는 tmp+rename.
- **Mirror**: `record.js:65-77` `sanitizeSlug`의 allowlist 규율 · `cli.js`의 원자 publish
- **Validate**: `../` · 절대경로 · 드라이브 문자 · `.claude/reviews/` 밖 · 심볼릭 이탈 · 비-hex 해시가 전부 exit 12로 거부되는 test

### Task 5: 자격 판정과 전파 (`finalize-receipt.js`)
- **이름으로 열고 끝내지 않는다 — 앵커를 대조한다 (R2 패널 HIGH ×2 흡수, 2명이 독립 지적).** 초안은 `.claude/receipts/mccp-plan-codex/<decision>.json`을 **슬러그 이름만으로** 열었고, 무스탬프 열거에 *부재·파손·null·열거 밖*은 있어도 **"다른 decision의 receipt를 찾음"이 없었다.** 이 브랜치에서 그것은 가정이 아니라 실측이다:
  - plan 게이트는 R1의 완화로 **명시 슬러그** `review-record-linkage-m3`를 쓴다.
  - `/mccp:pr`은 자기 슬러그를 **브랜치에서** 파생한다(`plugins/mccp/commands/pr.md:234` 등 5곳의 `derive-decision --command mccp:pr`) → `review-record-linkage`.
  - 디스크에는 `.claude/receipts/mccp-plan-codex/review-record-linkage.json` **단 하나**가 있고 그것은 **M1의** receipt다(실측: `decision_id="review-record-linkage"` · `review_source="multi-agent"` · `plan_hash="sha256:e85bad7d…"`).

  즉 초안대로면 M3의 ship receipt가 **M1 게이트의** `review_source`를 근거로 `plan_review_expected=true`를 해시 봉인한다 — 정직한 부재가 아니라 **다른 마일스톤의 리뷰를 자기 승인 증거로 삼는** unanchored linkage다. R1의 완화가 R4를 구조적으로 발화시키는데 초안은 둘을 독립 risk로 다뤘다.

  **[R3 흡수 — 앵커를 *내용 해시*에서 *경로 신원*으로 바꾼다]** 위 `plan_hash` 앵커는 R2 흡수로 넣었고 **R3에서 4관점 전원이 같은 축으로 반박했으며, 그 반박이 옳다.** 이제 그 반박은 추론이 아니라 **shipped 쌍에서의 실측**이다:
  - ship의 `plan_hash`는 PR 시점 **디스크 본문**에서 재계산된다(`plugins/mccp/scripts/receipt/write.js:428` `planAwareMarkdownHash(planAbs)`).
  - `/mccp:prp-implement` Phase 2.5.4가 plan 본문에 `## Codex Implementation Review`를 주입한다(`plugins/mccp/commands/prp-implement.md:344`).
  - **실측 (2026-09-02, 이 저장소)**: M1의 `mccp-pr-codex/review-record-linkage.json`은 `plan_hash="sha256:a467cd83…"`이고, 그 값은 **오늘 디스크의 `.claude/plans/review-record-linkage-m1.plan.md` 해시와 정확히 일치**한다. 같은 사이클의 `mccp-plan-codex/review-record-linkage.json`은 `"sha256:e85bad7d…"`다. 두 값이 다른 것이 반증이다 — 가설이 아니라 이미 머지된 ship 한 쌍이 그 상태다. memory `plan-receipt-goes-stale-at-implement`가 같은 사실을 "구조적이며 모든 shipped 사이클이 겪음"으로 기록한다.

  **그러므로 앵커는 plan의 repo-relative 경로다 — 내용이 아니라 신원이다.** 경로는 2.5.4 주입에 움직이지 않고, `evidence-stage-guard.js:95-98`이 파일명 슬러그와 `decision_id`를 대조하는 것과 **동형**이다(R3가 옳게 지적했듯 해시 버전은 동형이 아니었다 — 그쪽은 불변 식별자 대신 가변 본문을 비교했다). 세 층 중 **한 층은 그 값을 이미 봉인하고 있다**:

  | 층 | 필드 | 상태 (2026-09-02 실측) |
  |---|---|---|
  | 패널 레코드 | `measurement.plan_path` | **이미 존재** — 이 사이클의 `.claude/reviews/plan-review-review-record-linkage-m3.md`가 `".claude/plans/review-record-linkage-m3.plan.md"`를 담고 있다. 신규 코드 0줄 |
  | plan receipt | `meta.plan_path` | **부재** — `write.js:414`의 `planPath`는 로컬 변수이고 receipt 필드가 아니다 → **Task 1**이 present-only로 신설 |
  | ship 쪽 대조 값 | 2.5.7의 `--plan` | **LLM placeholder** (`plugins/mccp/commands/pr.md:1003`이 "still a placeholder by design"이라 명시) → **Task 6(c)**가 기계 파생 `SHIP_PLAN_PATH`로 교체 |

  판정 규칙 — 넷 다 이 Task가 소유한다:
  - **조회는 슬러그가 아니라 경로로 한다.** `.claude/receipts/mccp-plan-codex/*.json`을 훑어 `meta.plan_path === <이 ship의 plan 경로>`인 receipt를 고른다. 슬러그는 디렉토리 주소로만 남고 신원 판정에 쓰이지 않으므로, **R1의 슬러그 발산이 앵커를 깨지 않는다** — R4가 "구조적으로 어긋난다"고 적은 것이 무해해지는 지점이 여기다.
  - **일치가 정확히 1건이 아니면 무스탬프다.** 0건(미배선 · legacy receipt · 다른 plan) 도 **≥2건**(같은 plan을 두 슬러그로 재리뷰한 경우 — 이 저장소에서 실제로 일어날 수 있다) 도 `undecidable`이며 `link_anchor_unresolved`로 stderr에 loud warn한다. **첫 줄을 고르지 않는다** — 모호성을 통과시키면 이 Task가 닫겠다고 선언한 실패(엉뚱한 receipt를 자기 승인 증거로 삼음)가 이름만 바꿔 그대로 남는다.
  - **`meta.plan_path`가 없는 상류 receipt는 legacy이고 무스탬프다.** present-only이므로 M3 이전 receipt 전건이 여기 해당하고, **이 사이클 자신의 plan receipt도 그렇다**(Acceptance 부트스트랩 참조). 부재를 부정으로 승격시키지 않는다.
  - **경로 비교는 정규화된 문자열 동등이다.** 양쪽 모두 repo-relative + POSIX 구분자로 정규화한 뒤 비교한다(Windows에서 `\` 와 `/` 가 섞이면 같은 파일이 다른 이름이 된다). `realpath` 해소나 대소문자 접기는 하지 않는다 — 그것은 신원 판정이 아니라 파일시스템 질의이고, 이 앵커는 봉인된 두 **문자열**이 같은 것을 가리키기로 한 약속이다.

  **선례 인용이 이제 실제로 동형이다**: `evidence-stage-guard.js:95-98`은 **불변 식별자**(슬러그 ↔ `decision_id`)를 비교한다. 철회된 처방은 **가변 본문 해시**를 비교했으므로 동형이 아니었고 R3가 그것을 정확히 짚었다. 경로 앵커는 불변 식별자 ↔ 불변 식별자이므로 인용이 성립한다.
- **Action**: 경로 앵커가 **정확히 1건**으로 지목한 `.claude/receipts/mccp-plan-codex/*.json`에서 두 값을 파생한다(파일명이 아니라 `meta.plan_path`가 그 receipt를 고른다).
  - `review_record_path`: 상류 receipt의 `meta.review_record_path`를 **그대로** 전달. 없으면 전달하지 않는다.
  - `plan_review_expected`: **양성으로 확립된 두 경우에만 붙인다.** 상류 `resolution.review_source ∈ {multi-agent, hybrid}`면 `true`. `=== 'codex'`면 `false` + 사유(`plan gate ran in codex mode; the review record is the plan body's Codex section, not a panel record`).
  - **모르는 상태는 전부 무스탬프다** — 상류 receipt 부재 · JSON 파손 · `review_source`가 null/부재(`schema.js:206`이 명시적으로 허용한다) · 열거 밖의 값 · **경로 앵커 일치 0건** · **경로 앵커 일치 ≥2건(모호 — 첫 줄을 고르지 않는다)** · **상류에 `meta.plan_path`가 아예 없어 앵커를 대조할 수 없는 경우(legacy)**. 플래그를 아예 전달하지 않으므로 D2가 `undecidable`로 보고한다. **L2 패널 HIGH 흡수**: 초안은 상류 receipt 부재를 `false` + `chore ship` 사유로 적었는데, 그것은 *모름*을 권위 있는 *부정*으로 승격시켜 실제로 패널 리뷰를 받은 ship을 지표 2 분모에서 영구 제외하고 해시 봉인된 감사 필드에 거짓을 남긴다. R4가 "못 찾으면 undecidable로 보고"라고 적은 것과도 정면으로 모순이었다. 이제 둘이 일치한다.
  - **레코드 존재 여부로는 절대 판정하지 않는다.** D2가 "패널 레코드가 존재하면 리뷰 대상"을 명시적으로 기각한다 — 분모를 분자로 정의하면 링크율이 자명하게 100%가 된다.
  - **파일명 fallback을 만들지 않는다.** 관례를 되살리면 지표가 부풀려지고 M3가 없애려는 27/75 천장이 다른 이름으로 돌아온다.
- **Mirror**: `deriveCodexFlags(codexResult)`
- **Validate**: 일곱 분기 각각의 forwarding을 단언 — multi-agent / hybrid / codex / 상류 부재 / **앵커 일치 0건**(디스크에 다른 decision의 receipt가 있고 그 `meta.plan_path`가 이 ship의 plan과 다름 → 무스탬프) / **앵커 일치 ≥2건**(같은 `meta.plan_path`를 봉인한 receipt 둘 → 무스탬프, 첫 줄 선택 금지) / **상류에 `meta.plan_path` 부재**(legacy → 무스탬프). 앵커 분기는 이 사이클의 실제 디스크 상태를 fixture로 재현한다(M1 receipt + M3 plan). **음성 분기가 test의 본체다** — 양성만 두면 앵커 코드를 통째로 지워도 green이다(R3 test HIGH 흡수)

### Task 6: 게이트 본문 배선
- **Action**: (a) `plugins/mccp/commands/plan.md` 5.6b의 `WRITE_FLAGS`에 패널 모드일 때 `--review-record-path`를 더하되, 경로를 셸 문자열로 재조립하지 않고 **`record.js#reviewRecordPath(slug)`가 돌려준 값을 그대로 쓴다**(`node -e "...require(root+'/scripts/lib/plan-review/record').reviewRecordPath(slug)"`). **L2 패널 흡수**: 초안은 `".claude/reviews/plan-review-$DECISION_SLUG.md"`를 직접 보간했는데, 파일명의 소유자는 `sanitizeSlug`(`record.js:69-77`)다 — 슬러그에 sanitize 대상 문자(공백 · 선두 `.`/`-` · 연속 `-` · 120자 초과)가 있으면 봉인된 경로가 디스크의 레코드와 다른 파일을 가리키고, 그 dangling 링크가 형태 검사를 통과해 "링크 있음"으로 계상된다. 이 plan 자신의 "파생하지 않고 운반한다" 논지와도 어긋난다(`mode=codex`는 5.6b에서 이미 `exit 0`하므로 사거리 밖이다). **같은 블록에서 plan 경로를 단일 원천으로 만든다 (R4 architect HIGH 흡수)** — 5.2 진입 시 plan 경로를 `$REVIEW_DIR/plan-path` 아티팩트로 한 번 기록하고, 5.6b의 `--plan`을 포함해 이후 모든 callsite가 그 파일을 읽는다(§5.2 불변식 (i): 셸 상태는 블록을 넘지 못하고, 리터럴을 매번 다시 타이핑하면 한 실행 안에서도 값이 갈라진다). 이것은 경로의 *출처*를 기계화하지 않는다 — 한 실행 안의 *일관성*만 보장한다(R15). (b) `plugins/mccp/commands/pr.md` 2.5.7에서 `FINALIZE_RECEIPT_HASH` 캡처 직후 `link-receipt`를 호출한다. 실패는 loud warn + 진행 — **계측이 ship을 막아서는 안 된다**(`record.js`가 세운 것과 같은 선). 그 경우 레코드가 미연결로 남고 감사가 그대로 보고한다.
- **(c) 2.5.7의 `--plan`을 LLM placeholder에서 기계 파생으로 바꾼다 (R3 security HIGH 흡수 — 앵커의 ship 쪽 절반).** 오늘 `plugins/mccp/commands/pr.md:918`은 `--plan "<plan path or PR title>"`을 넘기고 `:1003`이 그것을 "still a placeholder **by design**"이라고 선언한다. 그 값이 앵커의 대조 대상이 되는 순간, **앵커를 통과할 plan을 고르는 것만으로** 다른 마일스톤의 리뷰를 자기 승인 증거로 봉인할 수 있다. 2.5.8(`:1023`)과 2.5.9(`:1097`)는 이미 `SHIP_PLAN_PATH="${PR_PLAN_PATH:-.claude/plans/${DECISION_SLUG}.plan.md}"`를 쓰므로, 이 변경은 **v1.25.2 C6이 2.5.8에 이미 수행한 마이그레이션을 마지막 남은 callsite에 적용**하는 것이지 새 기제가 아니다.
  - **경로가 해소되지 않으면 `write.js`가 throw하게 두지 않는다.** 실측: `planAwareMarkdownHash(<없는 경로>)`는 ENOENT를 **throw**하므로, 파생된 경로가 실재하지 않으면 receipt write가 예외로 죽는다. 그러므로 2.5.7은 파생 직후 `[ -f "$SHIP_PLAN_PATH" ]`를 확인하고, 없으면 **진단 HALT**한다 — `PR_PLAN_PATH`를 export하라는 복구 지시를 포함해서. 이것은 새 차단이 아니다: 같은 경로가 이미 2.5.9에서 `stale`로 HALT한다(실측: `validate --plan .claude/plans/review-record-linkage.plan.md` → `ok:false` + `stale` 2건). 실패를 **한 단계 앞으로 당기고 원인을 이름 붙일 뿐**이다.
  - **`PR_PLAN_PATH`는 운영자 채널이고 그 사실을 숨기지 않는다.** `plugins/mccp/commands/pr.md:1017`이 "no block in this body assigns it (zero assignments plugin-wide)"라고 실측을 적어 뒀다. 이 Task는 그것을 자동화하지 **않는다** — 브랜치명에서 plan 경로를 추측하는 것은 파일명 관례를 되살리는 일이고 이 plan이 금지한 것이다(Task 5의 "파일명 fallback 금지"와 같은 선).
- **Mirror**: `plugins/mccp/commands/plan.md` 5.6b의 조건부 `WRITE_FLAGS+=(...)`
- **Validate**: Task 9의 정적 배선 test + 라이브 완주

### Task 7: evidence commit이 링크를 함께 실어야 한다
- **Action**: evidence commit은 **Phase 3.0**이다(`plugins/mccp/commands/pr.md:1172`). 그 블록은 `.claude/receipts/mccp-pr-codex/`만 stage하고 그 외 경로가 staged면 HALT한다(`:1208-1214`). back-patch된 레코드는 git-tracked이므로 현 상태로는 링크의 절반이 히스토리에 도달하지 못하고, 감사는 트리를 읽으므로 실값이 0으로 남는다. **Phase 3.1은 pre-push history-leak 게이트(`:1222`)라 이 Task의 사거리 밖이다** — 초안은 그것을 3.1로 지목해 구현자를 누출 게이트로 보낼 뻔했다(L2 패널 LOW 흡수).
- **네 변경은 단일 커밋 불변식이다 (L2 패널 HIGH 흡수 3명 + R2 패널 흡수 2명)**:
  0. **블록의 진입 조건을 함께 넓힌다 (R2 흡수 — architect·invariant 독립 지적).** evidence commit 블록 전체가 `plugins/mccp/commands/pr.md:1189`의 `if [ -n "$(git status --porcelain .claude/receipts/mccp-pr-codex/ 2>/dev/null)" ]`로 열린다. receipt에 변화가 없고 **레코드만 back-patch된** 실행에서는 1~3번을 전부 고쳐도 블록이 통째로 skip되어 링크의 절반이 히스토리에 도달하지 않고 **어떤 HALT도 발화하지 않는다** — 정확히 R2가 지목한 지배적 실패 모드다. 초안의 "셋 중 하나라도 빠지면" 완결성 주장은 바깥 게이팅 조건 하나를 빠뜨리고 있었다. predicate를 "receipt 디렉토리 dirty **∪** 이번에 back-patch한 레코드 dirty"로 넓힌다.
  1. **stage 집합 + OUTSIDE HALT 조건**을 "receipt 디렉토리 ∪ 이번에 back-patch한 레코드 1건"으로 넓힌다(`:1190`, `:1208`).
  2. **guard의 stdin 생산자를 함께 넓힌다** — `:1197-1198`이 `git diff --cached --name-only -- .claude/receipts/mccp-pr-codex/`로 **경로 필터링**되어 있어, 1번만 하면 레코드가 guard에 **도달조차 못 해** 해시 일치 검사가 조용히 무발화한다(게이트처럼 보이는데 아무것도 멈추지 않는다).
  3. **guard에 리뷰-레코드 분기를 더한다** — `evidence-stage-guard.js:133-136`은 비-`.json` staged 경로를 무조건 offender로 거부하므로, 2번만 하면 **모든 ship이 즉시 HALT**한다. 분기는 staged blob이 패널 레코드이고 그 `measurement.receipt_hash`가 같은 커밋의 ship receipt 해시와 **일치**하는지 검사한다(불일치 = 위조/stale → fail-closed).
  넷 중 하나라도 빠지면 나머지가 fail-open이거나 fail-shut이거나 **아예 발화하지 않는다**. 한 커밋으로 넣는다.
- **guard의 인터페이스를 명시적으로 넓힌다 (R2 흡수 — architect·invariant MEDIUM ×2).** 3번이 요구하는 "같은 커밋의 ship receipt 해시와 일치"는 **현재 guard의 추상화가 담을 수 없는 불변식**이다: `validateContent(relPath, raw)`는 경로별 **순수 2-인자 함수**이고(`evidence-stage-guard.js:51`), `main()`이 받는 것은 `MCCP_EVIDENCE_STAGE_ROOT`와 stdin 경로 목록뿐이며(`:154`), stage되는 것은 코퍼스 **전체**(75+ receipt)라 "어느 것이 이번 ship인가"를 알 수단이 없다. 명시하지 않으면 구현이 **"아무 staged receipt와나 일치하면 통과"** 로 떨어지고, 그것은 게이트처럼 보이지만 stale·타 decision 해시를 통과시켜 Task 8 축 3이 닫겠다는 경로를 guard 층에서 그대로 연다. 그러므로 이 Task는 **guard에 앵커 입력 채널을 추가하는 것을 포함한다** — 이번 ship의 `DECISION_SLUG`(따라서 기대 receipt 경로와 해시)를 env 또는 argv로 전달하고, 리뷰-레코드 분기는 그 **하나의** receipt와만 대조한다. 순수성은 유지한다(앵커를 인자로 받는 순수 함수).
- **레코드가 이 결정의 것인지 결속한다 (R2 흡수 — security MEDIUM · R3 흡수로 앵커 교체).** Task 4의 containment는 `.claude/reviews/` **하위인지**(디렉토리)만 본다. 상류가 봉인한 `review_record_path`가 **다른 결정의 레코드**를 가리키면 그 레코드의 `receipt_hash`가 덮어써지고, **방금 덮어썼으므로 해시는 당연히 일치해** guard가 통과시키며 남의 리뷰 레코드가 이 ship의 증거로 커밋된다. R2는 이 결속을 `measurement.reviewed_plan_hash` 대조로 적었는데 **R3가 그것도 영구 미충족임을 실증했다**(같은 2.5.4 주입 축이고, 이쪽은 fail-closed 경로 위에 있어 정상 ship을 거절한다). 그러므로 결속도 Task 5와 **같은 앵커**를 쓴다: back-patch 대상 레코드의 **`measurement.plan_path`가 이 ship의 `SHIP_PLAN_PATH`와 같은지** 확인한다. 불변 식별자 ↔ 불변 식별자이므로 `:95-98` 선례와 동형이고, 레코드 쪽 값은 이미 봉인돼 있어 신규 producer가 필요 없다.
- **이 결속은 fail-closed 위에 있으므로 정규화가 선행 조건이다 (R4 architect MEDIUM 흡수).** 레코드 층의 `measurement.plan_path`도 같은 저자 전사 채널에서 온다(`plugins/mccp/scripts/lib/plan-review/record.js:314`가 `o.planPath`를 **그대로** 싣는다). 결속이 fail-closed라 표기 불일치는 무스탬프가 아니라 **정상 ship 거절**로 나타나며, 그것은 R3가 `reviewed_plan_hash` 결속에 대해 지적한 실패 모드와 같은 형태다. 그러므로 Task 2는 `receipt_hash` 키 추가에 더해 **`plan_path`를 receipt와 동일한 규칙으로 정규화해 기록한다**(repo-relative + POSIX). 두 층이 같은 정규화를 거치지 않으면 이 결속은 표기 축에서 임의로 붉어진다. 정규화 함수는 재구현하지 않고 `write.js`가 쓰는 것과 같은 헬퍼를 공유한다 — 두 벌이면 규칙이 갈라진다.
- **감사 우회를 함께 만든다 (L2 패널 MEDIUM 흡수)**: terminal ship 경로에 신규 fail-closed HALT를 넣으면서 퇴로를 안 만드는 것은 이 저장소의 관례와 어긋난다. `MCCP_PR_SKIP_LINK_EVIDENCE="<substantive reason>"`(strict `validateReason`)를 둔다. **읽는 지점은 Phase 2.5.7이지 3.0이 아니다 (R2 패널 HIGH 흡수).** 초안은 "쓰이면 레코드를 stage하지 않고 receipt에 사유를 봉인한다"고 적었는데, ship receipt는 2.5.7 finalize에서 **이미 봉인된 뒤** 3.0 evidence commit이 일어나므로 그 시점의 receipt 편집은 (a) §3.12 no-rehash 불변식 위반이거나 (b) 재해시 없이 쓰면 `evidence-stage-guard.js:75-77`의 해시 불일치 분기에 걸려 **모든 ship이 HALT**한다 — 선언된 퇴로가 복원되지 않거나 fail-shut이었다. 그러므로 2.5.7이 env를 읽어 `--link-evidence-skip-reason`(Task 1의 4번째 필드)으로 **봉인 시점에** 싣고, 3.0은 그 필드를 보고 레코드를 stage하지 않을 뿐이다. 링크는 미완성으로 남고 감사가 그대로 보고한다 — **단 그 "그대로 보고"가 성립하려면 라이브 파티션이 커밋된 상태를 읽어야 한다**(Task 8 축 1).
- **Mirror**: `evidence-stage-guard.js`의 `git show :<path>` staged-blob 검사 · `plugins/mccp/commands/pr.md`의 `MCCP_PR_SKIP_CODEX_REVIEW` audited escape 형태
- **Validate**: (a) 불일치 해시 fixture가 exit 1 + offender 목록으로 거부 · (b) **정상 링크된 ship이 그대로 commit되는 positive-path pin**(거부 fixture만 박으면 도달 불가한 게이트도 green이다) · (c) guard 입력 생산자가 리뷰 경로를 포함함을 보는 정적 단언(Task 9) · (d) **앵커가 전달되지 않으면 리뷰-레코드 분기가 fail-closed**(앵커 없이 "아무 receipt와나 일치"로 떨어지지 않음) · (e) **레코드만 dirty한 실행에서 진입 predicate가 참**이 되어 블록이 열리는 test · (f) `--link-evidence-skip-reason`이 봉인된 receipt에서 3.0이 레코드를 stage하지 않고 **HALT하지도 않는** 경로

### Task 8: 감사 도구의 join 전환 + 동결 재생성
- **산출 실값을 읽을 표면을 먼저 만든다 (L2 패널 HIGH 흡수 — 3명이 독립적으로 지적).** 초안은 Acceptance에 `bidirectional >= 1`을 적어 두고 그 값을 산출할 Task를 하나도 두지 않았다. `linkage-audit.js`의 `link`·`denominator`는 **`result.pre_baseline` 안에만** 존재하고(`:392-413`, `:431`) 그 모집단은 고정 SHA 트리이며(`:39-42`), 라이브 쪽은 `post_baseline = { ships, records }` 카운트뿐이다(`:480`). 즉 새로 발행될 receipt는 그 트리에 영원히 없으므로, "동결 수치 바이트 불변"과 "라이브 `bidirectional >= 1`"이 같은 필드에 동시에 걸려 자기모순이었다.
- **Action (축 1 — 라이브 파티션 신설)**: `post_baseline`을 `{ships, records}`에서 **`pre_baseline`과 동형의 linkage 블록을 갖는 구조**로 확장한다(같은 `classifyShipEligibility`·`classifyLink` 소비, 같은 `denominator: null` 규율). 두 파티션은 **결코 합산하지 않는다** — 합치는 순간 동결이 깨진다. 지표 2가 읽는 것은 라이브 파티션이고, 동결 파티션은 기준선으로 불변이다.
- **읽기 원천은 작업 트리가 아니라 커밋된 상태다 (R2 패널 HIGH 흡수 — 이 축의 급소).** 현재 `post_baseline`의 생산자 `liveCorpusNotInTree`는 `fs.readdirSync`/`fs.statSync`로 **작업 트리**를 센다(`linkage-audit.js:185-203`, `:480`), 그리고 그 파일 자신이 `:42`에서 그것을 **"진단 전용"** 이라고 선언한다. 그 위에 지표를 얹으면 M3가 닫으려는 실패 그 자체가 부활한다: `MCCP_PR_SKIP_LINK_EVIDENCE`를 쓰거나 evidence commit이 통째로 실패해도 back-patch된 레코드는 작업 트리에 남아 있으므로 감사가 `bidirectional`을 **만점으로 세고**, 히스토리에 증거가 0인 상태에서 지표 2가 100%를 보고한다. 즉 우회가 지표를 강등시키지 않고, Acceptance가 evidence commit 실패와 **구별되지 않는다**.
  그러므로 라이브 파티션은 **`HEAD`의 트리**를 읽는다(동결 파티션이 고정 SHA 트리를 읽는 것과 같은 규율 — `:511-520`의 tree 판독 경로를 재사용하고 ref만 다르다). 작업 트리 카운트는 **지우지 않고** 별도 진단 필드로 남긴다 — 두 값이 갈라지는 것 자체가 "커밋되지 않은 링크가 있다"는 신호이고, 그것이 우회가 실제로 관측되는 지점이다. Task 7의 "감사가 그대로 보고한다"는 문장은 이 변경이 있어야만 참이 된다.
- **Action (축 2 — join 전환)**: 두 파티션 모두 `meta.review_record_path`로 레코드를 찾는다. **그 경로로 파일을 열지 않는다** — 이미 스캔한 코퍼스 맵에 그 값이 있는지 조회할 뿐이라 traversal 표면이 생기지 않는다(Task 4의 containment는 *쓰기* 경로에만 필요하다). 조회 실패는 링크 부재다 — 즉 봉인된 경로가 실재하지 않는 레코드를 가리키면 그것은 링크로 세지 않는다(L2 패널 MEDIUM — 존재 결속 없는 봉인 흡수). `join: 'explicit_field'`, `join_note`를 그에 맞게 고치고 `filename_convention.match`는 **라벨로만** 남긴다.
- **Action (축 3 — 해시를 실제로 비교한다)**: `classifyLink`는 `review_to_receipt`를 **비어있지 않은 문자열인가**로만 판정한다(`linkage-defs.js:186`). Task 6(b)가 back-patch 실패를 warn+진행으로 두므로, **이전 ship의 stale 해시가 남은 레코드가 새 receipt와 짝지어져 `bidirectional:true`로 계수되는 경로가 실재**한다(L2 패널 MEDIUM 흡수). 감사가 그 위에서 **레코드의 `receipt_hash`가 그 receipt의 실제 `receipt_hash`와 같은지** 대조해 `bidirectional`을 확정한다. **`linkage-defs.js`는 손대지 않는다**(UI4 — D3의 정의는 M1 소유) — 감사 쪽에서 더 강한 조건을 얹을 뿐이고, 그 차이를 `join_note`가 명시한다.
- **Action (축 4 — 동결 재생성)**: `frozen-baseline.md`를 재생성하되 **동결 블록의 모든 수치 필드가 바이트 불변**임을 diff로 보인다(변경은 `join`/`join_note` 문자열뿐).
- **fan-out 흡수 2건**: (i) 바이트 비교 전에 EOL을 `\n`으로 정규화한다 — Windows에서 `core.autocrlf`가 조용히 발산시킨다. (ii) `--frozen-only`를 연속 2회 실행해 산출이 바이트 동일함을 단언한다(결정성).
- **Mirror**: `linkage-audit.js:388-412`
- **Validate**: 재생성 전후 **수치 diff 0줄** · 동결 test green · 2회 실행 바이트 동일 · **라이브 파티션 전용 test (R2 패널 MEDIUM 흡수)** — 축 1은 오늘 단순 카운트(`:480`)인 표면에 자격·링크 계산을 새로 얹는 실질 신규 코드인데 초안의 Validate는 전부 *동결* 파티션 단언이었다. (i) 커밋된 레코드가 있는 fixture에서 `bidirectional`이 계수되고 (ii) **같은 레코드가 작업 트리에만 있고 커밋되지 않은 fixture에서는 계수되지 않으며**(우회 강등의 기계 확인) (iii) 자격 없는 ship이 분모에서 빠지고 (iv) 분모 0이면 `denominator: null`인지를 단언한다

### Task 9: 배선 부재를 보는 test (UI12 + security HIGH의 강제 장치)
- **Action**: `linkage-wiring.test.js`가 정적으로 단언한다 — `plugins/mccp/commands/plan.md`에 `--review-record-path` 호출 줄 실재 · `plugins/mccp/commands/pr.md`에 `link-receipt` 호출 줄 실재 · `plugins/mccp/commands/pr.md` Phase **3.0**(`:1172` — evidence commit) stage 집합에 리뷰 경로 포함 · `finalize-receipt.js`가 `mccp-plan-codex`를 읽는 줄 실재 · **`cli.js`의 `link-receipt` 경로에 containment 호출이 실재**(fan-out security HIGH를 산문이 아닌 기계로 만든다) · **guard의 stdin 생산자 pathspec(`plugins/mccp/commands/pr.md:1197`)에 리뷰 경로가 포함**(L2 패널 HIGH 흡수 — stage 집합만 보면 fail-open을 못 잡는다). · **`plugins/mccp/commands/pr.md:1189` 진입 predicate에 리뷰 경로가 포함**(R2 흡수 — 1~3번을 다 고쳐도 이것이 빠지면 블록이 skip된다) · **guard 호출에 앵커 인자가 전달됨**(R2 흡수 — 앵커 없는 분기는 "아무 receipt와나 일치"로 떨어진다) · **`plugins/mccp/commands/pr.md` 2.5.7에 `MCCP_PR_SKIP_LINK_EVIDENCE` 읽기와 `--link-evidence-skip-reason` 전달 줄 실재**(3.0이 아니라 2.5.7이어야 봉인이 가능하다).
  그리고 **spawn e2e 2건**: (i) 임시 repo에 plan receipt와 레코드를 심고 `finalize-receipt.js`를 **실제로 실행**해 ship receipt에 링크가 봉인되는지 — 이것이 UI12가 요구하는 *산출된 실값*이며, 이 사이클의 라이브 ship이 부트스트랩 때문에 그 값을 낼 수 없으므로(아래 Acceptance) **이 e2e가 그 자리를 대신한다**. (ii) 같은 e2e를 **`meta.plan_path`가 어긋나는** 상류 receipt로 돌려 **무스탬프**가 나오는지 — 앵커가 실제로 발화하는지를 보는 음성 대조. 하나만 두면 앵커를 지워도 (i)은 green이다.
- **앵커 배선의 정적 단언 (R3 흡수)**: `plugins/mccp/commands/pr.md` 2.5.7 블록에 (i) 리터럴 `<plan path or PR title>`이 **더는 존재하지 않고** (ii) `SHIP_PLAN_PATH` 파생과 `[ -f ]` 확인이 실재하며 (iii) `--plan "$SHIP_PLAN_PATH"`가 `FINALIZE_FLAGS`에 실린다는 것. 그리고 `write.js`가 `meta.plan_path`를 stamp하는 줄이 실재하고 **`--plan-path` 같은 CLI 플래그는 0건**이라는 것(Task 1의 "플래그를 만들지 않는다"를 산문이 아니라 기계로). 그리고 **plan.md 쪽**: 5.6b가 `--plan`에 리터럴이 아니라 5.2에서 파생한 단일 원천 아티팩트를 넘긴다는 것, 그리고 `record.js`와 `write.js`가 **같은 정규화 헬퍼**를 부른다는 것(두 벌이면 규칙이 갈라진다 — R4 MEDIUM). 형태는 `validate-callsite-lint`가 pr.md의 placeholder를 잡는 것과 같다.
- **음성 e2e를 하나 더 둔다 (R3 test HIGH 흡수)**: 위 (ii)에 더해 **(iii) `write.js`의 `meta.plan_path` stamp 줄을 지우면 (i)의 양성 e2e가 red가 되는지**를 직접 확인한다. 앵커가 라이브에서 영구히 거짓이어도 아무 test도 red가 되지 않는다는 것이 R3의 test HIGH였고, 반증 가능성 점검을 **명시 단계로 적어 두지 않으면** 그 상태가 그대로 재현된다.
- **Mirror**: `plan-review-command-body.test.js`의 정적 단언 형태
- **Validate**: 각 배선 줄을 지웠을 때 red가 되는지 직접 확인한다 — **반증 가능성 점검을 하지 않은 정적 test는 통과 증명이 아니다**

### Task 10: 릴리스 4면 + PRD 상태
- **Action**: forward-only로 `plugin.json` 상향(목표 `1.34.3` — origin/main이 `1.34.2`), `renderer/html.js` page-foot · `renderer/markdown.js` derived 줄 · `CHANGELOG.md` 동기. PRD의 M1 행을 `complete`로 정정하고(PR #172 `a9fa92f` 머지 실측 — 현재 `in-progress`는 사실이 아니다), M3 행을 `in-progress` + Plan 경로로 갱신한다.
- **Mirror**: CHANGELOG `## [1.34.2]` 항목의 version 서술 형식
- **Validate**: `i18n-surface.test.js` green (기대값을 `plugin.json`에서 파생하므로 4면 drift를 그것이 잡는다)

## Validation

```bash
# 1. 신규·변경 test 전수 (codex 경로 차단 필수 — CLAUDE.md §3.4)
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 \
  plugins/mccp/scripts/lib/tests/linkage-audit.test.js \
  plugins/mccp/scripts/lib/tests/linkage-defs.test.js \
  plugins/mccp/scripts/lib/tests/linkage-frozen-baseline.test.js \
  plugins/mccp/scripts/lib/tests/linkage-link-receipt.test.js \
  plugins/mccp/scripts/lib/tests/linkage-wiring.test.js \
  plugins/mccp/scripts/lib/tests/plan-review-corpus.test.js \
  plugins/mccp/scripts/lib/tests/plan-review-record.test.js \
  plugins/mccp/scripts/lib/tests/plan-review-command-body.test.js \
  plugins/mccp/scripts/lib/tests/evidence-stage-guard.test.js \
  plugins/mccp/scripts/lib/tests/pr-phase-helpers/finalize-receipt.test.js \
  plugins/mccp/scripts/receipt/tests/receipt-linkage-fields.test.js \
  plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# 2. 과거 receipt hash 불변 — 전건 재검증 (UI2/UI16의 기계 확인)
node plugins/mccp/scripts/lib/evidence-audit.js --json

# 3. 동결 baseline — 결정성 + 수치 바이트 불변
node plugins/mccp/scripts/lib/linkage-audit.js --frozen-only --json > .git/mccp/tmp/m3-frozen-a.json
node plugins/mccp/scripts/lib/linkage-audit.js --frozen-only --json > .git/mccp/tmp/m3-frozen-b.json
diff .git/mccp/tmp/m3-frozen-a.json .git/mccp/tmp/m3-frozen-b.json && echo "deterministic"
git diff --stat -- docs/review-record-linkage/frozen-baseline.md

# 4. 라이브 완주 산출 실값 (UI12 — 단위 test 통과 != 경로 작동)
node plugins/mccp/scripts/lib/linkage-audit.js --json
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **R1 — 슬러그 충돌이 M1의 git-tracked 리뷰 레코드를 덮어쓴다.** PRD 경로에서 파생되는 슬러그는 `review-record-linkage`이고 M1이 이미 그 이름으로 `.claude/reviews/plan-review-review-record-linkage.md`를 커밋했다 | **높음** (기본 파생이 그렇다) | 이 게이트와 이후 모든 M3 단계는 명시 슬러그 `review-record-linkage-m3`를 쓴다(저장소 선례: `*-m1` · `*-m9` · `*-m11`). 라운드 원장도 그 키로 새로 열려 M1이 소비한 캡과 섞이지 않는다 |
| **R2 — evidence commit이 링크의 절반을 히스토리에 못 싣는다.** Phase **3.0**은 receipt 디렉토리만 stage하고 그 외가 staged면 HALT한다 | **높음** | Task 7의 3중 단일-커밋 불변식. 빠뜨리면 M3가 배선만 되고 실값이 0으로 남는다 — 이 PRD의 지배적 실패 모드 그 자체 |
| **R10 — 새 게이트가 도달 불가한 채 green이 된다.** guard 분기를 더해도 입력 생산자(`plugins/mccp/commands/pr.md:1197`)가 그 경로를 안 보내면 검사가 무발화하고 거부 fixture만으로는 그것을 못 잡는다 | **높음** | Task 7의 단일-커밋 불변식 3번 + Task 9의 입력-생산자 정적 단언 + positive-path pin. 셋을 함께 걸지 않으면 fail-open과 fail-shut 사이를 오간다 |
| **R3 — 동결 baseline이 움직인다.** `join` 문자열이 동결 블록 안에 있고 Windows EOL이 바이트 비교를 흔든다 | 중 | 수치 필드 바이트 불변을 acceptance로 못박고 EOL 정규화 + 결정성 단언을 더한다(Task 8). 수치가 움직이면 그 자체가 결함 신호다 |
| **R4 — 전파가 조용히 불발한다 … 또는 *엉뚱한 receipt를 찾는다*.** `/mccp:pr`은 상류 plan receipt를 ship 슬러그로 찾는데 두 슬러그는 R1의 완화 때문에 **구조적으로** 어긋나고, 이 브랜치에서는 그 이름이 **M1의 receipt와 exact match**한다 | **높음** (R2 실측 — 가정이 아니라 디스크 상태다) | fallback을 만들지 않는다 **+ `meta.plan_path`(경로 신원)로 앵커 대조한다**(Task 5). R3가 해시 앵커를 무너뜨린 뒤의 대체다. 못 찾는 것보다 잘못 찾는 것이 위험하다 — 전자는 `undecidable`이지만 후자는 다른 마일스톤의 리뷰를 승인 증거로 해시 봉인한다. R1과 R4는 독립 risk가 아니라 **한 축의 양면**이다 |
| **R5 — `plan_review_expected` 생산자가 M3 범위인지 논쟁이 된다.** PRD M3 문장은 링크만 말한다 | 중 | PRD 결정 2가 "M1이 파서로 정의"하고 M1이 생산자를 하류로 넘겼으며, 그것이 없으면 M3 자신의 지표가 계산 불가다. 이 판단을 여기 명시해 리뷰어가 반증할 수 있게 둔다 |
| **R6 — codex 모드 plan 게이트에는 패널 레코드가 없어 100%가 불가능해 보인다** | 낮음 | 자격 판정을 `review_source`에 결속해 codex 모드 ship을 `not_eligible` + 사유로 분류한다. 분모에서 빠지므로 목표가 달성 가능해지고 제외 사유가 receipt에 남는다 |
| **R7 — 병렬 브랜치 version 충돌** (9회 재발 이력) | **높음** | forward-only. 머지 해소 시점과 `/mccp:pr` 진입 직전 두 번 재계산(UI14) |
| **R8 — `plan-review/`를 공유 소유하는 in-flight 브랜치** (`diverse-agent-review-m9/m11`) | 중 | `record.js`는 한 줄(키 추가)만 건드리고 나머지는 신규 파일로 낸다. 착수 전 sibling worktree의 소유 범위 확인 |
| **R11 — 층간 링크의 신원 앵커가 없었다.** 슬러그는 구조적으로 어긋나고(R1·R4), 내용 해시는 2.5.4 주입으로 항상 움직이며(R3가 shipped 쌍에서 실증), plan receipt에 불변 plan 식별자가 없다 | **해소** (R4 라운드 입력) | 앵커를 **plan의 repo-relative 경로**로 바꾼다. 레코드 층은 `measurement.plan_path`로 **이미 봉인 중**(실측 — 신규 코드 0줄), receipt 층은 Task 1이 `meta.plan_path`를 present-only로 신설, ship 층은 Task 6(c)가 2.5.7의 LLM placeholder를 기계 파생 `SHIP_PLAN_PATH`로 교체. 경로는 주입에 불변이고 `evidence-stage-guard.js:95-98`과 **동형**이다. 잔여 둘을 아래 R12·R13으로 명시한다 |
| **R12 — `SHIP_PLAN_PATH` 기본 파생이 이 브랜치에서 실재하지 않는 경로를 낸다.** `${PR_PLAN_PATH:-.claude/plans/${DECISION_SLUG}.plan.md}` → `review-record-linkage.plan.md`인데 디스크에 없다(M1의 plan은 `-m1` 접미사) | **높음** (이 브랜치에서 확정) | 새 결함이 아니라 **이미 존재하는 HALT**다 — 실측: `validate --plan <그 경로>` → `ok:false` + `stale` 2건이므로 2.5.9가 오늘도 막는다. Task 6(c)는 그 실패를 2.5.7로 당기고 **`PR_PLAN_PATH` export 지시와 함께** 진단한다. `write.js:428`의 ENOENT throw로 죽게 두지 않는다 |
| **R13 — 같은 `meta.plan_path`를 봉인한 plan receipt가 둘 이상일 수 있다** (같은 plan을 다른 슬러그로 재리뷰) | 낮음 | 앵커는 **정확히 1건**일 때만 성립하고 ≥2건은 `undecidable`이다(Task 5). 첫 줄을 고르지 않는 것이 규칙이며 Task 5의 Validate가 그 분기를 직접 단언한다. 모호성을 통과시키면 이 축이 닫겠다는 실패가 이름만 바꿔 남는다 |
| **R14 — `meta.plan_path`가 plan 게이트 전용 필드가 아니다.** `write.js`의 `--plan` 파생이 게이트 중립이라 모든 게이트의 receipt에 실리고, 일부 호출처는 plan 경로가 아닌 값을 정당하게 넘긴다(`plugins/mccp/commands/pr.md:916` PR 제목 허용 · `prp-implement`/`resume`의 `$ARGUMENTS`) | **높음** (R4 architect 실측) | schema 규칙을 **형태만**으로 좁히고(접두·확장자 미강제), stamp를 **repo 하위 실재 파일**일 때로 한정한다(Task 1). Validate는 그 호출처들의 `--plan` 모양을 그대로 `buildReceipt`에 통과시켜 **어떤 게이트의 receipt도 schema-invalid가 되지 않음**을 단언한다 — 계측 필드가 terminal ship의 차단 조건을 넓히지 않는 것이 이 Risk의 acceptance다 |
| **R15 — 앵커의 두 끝은 저자 전사에서 온다.** `plugins/mccp/commands/plan.md`의 `--plan "<plan path>"`도 ship 쪽 placeholder와 같은 종류다 | 중 | 이 plan은 상류를 "기계 파생"이라 주장하지 **않는다**. 보장은 **표기 면역**(정규화)까지이고, 저자가 다른 파일을 지목하는 경우는 「이 milestone이 주장하지 않는 것」에 명시한다. 대신 한 실행 안에서 값이 **단일 원천**이 되도록 Task 6(a)가 plan 경로를 아티팩트로 한 번 파생해 이후 callsite가 그것을 읽는다(§5.2 불변식 (i)와 같은 형태) |
| **R9 — 신규 test가 CI에 없다.** `.github/workflows/`에 등재된 test는 셋뿐이라 강제가 로컬 실행에 의존한다 | 중 | M3는 이 부채를 **갚지 않는다**(우산 축이고 M3만의 문제가 아니다). backlog에 명시 이연하고, 사이클의 `## Validation`이 로컬에서 돌리는 것이 강제 지점임을 보고서에 적는다 |

## 이 milestone이 주장하지 않는 것

- **과거 코퍼스의 링크율을 올리지 않는다.** 동결 baseline은 0/null 그대로다(UI1).
- **`resolution.rounds`를 건드리지 않는다.** M2는 dropped이고 상류가 소유한다(UI15).
- **리뷰 레코드의 형식을 강제하지 않는다.** `receipt_hash` 키를 더할 뿐이고, 형식 강제와 `rounds` 구조는 M4 소관이다(UI9).
- **링크가 *옳다*고 보증하지 않는다.** 보증하는 것은 *운반된 값이 위조 없이 히스토리에 도달한다*이며, 그 위조 방지도 `evidence-stage-guard`가 보는 범위(staged blob의 해시 일치)까지다. 같은 권한으로 Node를 실행하는 주체는 여전히 양쪽을 함께 다시 쓸 수 있다.
- **plan 경로의 *출처*를 기계화하지 않는다 (R4 architect HIGH 흡수).** 앵커의 두 끝은 저자가 타이핑한 경로에서 오고, Phase 4가 plan 파일을 쓰는 주체인 이상 이 저장소에 비-LLM 원천은 존재하지 않는다. 이 milestone이 닫는 것은 **표기 차이**(절대/상대 · `./` · `\` · 중복 슬래시)와 **슬러그 발산**이며, 저자가 *다른 파일*을 지목하는 경우는 닫지 않는다 — 그것은 plan 자체가 리뷰 대상이라는 사실로만 제한된다. R15에 Risk로 남긴다.
- **대시보드/`validate-cmd`에 링크를 노출하지 않는다.** 지표 2가 지정한 읽는 주체는 "사후 감사 → receipt에서 리뷰 원문으로 1홉"이고 필드 자체가 그것을 만족한다. derive/renderer 배선은 요구되지 않았다.

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 != 경로 작동). **부트스트랩을 정직하게 적는다 (R2 패널 HIGH ×2 흡수 — architect·test 독립 지적).** 초안은 "이 브랜치의 `/mccp:pr`이 발행한 ship receipt가 링크를 담을 것"을 acceptance로 걸었는데, **이 사이클에서는 구조적으로 불가능**하고 따라서 아무것도 반증하지 못한다. 두 이유가 독립적으로 작동한다:
  1. 이 사이클의 `mccp-plan-codex` receipt는 **Task 1·6(a)이 존재하기 전에** 발행된다(지금 이 게이트가 쓴다). 그래서 `meta.review_record_path`를 담을 수 없고, Task 5는 없는 것을 전달하지 않는다.
  2. 이 사이클의 상류 `mccp-plan-codex` receipt는 **`meta.plan_path`를 담지 않는다** — Task 1이 그 필드를 신설하기 *전에* 발행되기 때문이다. Task 5의 경로 앵커는 그것을 legacy로 보아 정확히 **무스탬프**를 낸다 — 그것이 옳은 동작이다. (R3 이후 바뀐 점: 슬러그 발산은 이제 앵커를 깨지 않는다. 조회가 슬러그가 아니라 `meta.plan_path`로 이뤄지므로 R1의 완화는 이 축에서 무해해졌고, 부트스트랩 미발화의 사유는 **오직** 필드 부재 하나로 줄었다.)

  그러므로 이 항목이 요구하는 *산출된 실값*(UI12)은 **Task 9의 spawn e2e**가 낸다 — 임시 repo에 상류 receipt와 레코드를 심고 `finalize-receipt.js`를 실제로 실행해 **진짜 ship receipt에 링크가 봉인되고**, 같은 harness에서 evidence commit까지 돌려 `git show <commit>:<path>`로 양쪽이 읽히는 것. 이것은 mock이 아니라 실제 프로덕션 코드의 실행이다. **첫 라이브 링크 ship은 다음 사이클**(M3가 착지한 뒤의 게이트 실행)이며, 그때 이 항목을 라이브로 다시 확인한다.
- [ ] `linkage-audit.js --json`의 `linkage.join`이 `explicit_field`이고 **`post_baseline.linkage`**(신설 라이브 파티션)가 `pre_baseline`과 동형으로 존재하며 그 읽기 원천이 **`HEAD` 트리**임을 확인. 이 값은 동결 파티션과 **다른 필드**에서 읽힌다.
  **`bidirectional >= 1`은 이 사이클의 acceptance가 아니다** — 위 부트스트랩 때문에 이 브랜치의 라이브 값은 정직하게 **0**이고, 0을 1로 만드는 유일한 방법은 앵커를 끄거나 파일명 fallback을 되살리는 것이며 둘 다 이 plan이 금지한 것이다. 라이브 축에서 기계로 확인하는 것은 (a) 파티션이 존재하고 (b) `denominator`가 D2 규율대로 동작하며(자격 ship 0건이면 `null`) (c) **작업 트리 전용 카운트와 `HEAD` 카운트가 별도 필드로 함께 보고되는 것**이다. `bidirectional >= 1`은 **다음 사이클의 acceptance로 이연**하고 그 사실을 여기 적어 둔다 — 도달 불가한 체크박스를 남겨 두면 완료 판정이 거짓이 된다
- [ ] 동결 블록의 **모든 수치 필드**가 재생성 전후 바이트 불변 (변경은 `join`/`join_note` 문자열뿐) · `--frozen-only` 2회 실행 바이트 동일
- [ ] 과거 ship receipt 전건의 `receipt_hash` 불변 — `evidence-audit.js`가 비-blind
- [ ] 배선 부재 test가 **반증 가능**함을 확인 (각 호출 줄을 지우면 red)

## Design Critique

- 트리거: `design_signal=true` (축 a — detector positive). `signal_files`는 `plugins/mccp/scripts/receipt/write.js` · `plugins/mccp/scripts/lib/renderer/html.js` · `plugins/mccp/scripts/lib/renderer/markdown.js` 셋이다.
- **신호의 성질**: 이 hit는 *파일 정체성*에 대한 whitelist 일치이지 *디자인 내용*에 대한 판정이 아니다. 이 plan이 두 renderer 파일에 제안하는 변경은 version 리터럴 1개씩이다 — `html.js:1419`의 `page-foot` footer 문자열과 `markdown.js:163`의 derived 줄. 그 사실을 적어 두지 않으면 이 기록이 "디자인 변경을 리뷰했다"로 읽힌다.
- 라운드: R0 1회 (cap 1 — 봉인된 라운드 정책)
- Verdict: **CONVERGED** (HIGH/CRITICAL/UNKNOWN 0건)

| Output Constraint | 판정 | 근거 |
|---|---|---|
| 정보 위계 3단계 (heading depth ≤ 3) | pass | 두 편집 모두 기존 `<footer>` / `_…_` 한 줄 안의 문자열이라 렌더 표면에 heading을 추가하지 않는다. plan 본문의 heading 최대 깊이도 `###`(H4+ 0건) |
| 강조색 화면당 1개 | pass | 색·accent 토큰을 건드리지 않는다. `html.js:1419`는 `class="page-foot mono"` 안, `markdown.js:163`은 이탤릭 텍스트다 |
| raw markdown marker 금지 | pass | `v1.34.2` → 새 version 리터럴 치환뿐이라 HTML footer에 새 마커·엔티티가 새지 않는다. plan 문서 자신의 `**bold**`는 렌더 표면이 아니라 계획 산출물이므로 이 제약의 사거리 밖이다 |
| 한 화면 항목 수 상한 | pass | STATUS.md / status.html에 `list-of-N` 섹션을 추가하지 않는다. 이 plan의 표(Files to Change · Risks)는 대시보드 렌더 표면이 아니다 |

- Findings: `[]`
- 미해소 HIGH/CRITICAL: 없음

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더된 UI가 없으므로 **어떤 impeccable 명령도 호출하지 않는다** — 아래는 구현자를 위한 체크리스트다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` |
| refine | `/impeccable typeset` |
| refine | `/impeccable animate` |
| refine | `/impeccable colorize` |
| refine | `/impeccable bolder` |
| refine | `/impeccable quieter` |
| refine | `/impeccable overdrive` |
| refine | `/impeccable delight` |
| simplify | `/impeccable adapt` |
| simplify | `/impeccable distill` |
| simplify | `/impeccable clarify` |
| evaluate | `/impeccable critique` |
| evaluate | `/impeccable audit` |
| harden | `/impeccable harden` |
| harden | `/impeccable optimize` |
| harden | `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` |
| system | `/impeccable extract` |

> 이 milestone의 렌더 표면 변경은 version 리터럴 동기뿐이라, 실제로 발화할 것으로 예상되는 행은 없다. 표는 오라클이 낸 그대로 싣는다.

## L2 Refutation Panel — 흡수 기록

R0·R2 두 라운드 모두 4관점이 전원 `fail`을 냈다(R0: finding 17 · blocking 11 / R2: finding 14 · blocking 10). 최신 원문은
[.claude/reviews/plan-review-review-record-linkage-m3.md](../reviews/plan-review-review-record-linkage-m3.md)에 있고
`reviewed_plan_hash`는 `sha256:55f45327…`(흡수 **이전**의 본문)로 봉인돼 있다 — 그 값이 stale해진 것은 결함이 아니라
"무엇을 보고 무엇을 말했는지"의 정직한 기록이다.

**R0에서는 §3.16대로 라운드를 늘리지 않았다.** 판정을 §3.14 임계로 triage해 HIGH 전건과 값싼 MEDIUM/LOW를
그 자리에서 흡수하고, 남은 1건은 backlog로 명시 이연했다.

**R2는 §3.16으로부터의 명시적 이탈이며, 사용자 지시로 열렸다.** 캡이 1이라 R1은 기계적으로 거부됐고
(`plan-review/cli.js:508` `BLOCK: round cap reached`), 사용자가 "수렴해서 receipt 쓸 때까지 반복"을 지시해
`MCCP_GATE_ROUND_CAP`을 1→3으로 올려 재봉인했다. **원장은 지우지 않았다**(§3.16의 금지 사항) — `rounds_so_far`가
1에서 2로 정상 증가했고 남은 예산은 1라운드다. 이 이탈을 적어 두는 이유는 §3.16이 근거로 든 실측(같은 plan에
8시간)이 이 사이클에도 적용 가능한 위험이기 때문이다: R0 17건 → R2 14건으로 줄었으나 R2가 **새 축 3개**
(상류 앵커 · 라이브 파티션 읽기 원천 · 우회 봉인 시점)를 열었고, 그것은 §3.16이 경고한 "수정이 다음 라운드의
표적이 되는 전이"가 아니라 초안이 실제로 덮지 못한 구멍이었다.

| 축 | Severity | 지적 | 처리 |
|---|---|---|---|
| A | HIGH ×3 | 감사의 링크 계산이 동결 트리 안에만 있어 `bidirectional >= 1`이 구조적으로 불가능하고 "수치 바이트 불변"과 자기모순 | Task 8 축 1 — 라이브 파티션 신설 · Acceptance 분리 |
| B | HIGH ×3 | guard 입력 pathspec(`plugins/mccp/commands/pr.md:1197`) 미확장 → fail-open. 입력만 확장 → `:133`이 전 ship 거부 | Task 7 — 3중 단일-커밋 불변식 + Task 9 정적 단언 + R10 |
| C | HIGH ×2 | 자격 판정이 *모름*(상류 부재·파손·`review_source` null)을 권위 있는 `false`+날조 사유로 승격 | Task 5 — 양성 확립 2경우만 stamp, 나머지 무스탬프 |
| D | MEDIUM | 파일명 SoT(`record.js#reviewRecordPath`) 우회 | Task 6(a) |
| E·F | MEDIUM | 해시 미비교로 stale 링크 계상 · 존재 결속 없는 봉인 | Task 8 축 2·3 |
| G | MEDIUM | terminal 신규 HALT에 positive-path pin·감사 우회 없음 | Task 7 — `MCCP_PR_SKIP_LINK_EVIDENCE` + positive pin |
| H | LOW | evidence commit은 3.0인데 3.1로 지목(= history-leak 게이트) | Task 7 · R2 · **Files to Change · Task 9** — 초기 흡수가 Task 7/R2 산문만 고치고 *지시* 2곳(파일 표 · Task 9 정적 단언 대상)을 3.1로 남겨, 흡수했다는 주장 자체가 거짓이었다. 네 곳 전부 3.0으로 정정 |
| I | MEDIUM | Validation 목록에 `plan-review-record` · `plan-review-command-body` 누락 | Validation · Files to Change |
| J | MEDIUM | Task 9 반증 확인이 수동 | **이연** — backlog 2026-09-02 |

### R2 흡수 (2026-09-02, finding 14 · blocking 10 · HIGH 6)

| 축 | Severity | 지적 | 처리 |
|---|---|---|---|
| K | HIGH ×2 | 상류 plan receipt를 **슬러그 이름만으로** 열어, ship 슬러그(브랜치 파생 `review-record-linkage`)가 디스크의 **M1 receipt**와 exact match한다. 다른 마일스톤의 리뷰가 이 ship의 승인 증거로 해시 봉인된다 | Task 5 — `plan_hash` 앵커 대조. 불일치·앵커 부재는 *부재와 동일하게* 무스탬프 + loud warn. Validate 6분기 |
| L | HIGH ×2 | Acceptance의 라이브 실값이 이 사이클에서 **구조적으로 도달 불가**(상류 receipt가 Task 1 이전 발행 + 슬러그 의도적 발산)라 아무것도 반증하지 못한다 | Acceptance — 부트스트랩을 명시하고 *산출된 실값*의 생산자를 Task 9 spawn e2e(음성 대조 포함 2건)로 이동. `bidirectional >= 1`은 다음 사이클로 명시 이연 |
| M | HIGH | 라이브 파티션이 **작업 트리**를 읽으므로(`linkage-audit.js:185-203`, 자기 주석 `:42`가 "진단 전용") 우회·evidence commit 실패에도 지표가 100%를 보고한다 — PRD의 지배적 실패 모드 그 자체 | Task 8 — 라이브 파티션은 `HEAD` 트리를 읽고, 작업 트리 카운트는 별도 진단 필드로 병기(둘의 발산이 곧 미커밋 링크 신호). 라이브 전용 test 4종 |
| N | HIGH | 우회 `MCCP_PR_SKIP_LINK_EVIDENCE`의 사유 봉인이 **시점상 불가능**(receipt는 2.5.7에 봉인, evidence commit은 3.0 → no-rehash 위반이거나 guard가 전 ship HALT) + 담을 필드·플래그·schema·test 전무 | Task 1 — 4번째 present-only 필드 신설 · Task 7 — env를 **2.5.7**에서 읽어 write 플래그로 전달 |
| O | MEDIUM ×2 | guard의 `validateContent(relPath, raw)`는 경로별 **순수 함수**라 "같은 커밋의 ship receipt와 일치"를 담을 채널이 없다 → "아무 staged receipt와나 일치"로 약화 | Task 7 — guard 앵커 입력 채널을 Task 범위에 명시 포함 + Validate (d) |
| P | MEDIUM + LOW | evidence commit 블록의 **진입 predicate**(`plugins/mccp/commands/pr.md:1189`)가 receipt dirty 여부만 보므로 레코드만 back-patch된 실행은 통째로 skip | Task 7 — 3중 → **4중** 단일 커밋 불변식(0번 신설) + Validate (e) + Task 9 정적 단언 |
| Q | MEDIUM | back-patch 대상이 **이 결정의 레코드**인지 결속 없음(덮어쓴 뒤라 해시는 자명하게 일치) | Task 7 — 레코드의 `reviewed_plan_hash` 대조. 선례 `evidence-stage-guard.js:95-98` |
| R | MEDIUM | 라이브 파티션 신설이 실질 신규 코드인데 Validate가 전부 *동결* 단언 | Task 8 Validate — 라이브 전용 4항목 |
| S | MEDIUM | 배선 test 반증 확인이 여전히 수동 | **이연 유지** — backlog 2026-09-02 (R0의 J와 동일 축) |

### R3 흡수 (2026-09-02, finding 9 · blocking 9 · HIGH 5) — **비수렴으로 종료, 예산 소진** · 처방은 아래 «R3 처방» 절이 소유한다

| 축 | Severity | 지적 | 처리 |
|---|---|---|---|
| **T** | **HIGH ×4** (4관점 전원 동일 축) | R2가 넣은 `plan_hash` 앵커가 **항상 거짓인 술어**다 — ship의 `plan_hash`는 PR 시점 디스크 본문에서 재계산되고(`write.js:428`) 2.5.4가 그 본문에 절을 주입하므로(`plugins/mccp/commands/prp-implement.md:344`) 상류와 절대 일치하지 않는다. 채택하면 M3의 산출이 어느 사이클에서도 발화하지 않고, Task 7의 `reviewed_plan_hash` 결속은 fail-closed 경로에서 정상 ship을 거절한다 | **처방 철회 + R11 신설.** 대체 앵커를 지어내지 않았다 — receipt에 불변 plan 식별자가 없고(실측) 후보 3방향은 전부 설계 변경이라 리뷰가 필요한데 예산이 0이다 **(→ 아래 «R3 처방»에서 해소: 앵커를 경로 신원으로 교체)** |
| U | HIGH | 앵커 대조의 ship 쪽 원천이 2.5.7의 placeholder `--plan`(`plugins/mccp/commands/pr.md:1003` "still a placeholder by design")이라 caller 지정 값에 결속된다. 구현이 ship 자신의 `plan_hash`를 비교항으로 쓰면 항등식이 되어 앵커가 무조건 통과 | 같은 축 — T와 함께 철회. 기계 파생 `SHIP_PLAN_PATH`는 `:1097`로 2.5.7(`:959`)보다 뒤라 이 시점에 존재하지 않는다는 사실을 R11에 기록 **(→ 아래 «R3 처방»에서 해소: Task 6(c)가 2.5.7에 그 파생을 넣는다)** |
| V | MEDIUM | 신규 토글 `MCCP_PR_SKIP_LINK_EVIDENCE`가 `env-contract/registry.js`에 미등재 → `lint.js` L1이 붉어지는데 Validation에 lint 실행이 없다 | **미흡수 — backlog 이연** (예산 소진). 착수 시 Files to Change에 registry + `docs/environment/*` 추가하고 Validation에 `env-contract/lint.js` 추가 |
| W | MEDIUM | Validation 3번이 `.git/mccp/tmp/`로 리다이렉트하는데 linked worktree에서 `.git`은 **파일**이라 실행 불가 | **미흡수 — backlog 이연**. `git rev-parse --git-path mccp/tmp`로 바꿔야 한다 |
| X | MEDIUM | (invariant) 기타 앵커 축 파생 지적 | T와 같은 축 |

**세 라운드의 궤적**: R0 17건/blocking 11 → R2 14건/10 → R3 9건/9. 수치는 줄었으나 **매 라운드가 실재하는 HIGH를 새로 찾았고**, R3의 것은 R2 흡수가 만든 것이다. §3.16이 경고한 "수정이 다음 라운드의 표적이 되는 전이"가 이번에는 오탐이 아니라 **진짜 결함의 연쇄**였다 — 그리고 그 연쇄가 이 plan의 중심 기제(층간 링크의 신원 확인)가 아직 풀리지 않았음을 보여준다.

**receipt는 발행되지 않는다.** 사용자 지시로 라운드를 재개해 R2·R3를 돌렸으나 세 라운드 모두 4/4 `fail`이었고, 라운드 예산(cap 3)이 소진됐다.
따라서 `mccp-plan-codex/review-record-linkage-m3` 부재가 **여전히 정직한 상태**다. 이 저장소의
`MCCP_RECEIPT_GATE_MODE=soft`에서 *누락* receipt는 비-terminal 게이트를 막지 않는다(§1.2).
어느 쪽이든 승인 기록을 위조하지 않는다 — verdict는 실제 값 그대로 봉인된다.

### R3 처방 (2026-09-02) — R4 라운드의 입력

R3는 4관점 전원이 단일 축이었다: R2가 넣은 `plan_hash` 앵커가 **항상 거짓인 술어**라는 것.
그 반박은 옳았고, 이번에 **추론이 아니라 디스크에서** 확인했다 — 이미 머지된 M1 쌍이
`plan_hash` 불일치 상태로 존재한다(ship `a467cd83…` = 오늘의 `-m1` plan 해시 / plan receipt
`e85bad7d…`). 처방을 철회하는 데서 멈추지 않고 **앵커를 교체**한다.

| R3 finding | 관점 | 이 라운드의 처방 |
|---|---|---|
| 앵커가 구조적으로 항상 거짓 → 링크가 어느 사이클에서도 발화하지 않음 | architect HIGH | 앵커를 가변 내용 해시(`plan_hash`)에서 **불변 경로 신원**(`meta.plan_path` ↔ `SHIP_PLAN_PATH`)으로 교체 (Task 5) |
| Task 7의 결속도 같은 이유로 영구 미충족 — fail-closed 경로 위라 정상 ship을 거절 | architect HIGH | 결속도 같은 앵커로 교체 — `measurement.plan_path` ↔ `SHIP_PLAN_PATH` (Task 7) |
| 대조의 ship 쪽 값이 기계 파생이 아니라 LLM placeholder | security HIGH | 2.5.7의 `--plan`을 기계 파생으로 교체 + 미해소 경로는 진단 HALT (Task 6(c)) |
| 양성 방향이 실제 producer에 대해 반증되지 않음 | test HIGH | stamp 줄을 지우면 e2e가 red가 되는지 **명시 단계로** 확인 + 음성 e2e 2종 (Task 9) |
| reference 해시의 출처가 명시되지 않음 | invariant HIGH | 양쪽 원천을 표로 고정 — 레코드/receipt/ship 세 층과 각 층의 필드·상태 (Task 5) |

**이 처방이 주장하지 않는 것**: 경로도 결국 *이름*이다. 같은 경로를 봉인한 receipt가 둘이면
앵커는 판정을 거부하며(R13), 같은 권한으로 Node를 실행하는 주체는 여전히 양쪽을 함께 다시 쓸 수
있다("이 milestone이 주장하지 않는 것" 참조). 닫는 것은 **다른 마일스톤의 리뷰가 조용히 자기
승인 증거가 되는 경로**이고, 그 이상은 아니다.

**라운드 예산**: R0·R2·R3로 cap 3을 소진했고, 이 처방을 검증하기 위해 사용자 판단으로
`MCCP_GATE_ROUND_CAP`을 4로 올려 R4를 연다(§3.16 이탈 — 원장은 지우지 않는다).


### R4 흡수 — 1차 발화 (2026-09-02, architect 단독 · finding 3 · HIGH 2)

**이 발화는 4관점이 아니라 1관점이었다.** 호출자가 `workflow-args.json`의 `fleetKeys`를 넘기지
않아 `plugins/mccp/scripts/workflows/plan-review.js:145-151`이 `PERSPECTIVE_ORDER.slice(0, 1)`로
강등했다 — 스크립트가 정확히 그 경우를 경고로 적어 둔 배선 실수다. 정족수(3/4)를 채우지 못하므로
이 결과는 **승인 근거가 아니고**, 아래는 그 1관점이 실제로 낸 지적의 흡수 기록이다. 정식 R4는
4관점으로 다시 발화한다.

| finding | Severity | 흡수 |
|---|---|---|
| 앵커의 **상류 절반도** LLM placeholder다 — `plugins/mccp/commands/plan.md`의 `--plan "<plan path>"`는 `plugins/mccp/commands/pr.md:1003`이 placeholder라 부르는 것과 같은 종류다. Task 6(c)는 ship 쪽만 기계화하므로 앵커가 "두 전사의 바이트 일치"에 의존한다 | HIGH | **주장을 좁히고 보장을 명시한다.** 상류를 "기계 파생"이라 주장하지 않는다. 대신 `write.js`가 `resolve → relativeToRepo → POSIX`로 접어 **표기 차이에 면역**임을 Task 1에 적고, 한 실행 안의 **단일 원천**을 Task 6(a)가 아티팩트로 보장한다. 남는 것(저자가 다른 파일을 지목)은 R15 + 「주장하지 않는 것」에 명시 |
| 신규 schema 규칙이 **모든 게이트**에 적용된다 — `write.js:414/427`은 게이트 중립이고 `plugins/mccp/commands/pr.md:916`은 PR 제목을, `prp-implement`/`resume`은 `$ARGUMENTS`를 정당하게 넘긴다. `.claude/` 하위 + `.md` 강제는 그 receipt를 schema-invalid로 만들어 **terminal ship을 막는다** | HIGH | 규칙을 **형태만**으로 좁히고(repo-relative · POSIX · `..` 없음), stamp를 **repo 하위 실재 파일**일 때로 한정한다. R14 신설 + Validate에 "어떤 게이트의 receipt도 schema-invalid가 되지 않음" 단언 추가 |
| 레코드 층의 `plan_path`도 같은 전사 채널이고 Task 7 결속은 fail-closed라 표기 불일치가 **정상 ship 거절**로 나타난다 | MEDIUM | Task 2가 `plan_path`를 receipt와 **같은 헬퍼**로 정규화한다(두 벌이면 규칙이 갈라진다). Task 9가 헬퍼 공유를 정적으로 단언 |

**반증되지 않은 것** (리뷰어가 공격했으나 실측대로였음): `evidence-stage-guard.js:95-98` 동형
주장 · `:133-136` 비-JSON 거부 · `:1197` pathspec · `validateContent`의 2-인자 순수 시그니처
(`:51`)와 `main()` 입력 채널(`:154`) · `linkage-audit.js:480`의 `post_baseline` 카운트와
`:494-503` `frozenOnly` 화이트리스트가 라이브 파티션을 동결 블록에 새게 하지 않는다는 것 ·
R13(≥2건 undecidable) · 부트스트랩 무스탬프 논증 · 레코드 층 `measurement.plan_path`의
"신규 코드 0줄" 주장.

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->

## External Research Provenance

- Source PRD: .claude/prds/review-record-linkage.prd.md
- References section sha256: 6285d0d8018061d14bd81f59fab68b7c3fcdd25580472eb34dd5b2f6449f5647
- Stamped at: 2026-09-02T06:50:00.340Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt's plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.

## Codex Implementation Review

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 결과: `classification=disabled` · `blocking=false` · `durationMs=0` — `MCCP_CODEX_DISABLED=1` 영구 운영자 정책에 따른 first-class skip (§3.3). 게이트는 이 변수를 해제·override하지 않는다.
- 라운드 수: 0 (봉인된 캡 `cap=1 mode=enforce pinned-by=codex-disabled`)
- 합치 결론: Codex는 발화하지 않았다. 그 자리를 대신하는 것은 이 사이클의 R4 패널 4관점이며, 그 blocking HIGH 5건을 아래에서 흡수한다.
- Codex session 참조: n/a (미발화)

### R4 패널 HIGH 흡수 — 구현 시점 결정 (STATE.md «Next Step» 이행)

plan 게이트는 `MCCP_REVIEW_SINGLE_PASS=deferred_to_prd_completion`으로 봉인됐고(§3.15·§3.16),
DD13 때문에 plan 본문을 고치면 R5가 강제되므로 HIGH 흡수를 이 단계로 이연했다. 여기가 그 이연의 착지점이다.
아래 5건은 전부 **구현 명세의 공백**이지 축의 반박이 아니었으므로, 흡수는 설계 변경이 아니라 **미결정의 결정**이다.

| id | 관점 | 지적 | 흡수 결정 |
|---|---|---|---|
| `7a88ff03` | architect | 공유 정규화 헬퍼가 살 곳이 Files to Change 어디에도 없다. 유일한 in-set 경로는 계층 역전이고, `linkage-defs.js`는 동결돼 있다 | **신규 파일 `plugins/mccp/scripts/lib/repo-path.js`를 만든다.** `require`는 `path` 하나(순수 builtin · I/O 0건)이므로 `record.js`가 그것을 require해도 "Pure and dep-free … NEVER throws" 계약이 유지된다 — 그 계약이 막는 것은 `fs`·`child_process`·git을 write 경로로 끌고 들어오는 것이고(`linkage-defs.js` 헤더가 그렇게 적는다) `path`는 그 부류가 아니다. `write.js`의 모듈-로컬 `relativeToRepo`는 **삭제하지 않고** 이 헬퍼에 위임하게 바꾼다(호출부 4곳의 동작 불변). 이것은 plan의 Files to Change에 없는 파일이므로 **명시 deviation**이며, §1.2대로 dedupe planned matcher를 빗나가 PR-Codex가 발화한다(fail-closed 방향이라 안전) |
| `613d8e5f` | security | back-patch의 결정 결속(`record.measurement.plan_path == SHIP_PLAN_PATH`)에 구현 지점도 test도 없다. 쓰기가 guard보다 **먼저** 일어나므로 3.0의 거절로는 되돌릴 수 없다 | **`link-receipt`에 `--expect-plan-path <p>`를 신설하고, 결속 검사를 쓰기 *이전*에 fail-closed로 둔다.** 순수 술어 `bindsToPlanPath(recordText, expected)`가 `link-receipt.js`에 살고 cli.js가 그것을 소비해 불일치 시 exit 12 + 쓰기 0건. `pr.md` 2.5.7이 `SHIP_PLAN_PATH`를 그 플래그로 넘기고, Task 9의 정적 단언이 그 전달 줄을 본다. 플래그 부재도 **exit 12**다 — 결속 없는 back-patch는 이 지적이 지목한 상태 그 자체이므로 선택지가 아니다 |
| `682a31c5` | test | Task 8 축 3(해시 실제 비교)의 over-permissive 방향 test가 없다 — stale `receipt_hash`가 `bidirectional`로 계수되는 채 green이 된다 | **stale-hash fixture test를 `linkage-audit.test.js`에 추가한다.** 레코드가 비어있지 않은 그러나 **틀린** `receipt_hash`를 담을 때 `bidirectional`이 계수되지 않고 `review_to_receipt`도 계수되지 않음을 단언한다. 대조군으로 같은 fixture의 해시만 옳게 고치면 계수되는 양성 단언을 짝으로 둔다 — 음성만 두면 축 3을 과잉 차단해도 green이다 |
| `9ffdd2e3` | invariant | 신설 라이브 파티션에 blind/degraded 사다리가 없어 판독 실패가 '정상적으로 0건'과 구별되지 않는다. acceptance 3항목이 판독 실패에서도 전부 참이 된다 | **동결 파티션의 사다리(`linkage-audit.js:461-477`)를 라이브 파티션에 그대로 미러한다.** `post_baseline.state ∈ {ok, degraded, blind}` + `reason` + `scope_unknown`이고, `scope_unknown`이면 `linkage` 블록을 **방출하지 않는다**(`frozenOnly`가 동결 쪽에서 하는 것과 같은 규율). acceptance는 "파티션이 존재한다"가 아니라 **"`state=ok`이면서 파티션이 존재한다"**로 좁아진다 |
| `0c8735fe` | test | Validation 3번이 `.git/mccp/tmp/`로 리다이렉트하는데 linked worktree에서 `.git`은 파일이라 실행 불가. acceptance의 유일한 검증 명령이 이 환경에서 돌지 않는다 | **`$(git rev-parse --git-path mccp/tmp)`로 교체한다** — `prp-implement.md` Phase 2.5.5c의 F1과 동형. 이 저장소의 사이클은 `.worktrees/` 하위에서 도는 것이 관례(§3.8)이므로 하드코딩된 `.git/`은 언제나 틀린다 |

### MEDIUM 이연 (§3.14)

R4의 MEDIUM 8건은 `.claude/plans/codex-findings-backlog.md`에 이미 기계 적재됐다(`backlog_skipped_nonblocking: 8`).
그중 넷은 코드를 쓰려면 어차피 결정해야 하므로 **이연이 아니라 여기서 결정**한다 — 결정하지 않으면 구현이 리뷰어가
예측한 두 갈래(fail-open 또는 남의 레코드 stage) 중 하나로 떨어진다:

- **`--record` 인자의 원천** (architect MEDIUM): 방금 봉인된 ship receipt의 `meta.review_record_path`다. `reviewRecordPath(slug)` 로컬 파생은 **쓰지 않는다** — Task 5가 금지한 파일명 관례 부활이다. 앵커 무스탬프로 그 필드가 부재하면 back-patch를 **호출하지 않는다**(링크 미완성으로 남고 감사가 그대로 보고한다).
- **2.5.7 → 3.0 경로 운반** (invariant MEDIUM): 셸 변수가 펜스를 넘지 못하므로 `<gitdir>/mccp/tmp/link-record--<slug>.txt` **아티팩트**로 운반한다(Task 6(a)가 plan.md 쪽에서 쓴 것과 같은 형태). 3.0의 진입 predicate·stage 집합·guard stdin 생산자 셋 다 그 파일을 읽고, 파일이 없으면 셋 다 receipt-only 동작으로 접힌다(글로브로 떨어지지 않는다).
- **무관한 여분 staged 경로의 OUTSIDE HALT 보존** (security MEDIUM): OUTSIDE 필터를 prefix(`^\.claude/reviews/`)로 넓히지 **않는다**. 아티팩트가 명명한 **정확히 그 한 경로**만 예외로 뺀다 — prefix면 코퍼스가 통째로 열린다. 그 음성 test를 함께 둔다.
- **상류 `review_record_path`의 형태 검증** (invariant MEDIUM): 상류 receipt는 hash 미검증이므로 `finalize-receipt.js`가 전달 **전에** `isRepoRelativePath` + `.claude/reviews/` 접두를 확인하고, 불만족이면 **전달하지 않는다**(무스탬프). R14와 같은 논거다 — 계측 필드가 terminal ship의 차단 조건을 넓혀서는 안 된다.

나머지 넷(신규 토글 registry 미등재 · `measurement.plan_path` 정규화 동작 test · 2.5.7 `[ -f ]` HALT test · 기존 `post_baseline` 단언의 운명)은 구현하면서 함께 닫는다 — 넷 다 "test/등재를 추가하라"이고 추가 비용이 이연 비용보다 낮다.

- Deferred to backlog: 0 (이 라운드의 신규 finding 0건 — Codex 미발화)
- Open Questions: 없음 — 위 5건 흡수로 §0 auto-CRITICAL 카탈로그(보안 경계 · atomic state · schema 파손) 해당 항목 0건

### Security Reviewer

`Task(mccp:security-reviewer, "review proposed implementation: …")` — 제안 설계에 대한 리뷰다(코드 작성 전).
산출: HIGH 1 · MEDIUM 2 · LOW 3. **HIGH를 포함해 넷을 즉시 흡수했고**(§3.14 — 흡수는 그 자리에서),
그 흡수로 지적이 성립하지 않게 됐으므로 미해소 HIGH는 0건이다. 나머지 둘은 문서화·설계 확인으로 닫는다.

| id | Severity | 지적 | 흡수 |
|---|---|---|---|
| H1 | **HIGH** | Task 4는 쓰기 지점인데 **읽기 전용으로 설계된** `resolveContained`(`plan-review/cli.js:213-235`)를 그대로 쓴다. 그 함수는 realpath 실패(ENOENT)를 치명적으로 보지 않고 **미해소 lexical 경로로 `ok:true`**를 낸다(`:232-234`, 주석이 읽기 호출자용임을 명시). `.claude/reviews`가 디렉토리 심볼릭 링크이고 leaf가 아직 없으면 containment는 lexical로 통과하고 실제 read/write는 저장소 밖으로 나간다. `writePrivate`의 rename 보장(`:116-118`)은 **leaf** 심볼릭 링크에 대한 것이지 **중간 디렉토리**에 대한 것이 아니다 | **`resolveContained`를 재사용하지 않는다.** `link-receipt` 전용 write-locus 해소기를 둔다: (1) `fs.lstatSync`로 대상이 **이미 실재**하고 leaf가 심볼릭 링크가 **아님**을 확인 · (2) `fs.realpathSync`가 **반드시 성공**해야 하고 실패는 lexical fallback 없이 **exit 12** · (3) 해소된 realpath가 `realpath(repoRoot)` 하위 **그리고** `realpath(repoRoot/.claude/reviews)` 하위 · (4) 읽기·tmp+rename을 전부 **해소된 realpath**에 대해 수행해 중간 심볼릭 링크가 사후 교체돼도 이미 해소된 경로를 벗어나지 않게 한다. back-patch는 **기존 레코드의 갱신**이므로 "이미 실재해야 한다"는 제약이 기능을 좁히지 않는다 |
| M1 | MEDIUM | guard의 앵커 채널이 env/argv 미확정이다. env면 펜스를 못 넘어 **조용히 상시 비활성**이거나, 고치려고 export하면 `CODEX_DEDUPE_AT_PR`·`PR_CODEX_FORCE_OVERRIDE_REASON`이 겪은 stale-env 버그를 재현한다(`pr.md:171-180`·`:472-481`의 `unset` 선례) | **env를 쓰지 않는다.** 앵커는 아티팩트 `<gitdir>/mccp/tmp/link-evidence--<slug>.json`로 운반하고 guard는 `--anchor-file <p>` argv로 받는다. 2.5.7은 진입 시 그 파일을 **먼저 삭제**하고 `link-receipt` **성공 후에만** tmp+rename으로 쓴다 — stale 값이 다음 실행에 상속될 경로가 없다. Task 9에 "앵커가 argv이고 env 이름이 0회 등장한다"는 정적 단언 + stale 회귀 test를 넣는다 |
| M2 | MEDIUM | guard의 `.md` 분기가 "패널 레코드 + 해시 일치"만 보고 **staged 경로가 앵커가 지목한 그 경로인지**는 안 본다. 호출자의 pathspec 스코핑에 의존하는 것은 guard 자신의 docstring(`:15-16`, "fail-CLOSED over the exact STAGED blob")과 어긋난다 | **분기에 경로 동등 검사를 더한다.** staged `.md` 경로가 앵커의 `record_path`와 **문자열 동일**하지 않으면 offender다. 앵커 부재도 offender(fail-closed). 그러면 훗날 누가 stdin 생산자를 prefix로 넓혀도 guard가 단독으로 막는다 |
| L1 | LOW | 운반 아티팩트의 내용이 `git add` pathspec으로 쓰이기 전에 형태 검증되어야 하고, back-patch 실패 시에는 아티팩트가 남으면 안 된다 | **단일 아티팩트 + 단일 검증기로 통합한다.** M1의 파일 하나가 `record_path`·`receipt_path`·`receipt_hash` 셋을 함께 나르고, 순수 검증기 `parseLinkEvidence(text)`(`link-receipt.js`)가 단일 줄 · `.claude/reviews/` 접두 · `..` 부재 · 제어문자 부재 · 64-hex를 강제한다. pr.md 3.0과 guard가 **같은 검증기**를 지난다. 실패 시 미작성(진입 시 삭제했으므로 부재가 기본) |
| L2 | LOW | 앵커가 순수 문자열 동등이라 Windows에서 대소문자만 다르면 안전 방향(무스탬프) false-negative | **의도된 트레이드오프로 문서화한다** — 「이 milestone이 주장하지 않는 것」이 이미 표기 축의 범위를 좁게 적었고, 대소문자 접기·realpath 비교를 더하면 R3가 거부한 "파일시스템 질의로의 성격 변화"가 되돌아온다. 고치지 않는다 |
| L3 | LOW | `bindsToPlanPath`의 정규화가 `repo-path.js`와 갈릴 수 있다 | **`link-receipt.js`가 `repo-path.js`를 require한다.** 두 벌을 만들지 않는다 — 이것이 `7a88ff03` 흡수가 헬퍼를 신설한 이유 그 자체다. Task 9의 정적 단언 대상에 `link-receipt.js`를 더한다 |

추가 채택 1건 — 리뷰어가 「이미 잘 닫혀 있는 부분」에 남긴 권고: `meta.plan_path`의 "CLI 플래그로 주입 불가"를
**부재 증명이 아니라 행위 증명**으로 쓴다(`--plan-path <악의적 값>`을 실제로 넘겨도 봉인값이 `--plan` 파생 그대로인지).
§3.13이 intent 플래그에 대해 채택한 증명 방식과 같다.

- Open Questions: 없음 — H1 흡수 후 §0 auto-CRITICAL 카탈로그(보안 경계 · atomic state · schema 파손) 미해소 항목 0건

### Audited escape — 2.5.7 read-back validate

`MCCP_SKIP_RECEIPT=1` (1회). **사유**: Phase 2.5.4가 **의무적으로** `## Codex Implementation Review`를
plan 본문에 주입하므로 상류 `mccp-plan-codex` receipt의 `plan_hash`가 구조적으로 어긋난다. 실측 —
봉인값 `sha256:0b32a1d5…`는 리뷰 레코드의 `reviewed_plan_hash`와 정확히 일치하고(즉 내 주입 **이전**의
본문 해시), `missing`·`blocking`·`open_critical`은 전부 비어 있으며 `stale` 1건이 그 항목 하나다.
memory `plan-receipt-goes-stale-at-implement`가 같은 사실을 "구조적이며 모든 shipped 사이클이 겪음"으로
기록한다. §3.16대로 라운드를 늘리지 않고 문서화된 우회를 쓰되 사유를 남긴다.

## Milestone Closure Provenance
- Milestone : review-record-linkage-m3
- Verdict   : done
- Closure   : .claude/milestone-closures/review-record-linkage-m3.md
- sha256    : sha256:d7cf3940ce169c5dce075b95d9e25821c5207c268219afb4967b6d8ceea638a1
- Stamped at: 2026-09-03T06:46:42.086Z
