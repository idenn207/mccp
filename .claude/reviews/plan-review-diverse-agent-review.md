# Plan Review Panel — diverse-agent-review

**Plan**: `.claude/plans/diverse-agent-review-m9.plan.md` · **Plan version**: `sha256:43c2c867ebbf89ae87a5a67e01f7bb409e86635784ffaa4073055de93c4f9e07`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired
**Halted at**: `5.2e`

> Reason: L2 quorum not satisfied: 6 blocking finding(s): architect/HIGH, architect/FAIL, test/HIGH, test/FAIL

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | HIGH | Task 2 단계 5의 폴백 목적지와 Task 3 T4의 단언이 서로 배타적이다 — T4가 구성하는 바로 그 시나리오에서 폴백도 반드시 실패하므로 "이번 레코드가 유일 경로에 존재한다"는 어떤 구현으로도 만족될 수 없다. plan 내부 모순(M11이 C2로 유형화한 미탐 형태)이며, 구현자는 이 핵심 불변식 test를 조용히 약화시켜 통과시키게 된다. | plan Task 2 단계 5: "이번 실행의 레코드를 `archiveRecordPath(slug, nowIso, sha256(newMarkdown))`에 쓰고" — 목적지가 `.claude/reviews/archive/` 안이다(Task 1). plan Task 3 T4: "아카이브 디렉토리 자리에 **파일**을 만들어 mkdir을 실패시킨다 → canonical이 여전히 직전 바이트이고 · **이번 레코드가 유일 경로에 존재하며** …". 아카이브 경로에 파일이 있으면 `mkdirSync(dir,{recursive:true})`가 ENOTDIR/EEXIST로 실패하고 같은 디렉토리 하위 write도 실패하므로, 이 실행의 레코드는 canonical에도(단계 5가 금지) 아카이브에도(디렉토리 부재) 존재할 수 없다. plan 자신이 그 귀결을 인정한다 — "그것마저 실패하면 degradation만 남기고 exit 0". |
| architect | MEDIUM | 이 milestone은 `record` 서브커맨드의 계약("항상 canonical을 쓴다")을 깨면서, 그 계약을 산문으로 선언한 게이트 본문을 "diff 공집합"으로 봉인한다. UI2의 유일한 기계적 증거(Validation 5)가 오히려 이제 거짓이 된 본문 문장을 고정하는 장치가 된다. | `plugins/mccp/commands/plan.md:1123` — "It reads the artifacts, writes `.claude/reviews/plan-review-<slug>.md`, and **always exits 0**". plan Task 2 단계 5는 "2에서 보존이 실패했으면 쓰지 않는다"로 그 전반부를 반증하는데, plan은 `plugins/mccp/commands/plan.md`를 Files to Change에서 제외하고(72-73행) Validation 5가 그 diff 공집합을 요구한다(209행). 갱신 대상 문서는 CLAUDE.md §3.12와 신규 docs뿐(Task 4·5)이라 게이트 본문의 stale 계약 서술을 고칠 경로가 plan 안에 없다. |
| security | MEDIUM | T4의 핵심 불변식 단언은 Task 2 step 5의 설계상 성립할 수 없고, 그 실제 결과는 M4가 닫은 '차단 경로 미계측'의 부분적 재개방이다. T4는 아카이브 디렉토리 자리에 '파일'을 두어 mkdir을 실패시킨 뒤 '이번 레코드가 유일 경로에 존재'한다고 단언하는데, 그 '유일 경로'가 곧 archiveRecordPath이고 같은 장애물이 그 write도 ENOTDIR로 실패시킨다. 실제로 남는 상태는 step 5 말미가 스스로 적은 '그것마저 실패하면 degradation만 남기고 exit 0'이며, 이때 디스크의 canonical은 **직전 실행의 verdict를 계속 주장**하고 이번 실행은 어떤 파일에도 남지 않는다. 오늘 코드에서는 canonical 덮어쓰기가 'canonical = 최신 실행'을 보장하므로, 이는 M9가 새로 도입하는 stale-evidence 창이다. | plan.md:113-116 ("canonical 쓰기 — 단, 2에서 보존이 실패했으면 쓰지 않는다 … 그것마저 실패하면 degradation만 남기고 exit 0") vs plan.md:139-141 (T4 "아카이브 디렉토리 자리에 파일을 만들어 mkdir을 실패시킨다 → canonical이 여전히 직전 바이트이고 · 이번 레코드가 유일 경로에 존재하며"); 현행 보장은 cli.js:1151-1155 (mkdir + 무조건 writeFileSync); 침해되는 PRD 불변식은 prd.md:88 "계측 표면이 receipt에서 git-tracked `.claude/reviews/`로 이전, 전 HALT 경유" |
| security | LOW | '이름이 내용 파생이므로 목적지가 이미 있다면 바이트가 동일하다 — 그래서 특례 분기를 두지 않는다'는 근거가 같은 Task가 정의한 fallback에서 거짓이다. Task 1은 stamp 불일치 시 `undated`, digest 불일치 시 `nodigest`라는 **내용과 무관한 상수**로 접도록 규정하므로, 두 fallback이 함께 걸린 서로 다른 두 레코드는 같은 파일명(`plan-review-<slug>--undated--nodigest.md`)을 갖고 충돌 분기가 없어 **조용히 덮어써진다** — M9가 없애려는 바로 그 유실이 아카이브 안에서 재현된다. 부수적으로 digest12(48비트)는 내용 주소로서의 충돌 저항을 주장하기에 짧지만, 그쪽은 이 코퍼스 규모에서 실질 위험이 아니라 위 fallback 경로가 실질 축이다. | plan.md:81-85 ("…아니면 `undated`" · "…아니면 `nodigest`") vs plan.md:109-110 ("이름이 내용 파생이므로 목적지가 이미 있다면 바이트가 동일하다 — 덮어써도 무해하고 그래서 특례 분기를 두지 않는다") |
| test | HIGH | T4 — 이 milestone이 "핵심 불변식"이라 부른 유일한 test가 Task 2의 설계 아래에서 통과 불가능하다. 즉 구현자는 test를 느슨하게 하거나 불변식을 바꾸게 되며, 어느 쪽이든 '보존 실패 시 유실 0'은 반증 수단을 잃는다. | plan Task 3 T4: "아카이브 디렉토리 자리에 **파일**을 만들어 mkdir을 실패시킨다 → canonical이 **여전히 직전 바이트**이고 · 이번 레코드가 유일 경로에 존재하며". 그러나 Task 2 단계 5는 보존 실패 시 이번 레코드를 `archiveRecordPath(...)`에 쓰라고 지시한다 — T4가 만든 시나리오에서 그 디렉토리는 생성 불가(자리에 파일)이므로 그 write도 실패하고, plan 자신이 "그것마저 실패하면 degradation만 남기고 exit 0"이라 적는다. 따라서 이번 레코드는 어느 경로에도 없다. '유일 경로'를 canonical로 읽으면 같은 문장의 'canonical이 여전히 직전 바이트'와 직접 모순된다. |
| test | MEDIUM | M9는 `.claude/reviews/` finding 표면에 신규 writer(rename/copy/write)를 `plan-review/cli.js`에 추가하는데, 그 표면을 감시하는 approved-writer 허용목록에 `cli.js`가 없다. Files to Change에도 Validation에도 그 게이트가 등장하지 않아 위반 여부가 어느 쪽으로도 test되지 않는다. | `plugins/mccp/scripts/lib/msw-metrics/c1-coverage-gate.js:35-38` `APPROVED_SURFACE_WRITERS = ['plugins/mccp/scripts/lib/plan-review/record.js','plugins/mccp/scripts/lib/santa/seal.js']` + `:57-58` 토큰 정규식이 `.claude/reviews` 인접을 잡고 `:64-75`가 `renameSync\|copyFileSync\|writeFileSync`를 write verb로 센다. plan Validation 1~10 어디에도 c1-coverage-gate 실행이 없고 Files to Change에도 그 파일이 없다. |
| test | MEDIUM | Task 2가 특례 분기를 생략하는 근거("이름이 내용 파생이므로 목적지가 이미 있다면 바이트가 동일하다")는 Task 1이 스스로 정의한 퇴화 경로에서 거짓이며, 그 경로를 덮는 test가 없다 — `undated--nodigest`로 접히면 파일명이 내용과 무관해져 서로 다른 바이트가 조용히 덮인다(= M9가 없애려는 바로 그 유실). | plan Task 1: "압축 결과가 `^\\d{8}T\\d{6}\\d{0,3}Z$`가 아니면 `undated`" · "`^[0-9a-f]{12,64}$`의 앞 12자. 아니면 `nodigest`". Task 2 단계 2: "이름이 내용 파생이므로 목적지가 이미 있다면 바이트가 동일하다 — 덮어써도 무해하고 그래서 특례 분기를 두지 않는다". T5는 "throw하지 않고 결과가 `.claude/reviews/archive/`를 벗어나지 않는다"만 단언하고 목적지 충돌+상이 바이트는 어느 케이스에도 없다(T3는 '같은 바이트'만 다룬다). |
| test | LOW | UI9가 요구하는 '라이브 완주' 관측(Validation 10)이 합격 판정을 갖지 않는다 — 산출 0건에서도 명령이 성공으로 읽힌다. | plan Validation 10: `ls -1 .claude/reviews/archive/plan-review-diverse-agent-review--*.md \| wc -l` — 개수를 출력할 뿐 임계 비교가 없고, Acceptance의 '1건 이상'을 기계로 강제하지 않는다(glob 미매치 시 `ls` 오류가 곧 판정이 되는 것도 의도된 형태가 아니다). |
| invariant | HIGH | 보존 순서가 뒤집혀 있다 — 파괴적 연산(rename)이 canonical 쓰기보다 먼저이고, 그 사이에서 실패하면 canonical 레코드가 디스크에서 사라진다. Plan은 그 창을 설계에도 test에도 담지 않았고, Risks 행이 정반대를 단언한다. | Plan Task 2: "2. 보존: … fs.renameSync … 5. canonical 쓰기". 기존 canonical 쓰기는 실패 시 그냥 EX_OK로 반환한다(cli.js:1153-1160 `catch { errln(...); return EX_OK; }`). 따라서 rename 성공 → write 실패(EACCES/ENOSPC/프로세스 kill) 경로에서 `.claude/reviews/plan-review-<slug>.md`는 **존재하지 않게** 되고, 아카이브에서 되돌리는 단계가 plan에 없다. T4는 mkdir 실패(=rename 이전)만 검사하므로 이 창을 덮지 않는다. Plan Risks는 "rename은 원자적이라 이 축에서 유실은 없고 순서만 흔들린다"고 적지만 원자성은 단일 연산의 성질이지 2연산 시퀀스의 성질이 아니다. 결과는 앵커 소실이다 — approval-audit의 앵커 해소가 canonical 경로를 먼저 본다(approval-audit.js:385 resolveAnchor / :588 io.readDir(REVIEW_DIR)), 즉 PRD A1이 `unauditable`로 부른 바로 그 상태를 신규 코드가 만들 수 있다. |
| invariant | MEDIUM | 보존 실패 분기가 canonical을 '직전 실행의 바이트'로 남기도록 명시하지만, slug로 canonical을 읽는 소비처들은 그것을 이번 실행의 레코드로 읽는다. degradation은 아무 소비처도 보지 않는 아카이브 파일과 stderr에만 남는다. | Plan Task 2 단계 5 + T4: "canonical이 **여전히 직전 바이트**이고 · 이번 레코드가 유일 경로(아카이브)에 존재". canonical을 slug로 여는 소비처는 `plugins/mccp/scripts/state/handoff-items.js:156`(`'.claude/reviews/plan-review-' + work_unit + '.md'`), `plugins/mccp/scripts/lib/review-single-pass.js:163-170`(레코드 경로에서 slug·dispatch-log를 도출하고 :173 `extractMeasurement`로 그 레코드의 Measurement를 판정 입력으로 삼음), `plugins/mccp/scripts/lib/msw-metrics/c1-coverage-gate.js:322-334`이다. 이 분기에서 `emitPanelFindings`(cli.js:1149)는 여전히 이번 실행 이벤트를 레지스트리에 append하므로 레코드와 레지스트리가 서로 다른 실행을 가리킨다. Plan의 Risks 표에 이 축(stale canonical) 행이 없다. |
| invariant | MEDIUM | `.claude/reviews/` 쓰기를 관장하는 유일한 정적 게이트를 Validation이 돌리지 않으며, 그 게이트의 허용 목록은 실제 writer와 이미 어긋나 있다 — 구현 방식에 따라 게이트가 조용히 붉어진다. | `c1-coverage-gate.js:35-38` APPROVED_SURFACE_WRITERS는 `plan-review/record.js`(fs import 0건인 순수 모듈)만 담고 실제 writer인 `plan-review/cli.js`는 없다. cli.js가 현재 통과하는 이유는 write 줄에 경로 리터럴이 없기 때문뿐이다(:1151-1155). M9가 cli.js에 `renameSync`/`copyFileSync`를 추가하면서 목적지 변수를 `path.join(root,'.claude','reviews','archive',…)` 형태로 만들면 `SURFACE_PATH_TOKEN_RE`(:57-58) + `TAINT_DEST_TARGET_RE`(:73-75)에 걸려 위반이 되고, CLI는 비영점 exit한다(:625). Plan의 Validation 1~10 어디에도 `c1-coverage-gate.js`가 없다. |
| invariant | MEDIUM | corpus.js는 중복 제거도, 레코드가 어느 계측 체제(결정당 1건 vs 실행당 1건)에서 왔는지 표시할 필드도 갖지 않는다. M9 이후 그 도구가 내는 모든 비율은 두 표본 우주의 혼합이 되고, M8이 발행한 수치는 도구로 재현 불가가 된다. | `corpus.js:676-710` readReviewRecords는 두 디렉토리의 모든 `.md`를 무조건 push하며 dedupe·체제 태깅이 전혀 없고, `:464 panel_records` · `:495 pass_path` · `:660 k_split(before/after)`가 그 집합 위에서 계산된다. 아카이브로 들어가는 것은 구조적으로 '나중 라운드에 의해 대체된' 레코드(대개 divergent)이고 시간상 split 이후에 몰리므로, M8이 "손잡이는 무력하다"를 논증한 바로 그 축(k_split 전후 비교)이 편향된다. Plan Risks는 "수치가 커져 M8과 어긋난다 — forward-only"로 **개수 증가**만 다루고 분포 편향·재현성 상실은 다루지 않는다. |
| invariant | LOW | "아카이브가 자동으로 코퍼스가 된다"는 corpus.js 한 도구에만 참이다. 승인 품질 감사 도구는 `.claude/reviews/`만 비재귀로 읽으므로 아카이브된 레코드는 감사 사거리 밖으로 나간다. | Plan Summary는 corpus.js:103-106만 근거로 든다. 그러나 `approval-audit.js:172` `REVIEW_DIR = .claude/reviews`이고 `:588 io.readDir(REVIEW_DIR)`는 비재귀라 `archive/` 하위를 열거하지 않는다 — M11이 세운 false-approve 감사(G3 downstream 채널 포함)는 아카이브로 밀려난 레코드를 보지 못한다. Plan은 이 도구를 Patterns(approval-audit.js:41)로 인용하면서도 그 열거 범위는 검토하지 않았다. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | 인용 검증: `cli.js:1069/1140/1151-1160`(cmdRecord 무조건 덮어쓰기·exit 0 계약) · `corpus.js:103-106`(archive 포함 2경로) · `corpus.js:211`+`readReviewRecords:676-691`(H1 판별자, 파일명 아님) · `record.js:69-77`(sanitizeSlug가 `-{2,}` 접음 → `--` 구분자 주장 참) · `record.js:315,323`(recorded_at 존재, 첫 줄 H1) · `approval-audit.js:41-48,172`(이름 결속 함정 A7) · `handoff-items.js:156` · `c1-coverage-gate.js:322-334` · `review-single-pass.js:161-170` · `.gitignore:160-166`(reviews는 무시 대상 아님). 공격한 축: (1) 아카이브 파일명이 소비처 3곳을 깨는가 — c1-coverage-gate와 single-pass는 `.claude/reviews`를 비재귀로만 읽으므로 archive 하위는 사거리 밖, 깨지지 않음. (2) handoff-items의 canonical 포인터가 아카이브 이후 다른 실행의 레코드를 가리키게 되는가 — 그렇지만 M9 이전에도 덮어쓰기로 동일하게 틀렸으므로 회귀가 아니라 판단해 finding으로 올리지 않음. (3) 내용 파생 파일명의 충돌·중복 축적(T3) — recorded_at이 바이트 안에 있어 stamp도 내용 파생이므로 일관, 결함 없음. (4) corpus 수치 팽창 — Risks가 forward-only로 명시 흡수. (5) `--diff-filter=D` 오탐 — canonical이 같은 커밋에서 M으로 남아 성립. 남은 두 건이 위 findings다. |
| security | pass | 1) 경로 주입/traversal: `archiveRecordPath`의 세 입력을 각각 공격했다 — slug는 record.js:69-73 `sanitizeSlug`가 `[^A-Za-z0-9._-]`를 접고 선행 `.`/`-`를 제거하며 `-{2,}`를 접으므로 `../`도 `--` 경계 모호성도 만들 수 없음을 확인(plan의 `--` 주장은 코드와 일치). stamp/digest는 plan이 정규식+fallback으로 총함수화하므로 구분자 주입 불가. 착지 못함. 2) 신뢰 경계: 아카이브 파일명이 새 승인 앵커가 되는가 — corpus.js:211 `PANEL_TITLE_RE`가 소속 판별자이고 approval-audit는 해시 결속이라 파일명이 판정에 도달하지 않음을 확인. A7 재현 경로 없음. 3) 소비처 오염: c1-coverage-gate.js:322-334 `listReviewRecords`가 `.claude/reviews`를 비재귀로 읽고 `/^plan-review-.+\\\\.md$/`로 거르므로 `archive/` 하위가 work_unit 집계에 새어 들어오지 않음을 확인. review-single-pass.js:163-169는 아카이브 경로를 받으면 root/slug가 어긋나지만 그 실패는 exit 1(fail-closed)이고 호출자가 canonical만 넘김. 착지 못함. 4) 절대경로 유출(§3.12 선례): record.js:314가 `--plan`을 축자 저장하고 아카이브가 자동 정리되지 않으므로 영구화 가설을 세웠으나, canonical도 이미 git-tracked이고 커밋된 이력은 덮어쓰기로 지워지지 않으므로 M9가 유출 클래스를 바꾸지 않음 — 스스로 반증해 제외. 5) 우회 토글: 보존을 끄는 env가 0개임을 확인(plan.md:126). 남은 것은 위 두 건이며 HIGH/CRITICAL 없음. |
| test | fail | plan의 인용을 실물과 대조했다: `cli.js:1149-1160`(emit→write 순서·exit 0 계약)·`corpus.js:103-106`·`:211`(2경로 + H1 판별자)·`record.js:75-77`은 전부 plan의 서술과 일치했다. 기존 `plan-review-record.test.js`를 훑어 덮어쓰기를 정본으로 고정한 test가 있는지 봤고 없었다(T1·T6의 red-first 주장은 성립 가능). A7 함정 재발 가능성을 소비처에서 직접 검증했다 — `c1-coverage-gate.js:322-333`(비재귀 readdir + `^plan-review-.+\\.md$`), `approval-audit.js:586-600`(비재귀 + 패널 H1 제외), `review-single-pass.js:163-169`(파일명 slug + 두 단계 위 root)는 모두 canonical 디렉토리만 보므로 아카이브 파일이 오귀속되지 않았다 — 이 축은 반증 실패로 보고하지 않는다. 남은 결함은 위 넷이며 핵심은 T4의 자기모순과 c1 approved-writer 축의 미검증이다. |
| invariant | fail | 인용 검증(cli.js:1069/1140/1153, record.js:70/76, corpus.js:103-106/211, approval-audit.js:41)은 전부 실측했고 plan이 말한 대로였다. 공격한 축: (1) 보존 실패 분기가 어느 방향으로 접히는가 — exit 0 계약은 유지되나 canonical이 stale로 남고 그 사실이 소비처에 도달하지 않음. (2) rename→write 2연산 시퀀스의 크래시 창 — canonical 소실 경로가 실재하고 복구 단계·test 모두 없음(Risks 행이 반증됨). (3) `.claude/reviews/` 쓰기를 막는 정적 게이트(c1-coverage-gate)의 allowlist·taint 규칙 대조 — Validation 미포함 + allowlist가 실제 writer와 불일치. (4) corpus.js의 dedupe/체제 태깅 부재와 k_split 편향. (5) approval-audit·handoff-items·review-single-pass·c1-coverage-gate 네 소비처의 열거 범위. 반면 아카이브가 c1-coverage-gate의 surface-delta 축을 붉게 만드는가는 추적했으나 방향이 반대(레코드가 레지스트리를 초과할 때만 실패, :466/:480)라 finding으로 올리지 않았고, digest12 절단 충돌·sanitizeSlug 120자 절단도 신규 결함이 아니라 판단해 뺐다. |

## Measurement

<!-- Written by plan-review/cli.js record on EVERY exit path, pass or halt.
     Machine-readable; do not hand-edit. A null field means the axis was
     not observed, never that it was zero. -->

```json
{
  "verdict": "divergent",
  "source": "multi-agent",
  "layers": {
    "l1": "converged",
    "l2": "divergent",
    "l3": "not fired"
  },
  "quorum": {
    "responded": 4,
    "required": 3,
    "roles": 4,
    "of": 4,
    "passed": false
  },
  "wall_clock_ms": 401624,
  "halt_stage": "5.2e",
  "backlog_appended": null,
  "backlog_skipped_nonblocking": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:43c2c867ebbf89ae87a5a67e01f7bb409e86635784ffaa4073055de93c4f9e07",
  "plan_path": ".claude/plans/diverse-agent-review-m9.plan.md",
  "recorded_at": "2026-09-01T01:28:51.500Z"
}
```
