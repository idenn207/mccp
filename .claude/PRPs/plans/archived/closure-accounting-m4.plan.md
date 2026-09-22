# Plan: closure-accounting M4 — instrument-repair

**Source PRD**: `.claude/prds/closure-accounting.prd.md`
**Selected Milestone**: 4 — instrument-repair (신설)
**Complexity**: Large

## Summary

M1은 격차를 **보이게** 했고 M2는 격차를 **닫는 경로**를 만들었다. 그런데 두 산출물은 지금 스스로
틀린 값을 낸다(2026-09-14 실측). 봉인은 자기가 만들어진 커밋이 아니라 전임 봉인의 커밋을 적고
있다. m10 게이트는 재봉인 뒤 조상 결속 1115줄을 불일치로 보고한다. 리포트는 판정을 검증하지 않아
"거짓 100%"로 가는 알려진 경로가 남아 있다. registry 디렉토리 열거가 실패하면 0건으로 접힌다.
격차는 재봉인 5일 만에 426건으로 다시 벌어졌지만 이 계기를 부르는 곳은 여전히 없다.
M4는 이 결함들과 M1·M2 backlog 이연분을 고치고, `closure report`를 CI에서 주기 호출하고, PRD의
상태·Open Question 표류를 정리한다. registry-reachability와 fix-task, M3 plan 게이트 이연분은
M3 소관이라 건드리지 않는다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | backlog, fix-task, open questions, 의도대로 동작하지 않는 기능의 수정 계획을 작성한다 | direction |
| UI2 | closure-accounting PRD에 새 마일스톤을 추가한다 | direction |
| UI3 | M4는 M1과 M2 산출물의 결함과 그 backlog만 고친다 | constraint |
| UI4 | fix-task와 M3 plan 게이트 이연 finding 9건은 M3 구현이 흡수하고 M4는 넘긴다는 사실만 적는다 | exclusion |
| UI5 | M4는 같은 브랜치에서 M3 다음 순서로 진행한다 | constraint |
| UI6 | closure report를 CI에서 주기적으로 호출하고 결과를 job summary에 남긴다 | direction |
| UI7 | 리포트는 게이트가 아니다 — 격차 값으로 진행을 막지 않는다 | constraint |
| UI8 | 봉인 결속 inventory_sha256과 스냅샷 의미론은 바꾸지 않는다 | constraint |
| UI9 | 판정과 해소와 수정을 한 수로 접지 않는다 | constraint |
| UI10 | 이 PRD는 부채를 갚지 않고 갚았는지를 볼 수 있게만 한다 | exclusion |
| UI11 | backlog 표에 상태 열을 추가하지 않는다 | exclusion |
| UI12 | 방어할 근거 없는 임계를 새로 만들지 않는다 | exclusion |
| UI13 | 자식 브랜치는 plugin.json version을 선언하지 않는다 | constraint |

## Evidence (2026-09-14 · HEAD `6be6169` · origin/main `6425ff8`)

아래 값은 관측 로그다. 정본은 실행 시점의 산출이다(PRD Evidence 절과 같은 규율).

- **`closure report`** — sealed 2841 · live 3259 · 격차 **426 (13.07%)** · disposed 1101 · resolved 131 ·
  fixed 1 · registry 21/1495 (1.4%). 2026-09-08 재봉인 직후 격차는 0이었다(M2 report Acceptance).
- **봉인이 틀린 커밋을 적는다.** `Sealed at 2026-09-08T08:25` 옆에 `Sealed commit: 9093b08…`이 찍힌다. 9093b08은
  2026-09-01 전임 봉인의 커밋이다. 재봉인이 실제로 실행된 HEAD는 `e5d274c4e621541f9a26e42bb85761387c5859b2`다
  (`.claude/_meta/data/2026-09-08-closure-reseal-live.json`의 `repo_head`). 원인은
  `plugins/mccp/scripts/lib/msw-metrics/reseal.js#buildCandidate`다. 이 함수는 `sealed_at_commit: doc.meta.sealed_at_commit`로
  값을 복사하고, `Object.assign({}, doc.meta, …)`로 `source_digests`(backlog `ce5810…`)를 함께 물려받는다.
  두 값을 제대로 재는 코드는 `debt-inventory.js#sealInventory`(`headCommit` · `fileDigest`)에 이미 있다.
  `source_digests`를 읽는 비-test 소비처는 0이다(grep).
- **m10 게이트가 조상 결속을 불일치로 보고한다.** `m10-coverage-gate.js --json`의 결과는 `seal.ok:false` ·
  `bound_lines 1101` · `mismatched_lines 1115` · exit 1이다. `checkSeal`은 현재 sha가 아닌 줄을 전부
  mismatched로 센다. 같은 판정을 `debt-inventory.js#verifyDispositions`는 조상 결속 / 불일치로 나누고,
  그 주석이 이 경우를 "a thousand-line false alarm"이라고 부른다. `prd_flip`은 `PRD absent`다 —
  `PRD_REL='.claude/prds/multi-session-work-loop.prd.md'`이지만 그 PRD는 `.claude/prds/archived/`로 옮겨졌다(§3.11).
- **리포트가 판정을 검증하지 않는다.** `plugins/mccp/scripts/lib/closure/report.js`에서 `validateDisposition` 호출은 **0회**다.
  backlog의 PR-Codex R2 F2 재현(모든 판정을 `NOT_A_REAL_ENUM`으로 바꿔도 `closed:1115 · pct:100 · degraded:[]`)은
  "거짓 100%로 가는 알려진 잔여 경로"로 기록돼 있다.
- **registry 열거 실패가 0건으로 접힌다.** `plugins/mccp/scripts/state/findings-registry.js#listWorkUnits`의
  `catch (_e) { return []; }` 때문에 `readAll`은 `degraded:false`를 낸다. PR-Codex R1 F2 재현: EACCES를
  주입하면 findings 1250 → 0이 되는 동안 `degraded`는 비어 있었다.
- **수락 마커 stripper의 구멍** — `debt-inventory.js#stripQuotedForMarker`는 fence·blockquote·4칸 들여쓰기만
  지운다. inline code span과 HTML `<pre>`/`<code>` 블록은 지우지 않는다.
- **reseal.js 운영 결함** — `runCli` plan은 `plan.ok`와 무관하게 `EX_OK`를 낸다. `preflightCarried`의 reason에는
  `checkSuccessor`의 `'successor unreadable: ' + err.message`(절대경로 포함)가 스크럽 없이 들어간다.
  `applyReseal`에는 lock이 없다. `archive-conflict`·`archive-not-stageable`을 단언하는 test는 0개다.
  `archiveRelFor`가 null을 돌려주면 step 0에서 manifest가 이미 쓰인 뒤라 `path.join(repoRoot, null)`이 throw한다.
- **리포트 행이 판정을 종결로 적는다.** 텍스트 출력의 `disposition-ledger  Closed: 1101 / 2841 · 38.75%` 중
  970은 `deferred`다. resolved·fixed는 다른 절에만 있다(PRD 결정 2 · 지표 4).
- **아무도 부르지 않는다** — `.github/workflows/` 7개 중 closure·debt-inventory·m10을 호출하는 곳은 0이다(grep).
- **PRD 표류** — M2 행은 PR #194가 2026-09-14에 머지됐는데도 `in-progress`다. Open Question 1(승계 규칙)은
  M2가 답했지만 체크되지 않았다.

## Backlog triage (closure-accounting M1·M2 태그 행 전수)

backlog 표에는 상태를 적지 않는다(UI11). 판정은 이 표와 보고서에만 남긴다.

| # | backlog 행 (날짜 · 출처 · 요지) | 판정 | 근거 / Task |
|---|---|---|---|
| B1 | 09-08 M2 plan L2 security — 봉인 sha 형태 검증 없이 아카이브 경로 | **M4** | `archiveRelFor`는 형태를 거르지만 null 처리가 manifest 뒤라 throw → Task 3 |
| B2 | 09-08 M2 plan L2 test — `seal_intact` 의미가 test·문서 한 곳에만 | **M4** | `debt-inventory.md`에 `seal_intact` 언급 0 → Task 8 |
| B3 | 09-08 M2 plan L2 — file:line 인용 4건 어긋남 | 해소됨 | 행 자체가 "전건 정정 완료" 기록 |
| B4 | 09-08 M2 plan L2 R3 test — 소비처 연속성 test 반증 불가 | 이연 유지 | 라이브 재봉인이 실효를 실증(M2 report Acceptance). reseal fixture를 소비처에 주입하는 test는 별도 축 |
| B5 | 09-08 M1 L2 architect — `readInventory` `{ok,lines}` 오인 | 해소됨 | `report.js#buildClosureReport`가 try/catch로 `sealed-inventory` degraded |
| B6 | 09-08 M1 L2 architect — Acceptance가 리터럴 카운트 요구 | obsolete | M1 ship 완료, plan-level |
| B7 | 09-08 M1 L2 security — `readInventory` throw | 해소됨 | B5와 같은 분기 |
| B8 | 09-08 M1 L2 test — Task 4(c) 동어반복 | 해소됨 | `report.test.js` (c) injected fixtures |
| B9 | 09-08 M1 L2 test — reseal_warning false 분기 | 해소됨 | `report.test.js` (g) |
| B10 | 09-08 M1 L2 test — CHANGELOG task 없음 | obsolete | M1 ship 완료 |
| B11 | 09-08 M1 L2 invariant — 격차 unknown일 때 경고 억제 | obsolete | 경고가 막으려던 "재봉인이 판정을 끊는다"는 M2 승계로 사라졌다. 판독 불가 입력에서는 reseal이 apply를 거부한다(`msw-reseal.test.js` "an unreadable source refuses to apply") |
| B12 | 09-08 M1 L2 invariant — `null - null === 0` | 해소됨 | `report.js`가 `identityIncomplete`면 gap null |
| B13 | 09-08 M1 L2 invariant — 리포트가 봉인에 앵커되지 않음 | 부분 해소 · 잔여 이연 | `seal.inventory_sha256`은 포함됨. live 측 commit 앵커는 없다 — CI 실행분은 run SHA가 대신한다(Task 7) |
| B14 | 09-08 M1 L2 invariant — Validation 리터럴 1115 | obsolete | M1 ship 완료 |
| B15 | 09-08 M1 R3 fable — 실패 순서에 따라 보고가 달라짐 | **M4** | Task 4(b) |
| B16 | 09-08 M1 R3 codex — 디렉토리 열거 실패가 0/0 | **M4** | B20과 같은 원인 → Task 5 |
| B17 | 09-08 M1 R3 fable — test 5건이 `process.cwd()`에 결속 | **M4** | Task 4(e) |
| B18 | 09-08 M1 R3 fable — `readAll`의 비배열 `findings` | **M4** | `report.js`에서 `Array.isArray` 실패 시 조용히 0/0 → Task 4(c) |
| B19 | 09-08 M1 R3 fable — 테이블이 NOT COUNTED 사유를 안 보임 | 해소됨 | `cli.js`가 `denominator_note`를 `Denominator:` 줄로 렌더 |
| B20 | 09-08 M1 PR-Codex R1 F2 — `listWorkUnits`가 열거 실패를 삼킴 | **M4** | Task 5 |
| B21 | 09-08 M1 PR-Codex R2 F2 — 판정 미검증 → 거짓 100% | **M4** | Task 4(a) |
| B22 | 09-08 M2 Plan-Codex R1 F1 — 봉인 교체 전 크래시 창 복구 규약 | 이연 유지 | manifest 부재 시 거부하므로 유실은 fail-closed로 막힌다. 목표 inventory 영속화는 별도 설계 축 |
| B23 | 09-08 M2 Plan-Codex R2 F1 — 0-격차 Acceptance 실행 불가 | obsolete | M2가 0을 실측(M2 report) |
| B24 | 09-08 intent 축 리뷰어·저자 의미 반대 | 범위 밖 | 소유 codex-intent-context PRD |
| B25 | 09-08 `normalizeCitedPath` 심볼릭 링크 | 범위 밖 | `classifyEvidence` 전 소비처 축 |
| B26 | 09-08 M2 implement security — apply TOCTOU, 잠금 없음 | **M4** | Task 3(a) |
| B27 | 09-08 `mask.test.js` main red | 범위 밖 | 소유 derive/toggle-usage |
| B28 | 09-11 M2 PR Opus — `buildCandidate`가 commit·digest 승계 | **M4** | Task 1 |
| B29 | 09-11 M2 PR Opus — abort 3분류 test 0건 | **M4** | Task 3(f) |
| B30 | 09-11 M2 PR Opus — 조상 결속 줄은 영구 무검증 | **M4 (문서)** | 한계를 명시 → Task 8 |
| B31 | 09-11 M2 PR Opus — apply lock 없음 · 비원자 append | **M4** | B26과 한 lock → Task 3(a) |
| B32 | 09-11 M2 PR Opus — A→B→A면 preflight 영구 abort | **M4** | Task 3(c) |
| B33 | 09-11 M2 PR Opus — plan이 ok:false여도 exit 0 | **M4** | Task 3(d) |
| B34 | 09-11 M2 PR GLM — `stripQuotedForMarker` inline·HTML 미제거 | **M4** | Task 6 |
| B35 | 09-11 M2 PR GLM — preflight 거부 사유 미스크럽 | **M4** | Task 3(e) |

## M3로 넘기는 것 (UI4)

M4는 아래를 편집하지 않는다. M3 구현이 흡수한다.

- `.claude/state/fix-task-applied.md` — `decision_id: closure-accounting-m3` · `verdict: codex_divergent` ·
  `Next: /mccp:santa-loop`. 이 finding(L3 Codex)은 소스 스캔 falsifier가 producer 호출을 지워도 통과한다는
  지적이며, backlog 2026-09-14 첫 행에 있다.
- backlog 2026-09-14 M3 plan 게이트 이연 9건(L3 1 · L2 8).
- 이 세션이 적재한 M3 참고 1건: M3 Validation의 test 경로 오기(`state/tests/` → 실제 `lib/tests/findings-registry.test.js`).
- 아래 `## Multi-Perspective Fan-out`의 findings는 fleet이 PRD의 진행 중 plan(M3)을 읽고 낸 것이라 전부
  M3 plan을 겨냥한다. M1·M2 결함 목록에 더할 것은 없었다. M3 구현이 참고한다.

## Open Questions 처리

| PRD Open Question | M4 처리 |
|---|---|
| 1. 재봉인이 기존 판정을 어떻게 승계하는가 | **닫는다** — M2가 답했다(1101 carried · 14 dropped · 아카이브 `docs/multi-session-work-loop/seals/debt-inventory-f171a42e2c34.json`). 체크 + 답 기록 (Task 8) |
| 2. 분모 밖 부채의 목표값 | **열어 둔다** — 관측만 갱신(재봉인 직후 0 → 5일 뒤 426). M4는 CI로 수치를 보이게 할 뿐 목표를 정하지 않는다(UI12) |
| 3. `deferred`를 어떻게 볼 것인가 | **열어 둔다** — 표본 조사(`/mccp:meta-research`) 범위 |
| 4. 두 계기를 통합할 것인가 | **M3 소관** — 변경 없음 |
| 5. 리포트를 어디에 표시하는가 | **닫는다** — CLI + CI job summary(주 1회 · main push · 계기 파일을 건드리는 PR). 대시보드는 배선하지 않는다 (Task 7·8) |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 조상 판정 | `plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js#verifyDispositions` | `sealAncestry().verified` 집합으로 ancestor-bound와 mismatch를 나눈다 |
| 봉인 필드 산출 | `plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js#sealInventory` | `headCommit(repoRoot)` · `fileDigest(repoRoot, rel)` |
| 계산 불가면 판정하지 않음 | `plugins/mccp/scripts/lib/closure/report.js#buildClosureReport` (seal digest 검사) | `typeof debtInv.inventoryHash === 'function'`일 때만 검증 — mock은 건너뜀 |
| 행 null 접기 | `report.js` `disposalDegraded` · `report.test.js` (m4) | degraded면 행·블록·경고를 같은 조건으로 null |
| 경로 스크럽 | `report.js#scrubPathsFromMessage` (이미 `reseal.js`가 require) | 사용자 가시 reason은 전부 통과 |
| archived 폴백 | `plugins/mccp/scripts/lib/renderer/sections/milestone-history.js` | `.claude/prds/archived/` 직접 조회 |
| HTML raw-text 규칙 | `plugins/mccp/scripts/lib/intent-claims.js#stripQuotedStructures` (type 1) | 규칙만 미러 — 함수 재사용은 금지 (DD6) |
| 합성 git fixture | `plugins/mccp/scripts/lib/tests/msw-reseal.test.js#makeRepo`·`sealAndDispose`·`writeSuccessor` | 라이브 저장소를 쓰지 않는다 |
| m10 fixture | `plugins/mccp/scripts/lib/tests/msw-m10-producers.test.js#gateRepo` | PRD·ledger를 임시 트리에 쓴다 |
| workflow 방어 | `.github/workflows/test-suite.yml` | checkout `11d5960a326750d5838078e36cf38b85af677262` · setup-node `49933ea5288caeca8642d1e84afbd3f7d6820020` SHA pin · `persist-credentials: false` · `contents: read` · `timeout-minutes` |
| workflow 텍스트 단언 | `scripts/tests/wiring-cut.test.js` | yml을 텍스트로 읽어 구조를 단언 |

## Design Decisions

> 저자 근거다. `## User Intent`에 넣지 않는다.

**DD1 — commit·digest는 봉인을 만든 실행이 잰다.** 전임 봉인의 값은 `meta.supersedes`에 이미 보존되므로 복사할
이유가 없다. `sealInventory`의 digest 블록을 `sourceDigests(repoRoot)`로 뽑아 `headCommit`과 함께 export하고,
`buildCandidate`가 둘을 부른다. 커밋된 봉인은 **`meta`만** 정정한다. `inventoryHash`는 `items[]`만 덮으므로
결속은 움직이지 않는다(UI8). `sealed_at_commit`은 `e5d274c…`로 바꾼다(근거 `repo_head`).
`source_digests`는 `null`로 둔다. 재봉인 시점의 파일 바이트를 사후에 증명할 수 없고(그 트리에 미커밋 행이
있었을 수 있다), 읽는 곳도 없다. 틀린 값보다 "측정하지 않음"이 이 리포트의 규율이다. 관측 아티팩트
`2026-09-08-closure-reseal-live.json`은 관측 기록이라 고치지 않는다.

**DD2 — m10 seal 축은 `verifyDispositions`와 같은 조상 판정을 쓴다.** 새 규칙은 없다. 검증된 조상에 묶인 줄은
`ancestor_bound_lines`로 세고, `mismatched_lines`에는 그 밖의 sha만 남긴다. `ok` 식은 그대로다. M2 DD8
("재봉인 뒤 게이트 exit 1")은 여전히 성립하는데, 이유가 `dispositions.open > 0`으로 옮겨질 뿐이다.
**red를 green으로 바꾸는 수정이 아니라 red의 이유를 정확하게 만드는 수정이다.** `prd_flip`은 활성 경로를
먼저 보고, 없으면 `archived/`를 본다. §3.11 아카이브 이동이 게이트 입력 경로를 끊었을 뿐 판정 기준은 같다.

**DD3 — 리포트는 `verifyDispositions`의 판정을 빌린다.** `validateDisposition`을 리포트 안에서 다시 조립하지
않는다. 조상 판정 깊이를 같은 오라클로 읽는 것과 같은 이유로, 리포트와 게이트가 유효성에서 어긋나면 안 된다.
`invalid_dispositions > 0`이면 malformed ledger와 **같은 경로**로 행·블록·경고를 null로 접는다. degraded 이름은
`disposition-validity`이고 첫 사유는 스크럽한다. `denominator_note`는 실제 사유를 부른다. verify는 folded
레코드가 아니라 현재 sha의 모든 줄을 검증하므로, 뒤에서 교정된 옛 무효 줄 하나로도 행이 null이 된다.
이것은 null 방향의 보수이며 게이트와 일치한다. mock 모듈에 함수가 없으면 검증을 건너뛴다(inventoryHash 선례).

**DD4 — 판정 행에 resolved·fixed를 싣는다(가산).** JSON의 `closed` 키는 유지한다. 기준선 JSON subset test (e)와
키 동일성 test (a)가 구조를 고정하므로 이름을 바꾸지 않는다. 텍스트 렌더는 `resolved` 키가 있는 행의 라벨을
`Disposed:`로 바꾸고 `Resolved: <n> (fixed <m>)` 줄을 더한다. 판별은 행 이름이 아니라 키 유무로 한다.

**DD5 — registry 열거는 ENOENT만 "빈 저장소"로 인정한다.** 그 밖의 오류는 `readAll`의 기존 계약
(`degraded` boolean + `degraded_reasons`)으로 흘린다. 소비처 4곳(`closure/report.js` · `debt-inventory.js` ·
`derive/sources/findings.js` · `state/handoff-items.js`)은 이미 degraded 경로를 가지고 있어 새 필드가 필요 없다.
`listWorkUnits`의 반환형은 바꾸지 않는다. reason에는 경로 없이 오류 코드만 싣는다.

**DD6 — 마커 stripper는 `intent-claims.stripQuotedStructures`를 재사용하지 않는다.** 그 함수는 HTML 주석을
지우는데, 수락 마커(`<!-- accepts-inventory: … -->`)가 바로 HTML 주석이다. 재사용하면 모든 마커가 사라지고
라이브 deferred 970건이 무효가 된다. 규칙만 가져온다. 짝이 맞는 `pre|code|script|style|textarea` 블록을
줄 수를 보존하며 지우고, 줄 선두의 닫히지 않은 raw-text 블록은 문서 끝까지 지우고, 한 줄 inline code span을
지운다. 과다 제거는 마커 소실 → deferred 무효 → verify fail-closed로 이어지므로 안전한 방향이다.

**DD7 — reseal lock은 `wx` 파일 하나다.** `.claude/state/reseal.lock`(`.gitignore:65` `.claude/state/*.lock` 적용 확인)을
`O_EXCL`로 만들고 body에 `{pid, host, started_at}`를 쓴다. EEXIST이고 같은 host의 죽은 pid면 1회 회수한다.
그 밖이면 `aborted:'locked'`와 함께 경로·복구 지침을 돌려준다. 해제는 자기 pid일 때만 finally에서 한다.
§3.6의 3종을 재사용하지 않는 이유가 있다. 그 락들은 호출자 계약(token IPC · heartbeat)과 묶여 있고,
apply는 사람이 한 번 부르는 CLI라 lease·heartbeat가 과하다. 범위는 `o.apply` 경로 전체(resume 포함)다.
lock 획득과 `archiveRelFor` null 검사는 **step 0(manifest) 앞**으로 옮긴다(B1).

**DD8 — 되돌아간 부채는 plan이 보고한다.** `planReseal`에서 `new_sha`가 검증된 조상 집합에 있으면
degraded `candidate-is-ancestor`로 `ok:false`를 낸다. apply는 기존 `plan-degraded` 경로로 멈추므로 새 abort
종류는 없다. 이 판정은 plan 단계에서 사유를 즉시 말하기 위한 것이다 — 원래 preflight가 이해하기 어려운 이유로
영구 abort하던 자리다(B32).

**DD9 — `reseal.js plan`은 `plan.ok`가 거짓이면 exit 1이다.** 리포트 CLI의 exit 0 원칙(UI7)은 `closure report`의
것이다. reseal plan은 도구이고, 스크립트가 "계획할 수 없음"을 종료코드로 구별할 수 있어야 한다.

**DD10 — CI는 non-gating 요약 job 하나다.** 새 파일 `.github/workflows/closure-report.yml`의 트리거는 다음과 같다.
- `push: branches [main]`
- `schedule`(주 1회)
- `workflow_dispatch`
- `pull_request`(paths = 계기 자신의 파일들). 이 트리거 덕분에 이 workflow를 도입하는 PR이 머지 전에 경로를
  1회 완주한다. schedule과 dispatch는 default branch에 파일이 있어야 발화하기 때문이다.

`continue-on-error`는 두지 않는다. CLI는 계약상 exit 0이므로, job이 red라면 계기 자체가 실행되지 못했다는
뜻이고 그것이 지표 5가 원하는 배선 회귀 신호다. 격차 값으로 red가 되는 경로는 없다(UI7). required check도
아니다(`scripts/ci-required-checks.js`는 `test-suite.yml`만 본다). **함정 하나**: `{ echo; node …; echo; } >> "$GITHUB_STEP_SUMMARY"`
형태는 그룹의 exit가 마지막 `echo`의 값이라 CLI crash를 삼킨다. 그래서 CLI를 파일로 먼저 리다이렉트해
bash `-e`가 실패를 잡게 한 뒤 요약에 붙인다. 주 1회 주기는 임계가 아니다 — 무엇도 막지 않는다.

**DD11 — 인용은 함수명으로 한다.** M3가 먼저 착지해 `report.js`·`cli.js`·`debt-inventory.js`·`findings-registry.js`·
`msw-m10-producers.test.js`의 줄이 움직인다(backlog B3 교훈). Task 0이 함수 존재를 다시 확인한다.

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/msw-metrics/reseal.js` | UPDATE | Task 1 `buildCandidate` · Task 3 lock·archive 가드·backwards·exit·scrub |
| `plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js` | UPDATE | Task 1 `headCommit`·`sourceDigests` export · Task 6 stripper |
| `plugins/mccp/scripts/lib/msw-metrics/m10-coverage-gate.js` | UPDATE | Task 2 조상 결속 3분할 · archived PRD |
| `plugins/mccp/scripts/lib/closure/report.js` | UPDATE | Task 4 validity · early-return degraded · 비배열 findings · resolved/fixed |
| `plugins/mccp/scripts/lib/closure/cli.js` | UPDATE | Task 4 `Disposed:`·`Resolved:` 렌더 |
| `plugins/mccp/scripts/state/findings-registry.js` | UPDATE | Task 5 열거 실패 degraded |
| `plugins/mccp/scripts/lib/tests/msw-reseal.test.js` | UPDATE | Task 1·2·3 |
| `plugins/mccp/scripts/lib/tests/msw-m10-producers.test.js` | UPDATE | Task 2 archived · Task 6 |
| `plugins/mccp/scripts/lib/closure/tests/report.test.js` | UPDATE | Task 4 |
| `plugins/mccp/scripts/lib/tests/findings-registry.test.js` | UPDATE | Task 5 |
| `docs/multi-session-work-loop/debt-inventory.json` | UPDATE | Task 1 `meta.sealed_at_commit`·`meta.source_digests`만 (items·digest 불변) |
| `docs/multi-session-work-loop/debt-inventory.md` | UPDATE | Task 8 |
| `.github/workflows/closure-report.yml` | CREATE | Task 7 |
| `scripts/tests/closure-report-workflow.test.js` | CREATE | Task 7 |
| `.claude/prds/closure-accounting.prd.md` | UPDATE | Task 8 M2 complete · OQ 1·2·5 |
| `CHANGELOG.md` | UPDATE | Task 8 `## [Unreleased]` |
| `.claude/plans/codex-findings-backlog.md` | UPDATE | 구현 중 새로 이연하는 행만(§3.14) |
| `.claude/PRPs/reports/closure-accounting-m4-report.md` | CREATE | Task 9 |

`plugins/mccp/.claude-plugin/plugin.json`은 목록에 없다(UI13 · §3.7).

## Tasks

### Task 0: 전제 확인

- **Action**: M3가 이 브랜치에 착지했는지 확인한다(`.claude/PRPs/reports/closure-accounting-m3-report.md` 존재, PRD M3 행).
  착지 전이면 **착수하지 않는다**(UI5). `git merge origin/main`을 실행한다 — 현재 HEAD는 #194 머지 커밋 하나 뒤이고
  내용 diff는 0이다. 이 plan이 인용하는 함수가 아직 있는지 확인한다.
- **Validate**: `git merge-base --is-ancestor origin/main HEAD` exit 0 ·
  `grep -c "function buildCandidate\|function checkSeal\|function checkPrdFlip\|function listWorkUnits\|function stripQuotedForMarker\|function preflightCarried\|function runCli" plugins/mccp/scripts/lib/msw-metrics/reseal.js plugins/mccp/scripts/lib/msw-metrics/m10-coverage-gate.js plugins/mccp/scripts/state/findings-registry.js plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js`가 7건 전부 1 이상

### Task 1: 봉인이 자기 commit·digest를 기록한다 (B28)

- **Test first** (`msw-reseal.test.js`): A→B 재봉인 뒤 새 봉인의 값을 단언한다. `meta.sealed_at_commit === git rev-parse HEAD`,
  `meta.source_digests.backlog === 'sha256:' + sha256(backlog 파일)`, `meta.supersedes.sealed_at_commit`은 전임 값.
  **수정 전 red를 실측**한다.
- **Action**:
  1. `debt-inventory.js`: `sealInventory`의 digest 객체를 `sourceDigests(repoRoot)`로 뽑고, `headCommit`·`sourceDigests`를 export한다.
  2. `reseal.js#buildCandidate(repoRoot, doc, plan)`: `sealed_at_commit: di.headCommit(repoRoot)`,
     `source_digests: di.sourceDigests(repoRoot)`로 바꾸고 호출처를 갱신한다.
  3. `docs/multi-session-work-loop/debt-inventory.json`: `meta.sealed_at_commit`을 `"e5d274c4e621541f9a26e42bb85761387c5859b2"`로,
     `meta.source_digests`를 `null`로 바꾼다. JSON 파싱 → 두 필드 → `JSON.stringify(doc, null, 2) + '\n'`
     (`sealInventory`와 같은 직렬화)로 쓴다.
- **Mirror**: `sealInventory`의 필드 산출 · `sealAndDispose` fixture
- **Validate**:
  - test green
  - `git diff --numstat docs/multi-session-work-loop/debt-inventory.json`이 두 필드 부근의 몇 줄뿐
  - `node -e 'const di=require("./plugins/mccp/scripts/lib/msw-metrics/debt-inventory");const d=di.readInventory(".");if(di.inventoryHash(d.items)!==d.inventory_sha256)process.exit(1)'` exit 0
  - mutation: `doc.meta.sealed_at_commit` 복사를 되돌리면 red

### Task 2: m10 게이트 — 조상 결속 3분할 · archived PRD (신규 관측)

- **Test first**:
  - `msw-reseal.test.js`: A→B 뒤 `gate.evaluateGate({repoRoot}).seal`이 `ok:true` ·
    `ancestor_bound_lines === 조상에 묶인 줄 수` · `mismatched_lines === 0`이어야 한다.
  - **비공허 대조**: 아카이브를 인덱스에서 빼면(`git rm --cached`) 그 줄들이 mismatched로 돌아가 `ok:false`가 된다.
  - `msw-m10-producers.test.js`: `gateRepo`가 PRD를 `.claude/prds/archived/` 아래에만 쓰면 `prd_flip.ok === true`다.
    두 경로 모두 없으면 기존 `PRD absent` 사유가 나온다.
  - 수정 전 red를 실측한다.
- **Action**:
  - `checkSeal`: `debt.sealAncestry(repoRoot, doc.value)`를 부른다. `null`이면 `{ok:false, reason:'seal ancestry is malformed'}`.
    검증된 조상 집합에 묶인 줄은 `ancestor_bound_lines`로 세고, 출력 필드에 추가한다.
  - `checkPrdFlip`: 활성 경로 → `.claude/prds/archived/multi-session-work-loop.prd.md` 순으로 찾고, 읽은 경로를 결과에 싣는다.
- **Mirror**: `verifyDispositions`의 조상 분기 주석과 형태
- **Validate**: test green. 라이브 `node plugins/mccp/scripts/lib/msw-metrics/m10-coverage-gate.js --json`에서
  `seal.ok === true` · `seal.mismatched_lines === 0` · `seal.ancestor_bound_lines > 0` · `prd_flip.status` 판독됨이고,
  exit는 여전히 1이며 그 원인은 `dispositions.ok === false`다(DD2).

### Task 3: reseal.js 운영 안전 (B1 · B26 · B29 · B31 · B32 · B33 · B35)

- **Action**:
  - (a) lock (DD7): `acquireLock`/`releaseLock`을 모듈 내부 함수로 두고, `applyReseal`의 `o.apply` 경로 전체를 try/finally로 감싼다.
  - (b) `archiveRelFor(plan.old_sha)` 계산과 null 검사를 step 0 앞으로 옮긴다. null이면 manifest를 쓰지 않고
    `aborted:'archive-path-invalid'`를 돌려준다.
  - (c) backwards (DD8): `planReseal`에서 `anc.verified`가 `newSha`를 포함하면 degraded `candidate-is-ancestor`.
  - (d) `runCli` plan: `return plan.ok ? EX_OK : EX_FAIL`로 바꾸고 USAGE 문구를 갱신한다.
  - (e) `preflightCarried`의 `v.reason`에 `scrubPathsFromMessage(…, repoRoot)`를 적용한다.
- **Test** (`msw-reseal.test.js`):
  - (f) abort 3종: `archive-conflict`(같은 경로에 다른 내용), `archive-not-stageable`(fixture `.gitignore`가 seals/를 무시),
    `preflight-unresolved`(successor에서 조상 마커 제거). 각각에 대해 세 가지를 단언한다 — 봉인 파일 바이트 불변 ·
    manifest state · 원인 제거 후 재시도가 `ok:true`로 수렴하고 승계 줄 수 = carried.
  - (g) lock: `process.pid` 소유 lock이 있으면 `aborted:'locked'`이고 원장 줄 수가 변하지 않는다. 종료된 자식 pid의
    lock이면 회수 후 진행한다. 성공한 뒤와 abort한 뒤 모두 lock 파일이 없다.
  - (h) archive 경로 null이면 manifest가 생기지 않는다.
  - (i) A→B→A: plan이 `candidate-is-ancestor`로 `ok:false`, CLI plan exit 1.
  - (j) scrub: 읽기 권한 000 successor(`process.getuid() === 0`이면 skip)로 만든 apply 출력에 fixture 절대경로가 없다.
- **Mirror**: `makeRepo` · `sealAndDispose` · `writeSuccessor` · 기존 "a manifest deleted mid-flight refuses" test 형태
- **Validate**: test green. mutation 두 가지를 실측한다 — lock 획득 제거 → (g) red · scrub 제거 → (j) red.

### Task 4: 리포트 정직성 (B15 · B17 · B18 · B21 · DD3 · DD4)

- **Action** (`report.js`):
  - (a) DD3. `typeof debtInv.verifyDispositions === 'function'`일 때 호출해 `invalid_dispositions > 0`을 disposal degraded로 접는다.
    `denominator_note`와 degraded reason이 실제 사유(`invalid dispositions` vs `malformed lines`)를 부르게 한다.
  - (b) `buildInventory` throw의 조기 반환이 앞서 관측한 `disposalDegraded`·`sealDigestMismatch`를 `degraded`에 함께 싣고,
    그중 하나라도 있으면 `dispositions`를 null로 둔다.
  - (c) `readAll` 결과의 `findings`가 배열이 아니면 `findingsIncomplete = true` + degraded `findings-registry`
    (`'readAll returned no findings array'`).
  - (d) DD4. disposition 행에 `resolved`·`fixed`를 같은 null 조건으로 싣는다. `cli.js#formatTable`은 `resolved` 키가 있는
    행을 `Disposed:` 라벨로 쓰고 `Resolved: <n> (fixed <m>)` 줄을 더한다.
  - (e) `report.test.js`의 `process.cwd()` 10곳을 `__dirname`에서 해소한 repo root로 바꾸고, 그 경로에 `.git`이 있음을 단언한다.
- **Test** (`report.test.js`):
  - (v1) 합성 저장소(`sealInventory` → 결속 줄 하나를 `fs.appendFileSync`로 `disposition:'NOT_A_REAL_ENUM'` 직접 기입)에
    실제 모듈로 `buildClosureReport` → disposition 행 `closed/total/pct/resolved/fixed` 전부 null ·
    degraded에 `disposition-validity` · `reseal_warning` null.
  - (v2) evidence 없는 `fixed` 줄 → 같은 결과.
  - (v3) 양성 대조: 유효 줄만 있으면 행이 수치를 낸다.
  - (o1) malformed ledger + `buildInventory` throw(mock) → degraded에 두 항목 · `dispositions` null.
  - (n1) `readAll`이 `findings: {}` → registry 행 null + degraded.
  - (r1) disposition 행에서 `fixed ≤ resolved ≤ closed`이고, (m4) 경로에서는 셋 다 null.
  - 수정 전 (v1)·(o1)·(n1) red를 실측한다.
- **Mirror**: (i)/(i2) 봉인 digest 불일치·양성 대조 쌍 · (m4) · `msw-m10-producers.test.js#sealed`
- **Validate**:
  - `MCCP_CODEX_DISABLED=1 node --test plugins/mccp/scripts/lib/closure/tests/report.test.js`
  - 그리고 **다른 cwd에서** `(cd plugins/mccp && MCCP_CODEX_DISABLED=1 node --test scripts/lib/closure/tests/report.test.js)` green
  - mutation: (a) 호출 제거 → (v1) red

### Task 5: registry 열거 실패를 degraded로 (B16 · B20)

- **Test first** (`findings-registry.test.js`): `readAll({dir: <일반 파일 경로>})` → ENOTDIR → `degraded:true`이고
  `degraded_reasons`에 `findings directory unreadable: ENOTDIR`이 있다. root 권한과 무관하게 결정적이다.
  `readAll({dir: <없는 경로>})` → `degraded:false` · `findings:[]`(ENOENT 동작 불변). 수정 전 첫 test red.
- **Action**: 모듈 내부 `enumerateWorkUnits(opts)` → `{units, error}`. `listWorkUnits`는 `.units`만 돌려준다(반환형 불변).
  `readAll`은 `error`가 있으면 `degraded:true`로 두고 reason을 `degraded_reasons` 맨 앞에 넣는다.
- **Mirror**: `readAll`의 기존 `degraded`/`degraded_reasons` 합성
- **Validate**:
  - test + `c1-feedback-loop.test.js` · `c1-coverage-gate.test.js` · `derive/tests/backlog-source.test.js` green
  - mutation: `catch`를 `return []`로 되돌리면 red

### Task 6: 수락 마커 stripper (B34)

- **Test first** (`msw-m10-producers.test.js`, "a successor must exist AND name the seal" 옆): `collectAcceptedShas`가
  다음 입력을 수락하지 **않는다** — backtick span 안의 마커 · `<pre>…</pre>` 안의 마커 · 여러 줄 `<code>` 안의 마커.
  **양성 대조**: 맨 마커와, 닫힌 `<pre>` 블록 **뒤** 줄의 마커는 수락한다. 수정 전 red를 실측한다.
- **Action**: `stripQuotedForMarker`의 줄 루프 앞에서 짝이 맞는 raw-text 블록을 같은 개행 수로 치환한다.
  줄 선두의 닫히지 않은 raw-text 블록은 끝까지 지우고, 줄 단위로 같은 길이 backtick 짝의 inline span을 지운다(DD6).
- **Mirror**: `intent-claims.js`의 type 1 규칙 서술 · 기존 fence 상태 기계
- **Validate**:
  - test green
  - **라이브 불변**: 수정 전후 `node -e 'const di=require("./plugins/mccp/scripts/lib/msw-metrics/debt-inventory");console.log(di.verifyDispositions(".").invalid_dispositions)'`가 같은 값(0)이다.
    라이브 successor 문서 3건의 실제 마커가 인용 구조 밖에 있음을 실측으로 확인하는 절차다.
  - mutation: 추가한 치환을 제거하면 red

### Task 7: CI 주기 호출 (UI6 · PRD 지표 5 · OQ5)

- **Action**: `.github/workflows/closure-report.yml`을 만든다(DD10).
  - 헤더 주석에 적을 것: 왜 존재하는가(PRD 지표 5 · Risk 1) · 게이트가 아님 · required check 아님 · red의 의미.
  - `on`:
    - `push: branches: [main]`
    - `schedule: - cron: '23 4 * * 1'`
    - `workflow_dispatch:`
    - `pull_request: paths:` — `.github/workflows/closure-report.yml` · `plugins/mccp/scripts/lib/closure/**` ·
      `plugins/mccp/scripts/lib/msw-metrics/{debt-inventory,reseal,m10-coverage-gate}.js` · `plugins/mccp/scripts/state/findings-registry.js`
  - `permissions: contents: read`. job `closure report (non-gating)`, `timeout-minutes: 10`.
  - steps:
    1. checkout — test-suite.yml과 같은 SHA, `persist-credentials: false`
    2. setup-node — 같은 SHA, `node-version: '20'`
    3. run: `node plugins/mccp/scripts/lib/closure/cli.js report > closure-report.txt`와
       `node plugins/mccp/scripts/lib/closure/cli.js report --json > closure-report.json`을 **각각 독립 명령으로** 실행한다.
    4. 그다음 `closure-report.txt`를 ```` ```text ```` fence로 감싸 `$GITHUB_STEP_SUMMARY`에 붙인다.
- **Test** (`scripts/tests/closure-report-workflow.test.js`):
  - (w1) 네 트리거가 존재한다
  - (w2) run이 CLI 경로를 부르고, 그 명령이 `{ … } >>` 그룹 **안에만** 있지 않다(DD10 함정)
  - (w3) `continue-on-error` 없음
  - (w4) 모든 `uses:`가 40-hex SHA pin이다. **음성 대조**로 `actions/checkout@v4` 문자열이 같은 정규식에 거부되는 것도 단언한다.
  - (w5) `permissions`가 `contents: read`
  - (w6) CLI를 실제로 spawn한 `report --json`이 exit 0이고, 파싱한 JSON에 `seal`·`live`·`ledgers`가 있다.
- **Mirror**: `scripts/tests/wiring-cut.test.js` 텍스트 단언 · `test-suite.yml` 방어 5종
- **Validate**: `node --test scripts/tests/closure-report-workflow.test.js` green. PR을 열면 이 workflow가 paths 트리거로
  1회 실행되고 job summary가 생긴다 — 그 run URL을 보고서에 적는다(Task 9).

### Task 8: 문서 · PRD · CHANGELOG

- **Action**:
  - `docs/multi-session-work-loop/debt-inventory.md` `## Re-sealing` 아래에 다섯 가지를 적는다.
    1. `seal_intact`는 items↔digest만 증명하고 조상 판정은 `sealAncestry`가 따로 한다(B2)
    2. 조상 결속 줄은 append 뒤 검증을 받지 않는다는 한계(B30)
    3. M2 봉인 meta 정정 기록 — 무엇이 · 왜 · 근거 · items와 digest 불변
    4. apply lock의 의미와 단일 host 한계
    5. `### Reproducibility notice` 갱신 — m10 seal 축은 조상 결속을 분리하고, 게이트 red의 이유는 `dispositions.open`이다
  - `.claude/prds/closure-accounting.prd.md`:
    - M2 행 → `complete`
    - Open Question 1 체크 + 답
    - Open Question 5 체크 + 답
    - Open Question 2 관측 갱신(체크하지 않음)
    - M4 행은 착지 시 `complete`
  - `CHANGELOG.md` `## [Unreleased]`에 항목 하나를 쓴다.
  - 구현 중 새로 이연하는 것이 있으면 backlog에 append한다(§3.14). triage 결과는 backlog가 아니라 보고서에 쓴다(UI11).
- **Validate**:
  - `node scripts/version-declaration-guard.js` exit 0
  - `grep -n '^| 2 | reseal-path .*| complete |' .claude/prds/closure-accounting.prd.md` 1건
  - `node plugins/mccp/scripts/lib/instruction-contract/lint.js --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md` exit 0 (CLAUDE.md는 편집하지 않지만 문서 계약 회귀를 확인한다)

### Task 9: 라이브 1회 완주와 보고서

- **Action**: 아래를 실행하고 출력을 `.claude/PRPs/reports/closure-accounting-m4-report.md`에 첨부한다.
  - `closure report`(텍스트·`--json`)
  - `m10-coverage-gate.js --json` + exit
  - `reseal.js plan --json` + exit
  - `verifyDispositions` `invalid_dispositions`
  - 커밋된 봉인 digest 재계산
  - Task 7 PR run URL

  보고서에 쓸 것: Backlog triage 표의 최종 상태(**M4** 행마다 그것을 고친 test 이름) · mutation red/green 표 ·
  M3로 넘긴 목록 · 주장하지 않는 것.
- **Validate**: 보고서의 값으로 다음이 성립한다.
  - 텍스트 리포트에 `Sealed commit:   e5d274c…` · `Disposed:` · `Resolved:`
  - m10 `seal.mismatched_lines === 0`
  - `invalid_dispositions === 0`
  - 봉인 digest 일치

## Validation

```bash
# 1. 단위·인접 스위트
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 \
  plugins/mccp/scripts/lib/tests/msw-reseal.test.js \
  plugins/mccp/scripts/lib/tests/msw-m10-producers.test.js \
  plugins/mccp/scripts/lib/closure/tests/report.test.js \
  plugins/mccp/scripts/lib/tests/findings-registry.test.js \
  plugins/mccp/scripts/lib/tests/c1-feedback-loop.test.js \
  plugins/mccp/scripts/lib/tests/c1-coverage-gate.test.js \
  plugins/mccp/scripts/derive/tests/backlog-source.test.js \
  scripts/tests/closure-report-workflow.test.js

# 2. report test의 cwd 독립 (B17)
(cd plugins/mccp && MCCP_CODEX_DISABLED=1 node --test scripts/lib/closure/tests/report.test.js)

# 3. 커밋된 봉인: meta만 바뀌고 결속은 불변
node -e 'const di=require("./plugins/mccp/scripts/lib/msw-metrics/debt-inventory");const d=di.readInventory(".");
if(di.inventoryHash(d.items)!==d.inventory_sha256)throw new Error("digest moved");
if(d.meta.sealed_at_commit!=="e5d274c4e621541f9a26e42bb85761387c5859b2")throw new Error("commit not corrected");
if(d.meta.source_digests!==null)throw new Error("digests not nulled")'

# 4. 리포트 (exit 0 유지 — UI7)
node plugins/mccp/scripts/lib/closure/cli.js report --json | node -e '
const j=JSON.parse(require("fs").readFileSync(0,"utf8"));
const row=j.ledgers.find(l=>l.name==="disposition-ledger");
if(!("resolved" in row)||!("fixed" in row))throw new Error("row lacks resolved/fixed");
if(row.closed!==null&&!(row.fixed<=row.resolved&&row.resolved<=row.closed))throw new Error("ordering");
if(j.seal.sealed_at_commit!=="e5d274c4e621541f9a26e42bb85761387c5859b2")throw new Error("seal commit")'
node plugins/mccp/scripts/lib/closure/cli.js report | grep -E "Disposed:|Resolved:"

# 5. m10: seal 축 green, 게이트는 dispositions.open 때문에 여전히 exit 1 (DD2)
M10_JSON=$(mktemp); node plugins/mccp/scripts/lib/msw-metrics/m10-coverage-gate.js --json > "$M10_JSON"; echo "m10 exit=$?"
node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(!j.seal.ok||j.seal.mismatched_lines!==0||!(j.seal.ancestor_bound_lines>0))throw new Error("seal axis");if(j.dispositions.ok)throw new Error("expected open>0")' "$M10_JSON"

# 6. 판정 유효성 라이브 불변 (Task 6)
node -e 'console.log(require("./plugins/mccp/scripts/lib/msw-metrics/debt-inventory").verifyDispositions(".").invalid_dispositions)'   # 0

# 7. reseal plan 종료코드가 plan.ok를 반영
node plugins/mccp/scripts/lib/msw-metrics/reseal.js plan --json > /dev/null; echo "reseal plan exit=$?"   # 라이브는 ok:true → 0

# 8. 선언·삭제 가드
node scripts/version-declaration-guard.js
git diff --diff-filter=D --name-only origin/main...HEAD   # 의도치 않은 삭제 0 (§3.5.1)
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| M3가 먼저 착지해 인용 줄·함수 형태가 움직인다 | HIGH | DD11 함수명 인용 · Task 0 재확인. M3가 `report.test.js` mock을 실제 모듈 spread로 바꾸면 Task 4의 mock 기반 test는 그 형태를 따른다 |
| `report.js`의 `verifyDispositions` 호출로 리포트가 느려진다(deferred successor 판독) | MEDIUM | 라이브 m10이 같은 호출을 이미 수 초에 완주한다. Task 9에 wall clock을 적는다. 느리면 그 사실을 기록할 뿐 캐시를 새로 만들지 않는다 |
| stripper 확장이 라이브 deferred를 무효로 만든다 | MEDIUM | Task 6 라이브 불변 검사(`invalid_dispositions` 전후 동일)를 착지 조건으로 둔다 |
| 커밋된 봉인 meta 정정이 결속을 흔드는 것으로 오해된다 | MEDIUM | Validation 3이 digest 재계산 일치를 기계로 확인한다. 문서가 무엇을 왜 바꿨는지 적는다 |
| registry degraded 확대가 세션 시작 승격 등 소비처의 출력을 끈다 | LOW | ENOENT 동작은 불변이다. 발현 조건은 실제 열거 실패뿐이고, 그때 degraded를 알리는 것이 올바른 동작이다 |
| CI 러너의 수치가 로컬과 다르다(untracked 파일 부재) | MEDIUM | 정본은 실행 시점 산출이다(PRD Evidence). workflow 헤더와 보고서에 명시한다 |
| 60일 무활동 저장소에서 GitHub가 schedule을 자동 비활성화한다 | LOW | `push: main` 트리거가 병행한다. 헤더에 적는다 |
| stale lock이 apply를 영구 거부한다 | LOW | 같은 host의 죽은 pid는 회수하고, 그 밖은 lock 경로와 복구 문구를 돌려준다 |
| Task 7 PR 트리거가 계기 파일을 건드리는 PR마다 job을 돌린다 | LOW | non-gating · required 아님 · 10분 상한. 좁은 paths 필터 |

## M4가 주장하지 않는 것

- **부채를 줄이지 않는다.** fixed 1 · resolved 131은 그대로다. M4의 수정도 disposition으로 기록하지 않는다 — 대상 행 일부가
  봉인 밖이라 재봉인 판단과 묶이고, 그 판단은 운영자 몫이다.
- **격차의 목표값을 정하지 않는다.** CI는 수치를 보이게 할 뿐 막지 않는다.
- **위조 방지가 아니다.** §3.12와 같은 위협모델이다. lock은 단일 host 동시 실행만 막는다.
- **registry 종결률 1.4%는 오르지 않는다.** M3 소관이다.
- **fix-task를 해소하지 않는다.** M3 구현이 흡수한다(UI4).
- **CI green은 결함이 없다는 뜻이 아니다.** 계기가 실행됐다는 뜻일 뿐이다.

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] mutation을 수정 전후 red/green으로 실측해 보고서에 기록 — Task 1 복사 복원 · Task 2 조상 판정 끄기 ·
  Task 3 lock·scrub 제거 · Task 4 verify 호출 제거 · Task 5 catch 복원 · Task 6 치환 제거
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동) — 라이브 `closure report`·m10·reseal
  plan 출력에서 Task 9의 네 항목이 성립하고, **PR에서 `closure-report.yml`이 paths 트리거로 실제 실행돼 job summary가
  생긴 run URL**이 보고서에 있다
- [ ] Backlog triage 표의 **M4** 행 전부가 대응 test 이름 또는 문서 절과 연결됨
- [ ] `plugin.json` diff 0 · CHANGELOG는 `## [Unreleased]` 아래에만
- [ ] fix-task 파일과 M3 이연 행을 편집하지 않음 (UI4)

## Multi-Perspective Fan-out

<!-- Auto-injected by /mccp:plan Phase 2.5 fan-out (read-only). -->

**Coverage**: 4/4 perspectives (architect, security, test, explorer) · spent ~77k.

### Findings (severity-ranked)

- **[MEDIUM][architect]** M3's DD4 puts a new declarative registry (PRODUCER_CHANNELS) and its consuming falsifier test in the same module (findings-registry.js) that also owns CLOSURE_FROM_ADJUDICATION, but the reachability data is consumed by three separate boundaries — closure/report.js (ledger row), findings-producer-reachability.test.js (static source scan across the whole plugins/mccp/scripts/ tree), and future DAR #1.5 (panel producer). Coupling a static cross-repo source-scanner's pass/fail to a data table that lives inside a single-responsibility state module creates a wide, silent blast radius: any refactor that moves an emitter file, renames a kind literal, or splits plan-review/cli.js will fail a test physically located far from the diff, with no import-time indicator that findings-registry.js is a scan target. — plan.md Task 3 (R1-R8) + DD4/DD6 — 'CLOSURE_FROM_ADJUDICATION 옆이어야 하는 이유는 DD7과 같다' vs Task 3's R5/R6 scanning 'plugins/mccp/scripts/ 비-test .js 전수'
- **[MEDIUM][architect]** The plan's own boundary discipline (DD5) folds registry events by inferring channel attribution from gate_id/perspective heuristics rather than an explicit channel tag stamped at emit time — this is a structural leak: the emitters (plan-codex-runner.js, cli.js panel path, santa/seal.js) don't know about or declare their own channel identity; channelOf() reverse-engineers it downstream. Any new emitter that reuses gate_id='mccp-plan-codex' with a new perspective value silently misclassifies into 'plan-review-panel' or 'unattributed' without any emitter-side signal to catch it before the fold. — plan.md DD5: 'gate_id=\'mccp-plan-codex\' ∧ perspective=\'codex\' → plan-codex-runner · gate_id=\'mccp-plan-codex\' → plan-review-panel. 어디에도 맞지 않으면 unattributed'
- **[MEDIUM][security]** finding_closed/finding_adjudicated events feed §3.14 gate-convergence 'no unabsorbed HIGH/CRITICAL' and the new closure/report.js producers[] output, but there is no authorization boundary on who can append these kinds — appendFindings() is a public export callable by any co-located script with repo write access, and the plan (DD4/DD6) only adds a text-scanning falsifier test, not a runtime authorization check. A malicious or buggy caller can synthesize finding_adjudicated{state:'accepted'} or finding_closed{closure_type:'deferred'} events for arbitrary finding_id/gate_id, which (per DD3's new accepted-is-debt filter and the producers[] reachability display) directly changes what closure report and downstream gate-convergence logic believe is closed/accepted vs open. — plugins/mccp/scripts/state/findings-registry.js:390 (appendFindings, no caller-identity/authz check) + :809 CLOSURE_FROM_ADJUDICATION export + :824 appendFindings export; CLAUDE.md §3.14 ties absorbed-finding accounting to gate/round convergence decisions
- **[MEDIUM][security]** The new findings-producer-reachability.test.js (Task 3) is explicitly scoped as a 'falsifier, not forgery prevention' (DD8/M3가 주장하지 않는 것) — it only detects drift via static regex/text scanning of source files, so any emitter that constructs kind/closure_type strings dynamically (e.g. via a variable or template literal) is invisible to R2/R3/R5/R6, meaning a future panel-adjudication producer (DAR #1.5) could silently emit finding_adjudicated with an unmapped closure_type and neither the falsifier nor a runtime guard would catch it — the plan relies entirely on the next milestone's author reading DD6's contract comment. — closure-accounting-m3.plan.md Risks table: 'falsifier가 텍스트 스캔이라 변수로 kind를 고르는 emitter를 놓친다 | MEDIUM' (own admission); DD6 enforcement is purely textual-literal-based ('kind: \'finding_adjudicated\' 리터럴')
- **[MEDIUM][test]** Task 3's R8 positive/negative-control checks and Task 4's p4 mutation test are specified as manual 'mutation 2건을 손으로 실측' steps rather than assertions inside the test file itself — the automated `## Validation` command block never re-runs these mutations, so a future regression that silently defeats R3/R4/R5 or the `open` filter would not be caught by CI/local `node --test`, only by a human remembering to redo the manual toggle. — plan.md Task 3 'Validate': 'mutation 2건을 손으로 실측한다: 패널 closure_types에서 deferred를 빼면 R4가 red … 되돌린 뒤 green' and Task 4 '(p4) … mutation 실측: open을 state === open으로 바꾸면 red' — both are prose instructions to the implementer, not code in findings-producer-reachability.test.js or report.test.js that self-verifies the falsifier fires.
- **[MEDIUM][test]** No test combines Task 1's filter change (accepted counts as debt) with Task 4's channel attribution (DD4/DD5) — p2 checks aggregate channel totals sum to ledger total, and p4 checks accepted is in both open/accepted buckets, but nothing asserts that the SAME accepted record is simultaneously attributed to the correct channel (plan-codex-runner) while also counted in open/accepted — the exact seam where two independently-described changes interact is untested. — Task 4 fixture note: 'fixture는 네 분류가 모두 1건 이상 나오도록 섞는다' (p2) vs '(p4) accepted 1건은 open과 accepted에 모두 잡히고' — p4's oracle is aggregate-count only, not per-record channel+state joint assertion.
- **[MEDIUM][explorer]** A second disposition sink, plan-review/backlog-append.js (review-loop-bypass M2, fired under MCCP_REVIEW_SINGLE_PASS), writes blocking findings directly to codex-findings-backlog.md, bypassing findings-registry entirely — this channel is absent from the PRD, the plan's Evidence table, and DD4's PRODUCER_CHANNELS declaration. Findings dropped there never reach finding_adjudicated/finding_closed and would still register as registry-gap after M3 ships, understating what fraction of findings are permanently registry-invisible unless explicitly scoped around. — plugins/mccp/scripts/lib/plan-review/backlog-append.js module header (per prior fan-out note): appends quorum.blockingFindings to .claude/plans/codex-findings-backlog.md independent of findings-registry; zero mentions in closure-accounting-m3.plan.md's Evidence, DD4 PRODUCER_CHANNELS, or Risks tables.
- **[LOW][architect]** M3 explicitly declares non-parallel-safety against two other in-flight PRDs (review-record-linkage, diverse-agent-review) because it edits plan-review/cli.js and findings-registry.js — both are core shared infrastructure files with no ownership/locking mechanism across PRDs. This is a genuine multi-PRD boundary hotspot the PRD itself flags but the M3 plan does not add any guard (e.g., a marker comment, a CHANGES-pending doc) to reduce the collision cost for the next planner touching the same files. — PRD :140-142 'M3는 plan-review/cli.js·findings-registry.js를 건드리므로 … 그 병렬 무충돌은 주장하지 않는다'; plan.md Task 6 adds only a one-line blockquote pointer in diverse-agent-review.prd.md, not a stronger coordination artifact
- **[LOW][architect]** DD3 changes the debt-inventory 'is this a debt item' predicate (state==='open' → state!=='closed') but the plan explicitly keeps the item's serialized shape unchanged specifically to avoid moving inventoryHash — this asymmetry (filter changes, shape doesn't) means the accepted/open distinction is now knowable only via the registry ledger row (DD4), not via the debt-inventory item itself. Any future consumer of debt-inventory.js items (there are 3 non-test callers per PRD Evidence) that wants to distinguish accepted-vs-open must re-derive it by re-reading the registry directly — debt-inventory.js's own item model becomes an information-losing boundary by design. — plan.md DD3: 'debt item의 형태는 바꾸지 않는다 — coords.state를 더하면 모든 findings item의 내용이 바뀌어 다음 봉인의 inventoryHash가 전 항목에서 움직인다. accepted를 구분해 볼 곳은 registry 행(DD4)이지 debt item이 아니다'
- **[LOW][architect]** Task 4's producers[] array is appended to the same ledger-row object that Success Metric #3 already reserves for a 2-row cross-ledger comparison (disposition ledger vs findings-registry). Growing that row's shape with a 5-element producers array plus per-channel nested reachable/observed objects risks the same 'closed-schema enum' trap the PRD's Decision 5 warned about for backlog's 4-column table — no explicit versioning or consumer contract is defined for report.js's JSON output shape as it grows across M1→M2→M3, and M1's own report.test.js pattern (invariants not literal values) doesn't cover schema-shape stability for external JSON consumers of `report --json`. — PRD Decision 5 rationale (fixed-column parser fragility) vs plan.md Task 4's nested producers[] addition to the same ledger row that Success Metric #3 defines ('리포트의 ledgers[] 2행'), with no schema-version field mentioned anywhere in Files to Change
- **[LOW][security]** DD3 changes debt-inventory.js#collectFindings from state==='open' to state!=='closed', pulling 'accepted' findings into the live debt denominator. This is a data-shape change to a security-relevant integrity metric (debt-inventory feeds seal/disposition verification) driven purely by matching majority-vote among three inconsistent consumers, not by re-validating the state field's trust model — the plan does not check whether 'state' on a finding record can be set by an untrusted/self-reported path (e.g. panel-authored appendFindings calls) versus a verified adjudicator. — closure-accounting-m3.plan.md DD3 (lines 108-116): 'collectFindings의 필터를 state===\'open\'에서 state!==\'closed\'로 바꾼다... 나머지 두 소비처가 이미 그렇게 읽는다. 바꾸는 쪽은 소수 의견 하나다' — no re-derivation of trust in the state field itself, only consumer-count argument
- **[LOW][security]** Task 7 requires a live, git-tracked report artifact (.claude/PRPs/reports/closure-accounting-m3-report.md) capturing full closure report --json output including absolute-path-derived degraded[] messages and item_id lists; the plan's Patterns to Mirror table cites report.js's scrubPathsFromMessage as prior art but Task 7/Task 4 do not explicitly require scrubbing before this new committed artifact is written, unlike the sibling M2 plan which the fan-out flagged for the same gap on reseal-manifest.json. — closure-accounting-m3.plan.md Task 7 (lines 287-296) writes raw --json output to a committed report with no scrub step named; Task 4's producers[] observed counts pull from allFindings.findings which may carry file paths in finding text fields; prior fan-out finding (LOW/security) already flagged the analogous gap in m2.plan.md for reseal-manifest.json and seal-doc meta fields — same unaddressed pattern recurs here
- **[LOW][security]** Task 5's CLI text output for the new producers[] channel rows embeds pending_owner and channel/emitter strings directly into terminal output with no width/format containment; while low risk for terminal injection, the emitter field is a repo-relative path pulled from the frozen PRODUCER_CHANNELS table (developer-controlled, not attacker input), so this is a minor hardening note rather than exploitable — flagged only because the plan introduces a new textual output surface without stating any sanitization posture for it (unlike report.js's degraded[] scrub for other fields). — closure-accounting-m3.plan.md Task 5 (lines 266-272): format string interpolates channel/pending_owner directly, no scrub call referenced
- **[LOW][test]** Task 7's 'live 1회 완주' acceptance criteria are value-comparisons against the current live repo state at implementation time, with no fixture-based rehearsal — since PRD explicitly warns baseline numbers move within the cycle, the four asserted facts could already be stale by the time the report is written to the committed artifact. — PRD lines 34-39: '이 절의 숫자는 한 시점의 값이고, 이 사이클 안에서 이미 움직였다 … 정본은 언제나 closure report의 실행 시점 산출이다.' Plan Task 7 'Validate': '위 네 항목이 보고서에 실측값과 함께 있다' — no re-run/idempotency check.
- **[LOW][test]** R6's known blind spot (new emit call added inside an already-allowlisted file, e.g. plan-review/cli.js gaining an l3 emit branch) is only documented in the Risks table prose, not covered by any falsifier test — this is precisely the failure mode DD6/UI9 (DAR #1.5 wiring the panel path) is likely to hit, and it will ship undetected by CI. — Risks table: 'falsifier가 텍스트 스캔이라 변수로 kind를 고르는 emitter를 놓친다 … 남는 사각은 이미 선언된 파일 안에 새 채널을 추가하는 경우다(예: plan-review/cli.js의 l3 핸들러가 emit을 시작하는 것) — 문서에 한계로 적는다' — mitigation is documentation only.
- **[LOW][test]** Task 5's only validation for the new per-channel CLI text-output line is a manual visual check with no format-string assertion — the described format (channel/open/total/accepted/closures reachable/adjudication reachable+owner) has no test pinning its shape, so a formatTable refactor could silently drop a field. — Task 5 'Validate': 'node plugins/mccp/scripts/lib/closure/cli.js report의 출력에 채널 5행이 보인다.' No corresponding assertion added to report.test.js or a new CLI-output test for the format string in the Action block.
- **[LOW][test]** The wide-blast-radius mock-replacement in report.test.js (swap all existing mocks for a real-module spread + readAll override) has its 'confirm pre-existing suite stays green before adding new assertions' safeguard living only in the Risks-table mitigation prose, not as a numbered Task 4 sub-step — this ordering discipline is load-bearing for not silently breaking pre-existing report.test.js invariants and should be an explicit gated step, not a risk-mitigation footnote. — Task 4 test description: '기존 … mock 전부를 실제 모듈을 spread하고 readAll만 덮는 형태로 바꾼다(그렇지 않으면 전 test가 degraded를 얻는다)'. Risks table: 'report.test.js mock 교체가 기존 불변식을 흔든다 | LOW | … 교체 직후, 새 test를 더하기 전에 기존 스위트 green을 먼저 확인한다'.
- **[LOW][explorer]** Plan correctly identifies CLOSURE_FROM_ADJUDICATION as an existing single-mapping primitive (DD4/DD7) rather than proposing a new one — verified live at findings-registry.js:58 and its module export at :809. This is the right reuse target. — plugins/mccp/scripts/state/findings-registry.js:58,809 (CLOSURE_FROM_ADJUDICATION table + export) matches plan DD4's citation.
- **[LOW][explorer]** Plan's Task 2 proposes adding PRODUCER_CHANNELS/channelOf to findings-registry.js — confirmed these do not yet exist, so this is a genuine CREATE, not duplication of prior work. — Grep for PRODUCER_CHANNELS|channelOf in findings-registry.js returns zero matches (only CLOSURE_FROM_ADJUDICATION found).
- **[LOW][explorer]** emitPanelClosures (plan-review/cli.js:1065-1116, invoked at :1682) already exists and emits finding_closed with closure_type:'deferred' for the panel/multi-agent path — plan's DD5/Evidence table correctly attributes this to the 'plan-review-panel' channel rather than re-implementing panel closure emission from scratch, resolving the CRITICAL finding from the prior fan-out round that an earlier premise ('multi-agent emits 0 finding_closed') was stale. — plugins/mccp/scripts/lib/plan-review/cli.js:1065 (function emitPanelClosures), :1094-1096 (kind:'finding_closed', closure_type:'deferred'), :1682 (call site) — plan Evidence table row cites cli.js:1130/:1094 for the same function.
- **[LOW][explorer]** debt-inventory.js#collectFindings currently filters strictly on state === 'open' (line 218) — plan Task 1's proposed one-line change to state !== 'closed' is a minimal, verified-necessary edit, not a rewrite. — plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js:218 `.filter(function (f) { return f && f.state === 'open'; })`.
- **[LOW][explorer]** closure/report.js already lazily requires '../../state/findings-registry' (line 380) and has an established findingsUnknown/null-on-degraded pattern (lines 424-427) — plan's Task 4 producers[] extension correctly plans to extend this existing require/degraded-handling site rather than adding a second registry import path. — plugins/mccp/scripts/lib/closure/report.js:380,397,418,424-427.
- **[LOW][explorer]** Plan does not name report.js's existing scrubPathsFromMessage path-redaction convention for the new producers[] observed{} block, though this is likely moot since producers[].observed derives purely from in-memory counts, not raw error/path strings. — plan.md Task 4 builds producers via PRODUCER_CHANNELS.map(...) with no path-bearing fields; scrubPathsFromMessage (cited in prior fan-out 'Patterns to mirror') is not referenced for this new surface.
- **[LOW][explorer]** Plan's DD8 deliberately creates a new test file rather than extending c1-feedback-loop.test.js, avoiding m7-assertion-manifest.json coupling — correctly mirrors the existing sibling-file pattern (msw-m10-producers.test.js) instead of growing an already-manifest-bound file. — plan.md DD8 citing docs/multi-session-work-loop/m7-assertion-manifest.json coupling risk; plugins/mccp/scripts/lib/tests/msw-m10-producers.test.js already exists as the sibling convention being followed.

### Meta-gaps

- Plan does not specify whether closure/report.js's --json output has any schema version marker; as producers[] and future DAR #1.5 fields are added, external consumers (dashboard? CI?) have no compatibility contract to check against.  _(architect)_
- No mention of who/what owns the invariant that PRODUCER_CHANNELS stays synchronized when a *fifth* channel (e.g. a future santa-loop variant, or a DAR panel sub-mode) is introduced beyond the falsifier test — the test catches drift but the plan doesn't say who is expected to update PRODUCER_CHANNELS when DAR #1.5 lands, beyond the one-line PRD pointer in Task 6.  _(architect)_
- The plan inherits M3's file list overlapping two other in-flight PRDs but does not describe a rebase/merge order protocol beyond 'Task 6 blockquote' — if DAR #1.5 lands first and adds finding_adjudicated to the panel path, this plan's own DD4 PRODUCER_CHANNELS.registers/adjudicated declarations become stale by construction and only the falsifier test (not a structural boundary) prevents silent drift.  _(architect)_
- No plan.md for M3 states a threat model boundary explicitly — like the M2 plan's residual forgery discussion, this M3 plan assumes 'same repo-write privilege as attacker' but never says so; the new appendFindings/PRODUCER_CHANNELS/producers[] surfaces should inherit that same stated assumption instead of leaving it implicit per-finding.  _(security)_
- The plan does not address what happens when DAR #1.5 (future panel-adjudication producer) is implemented — DD6's contract is documentation-and-test-only; there is no mechanism preventing that future producer from writing finding_adjudicated with a closure_type not present in CLOSURE_FROM_ADJUDICATION's value set at runtime (only a static scan at test time), so a runtime validation guard at appendFindings() call time is a gap the plan does not close.  _(security)_
- No mention of whether the new committed report artifact (Task 7) or the producers[] JSON output could leak local absolute paths, usernames, or other environment-derived strings from finding text fields — the plan cites scrubPathsFromMessage as a pattern to mirror but does not confirm it is actually applied to this new surface.  _(security)_
- No plan-level test asserts producers[] breakdown stays reconciled against top-level registry ledger totals in the live report specifically after Task 1's filter change lands — the partition invariant (p2) is only checked against a synthetic fixture, so a live drift (e.g. a registry record missing gate_id) wouldn't be caught until Task 7's manual live run.  _(test)_
- The plan does not specify auditing pre-existing assertions in msw-m10-producers.test.js that may implicitly depend on the old open-only filter semantics — Task 1 only describes adding new A/B/C cases, not sweeping the file for now-stale expectations.  _(test)_
- No test oracle is proposed for the doc-consistency claims in Task 6 (feedback-loop-design.md, diverse-agent-review.prd.md, closure-accounting.prd.md edits) beyond version-declaration-guard — prose/doc drift, the exact failure class this PRD exists to detect, is left unverified for the plan's own documentation deliverables.  _(test)_
- M3 plan does not state whether the review-loop-bypass backlog-append.js sink should be added as a fifth PRODUCER_CHANNELS entry (registers:false, mirroring DD7's hybrid-L3 treatment) or explicitly excluded with a documented reason — right now it is simply absent rather than deliberately scoped out.  _(explorer)_
- No cross-check in the plan against diverse-agent-review PRD's #1.5 current draft/plan status to confirm the DD6 contract comment placement (one blockquote line under its milestone table) won't itself collide with an in-flight DAR plan edit to the same PRD file.  _(explorer)_

### Patterns to mirror

- plugins/mccp/scripts/state/findings-registry.js:58-63 CLOSURE_FROM_ADJUDICATION — single frozen lookup table pattern the plan reuses for PRODUCER_CHANNELS (DD4), keeping closure vocabulary ownership centralized.  _(architect)_
- plugins/mccp/scripts/lib/msw-metrics/c1-coverage-gate.js:36-107 — allowlist + SELF_EXEMPT + comment-line exclusion + posix path normalization pattern the plan explicitly mirrors for the new falsifier test's static scanner (Task 3).  _(architect)_
- plugins/mccp/scripts/lib/closure/report.js scrubPathsFromMessage — redacts absolute paths before writing to committed diagnostic artifacts; should be applied to any new Task 7 report content that echoes raw finding/emitter data.  _(security)_
- plugins/mccp/scripts/state/findings-registry.js:58-63 CLOSURE_FROM_ADJUDICATION as single mapping table (DD7 precedent) — new producers should route through it rather than branching closure_type ad hoc at call sites, per plan's own DD4/DD6.  _(security)_
- plugins/mccp/scripts/lib/msw-metrics/c1-coverage-gate.js:36-107 — approved-writer allowlist + SELF_EXEMPT + comment-line exclusion + posix path normalization pattern for static provenance scanning, mirrored by Task 3's falsifier but worth citing as the canonical prior art for any future runtime authorization check on appendFindings.  _(security)_
- plugins/mccp/scripts/lib/tests/msw-m10-producers.test.js:37-73 makeRepo/openEvent — synthetic fixture repo with explicit seq/event_id/finding_id for deterministic folds, avoiding live-repo test dependency.  _(test)_
- plugins/mccp/scripts/lib/closure/tests/report.test.js 'invariants, not counts' pattern — asserting structural relationships (e.g. degraded => null propagation) rather than pinning literal live numbers that drift.  _(test)_
- plugins/mccp/scripts/lib/msw-metrics/c1-coverage-gate.js:83-107 static-scan pattern (allowlist + self-exempt + comment-line exclusion + posix path normalization) explicitly mirrored by Task 3's new falsifier — good precedent to keep consistent as the scanner evolves.  _(test)_
- plugins/mccp/scripts/state/findings-registry.js:58 CLOSURE_FROM_ADJUDICATION — single frozen lookup table for judgment→closure mapping; PRODUCER_CHANNELS should live adjacent per plan DD4 (already planned).  _(explorer)_
- plugins/mccp/scripts/lib/plan-review/cli.js:1065-1116 emitPanelClosures — existing panel-side closure emitter matching only-open finding_ids via a Set before appending; any new panel-side adjudication emitter (DAR #1.5) should mirror this de-dup guard.  _(explorer)_
- plugins/mccp/scripts/lib/closure/report.js:380-427 findingsUnknown/null-on-degraded pattern — established convention the new producers[] observed block should follow (never guess a number when a source channel is unreadable).  _(explorer)_
- plugins/mccp/scripts/lib/msw-metrics/c1-coverage-gate.js:36-107 (approved-writer list + SELF_EXEMPT + comment-line exclusion + posix path normalization) — direct precedent for the new findings-producer-reachability.test.js static scanner (Task 3).  _(explorer)_

## Design Critique

- ⚠️ DEGRADED: single-context (게이트 내장 critique — 대상이 plan 문서라 렌더링 표면이 없고, Phase 5 자율 계약이 단계 사이 사용자 질문을 금지해 impeccable critique의 이중 서브에이전트·브라우저·질문 단계를 실행하지 않았다)
- trigger: `design_signal=true` · `signal_files=["plugins/mccp/scripts/lib/renderer/sections/milestone-history.js"]`. plan이 Patterns to Mirror 표에서 archived 폴백 선례로 **인용**한 경로이며, 편집 대상이 아니다.
- SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints` 4종을 읽었다.
  - 사용자 가시 표면은 두 곳이다. `closure/cli.js` 터미널 평문 라벨(`Disposed:` · `Resolved: <n> (fixed <m>)`)과 CI job summary의 ```` ```text ```` fence 한 블록.
  - heading 깊이 · 강조색 · 항목 수 상한은 적용 대상이 없다.
  - raw markdown marker는 fence 안의 평문이라 렌더 누출이 아니다.
- detector: `impeccable detect --json plugins/mccp/scripts/lib/closure` → `[]` (exit 0)
- critique: `Skill(impeccable:impeccable, "critique closure-accounting-m4")` R0 · findings `[]`
- verdict: `CONVERGED` (round 0/2) → receipt `design_critique_verdict=converged`, rounds 1

## Design Routing Guide

routing mode: auto (effective at implement stage). implement 단계의 디자인 게이트가 단계별 impeccable 명령을 라우팅하고, 여기서는 체크리스트로만 둔다. 이 plan은 rendered surface가 0이므로 implement에서 refine/discovery가 강등된다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->

## Codex Implementation Review

- 호출: `node /home/madsc/.claude/plugins/cache/mccp/mccp/1.33.6/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1 (cap 1 · `MCCP_GATE_ROUND_CAP=1` · 봉인 `mccp-implement-codex__closure-accounting-m4`)
- classification: `ok` · structured verdict `needs-attention` → `divergent` · durationMs 66687
- 합치 결론: DD7의 dead-PID lock 회수가 **상호배제를 성립시키지 못한다**. 나머지 여섯 결정은
  반박되지 않았고, meta-only 봉인 정정이 1101건의 결속과 digest를 보존한다는 것은 리뷰어가
  독립적으로 확인했다(`invalid_dispositions` 0).
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 — 동시 stale-lock 회수자 둘이 모두 apply에 진입한다 | HIGH | ACCEPT_NOW | 실재한다. A·B가 같은 죽은 lock을 관측 → A가 unlink 후 자기 lock 생성 → B가 *옛* 관측으로 A의 **살아있는** lock을 unlink. `O_EXCL`은 생성만 보호하고 read-check-unlink 구간은 보호하지 않으며, release의 pid 검사는 이미 깨진 배타성을 복원하지 못한다. 결과는 manifest·seal 덮어쓰기와 carried 줄 중복 append — append-only 원장이라 되돌릴 수 없다 |
- F1 흡수 (Task 3(a) 확장, DD7 상위집합):
  - 회수를 **직렬화**한다. `<lock>.reclaim`을 `wx`로 먼저 잡은 프로세스만 unlink+재생성 구간에
    들어간다. 잡지 못하면 다른 회수자가 작업 중이라는 뜻이므로 `aborted:'locked'`로 거절한다.
  - 구간 안에서 lock body를 **다시 읽어** 관측했던 소유자와 같고 여전히 죽었을 때만 회수한다.
    A가 이미 자기 lock을 세웠다면 B는 살아있는 소유자를 보고 거절한다 — 이것이 F1의 시퀀스를
    구조적으로 닫는 지점이다.
  - 리뷰어가 요구한 **결정적 2-회수자 test**: `.reclaim`이 이미 존재하는 상태에서 stale lock을
    회수하려 하면 반드시 거절한다(Task 3(g2)). mutation — 직렬화 검사를 빼면 red.
  - 리뷰어의 대안(자동 회수 제거)은 택하지 않았다. DD7이 정한 "같은 host의 죽은 pid는 1회
    회수한다"는 계약을 유지하면서 race만 닫는 쪽이 더 작은 변화이고, 회수 제거는 crash 1회마다
    사람이 개입해야 하는 비용을 새로 만든다.
  - **남는 천장**: 회수자가 구간 안에서 죽으면 `.reclaim`이 남아 apply가 영구 거절한다.
    fail-closed이고 거절 메시지가 두 경로를 모두 이름으로 부른다. 자동 만료(lease)는 두지 않는다 —
    lease를 두는 순간 같은 TOCTOU가 한 층 위에서 재현된다.
- Deferred to backlog: 0
- Open Questions: 없음 (F1 흡수 완료 — DIVERGENT_UNRESOLVED 아님)
- Codex session 참조: threadId `01a09f0d-b636-7953-a836-10ea1110586a`
- 리뷰어 주석(범위 밖, 기록만): "M4 is plan-only at HEAD" — 이 게이트는 Phase 3 EXECUTE **앞**에서
  돌므로 구조적으로 참이다. 산출 diff에 대한 리뷰는 `/mccp:pr`의 PR-Codex 소관이다.

### Security Reviewer

`Task(mccp:security-reviewer)` — 설계 단계 리뷰(코드 미작성). **CRITICAL 0 · HIGH 2 · 둘 다 흡수.**
나머지 4개 초점 질문은 이슈 없음 또는 MEDIUM으로 판정됐다.

**S-HIGH-1 — `.reclaim` 직렬화는 "회수자 vs 회수자"만 닫는다. "회수자 vs 신규 획득자"가 남는다.**
Codex F1 흡수가 옳았지만 불충분하다. A가 `.reclaim`을 쥐고 죽은 lock을 `unlink()`한 **직후의 틈**에서,
EEXIST를 한 번도 겪지 않은 제3의 프로세스 C가 평범하게 `open(reseal.lock,'wx')`를 시도하면 파일이 순간
없으므로 **성공한다**. 그 뒤 A의 재생성이 EEXIST를 맞는데, A가 그것을 "내가 지웠으니 당연히 성공"으로
가정하고 무시하거나 `'w'`로 덮어쓰면 A와 C가 함께 `o.apply`에 들어간다 — F1이 막으려던 것과 같은 클래스가
다른 행위자 조합으로 재발한다.
- 흡수: 재생성은 **반드시 `wx`**(절대 `'w'` 아님)이고, 그 EEXIST는 `aborted:'locked'`로 **명시 처리**한다.
  "unlink가 성공했으니 open도 성공한다"고 가정하는 분기를 두지 않는다.
- 선례를 그대로 쓴다: `pr-phase-lock.js:477-504` `cmdEnter`가 같은 형태(`unlink` → 재시도 `open(wx)` →
  `catch EEXIST` → 로그 후 거절)를 이미 구현한다. DD7이 §3.6의 락 **3종을 재사용하지 않는다**는 결정과
  별개다 — 여기서 가져오는 것은 락이 아니라 이 한 줄의 안전장치다.
- `finally`의 self-pid 릴리스 검사(DD7)가 이 경로에서도 A가 **C의** lock을 지우지 않게 막는다. 유지한다.
- test 추가 **(g3)**: 재생성 틈에서 제3의 평범한 acquire가 이기면 회수자는 `locked`로 거절한다.
  mutation — 재생성을 `'w'`로 바꾸거나 EEXIST 분기를 지우면 red.

**S-HIGH-2 — 균형 raw-text 블록에 줄 선두 앵커를 걸면 under-removal이 된다.**
Task 6 Action의 "줄 선두"가 미종결 케이스에만 걸리는지 균형 케이스에도 걸리는지 문장이 모호하다.
mirror 선례는 둘을 **의도적으로 다르게** 다룬다: 균형 블록 제거(`intent-claims.js:64-72`)는 **앵커가
없고**, 미종결 open 탐지(`intent-claims.js:92`)만 줄 선두로 좁힌다 — 그 앵커의 목적은 코드 주석
(`intent-claims.js:88-91`)이 밝히듯 **과다 제거를 막는 것**이지 과소 제거 방지가 아니다.
균형 매칭까지 줄 선두로 좁히면, 문장 중간에서 열린 `<pre>…</pre>` 안의 예시 마커가 **지워지지 않고**
남는다. 렌더러는 그것을 raw HTML로 통과시켜 사람 눈에는 인용으로 보이는데 `collectAcceptedShas`는
원문에서 마커를 찾아 **진짜 승인으로 처리한다** — DD6이 "과다 제거가 안전한 방향"이라고 판단한 그
방향의 반대다.
- 흡수: 균형 블록 정규식은 선례와 동일하게 **줄 선두 앵커 없이** 전문을 매칭한다. 줄 선두 제약은
  미종결 open 탐지에만 남긴다. (DD6 정정이 아니라 DD6이 이미 정한 판단을 문장에서 확정하는 것이다.)
- test 추가 **(t2)**: 줄 **중간**(column≠0)에서 열린 `<pre>…</pre>` 안의 마커는 수락되지 않는다.
- test 추가 **(t3)**: 길이 2 이상의 backtick run으로 감싼 마커도 수락되지 않는다. CommonMark의 짝
  규칙(여는 run과 **정확히 같은 길이**의 다음 run이 닫는다)을 따르므로, 길이가 섞인 줄에서 회귀가 난다.

**S-MEDIUM (즉시 흡수)** — Task 5의 단언이 positive뿐이라 훗날 누가 `err.code` 대신 `err.message`
(Node fs 에러는 실패 경로를 메시지에 담는다)를 실으면 잡지 못한다. reason 문자열에 `/`가 **없음**을
단언하는 negative assert 한 줄을 Task 5 test에 더한다.

**S-MEDIUM (backlog 이연)** — CI step summary의 텍스트 fence 조기 종료. 리포트가 저장소 콘텐츠를
그대로 싣고 그 안에 백틱 3연속이 섞이면 fence가 끊겨 GitHub이 markdown으로 렌더한다. 올리지 않은 근거:
`pull_request` paths 필터가 계기 **코드**로만 좁혀 있어 fork PR이 콘텐츠만 바꿔 발화시킬 수 없고
(실제 표면은 `push:main`·`schedule`이며 그 콘텐츠는 이미 머지된 것), `contents: read` +
`persist-credentials: false` + secrets 미사용이라 write 경로가 없으며, step summary는 GitHub이
새니타이즈하고, UI7대로 이 출력은 아무 것도 gate하지 않는다. → backlog.

**이슈 없음으로 확인된 2건**: item 2(ordering) — `plan.old_sha`는 `planReseal`의 digest 검증
(`reseal.js:126`)을 통과한 값만 쓰고 `inventoryHash`는 항상 `INVENTORY_SHA_RE`를 만족하므로 정상 흐름에서
`archiveRelFor`가 null이 될 일은 없다. 이 수정은 **미래 회귀 대비 방어**이지 현재 도달 가능한 취약점의
수정이 아니다(그래도 순서 이동은 부작용이 없다). item 3(scrub) — `scrubPathsFromMessage`는 repoRoot
하위뿐 아니라 임의 POSIX 절대경로를 매칭하므로 `checkSuccessor`의 `err.message` 케이스를 정확히 덮는다.

## External Research Provenance

- Source PRD: .claude/prds/closure-accounting.prd.md
- References section sha256: f0e684f1fd00c5fe7ebd1b418efd2e119072b6364be46f4648e0827938702505
- Stamped at: 2026-09-14T05:28:05.640Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt's plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.
