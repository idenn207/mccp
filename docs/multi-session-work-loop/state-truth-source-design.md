# 상태 진실원 설계 (state truth-source) — multi-session-work-loop M5

> 이 문서는 M5가 **보증하는 것과 보증하지 않는 것**의 단일 기준이다. 코드가 이
> 문서와 어긋나면 코드가 틀린 것이고, 문서가 관측과 어긋나면 문서를 고친다 —
> 어느 쪽도 조용히 넘기지 않는다.
>
> 관련: [evidence-conflict-design.md](evidence-conflict-design.md) §8 (M3/M5 경계) ·
> [measurement-instrumentation.md](measurement-instrumentation.md) (A4) ·
> [CLAUDE.md §3.2](../../CLAUDE.md) (STATE.md 연속성)

---

## 1. 보증 (G1~G5)

| # | 보증 | 메커니즘 | 기계 검증 |
|---|---|---|---|
| G1 | **정상 모드의 모든 상태 변형이 손실 없이 append된다.** degraded 구간은 제외되며 그 제외는 마커·loud stderr·`journal verify` 비영점 exit 세 곳에 동시에 드러난다 | `state-writer.update()`가 투영 경유로 재배선. 변형은 저널 append가 먼저이고 STATE.md는 그 결과의 렌더 | `single-writer-lint.js` 축 1 · `state-journal-projection.test.js` degraded 5단계 |
| G2 | **닫힌 작업 단위는 지연·재생 기록으로 되살아나지 않는다 — 저널이 유실된 뒤에도** | `(work_unit, seq)` high-water + tombstone + `session_epoch` 우선순위. genesis 부트스트랩이 git-tracked `completion-ledger`에서 tombstone을 재수집 | `state-journal-replay.test.js` 6종 · `journal-store.test.js` ledger seed |
| G3 | **STATE.md 소비 계약이 불변이다** — 시그니처·렌더 바이트·소비 목적의 코드 변경 0줄 | `renderState`/`mergeState`를 재구현하지 않고 **호출만** 한다 | `state-journal-projection.test.js` byte-identical · lint 축 2 |
| G4 | **이력이 질의 가능하고, 보존 정책이 투영을 손상시키지 않는다** | `journal query|verify|checkpoint` + checkpoint 압축(무손실) + 세그먼트 **회전**(삭제 아님) | `state-journal-retention.test.js` 압축 전후 동등 |
| G5 | **A4 분자가 경계 스코프로 파생된다** | 저널 `prev_session_id` 경계 — self-credit이 구조적으로 불가능 | `a4-boundary-restore.test.js` 10종 |

> **G5의 "전환 확인"은 코드가 아니라 배포 후 실측이다** (UI9). 이 사이클의 실측
> 결과는 §10에 기록한다.

## 2. 보증하지 **않는** 것 (명시 잔여)

| # | 잔여 | 왜 남는가 |
|---|---|---|
| 1 | 저널은 working-tree 전용 — 클론 경계를 넘는 이력은 보존되지 않는다 | 세션마다 append되는 JSONL을 추적하면 모든 PR이 충돌 표면이 된다(§3.12가 ship receipt만 선별 추적한 것과 같은 판단). 클론은 STATE.md를 genesis로 부트스트랩한다 |
| 1b | **클론 경계를 넘는 tombstone 방어는 decision-slug 축에만 성립한다** (구현 중 정밀화) | ledger tombstone은 `decision_id` 키인데, `update()` 호출 다수는 slug를 patch에 싣지 않아 `work_unit`이 `task_fingerprint`로 떨어진다. 두 네임스페이스가 만나지 않으므로 fingerprint 축 레코드는 ledger seed의 보호를 받지 못한다. 저널 수명 **안**에서는 두 축 모두 tombstone이 성립한다 |
| 2 | "요약 문서의 강등"은 생성 계약에서만 성립한다 | SessionStart가 주입하는 것은 여전히 STATE.md 본문이다. 저널 질의 수단은 **사람·명령**(`journal query`)에게 생기고 자동 주입 경로에는 생기지 않는다 |
| 3 | A4를 제외한 지표는 M5가 뒤집지 않는다 | 저널은 A4의 기판 *그 자체*지만 A1·B3·C계열은 무관한 별도 producer를 요구한다 (M8 소관) |
| 4 | **락은 advisory다** | 투영 → STATE.md rename 구간은 기존 advisory 락을 쓰고 그 락은 ~1s 후 fail-open한다. 무조건적 상호배제를 주장하지 않는다 — 상세는 §5.3 |
| 5 | degraded 구간의 중간 이력은 복원되지 않는다 | `--reseed`는 그 구간의 *최종 상태*를 새 genesis로 봉인할 뿐이다. 또한 마커 write까지 실패한 세션 **안**에서는 사용자가 stderr 외의 신호를 받지 못한다(검출은 다음 세션) |
| 6 | 무결성은 **우발** 손상까지다 | `content_hash`는 부분 write·인코딩 깨짐·편집 실수·단건 변조를 검출하지만, 해시를 함께 재계산하는 편집자는 검출하지 못한다(체인·서명 없음). 단일 운영자 위협 모델 — M3 §1.1과 같은 판단 |
| 9 | 정적 lint는 별칭 뒤의 값을 못 본다 | 축 3은 리터럴 + 같은 스코프 1-hop 별칭 + `resolveHandoffRoot` 경유까지 본다. 임의 깊이 별칭·재할당·고차 함수 경유, 그리고 **이름은 맞지만 값이 틀린 바인딩**은 정적으로 판정 불가 — 그 축은 `cwd ≠ repoRoot` 런타임 fixture가 답하고, 두 겹이 남기는 사각은 닫히지 않는다 |
| 10 | G3은 *동등성*을 증명하지 남은 *정확성*을 증명하지 않는다 | `next_chunk` 같은 **선재 divergence** 필드는 pin이 "격차가 변하지 않았다"만 보증한다. *어느 쪽이 옳은가*는 두 파서를 통합하는 별도 축이다 |
| 11 | `Validation-SHIP`은 advisory다 | 비영점 exit로 신호할 뿐 `/mccp:pr`을 기계적으로 막지 않는다(게이트 강도 변경은 UI3 범위 밖). 미달은 대신 **자국을 남긴다** — §10 참조 |

> **잔여 7은 해소됐다.** plan은 "M5가 provisional 스키마 위에서 진행한다"고 적었으나,
> 착수 시점 [measurement-feasibility.md](measurement-feasibility.md)의 STATUS는
> `RE-FROZEN — 2026-07-24`이다. plan 작성 시점의 오독이며, 차단이 아니라 **완화**이므로
> 진행하고 여기 정정을 남긴다.

---

## 3. 레코드 스키마

`plugins/mccp/scripts/lib/state-journal/record.js` — bounded allowlist. 목록 밖 키는
기록되지 않는다.

| 필드 | 의미 |
|---|---|
| `record_id` | UUID |
| `ts` | 기록 시각 (ISO) |
| `session_id` | `orchestration-runaway#resolveSessionKey`와 **동일** precedence로 해석 |
| `session_epoch` | `session-ledger.created_at` (단조·host/pid 검증 완료). 부재 시 `ts` |
| `epoch_source` | `ledger` / `ts-fallback` — 어느 근거인지가 레코드에 남는다 |

> **ledger 리더의 기본값은 실제 리더다** (PR-Codex C1). 호출자 주입에 맡기면
> "caller가 잊는" 실패 모드가 남고 **실제로 그것이 일어났다** — `state-writer`가
> `ledgerRead` 없이 불러 프로덕션 `session_epoch`이 언제나 `ts-fallback`(= 그
> write의 시각)이었다. 그러면 판정 ③이 사실상 "나중에 append한 쪽이 승리"가 되어
> **되살아난 오래된 세션이 늦게 쓰면 이긴다** — UI5가 요구한 방어가 그 지점에서
> 뒤집힌다. 이제 `journalApply`가 기본으로 실제 `session-ledger.readLedger`를
> 쓰고(세션당 per-process 메모 — 모든 hook이 지나는 hot path다) test만 주입한다.
> 회귀는 **프로덕션 형태**로 단언한다: 한 세션의 여러 `update()`가 같은
> `session_epoch`을 `epoch_source: 'ledger'`로 유지하는가.
| `work_unit` | 순서·tombstone의 키 (§3.1) |
| `seq` | `work_unit` 별 단조 정수, 1부터 |
| `kind` | `genesis` / `update` / `tombstone` / `checkpoint` / `reseed` |
| `patch` | `state-writer` patch (update 전용) |
| `prev_session_id` | **저널 tail**에서 파생 (§7) |
| `superseded_by` | 강등 표식 — 폐기가 아니다 |
| `checkpoint_of` | 스냅샷 + 접점 메타 (genesis/checkpoint/reseed) |
| `content_hash` | 자기 자신을 제외한 정규 직렬화의 sha256 |

### 3.1 `work_unit` 해석 순서

`patch.workUnit` → `patch.work_unit` → `patch.escalate_pending_decision_id` →
`frontmatter.escalate_pending_decision_id` → `patch.taskFingerprint` →
`frontmatter.task_fingerprint` → `'unknown'`.

**patch가 frontmatter보다 먼저다.** 초기 구현은 기존 상태만 읽어서, 작업 단위를
바꾸는 바로 그 변형이 *이전* 단위로 기록됐다(한 칸 밀림). decision slug가
fingerprint보다 우선하는 이유는 ledger tombstone이 `decision_id` 키이기 때문이다 —
두 네임스페이스가 만나는 유일한 지점이며, 만나지 못하는 축이 **잔여 1b**다.

### 3.2 무결성의 범위

write 측 장치는 `O_APPEND` **단일 버퍼 write** 하나이고, 그것이 주는 것은 *레코드
단위 원자성*(다른 writer의 레코드와 뒤섞이지 않음)이지 매체 무결성이 아니다.
섹터 손상·커널 버퍼 손상은 이 층에서 막을 수단이 없으며, 그래서 `content_hash`가
**read 측 그물**로 존재한다. 즉 구조는 "write에서 섞임을 막고, read에서 손상을
잡는다"이고 **둘 다 우발 축**이다.

프로토타입 오염(`__proto__`/`constructor`)은 별도 축이다: `JSON.parse`는
`__proto__`를 own 속성으로 만들고 그 객체를 `Object.assign`의 source로 쓰면
`[[Set]]`이 `Object.prototype` setter를 발동시킨다. allowlist 복사가 키를
**목록에서만** 가져오므로 그 경로가 구조적으로 닫히며, patch(중첩 객체)는
`sanitizePatch`가 오염 키를 직접 턴다. 저널 라인과 ledger 엔트리 양쪽에 회귀
fixture가 있다.

**검증은 read 경로에서 일어난다 — verify에서만이 아니다** (PR-Codex C2). 초기
구현은 스키마 모양만 맞으면 레코드를 전부 통과시키고 `content_hash`는
`journal verify`에서만 봤다. 그러면 손상·변조됐지만 파싱은 되는 레코드가
**투영을 구동한 뒤에야** 보고된다 — DD6.3이 약속한 격리가 비어 있었다. 이제
`readRecords`가 해시 불일치 레코드를 `corrupt[]`로 격리해 `project()`에 넘기지
않고, `journal verify`는 `records`를 재검하는 대신 그 격리 목록을 읽는다(걸러진
뒤의 목록을 재검하면 언제나 0건이 되어 검사가 무력해진다).

**checkpoint는 격리로 해소되지 않는다.** checkpoint는 투영의 base 그 자체라
버리면 STATE.md가 통째로 리셋된다. 그래서 해시 불일치 checkpoint는 **degraded
모드를 발동**시킨다(§5.1의 append 실패와 같은 처리). 부트스트랩도 손상
checkpoint를 *부재*로 착각해 새 genesis로 덮어쓰지 않는다 — 그것은 격리가 아니라
증거 인멸이다.

**patch는 절단하지 않는다** (PR-Codex C3). 초기 구현은 patch 내부 문자열을
8192자에서 자르고 라인이 16KiB를 넘으면 `patch`를 통째로 `null`로 바꿨다. enforce
모드에서 투영이 권위이므로 그 조합은 **`update()`가 성공을 반환하면서
`chain_progress`·`next_chunk` 같은 의미 있는 값을 잃는** 경로였다 — G1과 UI4를
동시에 위반한다. 이제 patch는 있는 그대로 실리고, 표현 불가능한 경우(중첩 8단계
초과, 라인 256KB 초과)는 **조용한 절단이 아니라 append 실패**가 되어 degraded로
강등된다. 그 구간에서 값을 보존하는 것은 STATE.md 직접 경로다. 식별자성 스칼라
필드(`session_id`·`work_unit`…)의 256자 상한은 유지된다 — 그쪽은 절단이 의미를
바꾸지 않는 키·진단 축이다.

---

## 4. 재생 방어 판정 (UI5·UI7 응답)

`order.js#decideAdmission` — 순수 함수, 부작용 0.

| 순서 | 조건 | 판정 |
|---|---|---|
| ① | 스키마/allowlist 위반 | `reject-malformed` (저널에도 들어가지 않음) |
| ② | `work_unit`에 tombstone 존재 ∧ `seq > tombstone.seq` | `admit-post-tombstone` |
| ③ | 같은 `seq`를 이미 다른 레코드가 점유 | `session_epoch` 큰 쪽 `admit`, 작은 쪽 `admit-superseded` (동률은 `session_id` 사전순) |
| ④ | `seq < highWater[work_unit]` (역행·지연) | `admit-superseded` |
| ⑤ | 그 외 | `admit` |

**②가 ③보다 먼저다** — tombstone은 epoch보다 강하다. 닫힌 작업은 더 새 세션이라도
되살리지 못한다. 회귀 test가 이 순서를 별도 케이스로 고정한다.

> **plan의 ③/④ 순서에서 벗어난 지점.** plan은 ③을 `seq ≤ highWater →
> admit-superseded`로, ④를 same-seq epoch 비교로 적었다. 그런데 `highWater`는
> 정의상 admit된 최대 seq이므로 동시 append로 같은 seq가 발급된 두 번째 레코드는
> `seq ≤ highWater`를 **항상** 만족한다 → ④가 도달 불가능한 죽은 규칙이 된다.
> plan이 ④에 대한 별도 회귀 단언을 요구하므로, 두 규칙이 모두 효력을 갖는 유일한
> 해석은 same-seq 충돌을 역행보다 먼저 보고 역행을 strict `<`로 두는 것이다.
> ②가 epoch보다 앞선다는 plan의 명시 계약은 그대로 보존된다.

**투영에 도달하는 enum은 `admit` 하나뿐이다.** `admit-superseded` ·
`admit-post-tombstone`은 저널에 남되 투영에서 제외되므로 STATE.md를 **바꾸지
않는다** — 재투영 결과가 이전과 같아 `contentHash` 비교에서 write가 skip되고,
지연 레코드는 파일 mtime조차 건드리지 못한다.

### 4.1 클론 내구성 (DD11)

저널은 working-tree 전용이라 클론·`git clean`으로 사라진다. 그 뒤 STATE.md만으로
genesis를 세우면 tombstone이 하나도 없는 저널이 생기고, 크래시 세션이 되살아나
append하면 **이미 닫힌 작업 단위가 admit된다**. 해법은 새 durable 저장소가 아니라
**이미 git-tracked인 것을 읽는 것**이다: 부트스트랩이
`.claude/state/completion-ledger/`를 스캔해 각 엔트리를 tombstone으로 seed한다.

- ledger 엔트리는 `seq`를 갖지 않으므로 seed된 tombstone의 sentinel seq는 `0`이다 —
  판정 ②가 `seq > 0`인 모든 후속 레코드를 `admit-post-tombstone`으로 만든다.
- ledger 부재/읽기 실패는 **loud warn + tombstone 0으로 진행**한다(클론이 곧
  파이프라인 정지가 되면 안 된다). 그 경우 G2는 저널 수명 안에서만 성립한다.
- 엔트리별 parse + `decision_id` 존재를 확인하고 실패분을 `seeded`/`corrupt` 두
  카운터로 나눈다. `corrupt > 0`이면 loud stderr + `journal verify` 비영점 exit —
  **손상된 ledger는 tombstone을 적게 seed하므로 부활 방어에 구멍이 생기는데, 그
  구멍이 조용하면 G2가 성립한다고 오독된다.**

> **이 카운터가 실제로 결함을 잡았다.** 최초 구현은 ledger 파일의 top-level
> `decision_id`를 읽었는데 실제 스키마는 `{schema_version, entry:{decision_id, …}}`
> 로 감싸여 있어 **32건 전부가 corrupt**로 계상됐다. 조용히 0건을 seed했다면 G2가
> 성립한다고 오독됐을 자리다. 수정 후 27개 distinct 작업 단위가 seed된다.

---

## 5. degraded 모드

### 5.1 abort 의미론

| 상황 | 저널 | STATE.md | 이후 |
|---|---|---|---|
| append 성공 · 투영 성공 | 레코드 1건 | 재투영 결과로 write (동일하면 `contentHash` skip) | 정상 |
| append 성공 · STATE.md write 실패 | 레코드 **잔존** | 미갱신 | 저널이 완전하므로 다음 `update()`의 재투영이 자동 수렴. 손실 없음 |
| **append 실패 ∧ 마커 성공** | 없음 | write **한다** | degraded 모드 진입 (sticky) |
| **append 실패 ∧ STATE.md 성공 ∧ 마커 실패** | 없음 | write **했다**(되돌리지 않는다) | `update()`가 **throw**. rollback은 *또 하나의 실패 가능한 write*이고 이미 fs가 흔들리는 구간에서 신뢰할 근거가 없다 |
| **checkpoint 해시 불일치** (C2) | 손대지 않음 | write **한다** | degraded 진입. base를 신뢰할 수 없으므로 투영 자체가 성립하지 않는다. 부트스트랩도 이 checkpoint를 덮어쓰지 않는다 |
| **patch 표현 불가**(중첩 초과·라인 상한 초과, C3) | 없음 | write **한다** | degraded 진입. 절단해서 성공을 반환하지 않는다 — 값은 STATE.md 직접 경로가 온전히 보존한다 |
| `reject-malformed` | append 안 함 | 미갱신 | caller에 `{ok:false}` + loud warn |

### 5.2 책임 2층

| 층 | 함수 | 계약 |
|---|---|---|
| I/O | `journal-store.js#writeDegradedMarker` | `{ok:true}` / `{ok:false, reason}`. **throw하지 않는다** |
| 판정 | `state-writer.js#applyLocked`의 degraded 분기 | `{ok:false}`를 받으면 loud stderr 후 **throw**. 이 한 곳이 유일한 throw 지점 |

**그 throw가 보증하는 것은 정확히 둘이다**: ① `update()`가 성공을 반환하지 않는다
② 다음 세션이 반드시 알아챈다(`journal verify`의 추론 축). "세션이 시끄럽게 죽는다"는
보증하지 **않는다** — hook을 죽이는 쪽을 고르면 저널 결함이 곧 파이프라인 정지가
되어 Risk 표의 항목이 실현된다. 즉 이 경로에서 없애는 것은 *침묵*이지 *실패* 자체가
아니다.

### 5.3 마커 검사 위치는 계약이다

마커 확인은 `applyLocked`가 **기존 advisory 락을 잡은 직후 가장 먼저** 수행하는
일이며, 그 뒤 투영/직접 경로 분기가 결정된다. 락 밖에서 보거나 분기 이후에 보면
두 프로세스가 서로 다른 모드로 같은 STATE.md를 쓰는 창이 열린다. 락 자체는 여전히
advisory이므로(잔여 4) 이 배치가 상호배제를 *만들지는* 않지만, **모드 판정과 쓰기가
같은 임계구역 안에 있다**는 것은 보장한다.

**락 fail-open 구간의 귀결을 정확히 적는다** (잔여 4 정밀화): 두 프로세스가 동시에
append하면 같은 `seq`가 발급될 수 있고, 판정 ③이 `session_epoch` 큰 쪽을 `admit`,
작은 쪽을 `admit-superseded`로 결정론적으로 해소한다. **강등된 쪽의 patch는 투영에
반영되지 않는다** — 레코드는 잔존하고 `journal query --include-superseded`로 질의
가능하지만 STATE.md에는 나타나지 않는다. 즉 락 fail-open 구간은 "손실 없음"이
아니라 **"손실이 기록으로 남음"** 이다.

### 5.4 마커는 기록이 아니라 차단이다

`.degraded`가 존재하는 동안 genesis 부트스트랩은 실행되지 않고 `EX_TEMPFAIL`(75)로
멈춘다. 복구는 `journal checkpoint --reseed` 명시 호출이며, 즉 복구가 *권장*이 아니라
*경로상 필수*다. 단 이 거부는 **저널 경로에만** 적용된다 — STATE.md 직접 경로는 계속
동작하므로 세션이 막히지 않는다. 막히는 것은 "저널을 SoT로 삼는 것"이고, 그것이
정확히 신뢰할 수 없는 상태다.

**stickiness의 근거는 디스크 마커이지 in-memory 플래그가 아니다.** 실제로 degraded
구간을 가로지르는 것은 세션(=프로세스)이므로, 회귀 test가 `execFileSync`로 자식
node를 띄워 그 프로세스도 직접 경로를 타고 저널에 append하지 않음을 단언한다 —
모듈 스코프 캐시로 구현하면 이 단언이 실패한다.

### 5.5 reseed는 자기 자신을 기록한다

`--reseed`는 이력을 지우면서 자기 자신은 기록하지 않는 상태였다. 새 genesis는
`checkpoint_of.reseed_of`에 직전 checkpoint id·접점·폐기 레코드 수·degraded 진입
시각·사유를 봉인하고, 폐기된 활성 세그먼트는 unlink가 아니라 `segments/`로
**회전**한다. 인가 게이트를 만들지는 않는다 — 저장소 write 권한자는 저널 파일을
직접 지울 수 있으므로 CLI 게이트가 막지 못한다(단일 운영자 위협 모델). 보증하는
것은 **파괴가 이력에 남는다**이지 **파괴를 막는다**가 아니다.

---

## 6. 보존 정책 (UI6 응답 — 이번 milestone에서 확정)

상한은 **상수**이며 토글이 아니다(UI11 — 신규 토글은 정확히 1개). test 주입만
허용한다.

| 축 | 값 | 근거 |
|---|---|---|
| 활성 세그먼트 바이트 | 256 KB | 투영은 checkpoint 이후 레코드만 재생하므로 이 값이 곧 hot path 재생 비용의 상한이다. `msw-events`의 per-file cap과 같은 값을 쓴다 |
| 저널 전체 바이트 | 64 MB | 초과해도 **삭제하지 않고** loud warn한다 — 조용한 증발이 M5가 없애려는 것이다 |
| 보존 일수 | 90일 | 용량과 무관한 시간 축. 활성 세그먼트에 이보다 오래된 레코드가 있으면 압축한다 |

**`evictLRU` 방식의 무조건 unlink는 쓰지 않는다.** `msw-events.js:104-111`은 global
cap 초과 시 오래된 파일의 20%를 지우는데, 그것이 바로 PRD가 M5로 없애려는 "되돌릴
수 없는 압축"이다. 여기서는 checkpoint를 무손실 접점으로 남기고 세그먼트를 **회전**만
한다 — 삭제 경로가 없다.

### 6.1 압축은 순서 메타를 함께 봉인한다 (PR-Codex R2 D1)

checkpoint는 상태만이 아니라 **`order_index`**(work_unit별 high-water + 경계 seq의
점유자 + tombstone)를 함께 싣는다. 이것이 없으면 압축이 활성 세그먼트를 회전시킨
직후 admission 인덱스가 **빈 상태로 시작**하고, 압축 이전 시점의 stale writer가 옛
`(work_unit, seq)`를 append하면 high-water도 tombstone도 없어 그대로 `admit`된다 —
**G2가 압축 한 번에 무력해진다.** 회귀가 압축 전후 *상태*만 대조하고 *순서 메타*는
대조하지 않아 이 구멍이 통과했다.

경계 seq의 점유자까지 싣는 이유: 그것이 없으면 `seq === highWater`인 지연 레코드가
규칙 ③(충돌)에도 ④(역행, strict `<`)에도 걸리지 않고 admit된다. 반대로 전체
occupants를 실을 필요는 없다 — 경계보다 낮은 seq는 ④가 이미 잡는다.

### 6.2 보존 정책은 write 경로에서 발화한다 (PR-Codex R2 D2)

`enforceLimits`는 정의와 export만 있고 **호출부가 0개**였다 — 상한 3종이 정상
사용에서 한 번도 발화하지 않았고, "활성 세그먼트 상한이 곧 재생 비용의 상한"이라는
주장이 근거를 잃었다(세그먼트가 무한히 자란다). 이제 `journalApply`가 append 성공
직후 호출하며, 호출자가 이미 읽은 레코드를 재사용해 hot path에서 저널을 두 번 읽지
않는다. **압축 실패는 강등이 아니다** — append는 성공했고 저널은 온전하며 압축이
미뤄질 뿐이므로 loud warn만 한다.

### 6.3 압축 순서 불변식

① checkpoint를 tmp→rename으로 착지 → ② rename이 성공한 **이후에만** 활성 세그먼트를
`segments/`로 이동. ①과 ② 사이에서 크래시해도 활성 세그먼트가 그대로 남아 투영이
`checkpoint + 같은 레코드 재적용`이 되는데, `mergeState`는 섹션을 통째로 교체하므로
같은 patch를 다시 접어도 결과가 같다 — **tail 유실 없이 수렴한다.** 회귀 test가 이
크래시 지점을 재현한다.

---

## 7. A4 경계 파생 (G5)

기존 `computeA4`의 결함은 producer 부재가 아니라 **계산 오염**이었다: 스캐너가 현재
세션 자신의 sidecar까지 교차해 first session이 자기 handoff를 "복원됨"으로
self-credit → 경계를 하나도 건너지 않은 가짜 100%.

M5의 분자는 저널의 `prev_session_id` 경계에서 파생한다. **self-credit은 구조적으로
불가능하다** — 경계는 `prev !== cur`일 때만 성립하므로 자기 자신과의 교차가 분자에
들어갈 경로가 없다.

- `prev_session_id`는 ledger가 아니라 **저널 tail**에서 뽑는다. ledger의 "시간상
  직전"은 다른 worktree에서 동시에 돈 세션일 수 있고, A4가 물어야 하는 것은 *이
  저장소의 상태를 실제로 이어받은* 세션이다. 저널의 직전 레코드는 정의상 이 저장소
  상태를 마지막으로 만진 세션이므로 경계가 정확하다. 부수 효과로 A4가 ledger
  가용성에 의존하지 않는다.
- **genesis 경계는 분모에서 제외한다.** 그 레코드의 `prev_session_id`는 `null`이고,
  이를 경계로 세면 "이전 세션이 없는데 복원율을 계산"하게 된다. 클론 직후 A4가
  `computed 0%`가 아니라 `insufficient`로 돌아가는 것은 결함이 아니라 정직한 표기다.
- **`session_id === 'unknown'`은 경계에서 제외한다.** hook 밖(수동 CLI 등) 호출에서
  실제로 세션 id가 없을 수 있고, `'unknown'` 둘을 서로 다른 세션으로 세면
  self-credit이 뒷문으로 돌아온다. 기록은 하되 계상하지 않는다.
- `status==='computed'`이면 분모 ≥ 1이다. 분모 0에 `computed`를 붙이면 0/0을
  "측정됐다"로 보고하게 된다.

### 7.1 CL-5 4번째 재발

A4 분모(handoff 열거)가 여전히 cwd 상대면 저널 파생 분자와 짝이 맞지 않는다. 수정
대상 3곳:

| # | 위치 | 수정 |
|---|---|---|
| 1 | `session-end.js` | `enumerateUnfinishedItems(process.cwd())` → `resolveHandoffRoot(...)`의 `root` |
| 2 | `session-end.js` | `writeHandoffItems(sid, unfinished)` → `{stateDir}` 명시 전달 |
| 3 | `session-start.js` | `restoreAndMatch(sid)` → `{stateDir, cwd}` 명시 전달 |

**열거와 기록 양쪽을 고쳐야 한다** — 열거가 먼저 실행되므로 write만 고치면 *틀린
위치에서 읽은 내용*을 옳은 위치에 쓰게 되어, 아티팩트는 생기는데 내용이 비거나 교차
오염된다. G5가 "산출됨"으로 보이면서 값이 거짓이 되는 최악의 형태다.

`ctx.projectRoot`를 그대로 쓰지 않는 이유: `observer-sessions.js:99`가 global
컨텍스트에서 `projectRoot: ''`를 반환하고, 그러면 `path.join('', …)`이 cwd 상대로
접혀 고치려던 CL-5가 그대로 남는다(M3·M4 수정에도 잠재한 구멍). `resolveHandoffRoot`는
`projectRoot` → `discoverRepoRoot` walk-up → **loud warn + skip** 순으로 해석한다.

skip이 조용하면 CL-5 우회와 구별되지 않으므로 **셀 수 있게** 만든다: `.claude/state/
.handoff-root-unresolved` 마커 + `handoff_root_unresolved` msw-event **2채널**. 두
채널은 서로의 백업이고, ship 판정은 여기에 `session_end` 이벤트를 더해 **3-state**로
읽는다(마커/이벤트 존재 = CL-5 미해소 · 셋 다 부재 = producer 미실행 · `session_end`만
있음 = **판정 불가**). 세 번째가 핵심이다 — `session_end`는 hook이 실제로 돌았다는
독립 증거이므로, 그것이 있는데 아티팩트가 0건이면 "producer 미실행"은 거짓이다.

---

## 8. M3/M5 경계 (UI7 응답 — 확정)

| 축 | 소유 | 근거 |
|---|---|---|
| 점유(동시성) — `claim_epoch` UUID · TTL 15분 · 5분기 fence | **M3** | `evidence-claim.js`. M5는 재작성하지 않는다 |
| 순서 — 전역 단조 순번 · 파생 상태 재생 순서 · 이력 보존 · TTL 만료 이후의 무기한 replay 방어 | **M5** | `evidence-conflict-design.md` §8이 M5에 명시 배정 |

M3 §8이 못박은 대로 `claim_epoch`은 M5 모델의 **대체물이 아니라 최소 선행 조건**이다.
M5의 순번은 claim epoch **위에** 얹는 것이지 대체가 아니며, 세션 epoch은 새로 발명하지
않고 `session-ledger.created_at`에서 파생한다(UUID인 `claim_epoch`은 순서를 갖지 않아
"누가 먼저인가"를 답할 수 없다).

**TTL 만료 이후에도 방어가 성립한다**: epoch 비교는 시간 상한이 없다. 점유 TTL 15분이
만료돼도 순서 축 방어는 그대로이며, 회귀 test가 TTL 경과 후 동일 판정을 단언한다.

---

## 9. 토글 (UI11 — 정확히 1개)

`MCCP_STATE_JOURNAL=enforce|shadow|off`. 값의 의미와 운영 계약 5행은
[ENVIRONMENT.md §11](../ENVIRONMENT.md)이 canonical이다. 요지: **수동 전용** ·
**프로세스 수명** · **마커 > 토글** · `shadow`는 쓰기 경로만 되돌린다.

---

## 10. Ship 시점 실측 (G5 전환)

> 이 절은 배포(`claude plugin update`) + 새 세션 1회 이후에만 채울 수 있다.
> 채워지지 않은 상태로 ship하면 §G5 조건성의 **미달 처리**가 적용된다:
> `computed` 주장 금지 · `measurement-instrumentation.md` A4 행 `forward-only` 유지 ·
> PRD M5 status를 순정 `complete`로 적지 않음(non-canonical 문자열 → §3.11 C4
> 기준상 `/mccp:archive-complete`가 보수적으로 아카이브를 거부하며, **그 거부가
> 의도된 표식**이다).

| 항목 | 결과 |
|---|---|
| `plugin.json` 버전이 설치 캐시에 존재 | **미확인** — 이 사이클에서 `claude plugin update` 미수행 |
| `*.handoff-items.json` ≥ 1건 | **미확인** |
| A4 status `computed` | **미확인** |

**판정: G5는 분자 배송까지 충족, 전환은 미확인.** 위 셋은 plan 실행 밖의 3단계
(bump → `claude plugin update` → 새 세션 부팅)를 요구하며, 코드가 아무리 옳아도
런타임 hook은 플러그인 캐시에서 로드되므로 착지 직후에는 아직 아티팩트가 0건이다.
