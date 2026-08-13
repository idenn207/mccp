# 증거 충돌 소거 설계 (multi-session-work-loop M3)

> 대상 코드: `plugins/mccp/scripts/receipt/evidence-lock.js` · `plugins/mccp/scripts/state/evidence-claim.js` ·
> `plugins/mccp/scripts/receipt/store.js` · `plugins/mccp/scripts/lib/msw-metrics/b2-coverage-gate.js`
>
> 상위 plan: `.claude/plans/multi-session-work-loop-m3.plan.md` (보증 표 G1~G3가 **단일 기준**)
> 게이트 기록: `.claude/notes/multi-session-work-loop-m3.md` (Implement-Codex R1)

## 1. 무엇을 보증하는가 (그리고 무엇을 보증하지 않는가)

M3이 보증하는 것은 정확히 셋이며, 이 문서 어디에서도 이보다 강한 표현을 쓰지 않는다.

| # | 보증 | 메커니즘 |
|---|---|---|
| G1 | live 세션 간 동일 작업 단위 중복 점유 불가 | claim 레지스트리 + 암묵 claim-on-first-write |
| G2 | stale·부활 holder의 write-time 거부 | `{session_id, host, session_pid}` 3원소 대조 + 승계 시 tombstone (TTL 창 안) |
| G3 | 모든 덮어쓰기는 **보고되거나 감사에서 검출된다** | post-rename 소유 재확인 → `evidence_overwrite_observed` + fail-closed throw · 보고가 실패해도 B2 런타임 감사가 독립 검출 |

명시된 잔여 2건 — (a) 덮인 writer가 이미 성공을 반환했을 수 있음, (b) tombstone TTL 만료 후 replay fence lapse — 는 전역 단조 순번 없이 닫히지 않으며 **M5** 소관이다. `claim_epoch`는 M5 모델의 대체물이 **아니라** 그 축의 최소 선행 조건이다.

무조건적 상호배제는 파일시스템 원자 CAS 또는 단일 writer 프로세스를 요구한다. `rename`은 advisory lock에 대해 CAS가 아니므로, 확인과 rename 사이의 창은 원리상 닫히지 않는다. 그래서 보증이 "무손실"이 아니라 "무-무성(無silent)손실"이다.

### 1.1 위협 모델 (범위 밖을 명시한다)

이 설계가 겨냥하는 것은 **우발적 미계측 writer**다 — 신규 직접 write 유입, 셸 스크립트, 생성 코드, 잊힌 경로. 겨냥하지 **않는** 것은 **repo write 권한을 가진 적대적 위조자**다. 후자는 감사 코드 자체를 고칠 수 있으므로 in-repo gate로 원리상 방어 불가이며, PRD의 단일 운영자 신뢰경계 전제상 범위 밖이다. gate가 막지 못하는 것을 막는다고 주장하지 않는다.

이 전제의 직접적 귀결: lock body의 token은 **평문**이고(`pr-phase.lock`의 sha256 + stdin-pipe sealed channel 모델을 쓰지 않는다) 보호는 `0o600` 파일 모드다. sealed channel의 정당화는 "외부 reader가 lock을 읽어 token을 위조"하는 것을 막는 데 있는데, 그 공격자는 이미 위협 모델 밖이다. 또한 evidence lock은 단일 프로세스가 획득·해제를 한 호출 안에서 끝내므로 helper IPC가 존재하지 않아 sealed channel을 걸 지점 자체가 없다.

## 2. 점유 모델 (claim)

### 2.1 키와 수명

- **키 = decision slug.** PRD의 작업 단위 freeze(milestone = plan = PR = slug)를 그대로 따른다.
- **경로 = `.claude/state/evidence-claims/<slug>.json`.** 디렉토리째 gitignored — claim은 live 세션의 `{session_id, host, session_pid}`에 묶이므로 커밋되면 모든 clone에서 죽은 holder가 부활해 정당한 writer를 거부한다.
- **live 판정 = 자기완결 `last_touch` TTL** (`MCCP_EVIDENCE_CLAIM_TTL`, default 15분). holder가 write할 때마다 갱신한다.

`session-ledger.js`의 `listLedgers({activeOnly:true})`는 **쓰지 않는다.** 그 축은 이 아키텍처에서 무효다 — `session-start.js`가 `createLedger`에 pid를 넘기지 않아 기록되는 pid가 SessionStart **hook 프로세스**의 것이고, `updateLedgerHeartbeat`가 pid를 갱신하지 않으며, `listLedgers`의 same-host 분기는 그 pid의 생존을 요구한다. hook은 수 초 내 종료하므로 단일 머신에서 `activeOnly`는 사실상 공집합이다. 이 상류 결함의 구체적 수정안(`pid: Number(process.env.CLAUDE_PID)` 전달)은 backlog 소관이며 M3 범위 밖이다.

### 2.2 holder 정체 — 왜 `process.pid`가 아닌가

`receipt/cli.js`는 **write마다 새 node 프로세스**다. `process.pid`를 정체에 넣으면 같은 세션의 두 번째 write가 "다른 holder"로 거부된다 — 공격 경로가 아니라 **정상 경로가 깨진다**. 따라서 정체는 `{session_id, host, session_pid}`이고 각각:

| 축 | 소스 | 안정성 |
|---|---|---|
| `session_id` | `MCCP_SESSION_ID \|\| CLAUDE_CODE_SESSION_ID \|\| CLAUDE_SESSION_ID` (`orchestration-runaway.js#resolveSessionKey` 선례 재사용) | 세션 내 고정 |
| `host` | `os.hostname()` | 머신 고정 |
| `session_pid` | `CLAUDE_PID` — Claude **세션** 프로세스의 pid (CLI 프로세스가 아님) | 세션 내 고정 · `process.kill(pid,0)`으로 진짜 생존 판정 가능 |

**강등 경로(가정에 기대지 않는다).** `CLAUDE_PID`가 부재하거나 `kill(pid,0)`이 실패하면 정체에서 그 축을 빼고 `{session_id, host}`로 강등하며 liveness는 `last_touch` TTL 단독으로 판정한다(+ loud 기록). env가 사라져도 fence가 붕괴하지 않고 판별력만 낮아진다. `session_id`가 아예 없으면 claim을 **생성하지 않고 fence도 걸지 않는다**(`claim_skipped_no_identity` + loud warn) — 무명 프로세스에 nonce를 주면 자기 자신의 다음 write와도 불일치하고, host만 쓰면 전부 하나로 붕괴한다. 이때도 evidence lock·post-rename 검증·B2 감사는 그대로이므로 **G3는 유지되고 해당 write에 대해서만 G1·G2가 비활성**이다.

### 2.3 claim mutation은 전부 per-slug lock 안에서 (Implement-Codex F2)

**초안의 결함**: 이전 설계는 `acquireClaim`의 `O_EXCL`이 원자성을 준다고 적었는데, `O_EXCL`이 증명하는 것은 **생성**의 원자성뿐이다. 파일이 존재한 뒤의 stale 승계·`last_touch` 갱신·tombstone 기록은 전부 **slug 단위 mutation**인데, evidence lock의 키는 `(gate, slug)`다(경로에 `gate_id`가 들어간다). 그래서 세션 A가 `mccp-plan-codex/x`를, 세션 B가 `mccp-implement-codex/x`를 쓰면 **서로 다른 lock**을 들고 **같은 stale claim을 둘 다 관측·승계**해 둘 다 slug `x`의 소유자라 믿는다. receipt write가 fence에 닿기도 전에 G1·G2가 깨진다.

**해소**: claim 파일에 대한 **모든** 읽기-수정-쓰기를 전용 per-slug lock(`<slug>.json.lock`)으로 감싼다. 생성만이 아니다. 이 lock은 evidence lock과 같은 primitive(`withEvidenceLock`)를 쓰되 키가 다르므로, 게이트가 달라도 같은 slug면 반드시 직렬화된다.

### 2.4 tombstone은 승계 시점에 쓴다

G2의 전제 시나리오는 "A가 죽어서 release를 못 한 경우"다. 죽은 세션은 정의상 `releaseClaim`을 호출하지 못하므로, 자발적 release에서만 tombstone을 쓰면 **G2가 겨냥하는 바로 그 시나리오에서 tombstone이 존재하지 않는다**. 따라서 **승계자가 쓴다** — B가 stale claim을 승계할 때 이전 holder의 `{session_id, host, session_pid, claim_epoch}`를 같은 레코드의 `superseded` 항목으로 보존한다(별도 파일이 아니라 같은 파일이어야 원자성이 유지된다). 부활한 A는 "레코드 있음 + 내 epoch이 superseded 목록에 있음" → **거부**.

자발적 `releaseClaim`은 여전히 제공하되 **정확성의 전제가 아니라 최적화**(즉시 승계 허용)로 격하한다. 호출 누락이 정확성을 깨지 않는 것이 이 설계의 요점이다.

`superseded` 목록은 bounded(최근 8건)이고 TTL 경과분은 GC된다. **TTL 만료 후 fence는 lapse한다** — 부활 holder가 다시 통과한다. 숨기지 않고 known-gap test로 고정해 동작이 조용히 바뀌면 잡히게 한다. 무기한 replay 방어는 전역 단조 순번을 요구하므로 M5다.

### 2.5 fence 발화 조건 — 5분기

`writeReceipt`가 claim 레코드를 **스스로 읽고** 실행 세션 정체와 대조한다. 호출자가 epoch을 "제시"하지 않는다 — LLM이 flag로 나르는 방식은 command body 누락에 취약하고 게이트 신뢰 금지 원칙에 어긋난다. 그래서 **CLI 인자 변경이 0**이고 `/mccp:receipt-write` 같은 bare CLI ingress에도 자동 적용된다.

| claim 레코드 | 호출자 = holder? | 동작 |
|---|---|---|
| 부재 | — | **암묵 claim 생성 후 통과** (§2.6) |
| live holder | 예 | 통과 + 파일의 현재 epoch을 guard 이벤트에 기록 |
| live holder | 아니오 | **거부** + `evidence_conflict_prevented` |
| tombstone | 예(단 epoch 불일치) | **거부** — 부활 holder |
| tombstone | 아니오 | 통과 (승계자의 정상 write) |

epoch은 호출자가 만들지 않고 파일에서 읽으므로 위조 지점이 없다. fence의 신뢰 근거는 "호출자가 제시한 토큰"이 아니라 "파일에 기록된 holder 정체 ↔ 실행 중 세션 정체"의 대조다.

### 2.6 암묵 claim-on-first-write

"레코드 부재 → 통과"만 두면 claim을 획득하지 않는 5개 standalone ingress(`plan`·`prp-implement`·`pr`·`code-review`·`receipt-write`)끼리 같은 slug를 순차로 덮어쓸 수 있다. 그러면 중복 방지가 "claim을 만든 흐름에만" 성립한다.

해소: `writeReceipt`가 fence 판정 **이전에**, 레코드가 없으면 실행 세션을 holder로 하는 claim을 암묵 생성한다. "부재" 분기는 **최초 write 1회로 소멸**하고, 이후 다른 live 세션의 write는 "다른 live holder → 거부"로 떨어진다. 진짜 동시 진입(둘 다 부재를 관측)의 원자성은 §2.3의 per-slug claim lock이 보장한다. standalone 단일 세션은 자기 자신이 holder가 될 뿐이라 동작이 바뀌지 않는다(멱등 재진입).

### 2.7 advisory ↔ enforce 경계

- **advisory** — `session-start.js`의 `<system-reminder>` 통보, `work.md` Step 0 조기 확인. 차단하지 않는다.
- **enforce** — write-side fencing **뿐**. 실제 충돌 시점에만 막는다.

조기 경고를 무시하고 진행해도 안전하다. 중복 점유는 write 시점에 기계적으로 거부된다. 이 구분을 명시하지 않으면 "여기서 안 막혔으니 안전하다"로 오독된다.

## 3. 임계구역 (evidence lock)

### 3.1 fail-closed 선택 근거

`session-ledger.js#withLedgerLock`을 **메커니즘은 미러하되 실패 정책은 반전**한다. 그쪽은 lock 획득 실패 시 경고만 남기고 lock 없이 진행한다(last-writer-wins) — 그 동작이 PRD가 구조적 취약으로 지목한 것 자체다. evidence lock은 획득 실패 시 **throw**한다.

에러(`EVIDENCE_LOCK_UNAVAILABLE`)는 lock 절대경로 · 잔여 lease · 재시도 지침 · kill switch(`MCCP_EVIDENCE_CONFLICT_GUARD=warn`)를 반드시 포함한다. 조용한 실패도, 진단 불가한 실패도 금지다.

### 3.2 caller별 실패 정책은 의도적 비대칭이다

| caller | 정책 | 근거 |
|---|---|---|
| `store.js#writeReceipt` | **fail-closed** (throw) | 증거는 선택 사항이 아니다. `write.js:451`의 `writeReceipt` 호출은 fail-open 에필로그 3종(escalate · briefing · completion-ledger)보다 **앞**이므로 throw가 게이트를 정직히 중단시킨다 |
| `briefing/index.js` 메타 stamp | fail-open + **loud skip** | `receipt_hash` carve-out 필드만 바꾼다 — 봉인 증거를 못 바꾸므로 lock 미획득으로 게이트를 중단시키는 것이 손실보다 크다 |
| `completion-ledger/index.js` skip 진단 stamp | fail-open + **loud skip** | 위와 동일 (carve-out `ledger_write_skipped`) |

이 비대칭은 우발이 아니라 **하나의 경계**에서 나온다: 봉인 내용(hash에 들어감) vs carved 메타(hash에서 제외됨). §6의 커버리지 주장 범위 축소도 같은 경계에서 나온다. skip은 반드시 loud stderr + 이유 기록 — 조용한 누락은 금지다.

### 3.3 lease 정책 — `pr-phase-lock` tri-state를 의도적으로 차용하지 않는다

`pr-phase-lock.js`의 "same-host + pid alive → 절대 reclaim 안 함"은 그 lock이 **Codex review 전체(분 단위)**를 감싸기 때문에 정당하다 — live holder는 정상 작업 중일 가능성이 높다.

evidence lock의 임계구역은 **파일 IO ms 단위**다. 그러므로 live holder가 lease를 넘겨 보유한다는 것은 *작업 중*이 아니라 **고장**이다(임계구역 내 crash · 중단된 턴 · PID 재사용 · 긴 FS hold). tri-state를 그대로 두고 fail-closed와 결합하면 해당 receipt가 **영구 차단**되는 stall class가 생긴다.

따라서:

- **짧은 lease(default 5s)는 PID liveness와 무관하게 항상 적용**된다.
- PID liveness는 reclaim을 *막는* 조건이 아니라 lease 이전에도 즉시 reclaim하게 하는 **추가 trigger**로만 쓴다(dead PID → 즉시 reclaim).
- host 상이 → 즉시 reclaim.

### 3.4 lease를 열었으니 fencing이 반드시 따라온다

lease를 liveness-무관으로 만든 순간 새 구멍이 열린다: holder가 **정말로 쓰는 중**인데 AV 스캔·네트워크 드라이브·Windows 핸들 경합으로 5s를 넘기면, 다른 프로세스가 reclaim해 임계구역에 **writer 2명**이 생긴다. 원자 tmp+rename은 torn file만 막고 lost update는 못 막는다.

그래서 write는 두 단계 방어를 **반드시** 통과한다:

1. **base-hash 선조건** — 임계구역 진입 시 읽은 disk hash를 기억하고, rename 직전 disk가 그대로인지 재확인. 다르면 write를 **거부**하고 `evidence_overwrite_observed` 기록.
2. **rename 직전 lock 소유 재확인** — 우리 token이 아직 lock body에 있는지 검사, 아니면 abort.

잔여 창은 `rename` 시스콜 자체로 축소된다. `evidence_overwrite_observed` 검출은 별개 기능이 아니라 **이 fencing의 관측 면**이다.

### 3.5 heartbeat는 rename retry 루프 안에도 있어야 한다 (Implement-Codex F5)

**초안의 결함**: heartbeat를 "진입 직후"와 "rename 직전" 2점에만 두었는데, `writeFileAtomic`은 Windows `EPERM`/`EACCES`/`EBUSY`에 대해 bounded rename retry를 돈다. A가 pre-rename heartbeat를 찍은 뒤 retry 루프에서 lease를 초과하면, B가 reclaim해 commit하고 A가 뒤늦게 성공해 B를 덮는다 — heartbeat가 좁히려던 바로 그 창이다.

**해소**: (a) retry 루프에서 **매 재시도 전에 heartbeat + 소유 재확인**을 수행하고, (b) **총 retry 예산을 lease보다 마진을 두고 하한**한다. 소유를 잃은 것이 확인되면 재시도하지 않고 즉시 abort한다.

### 3.6 post-rename 검증과 ENOENT

rename 후 파일을 다시 읽어 우리가 쓴 내용의 hash와 대조한다. 불일치 = 경쟁에서 졌다는 확정 관측 → `evidence_overwrite_observed` + throw.

**ENOENT는 통과가 아니다.** rename 직후 대상이 사라졌다면 누군가 교체·삭제한 것이므로 손상 검출과 같은 등급으로 다루어 `evidence_overwrite_observed`로 기록한다. "읽을 수 없음"을 "문제 없음"으로 해석하는 경로를 남기지 않는다.

### 3.7 G3가 writer 생존에 의존하지 않는 이유

post-rename 검증은 *내가 덮인* 경우를 잡는다. 그러나 위험한 순서는 **B가 commit·검증까지 마치고 성공을 반환한 뒤, lease를 잃었던 A의 지연 rename이 B를 덮는 것**이다. 이미 반환한 B는 다시 확인하지 않으므로 **B 관점에서는 조용한 손실**이다. 여기에 더해 A가 rename 직후 검증 **전에** 죽으면 아무도 보고하지 않는다.

그래서 G3의 문구는 "덮어쓴 쪽이 **반드시** 보고한다"가 아니라 **"보고되거나 감사에서 검출된다"**이다. B2 런타임 변형 감사가 **write 프로세스와 다른 시점·다른 프로세스**에서 도는 crash-proof 사후 관찰자로서 같은 사건을 독립 검출한다(guard 이벤트의 `pre_hash`가 관측된 사전 상태와 어긋나거나, guard 이벤트 자체가 없는 hash 변경으로 드러난다).

덮인 쪽의 늦은 인지는 **남는 잔여**이며 숨기지 않는다.

### 3.8 재진입 금지

같은 target에 대한 중첩 획득은 즉시 throw한다(프로세스-로컬 held-path Set). `writeReceipt` → briefing → completion-ledger는 순차 호출이며 각각 독립적으로 acquire/release한다 — 이들을 감싸는 바깥 lock은 없다.

## 4. 파일명 규약 (gitignore glob과의 결합)

`.gitignore`는 `.claude/receipts/*`를 무시하되 `mccp-pr-codex/`를 negate하고, 그 안에서 `*.lock`/`*.tmp`만 다시 무시한다. 따라서:

- lock 파일은 **반드시 `.lock`으로 끝난다** → `<target>.lock`
- tmp 파일은 **반드시 `.tmp`로 끝난다** → `<target>.<pid>.<rand>.tmp`

`.tmp-<pid>` 같은 이름은 glob에 걸리지 않아 git-tracked ship receipt 디렉토리를 오염시킨다. tmp 이름이 고정(`target + '.tmp'`)이면 동시 writer가 tmp에서 충돌하므로 pid + random nonce를 넣는다(`context-state.js` 패턴).

`.claude/state/evidence-claims/`는 디렉토리째 무시되므로 그 안의 lock/tmp는 자동으로 덮인다.

## 5. 충돌 taxonomy

| kind | 언제 | B2 계상 |
|---|---|---|
| `evidence_guard_active` | guard가 감싼 write **마다** (충돌 유무 무관) | 분자·분모 **아님**. producer-present 신호 + 런타임 감사 대조 대상 |
| `evidence_conflict_prevented` | 변형이 **착지하기 전에** 막힘 — claim fence 거부, 또는 enforce에서 rename 전 검출 | 분자 **미계상** (예방은 사고가 아니다) · 병기만 |
| `evidence_overwrite_observed` | 방어를 뚫고 덮인 실사고 (목표 0) | **분자** |

`prevented`를 분자에 넣으면 **방어가 잘 될수록 지표가 나빠지는** 역인센티브가 생긴다.

**kind는 시점이 정한다, 형태가 아니다.** `conflict_kind`는 무슨 일이 있었는지를 말하고, 그것이 사고인지 예방인지는 변형이 착지했는지가 정한다:

| 검출 시점 | enforce | warn |
|---|---|---|
| claim fence (write 이전) | `prevented` — write 거부됨 | `prevented` — **라벨 유지, 실제로는 진행**(아래) |
| rename **전** (`base-hash-changed` · `lock-lost-before-rename`) | `prevented` — write 거부됨 | `overwrite_observed` — 막지 않으므로 실제로 덮는다 |
| rename **후** (`vanished-after-rename` · `content-differs-after-rename` · `wrote-without-ownership`) | `overwrite_observed` | `overwrite_observed` |

rename 후 검출에서 throw는 사후 알림일 뿐 변형을 되돌리지 않으므로, 모드와 무관하게 사고다.

warn 모드의 claim fence는 `prevented`로 남는데 실제로는 막지 않으므로 그 라벨이 정확하지 않다 — **알려진 부정확**이다. 그대로 두는 이유는 영향 범위가 병기 카운터(`conflict_prevented_count`)에 한정되고 B2 **분자에는 들어가지 않기** 때문이다. 그 write가 정말로 무언가를 덮었다면 바로 뒤 base-hash 재검이 `overwrite_observed`로 별도 계상한다. warn은 명시적 kill switch이고 이 카운터는 advisory이므로, 상태를 하나 더 만드는 것보다 과대계상을 문서화하는 편이 낫다고 판단했다.

claim 거부는 **별도 kind가 아니라** `evidence_conflict_prevented` + `conflict_kind ∈ {other-live-holder, resurrected-holder, claim-denied}`로 나간다. reader는 그 discriminator로 `claim_denied_count`를 파생한다 — 전용 kind를 두면 producer가 그것을 emit하지 않는 한 영원히 0인 dead read가 된다.

분모는 `concurrent_pairs`(동시 활동 쌍). 분모 0이면 `insufficient` — 비율을 만들 수 없다. `invalid`가 **아니다**: 이 코드베이스에서 `invalid`는 데이터가 서로 모순된다는 뜻(unit spike · timestamp inversion · type separation violated)이고, "아직 겹친 세션이 없다"는 모순이 아니라 부재다. `invalid`로 두면 1인 세션 저장소가 대시보드 최우선 버킷에 상시 무결성 위반으로 뜬다.

### 5.1 이벤트 필드와 emit 시점

allowlist에 `work_unit` · `conflict_kind` · `holder_session` · `pre_hash` · `post_hash` · `claim_epoch` · `event_id`를 추가한다. `eventToJsonLine`은 allowlist에 없는 키를 **조용히 버리므로**, 필드 추가 없이 emit하면 디스크에 남지 않고 감사가 대조할 값을 영영 못 찾는다.

guard 이벤트는 lock 해제 **후** append한다(임계구역을 파일 IO 최소로 유지). 단 fail-closed 거부 경로는 throw **전에** emit한다. 이 선택의 귀결: rename과 emit 사이에 crash하면 guard 이벤트 없는 hash 변경이 남아 런타임 감사가 이를 미커버 변형으로 보고한다 — **보수적 방향의 오탐**이며, 반대 방향(사고를 놓침)보다 안전하다.

### 5.2 writer↔reader 경로 일치 (CL-5)

`msw-events.js`의 기본 경로가 **cwd 상대**인데 reader(`session-activity.js`)는 **repoRoot 고정**이다. 두 caller(`session-start.js`, `session-end.js`) 모두 `opts.dir`을 넘기지 않으므로 실제 기록 위치가 hook 프로세스의 `process.cwd()`에 종속된다. 결과는 (a) 이벤트가 reader가 보지 않는 곳에 쌓여 조용히 0건이 되거나, (b) worktree가 여럿일 때 **교차 오염**된다. 이 저장소에 지금 worktree 3개가 동시에 살아 있으므로 (b)는 가설이 아니다.

M3은 `appendEvent`가 **명시 repoRoot에서 경로를 해석**하게 하고 두 caller가 repoRoot를 전달하게 한다. B2의 분모와 guard 커버리지가 전부 이 sidecar 위에 얹히므로 헤드라인 acceptance가 여기에 직접 달려 있다.

**back-compat 이중 스캔의 dedupe 키 (Implement-Codex F6).** reader가 구·신 두 위치를 모두 스캔하되 중복 계상하면 안 되는데, 기존 이벤트에는 **안정적 id가 없다**. cwd가 repo root면 두 경로가 aliasing되고, 본문 전체로 dedupe하면 필드가 우연히 같은 **별개 이벤트가 붕괴**한다. 해소: append 시 `event_id`를 부여하고 allowlist에 등재하며, 스캔은 **canonical realpath 기준 distinct 디렉토리만** 순회한다. `event_id`가 없는 구 이벤트는 `(파일 경로, 라인 오프셋)`으로 식별한다.

## 6. B2 coverage gate

B2의 `forward-only → computed` flip은 아래 gate 통과에 **종속**된다. 하나라도 실패하면 B2는 정직하게 `forward-only`로 남는다.

### 6.1 primary — 런타임 파일시스템 변형 감사

정적 소스 스캔은 동적 경로·셸/스크립트 writer·생성 코드·repo 밖 writer를 **원리상 못 본다**. 그래서 관측을 guarded producer 밖으로 옮긴다.

관측 창의 **사전/사후 스냅샷**(`path → {receipt_hash, mtime, size}`)을 뜨고, 관측된 모든 delta가 대응 guard 이벤트를 갖는지 검사한다.

**gate-pass 판정식(모호하지 않게 고정).** 관측된 `receipt_hash` 변경 각각에 대해, 같은 `target` 경로를 가리키고 `pre_hash`가 **변경 전 관측값**과 같고 `post_hash`가 **변경 후 관측값**과 같은 guard 이벤트가 msw-events 로그에 **정확히 1건 이상** 존재해야 한다. 시계 오차 흡수를 위해 이벤트 `ts`는 관측 창 ±30s까지 허용한다. carved 5필드만 바뀐 변형(hash 불변, mtime 변경)은 **별도 분류**로 세고 hash-변경 커버리지 판정에는 넣지 않는다.

pre/post hash를 **둘 다** 요구하는 이유: "delta + 아무 guard 이벤트"로는 우회 writer가 이벤트를 하나 흘려 **자기증명**할 수 있다. 사후 상태만 맞추는 사후조작으로는 통과할 수 없어야 한다.

### 6.2 CLI는 primary 축 없이 ok를 반환하지 않는다 (Implement-Codex F4)

**초안의 결함**: acceptance 명령이 standalone `b2-coverage-gate.js --json`인데, 그것이 정적 lint와 레지스트리 검사만으로 `{ok:true}`를 반환할 수 있으면 `computeB2`가 **primary 축을 한 번도 관측하지 않고** `computed`로 이동한다. 구체적 실패: 계측되지 않은 셸/생성 writer가 e2e 창 동안 receipt를 변형해도 정적 검사가 통과하고 CLI가 통과해 B2가 `computed 0/N`을 보고한다.

**해소**: `--json`은 **런타임 관측 아티팩트(사전/사후 스냅샷 + 상관된 guard 이벤트)를 공급받지 못하면 `ok:false`(indeterminate)**를 반환한다. `computeB2`는 **런타임 감사 verdict에만** 종속되고, 정적 축은 secondary diagnostics로 병기된다.

### 6.3 보조 축 (사전 차단)

1. **정적 lint** — 승인 helper(`store.js#writeReceipt` · 메타 stamper 2건 · sanctioned migration) 밖에서 `.claude/receipts` 경로에 write하는 코드가 있으면 실패. 신규 미보호 writer **유입**을 사전 차단한다. 이 lint는 §1의 "현재 알려진 caller" 한정을 지탱하는 guardrail을 겸한다.

   **탐지 범위를 정확히 적는다(이 축이 실재보다 넓게 읽히면 안 된다).** 3축이다 — (A) write 호출 **인자**에 receipt 토큰이 보이는 줄, (B) store의 `receiptPath(` helper를 부르는 파일의 모든 write 줄, (C) receipt 경로 식으로 대입된 변수와 그 파생이 write·rename 대상인 줄(**한 홉** taint). 축 C는 축 A·B가 못 보던 형태를 덮는다 — 초기 판본은 A·B뿐이라 `path.join(root,'.claude','receipts',…)`을 변수에 담고 다음 줄에서 쓰는 형태, tmp write 후 `renameSync(tmp,target)`(이 milestone 자신의 관용구), `fs.promises.writeFile`, `openSync`+`writeSync` **네 형태를 전부 통과시켰고** 저장소 전체 스캔이 위반 0을 보고했다. 즉 guardrail 주장이 실재보다 넓었다.

   **축의 실제 범위는 동사 목록이 정한다.** santa round 2가 그 점을 다시 확인했다 — 축 C를 넣은 뒤에도 동사 목록이 write 계열 4개뿐이라, 경로를 **호출 안에서 인라인으로** 만드는 변형은 축 C(대상이 식별자일 때만 발동)도 못 받아 9종 중 8종이 통과했다(`openSync(p,'w')` · `promises.open` · `promises.appendFile` · `copyFileSync(src,p)` · `renameSync(tmp,p)` · `cpSync` · `truncateSync` · `symlinkSync(evil,p)`). 리뷰어가 제시한 반례는 그중 `openSync` 하나였지만 나머지 7개가 같은 모양이므로 목록 전체를 **경로를 인자로 받아 내용을 만들거나 덮어쓰는 fs API**로 넓혔다(dest가 두 번째 인자인 copy·rename·cp·symlink·link 포함). 축 A와 축 C의 동사 목록은 **대칭으로** 유지한다 — 한쪽만 넓히면 "변수로 넘기면 잡히고 인라인이면 안 잡힌다"는 비대칭 구멍이 생긴다.

   **의도적으로 제외한 것**: 삭제 계열(`unlink`·`rm`). 증거 파괴이긴 하지만 이 축의 선언된 대상은 "미승인 writer 유입"이고 정리 코드에 오검출을 만든다. 조용한 누락이 아니라 명시된 비대상이다.

   **여전히 못 보는 것**(santa round 3에서 실측으로 확정). 객체 필드·함수 인자를 거쳐 다단계로 세탁된 경로, 런타임에만 결정되는 동적 경로, `plugins/mccp/scripts` 밖의 코드, 셸·생성 스크립트. 여기에 더해 **문자열 연산으로 조립된 경로**가 확인됐다 — `'.claude' + '/receipts' + '/x.json'`이나 `'.claude'.concat('/receipts', …)`는 토큰이 리터럴 경계에서 쪼개져 어느 축도 못 본다. 단 `const r = 'receipts'; path.join('.claude', r, …)`처럼 **세그먼트를 변수에 담는** 형태는 축 C가 잡는다(실측). 이 gap들은 known-gap test로 고정돼 있어 동작이 조용히 바뀌면 드러난다.

   **반대 방향의 잔여 — 축 A·B는 의도적으로 과잉 포섭이다.** 축 A는 호출의 첫 닫는 괄호 전까지 `receipt` 토큰을 스캔하므로 **경로가 아니라 값** 쪽에 있어도 잡고(`writeFileSync(configFile, JSON.stringify(receipt.meta))`), 축 B는 `receiptPath(`를 부르는 파일의 **모든** write 줄을 잡는다(읽기용으로만 부르고 다른 곳에 써도). 이는 결함이 아니라 선택이다 — 이 축의 두 오류는 비용이 비대칭이기 때문이다. **오검출은 gate가 시끄럽게 실패**해 사람이 승인 목록으로 분류하면 끝이지만, **미검출은 guardrail을 조용히 비운다**(이 milestone이 정확히 그 상태로 두 번 ship될 뻔했다). 정밀도를 올리려면 write 대상 인자를 구조적으로 판정해야 하고 그건 정규식이 아니라 AST 파서의 일인데, dest가 두 번째 인자인 계열(`copyFileSync(src, p)`)까지 맞추려면 범위가 더 커진다. 보조 축에 그 비용을 쓰지 않는다 — **정밀도가 필요한 판정은 애초에 런타임 변형 감사(primary)의 몫**이다.

   요약하면 이 축의 정직한 성격은 "receipt write를 정확히 판정하는 검출기"가 아니라 **"receipt 근처에서 파일을 쓰는 미승인 코드를 시끄럽게 만드는 guardrail"**이다. 위 두 문단이 그 경계의 canonical 서술이고, `store.js`는 이 절을 가리킨다.
2. **변형 entrypoint 레지스트리** — 기대 mutation 경로를 명시 목록으로 두고 lint 결과와 대조(목록 밖 = 실패, 목록에 있는데 guard 미경유 = 실패).
3. **건별 상관** — 열거의 출발점은 **receipt corpus의 `receipt_hash` 관측값**이다. guard 이벤트에서 출발해 receipt를 확인하는 방향은 미커버 writer를 **원리상 못 본다**(guard를 안 탄 write는 이벤트를 안 남기므로 열거에 안 잡힌다). 총량 비교는 금지 — 누락을 은폐한다.
4. **부정 fixture 2종** — (i) 이벤트 없는 우회 write, (ii) **위조 이벤트를 동반한** 우회 write. 둘 다 B2 flip을 차단해야 gate가 반증 가능하다.

정적 축이 **사전 차단**, 런타임 축이 **사후 검출**이라는 역할 분담이 이 구성의 핵심이다.

### 6.4 커버리지 주장 범위

`receipt_hash`는 carve-out 5필드(`meta.briefing_summary` · `briefing_token_count` · `briefing_token_estimated` · `briefing_invocation_count` · `ledger_write_skipped`)에 **불변**이므로 hash 기반 열거는 carved 변형을 구조적으로 못 본다. 이를 구멍으로 두지 않고 **주장 범위로 전환**한다: B2가 보증하는 것은 **hash 변경 변형(= 봉인된 증거)의 커버리지**이고, carved 변형은 봉인 증거를 바꿀 수 없으므로 그 손실은 **증거 손실이 아니라 메타 손실**이다. 스냅샷의 mtime 축이 carved 변형까지 포착해 별도 분류로 세므로, 이 축소는 *구멍*이 아니라 *설명*이다.

이 분할이 §3.2의 caller 비대칭과 **같은 경계**에서 나온다는 점이 중요하다 — 두 결정이 임기응변이 아니다.

## 7. API 경계 (Implement-Codex F3)

**초안의 결함**: `withEvidenceLock(target, fn, ctx)`를 primitive로 두고 base-hash 보존 · disk hash 재확인 · 소유 재확인 · rename 후 검증을 **caller 책임**으로 남기면, caller가 승인된 lock helper로 감싸면서 `assertOwned`나 base-hash 선조건을 빠뜨릴 수 있다. 그래도 정적 커버리지는 승인 helper를 보고, guard 이벤트도 emit되는데, **lost update 창은 재개방**된다. writer 통합 지점이 3곳(그중 2곳이 read-modify-write stamper)이라 위험이 특히 크다.

**해소**: 공개 API는 **전 구간을 소유하는 단일 함수**다.

| 공개 API | 소유 범위 |
|---|---|
| `guardedWrite(target, buildContent, opts)` | lock 획득 → base-hash 캡처 → claim fence → `buildContent()` → pre-rename heartbeat + 소유 재확인 → 원자 rename(retry 안에서도 heartbeat) → post-rename 검증 → guard 이벤트 emit → 해제 |
| `guardedReadModifyWrite(target, mutate, opts)` | 위와 동일하되 `mutate(current)`가 lock **안에서** 읽은 내용을 받는다 (read도 임계구역 안) |

raw lock context(`withEvidenceLock`의 heartbeat/assertOwned 핸들)는 **module-private + test-only export**로 유지한다. caller 규율이 아니라 API 형태가 불변식을 강제한다.

## 8. M3 / M5 경계

| 축 | 소관 |
|---|---|
| live 중복 점유 불가 · stale epoch write 거부(tombstone TTL 내) · 봉인 증거 변형의 원자성·커버리지 | **M3** |
| 전역 단조 순번 · 파생 상태 재생 순서 · 이력 보존 · TTL 만료 이후의 무기한 replay 방어 | **M5** |

`claim_epoch`는 M5 모델의 **대체물이 아니다**. 그 축의 최소 선행 조건이며, 그것만으로 순서 의미론을 주장하지 않는다.

> **M5 착지 결과 (v1.23.9) — 대체가 아니라 확장임이 확정됐다.** M5는 `evidence-claim.js`를 한 줄도 재작성하지 않았다. 순서 축은 별도 기판(`lib/state-journal/` + `state/journal-store.js`)에 서고, 세션 epoch은 새로 발명하지 않고 `session-ledger.created_at`에서 파생한다(UUID인 `claim_epoch`은 순서를 갖지 않아 "누가 먼저인가"를 답할 수 없다). 두 축의 관계는 다음과 같이 고정됐다:
>
> - **점유는 시간 창(TTL 15분)의 문제, 순서는 시간 상한이 없는 문제다.** M5의 `session_epoch` 비교에는 만료가 없으므로, M3 claim TTL이 지난 뒤 되살아난 세션의 지연 append도 여전히 `admit-post-tombstone`으로 배제된다(회귀 test가 TTL 경과 후 동일 판정을 단언). 이것이 §8이 M5에 배정한 "TTL 만료 이후의 무기한 replay 방어"의 구현형이다.
> - **tombstone은 epoch보다 강하다.** 판정 우선순위상 tombstone 검사가 epoch 비교보다 먼저이므로, 더 새로운 세션이라도 닫힌 작업 단위를 되살리지 못한다.
> - **클론 경계에서의 방어는 M3 claim이 아니라 git-tracked `completion-ledger`가 지탱한다.** 저널은 working-tree 전용이라 클론 후 tombstone이 0이 되는데, genesis 부트스트랩이 ledger 엔트리를 tombstone으로 seed해 그 구멍을 메운다. 단 그 seed는 `decision_id` 키이므로 `task_fingerprint` 축 레코드에는 미치지 않는다(명시 잔여 1b).
>
> 상세와 보증/비보증의 단일 기준: [state-truth-source-design.md](state-truth-source-design.md).

## 9. 토글

| 토글 | default | 의미 |
|---|---|---|
| `MCCP_EVIDENCE_CONFLICT_GUARD` | `enforce` | `enforce` = fail-closed lock + fence · `warn` = 관측·이벤트는 그대로 두되 차단하지 않음(복구용 kill switch) · `off` = guard 전체 비활성(loud warn) |

신규 토글은 **정확히 1개**로 제한한다(B3 토글 축 증가 억제 방향과의 균형). lease/TTL 값은 상수로 두되 test 주입만 허용한다.

---

## CLAUDE.md §3.12 원문 아카이브

CLAUDE.md §3.12 「증거 내구성 계약」이 싣던 **원문 전문**이다(11,734 B). 재봉인 금지 불변식 ·
`codex_verdict` 우선 규칙 · merge-commit 정책은 CLAUDE.md에 그대로 남아 있고, 여기 보존한
것은 무결성 통일 M1~M3의 도출 내력이다.

### evidence-durability-contract

CLAUDE.md §3.12의 원문이다. 한 글자도 다듬지 않았다 — 이전이 재작성으로
변질되지 않았음을 줄 단위로 기계 검증할 수 있어야 하기 때문이다.

### 3.12 증거 내구성 계약 (Evidence durability contract) (v1.22.4 — durable-evidence-substrate Phase A)

ship receipt(`mccp-pr-codex`)는 **감사 대조 corpus**다 — worktree 삭제 후에도 ledger↔receipt 대조가 성립하도록 **git-tracked**로 유지한다(v1.22.4 `.gitignore` 선별 해제). plan/implement receipt는 세션 진단용이라 여전히 working-tree only. 이 비대칭은 감사 가능성을 위한 것이다: fresh clone이 항상 "대조 대상 부재" 상태이면 저장소를 새로 받은 누구도 술어 결함(E1)을 발견할 수 없다.

#### 재봉인 금지 (no-rehash invariant)

기존 ship receipt의 `receipt_hash`는 **하나의 sanctioned 재봉인 도구를 제외하면 절대 재계산하지 않는다.** completion-ledger 엔트리의 파일명 정체성이 `<decision_id>__<receipt_hash[0:12]>`이고 `writeEntry`가 `(decision_id, receipt_hash)` 쌍에 멱등이므로, receipt를 **결속 재키잉 없이** 재봉인하면 ledger가 그 receipt를 가리키던 **결속이 끊겨 dangling**이 되고 재-append가 no-op이 아니라 **중복 엔트리**를 만든다(E4). 그래서 무단 재봉인은 금지다.

**유일한 sanctioned 재봉인 — `v1.22.4-cwd-rebind.js` (durable-evidence-substrate follow-up · F1).** 원래 §3.12는 "노출 제거보다 결속 보존이 우선 — 유출 receipt는 재봉인이 아니라 추적 제외(Phase B rebind 대상)로 회피한다"고 적었으나, **F1이 바로 그 Phase B rebind을 앞당긴 것**이다. 이 도구는 receipt의 `meta.cwd`를 repo-relative로 redact하고 `receipt_hash`를 재계산하되, 그 receipt에 bound된 **git-tracked** ledger 엔트리(파일명 + `entry.receipt_hash`)를 **같은 run에서 원자적으로 재키잉**한다 — 그래서 §3.12가 막으려던 E4(dangling/중복)가 발생하지 않는다. 즉 무단 위반이 아니라 §3.12가 예고한 sanctioned 진화다. no-rehash 불변식은 **다른 모든 writer에 대해 여전히 유효**하다.

- 신규 receipt의 `meta.cwd`는 `write.js`가 repo-relative로 정규화한다(절대경로 leak 회피). 기존 receipt는 이 sanctioned 도구로만 손댄다.
- `hash.js`에 `meta.cwd` carve-out을 **추가하지 마라** — `meta.cwd`는 전 receipt에 존재하므로 carve-out은 전 receipt의 검증을 깨뜨린다. rebind은 carve-out이 아니라 결속 재키잉으로 hash 변경을 처리한다.
- git-tracked receipt를 다른 hash로 덮어쓰려는 시도는 `store.js#writeReceipt`의 가드가 fail-closed HALT한다. **cwd-rebind은 이 가드를 의도적으로 우회**한다 — `store.writeReceipt`가 아니라 직접 `fs`(atomic tmp+rename)로 쓰되, 결속을 원자적으로 재키잉하기 때문에 정당하다(도구 헤더에 명시). 그 외의 정당한 재-ship은 여전히 **새 decision slug**를 쓴다(기존 slug 덮어쓰기는 supersession 스키마가 생기기 전까지 불허). rebind이 아닌 어떤 tracked-hash 변경도 여전히 금지다.

#### `resolution.converged`는 신뢰 불가 필드 — 완료 판정 키로 쓰지 마라

추적 corpus에는 오도성 필드 `resolution.converged`가 함께 실린다(divergent ship인데 이 필드는 `true`). v1.20.3이 dedupe 축에서 이미 내린 판정처럼, **완료/승인 판정의 키는 `resolution.codex_verdict`**(enum `converged|divergent|critical|unavailable|skipped`)여야 한다. 추적이 옳은 이유는 바로 옆 `codex_verdict`가 불일치를 증명 가능하게 만들기 때문이다(E1 감사를 성립시키는 성질). 소비처(ledger backfill·derive·renderer)는 `resolution.converged`를 완료 신호로 삼지 마라.

> **v1.22.5 무결성 통일 M1 — 위 지침의 mechanical 강제**: (1) `completion-ledger/index.js` 승인 술어가 codex_verdict-first로 교체됨 — `resolution.converged`는 신뢰 키에서 은퇴하고 NEW append는 `codex_verdict ∈ {converged(∧ actionable≠true)·skipped·unavailable}`만, `divergent`/`critical`/absent는 fail-closed skip(운영자 승인: `skipped`=dedupe happy-path·`unavailable` 유지). (2) `resolution.converged`를 직접 읽던 전 소비처(status·worktrees·escalate-detector·derive projection)가 [receipt-convergence.js](plugins/mccp/scripts/lib/receipt-convergence.js) `isConvergedVerdict`/`isDivergentVerdict` 한 곳으로 통일 — `divergent`/`critical` ship은 `converged`가 true여도 절대 converged로 렌더/판정되지 않음. (3) 기존 ledger 엔트리는 `v1.22.5-ledger-verdict-repair.js`가 `verdict_provenance`(`codex-verdict`/`legacy-unknown`/`superseded`)로 재판정·**보존+표식**(drop 금지, cardinality 불변, no-rehash). (4) 무결성 검증이 write-side(`evidence-stage-guard`: schema+gate+phase+slug)와 read-side(`evidence-audit`: `hash_bound`에 `receiptHash` 재계산+schema)에서 같은 `receiptHash` 함수로 대칭화. M2(leak-scan·subject_hash·parser fixture)·M3(terminal `/mccp:pr` non-approving mechanical hard-stop 재설계)는 별건.

> **v1.22.6 무결성 통일 M2 — 독립 무결성 fixes**: M1의 tightly-coupled 3축과 분리된, 서로 다른 trust boundary의 국소 결함 4건을 닫는다(각 Task 자기완결 회귀 test, 순서 불변식 없음). (1) `validate-cmd.js`의 subject_hash mismatch를 `result.stale`→`result.blocking` `kind:'subject-tamper'`로 승격(`preflight.js`도 "Do NOT regenerate (that destroys the evidence)" INTEGRITY 힌트로 확장) — 바로 아래 receipt_hash receipt-tamper 블록과 대칭. `subjectHash`는 SUBJECT_FIELDS self-consistency seal이라 mismatch=서명-후-변조(tamper)이지 plan staleness가 아니며(staleness는 별도 plan_hash 비교), stale→regenerate가 tamper 증거를 파괴하던 subject-side 잔여(M1이 `receipt_hash`에 대해 이미 닫은 것과 동일 잠복 결함)를 닫는다. (2) `history-leak-scan.js` allowlist를 `oid→paths[]`로 확장 — `git rev-list --objects`는 blob당 first-path 1개만 방출(실측 확인 · 플랜의 "다중경로 방출" 가정은 거짓)하므로 range 커밋 `git ls-tree -r`로 전 경로를 증강하고 allowlist를 **경로별**로 판정. 같은 blob이 allowlisted fixture 경로 + non-allowlisted real 경로에 도달할 때 real leak을 더 이상 조용히 억제하지 않는다(pre-push secret/path backstop 복구 · ls-tree 실패는 fail-closed · security-reviewer 독립 검토 SOUND). (3) `codex-review-payload.js`는 이미 `.stdout`→`.result.verdict`를 정상 파싱함을 실-producer envelope 회귀 fixture로 봉인(코드 변경 0 — "통과했다≠검사했다" drift 방지, verify-and-close). (4) `briefing/invoke.js`가 raw `!!res.converged` 대신 [receipt-convergence.js](plugins/mccp/scripts/lib/receipt-convergence.js) `isConvergedVerdict`를 소비 — divergent/critical ship이 briefing 요약에 더 이상 "converged: true"로 오기되지 않는다(M1 Task 1b sweep의 마지막 raw 소비처; derive projection은 M1이 이미 교정). Implement-Codex는 환경 companion `exit-nonzero`로 **advisory** 진행(운영자 승인, M1 #110 선례) → receipt `codex_verdict='unavailable'` 봉인 → PR-Codex 별도 발화. M3(terminal gate 재설계)는 계속 별건.

> **v1.23.0 무결성 통일 M3 — terminal `/mccp:pr` non-approving mechanical hard-stop 재설계(PRD 종료)**: M1이 verdict-SoT를, M2가 독립 무결성 4축을 닫았지만 **terminal `/mccp:pr` 게이트 자체는 non-approving PR-Codex verdict를 mechanical하게 막지 못했다** — 파서는 복구됐으나 게이트에서 audit-only였다(backlog 2026-07-21 HIGH: receipt `codex_verdict='divergent'`인데 `validate --command mccp:pr` exit 0). M3은 단일 pure 오라클 [pr-ship-gate.js](plugins/mccp/scripts/lib/pr-ship-gate.js) `deriveShipDecision`으로 no-ship 집합 **{divergent, critical, unavailable, absent}**을 판정하고(ship 집합 = {converged, skipped}; `!==converged` 전량 차단이 아니라 `skipped` sanctioned ship 보존 — DD1), 이를 **이중 locus·단일 오라클**로 강제해 drift를 구조 차단한다(DD2): (1) **runtime 1차** = `finalize-receipt.js`가 write 성공 후 receipt 재read → no-ship이면 `EX_SHIP_BLOCKED(12)` 반환 → `pr.md` 2.5.7 HALT(write 경로 자체라 LLM 누락 불가), (2) **canonical 표면** = `validate-cmd.js` `--check-ship-verdict`(pr.md Phase 2.5.9 read-back). read-back은 verdict를 신뢰하기 전 receipt를 schema+tamper 재검하고 단일 kind가 아니라 **aggregate `ok===false`로 HALT**한다 — 4종 fail-closed blocking kind(`pr_codex_nonconverged`·`subject-tamper`·`receipt-tamper`·`ship-gate-schema-invalid`)를 모두 존중하고 validate 출력 parse 실패도 fail-closed(위조 divergent→converged가 봉인 무결성으로 차단되고 조용히 ship되지 않음). 유일 우회는 audited override `MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE="<reason>"`(strict validator 재사용, Phase 0.4)인데 **verdict를 `converged`로 재작성하지 않는다** — receipt는 실제 divergent를 봉인한 채 `meta.pr_codex_force_override=true`와 ship돼 cross-gate dedupe fail-closed·§3.12 봉인·ledger 승인 술어(M1) 무손상(DD3). **8라운드 비수렴 회피**: 강제 메커니즘을 적대 리뷰하면 우회 표면이 매 라운드 노출되므로(env opt-out·lock·crash-window·session key·absent-verdict·re-entrancy) plan §Design Decisions(DD1~DD7)에서 선제 설계로 닫았다 — self-gate는 `checkShipVerdict` flag-gated라 조기 preflight(1.6)엔 미발화(재실행 self-poison 회피·DD4), fresh-receipt locus라 historical absent-verdict 예외 자동 충족(DD5), ship-gate는 codex-runner lock exit **후** 실행이라 lock 무상호작용(DD6), divergent receipt는 evidence-commit 미도달이라 §3.12 정합(DD7). present-only meta 필드(default false/null)라 `receipt_hash` carve-out 무변경·기존 git-tracked ship corpus 무손상. integrity-unification PRD 전체 완료 → §3.7 minor bump `1.22.6 → 1.23.0`. **Implement-Codex dogfood(cross-model, 4라운드)**: 환경 companion이 실작동해(라운드당 ~8분) M3 ship-gate를 적대 리뷰 → core fail-open 5건을 fail-closed로 흡수 → `deriveShipDecision` no-ship 집합이 verdict뿐 아니라 `skipped`-proof 부재(`skipped-unproven`)까지 포함하고, blocking kind가 위 4종에 더해 `ship-gate-receipt-missing`(R1 F1: read-back null fail-closed)·`ship-gate-stale-head`(R2 F4: `head_sha≠HEAD`)·`ship-gate-hash-mismatch`(R3 F5: finalize가 봉인한 정확한 `receipt_hash`에 read-back bind)로 확장됨. finalize primary도 재read 후 schema+subject+receipt-hash+head+write-binding을 `deriveShipDecision` **전에** 검증(self-sufficient, markdown read-back 미의존). R4 F6(dedupe skip proof 재검증 — upstream `evaluateForDedupe`가 이미 fail-closed 검증하는 defense-in-depth, 완전 fix는 sealed verifiable dedupe proof = 후속 milestone)만 DEFER_TO_BACKLOG(2026-07-30). Implement-Codex receipt는 §3.12 dogfood대로 **divergent 봉인**(F6 미해소 정직 반영 → cross-gate dedupe fail-closes → M3 코드가 `/mccp:pr` PR-Codex를 실제로 받음).

#### merge-commit 정책

ship squash 시 PR merge 방식은 **merge commit**(GitHub 설정 적용 완료)이다 — squash가 개별 커밋 SHA를 소급 재작성해 evidence-commit이 참조하는 SHA 도달성을 깨는 것을 피하기 위함. 과거 squash 커밋의 SHA 복구는 원리상 불가능이므로(Out of Scope), 앞으로의 ship은 merge-commit으로 SHA를 보존한다.

감사 도구: `node plugins/mccp/scripts/lib/evidence-audit.js --json` (ledger↔receipt 대조 · `state=blind`면 비영점 exit · read-only · LLM-free).

---

