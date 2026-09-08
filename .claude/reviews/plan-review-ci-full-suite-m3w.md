# Plan Review Panel — ci-full-suite-m3w

**Plan**: `.claude/plans/ci-full-suite-m3w.plan.md` · **Plan version**: `sha256:e078f716d2981dd67ffc5162d3e42746e341200f704e307c7d6398ba1c34e3fa`
**Verdict**: `converged` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=true
**Layers**: L1 converged · L2 converged · L3 not fired

> Reason: L1 + L2 quorum satisfied (4/3 responses, 4 distinct roles); L3 not fired

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | MEDIUM | digest 앵커의 '재계산'이 러너와 같은 구현을 쓴다는 것이 계약으로도 단언으로도 고정되지 않았다 — 새 모듈이 자체 digest/glob 확장을 구현하면 CI에서 영구 `digest_mismatch`(저장소 인질 상태, DD2가 한 라운드를 들여 막은 그 상태)가 되는데, 이를 붉게 만들 test가 없다. | plan L608 "`coverage.js`가 로드한 exclusions로 digest를 **재계산**해 measurement의 값과 대조" — 공유 함수 이름을 지목하지 않는다. 실제 producer는 `scripts/test-suite/run.js:580` `exclusions_digest: exclusionsDigest(exclusions)`이며 그 구현은 `scripts/test-suite/enumerate.js:84-90`(정렬 + `pattern + ' ' + reason` 연결)이다. 그런데 Task 2 Validate 분기 (9)(plan L1084-1085)는 합성 입력이라 양변이 같은 구현에서 나오고, 명시된 공유 짝 단언(plan L1058-1061)은 `coverage.js` ↔ `gate.js` 사이만 대조하지 러너와는 대조하지 않는다. `inputs.js`의 소유 범위(plan L980)에도 digest/열거 재사용은 열거돼 있지 않다. |
| security | LOW | Task 5는 `persist-credentials: false` 체크아웃과 그 뒤의 `git fetch --no-tags origin "$BASE_REF"` 단계를 **함께** 요구하는데, 이 조합은 미러 원본 어느 쪽에도 없다 — baseline은 credential을 끄되 이후 git 네트워크 작업이 없고(주석이 명시적으로 그 근거를 든다), version-declaration-gate는 fetch를 하되 credential을 유지한다. 인증이 필요한 구성(저장소가 private로 전환되거나 fetch가 토큰을 요구하는 환경)에서는 fetch가 실패해 `--base-ref` 해소 불가 → 게이트가 전 PR에서 영구 red가 되고, 그 상태의 유일한 출구는 이 계획이 스스로 금지한 게이트 완화다. 계획은 fetch 가용성을 논하면서(L2 R8 흡수) 자격증명 제거가 그 fetch의 전제를 건드린다는 점은 어디에도 적지 않는다. 현재 저장소가 공개로 보이므로(공개 issue 링크 실측) 즉시 발현하는 취약점은 아니고, 이 상호작용이 문서화되지 않은 잔여로 남는다는 것이 지적 대상이다. | .github/workflows/test-suite-baseline.yml:60-67 ("이 job은 이후 어떤 git 쓰기도 하지 않으므로 기능 손실이 없다") 대 .github/workflows/version-declaration-gate.yml:48-50,59-60 (persist-credentials 미설정 + fetch) 대 plan Task 5 ("`persist-credentials: false`" … "판정 앞에 `git fetch --no-tags origin \\"$BASE_REF\\"` 단계를 둔다") |
| test | MEDIUM | 축 D 절단 B의 대상 선택 규칙 셋이 '판정보다 앞선 자기 test 단계가 이름으로 부르는 파일'을 배제하지 않는다 — 그 파일을 고르면 이 계획이 네 번 흡수한 'Acceptance 3-B 증거의 CI producer 소멸'이 형태만 바꿔 재현되고, 그것을 붉게 만들 단언이 0건이다. | plan L1932-1937 (e5) 규칙 셋은 (1) `grep -r "<basename>" --include=*.test.js` 비순환성 · (2) 격리 패턴 미매치 · (3) `allow_deletions` 부재뿐이다. 그런데 Task 5가 판정보다 앞선 독립 단계로 못박은 자기 test 줄은 `node --test scripts/tests/test-suite-coverage.test.js scripts/tests/wiring-cut.test.js`(plan L1471)이고, 그 두 경로는 `*.test.js`이자 tracked라 절단 B의 후보 집합에 들어 있다. 규칙 (1)의 grep은 *test 파일이 그 파일을 단언하는가*만 보므로 workflow가 이름으로 부르는 의존을 구조적으로 못 본다 — plan 자신이 L1484-1485에서 같은 grep의 한계('개수에 걸린 의존을 구조적으로 못 본다')를 인정한 것과 같은 사각이다. 그 파일이 삭제된 트리에서는 자기 test 단계가 ENOENT로 red가 되어 판정 단계가 실행되지 않고 `gate.json`이 생성되지 않으므로 Acceptance 3-B(plan L2403-2405)의 증거 producer가 사라진다. |
| test | MEDIUM | Task 1의 Validate 명령이 그 Task가 고치는 것(Linux 전용·node20 전용 red)을 로컬에서 구조적으로 exercise할 수 없어, 단언을 약화시키는 '수리'와 진짜 수리를 가르는 검사가 이 Task에 0건이다. | plan L1026-1027은 대상을 '1b `santa-loop-cap.test.js` DD3 symlink (Linux 전용) · 1c `dispatch-fullcycle-smoke.test.js` (node20 전용)'으로 적는데, Validate(L1032-1033)는 `MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 <file>`을 **로컬**에서 돌린다. 이 계획은 로컬 정본을 Windows/Node 24로 선언한다(L2044-2046 · L2223 '**Windows 로컬에서는 통과하지 않을 수 있다**'). 즉 그 파일들은 수정 전에도 로컬에서 green이므로 이 Validate 줄은 어떤 변경에 대해서도 붉어질 수 없다. 판정을 CI로 미루지만(L1033) CI 축의 증거는 '체크가 green'(Acceptance 1, L2388)이라 단언을 지운 수리도 동일하게 만족시킨다. |
| invariant | MEDIUM | 분모 채널의 `-z` 규율이 DD2에만 착지하고 구현 명세 두 곳에는 반영되지 않았으며, 그것을 pin하는 단언이 0건이다 — R23이 흡수했다고 적은 '두 채널이 같은 집합을 다르게 센다' 결함의 절반만 착지한 형태다. | plan L567 DD2: "`tracked`는 **`git ls-files -z '*.test.js'`** 다(NUL 구분 …)". 그러나 구현자가 읽는 두 자리는 `-z`가 없다 — plan L980 `## Files to Change` inputs.js 행: "`tracked`(`git ls-files '*.test.js'`)" · plan L1157-1158 Task 2b: "**`tracked`는 스스로 `git ls-files '*.test.js'`로 해소해**". 짝 단언 (12)·(i)는 `denominator === tracked.length`와 measurement 미파생만 재고 플래그 형태는 재지 않는다. 러너 쪽은 `scripts/test-suite/run.js:404-410`이 `-z`를 쓰므로 두 채널이 갈린다. |
| invariant | MEDIUM | 라운드 캡이 이 계획의 진행에 대해 실제로 아무것도 막지 않았고, 그 우회(새 decision slug 재발행)가 계획 본문에 표준 절차로 성문화됐다 — 게이트 모양은 남고 차단력만 사라진 형태다. | plan L419-427: "그 방식(새 decision slug 재발행)은 §3.16이 열거한 **문서화된 감사 우회 넷에 없다** … 즉 **캡 강제는 이 진행에 대해 작동하지 않았고**, 어느 라운드도 receipt에 봉인되지 않아 사후 감사는 아래 표와 `.claude/reviews/`의 기록에만 의존한다 … 각 라운드는 흡수 후 **새 decision slug**로 재-ship한다(`m3` → `m3a` → …)". CLAUDE.md §3.16은 캡을 `(gate, decision)` 키로 강제한다고 적는다. 정직하게 기록된 이탈이고 dual-review는 PR-Codex로 미뤄지지만, 절차로 성문화되면 다음 계획이 같은 경로를 상속한다. |
| invariant | LOW | stage 단락 때문에 red·커버리지 실패 run에서는 `redaction_ok` 판정이 아예 수행되지 않는데, 업로드는 `if: always()`로 무조건 발행된다 — 유출 가능성이 가장 높은 run(단언 diff가 존재하는 red run)에서 게이트의 유출 축이 침묵한다. | plan L664-666(단계 1에서 차단 시 3단계 미도달) + L835-841 DD4a: "Task 5의 업로드 단계는 판정 **뒤**에 있지만 `if: always()`이므로 게이트가 3단계에서 차단해도 유출본은 **조건 없이** 공개 artifact가 된다". DD4a는 stage 3 차단 경우만 다루고, stage 0·1·2에서 단락돼 유출 판정 자체가 없는 경우는 어디에도 적히지 않는다(measurement.json의 `redaction_ok` 필드가 유일한 잔여 신호다). |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | 인용 검증: `run.js:10-12`·`:179-183`(`Number(r.exit_code)\|\|0` 접힘)·`:205-214`(`per_file: ok ? perFile : null` + 주석)·`:404-410`(`ls-files -z`)·`:575-580`·`:613-631` last-wins 파서, `enumerate.js`의 `normalizeExclusions`/`globToRegExp`(`**`→`.*`)/`exclusionsDigest`, `version-declaration-gate.yml:21-24·57-60·62-65`(fetch-depth·base fetch·가드보다 앞선 판별력 test) — 전부 계획이 주장하는 대로였다. 구조적 공격 시도: (1) `ticket` 필드가 digest를 바꿔 영구 mismatch를 만드는가 → `exclusionsDigest`가 내부에서 `normalizeExclusions`로 `{pattern, reason}`만 남기므로 아니다. (2) floor 5상수 산술이 두 번째 삭제 사이클/절단 B/정상 면제에서 자기모순인가 → `tracked = tracked_basis − (max_allowed_deletions+1)` + R17 재기준 규칙으로 세 경우 모두 일관됨을 손으로 계산해 확인했다. (3) 자기 test 단계(판정 앞)가 트리를 읽어 절단 A·B의 producer를 죽이는가 → 트리 판독 단언이 `max_excluded_files` 등가 하나로 축소됐고 (e5)(e5a) 선택 규칙이 그것을 덮는다. (4) `gate.js`↔`coverage.js`↔`inputs.js` 순환/이중 소유 → `inputs.js`(구현)·`gate.js`(계약)로 분리돼 순환 없음, 격리 로더는 `exclusions.js` 위임으로 단일화. (5) `tracked` 채널이 러너(`ls-files -z` + suffix)와 게이트(pathspec)로 갈리는가 → 갈리며, 계획이 열거 sanity 검사 1로 정확히 그 divergence만 잡는다고 스스로 축소 선언한다. (6) `missing = base_set − head_set`의 추가/rename/얕은 클론/빈 base 경로 → 각각 (k) 분기·`base_set_empty`·merge-base 해소로 덮임. HIGH/CRITICAL로 세울 수 있는 것은 찾지 못했다. |
| security | pass | 공격한 축: (1) fork PR 위협모델 — `pull_request` + `permissions: contents: read` + secrets 미주입 + `pull_request_target` 미사용 + SHA pin으로 실제 escalation 경로를 만들지 못했다. (2) 공개 artifact 유출 — `if: always()` 업로드가 `redaction_ok` 차단과 무관하게 발행된다는 점은 DD4a가 배선대로 정확히 기술하고 교환(증거 vs 발행 억제)을 명시 기록한다; redact.js 헤더(:8-16, :29-34)의 잔여 축 서술과도 어긋나지 않았다. 노출 *빈도* 확대(paths 필터 제거)도 DD4가 자기 정정으로 이미 인정한다. (3) 판정 입력 위조 — 격리·floor 파일이 PR 트리 소유이고 실행 중 test가 덮어쓸 수 있다는 런타임 변조 경로를 찾았으나 DD4a가 그것을 그대로 적고 닫지 않는다고 선언한다(과대주장 없음). (4) `${{ }}` 보간 주입 — 판정 줄이 `env:` 간접을 쓰고 인용이 방어가 아니라는 서술도 정확하다. (5) `--allow-codex` secret 상속(S4) — 가드 위치를 childEnv에서 플래그 파싱으로 옮긴 근거를 run.js:451-468, :655-664에서 대조했고 CI 진입점이 CLI 단독이라 약화가 아니다. (6) 인용 검증 — run.js:179-183(`Number()\|\|0`로 null→0), :205-216(`per_file: ok ? … : null`), :213-214 주석이 DD3 0단계 논증대로 실재한다. HIGH/CRITICAL을 세우지 못했고, 남은 것은 위 LOW 하나뿐이다. |
| test | pass | 계획이 인용한 소스를 직접 대조했다: `run.js:725`(`return result.ok ? 0 : 1`) · `:685-686`(`flags.from ? readJsonFile : runOnce`) · `:676-679`(`--list`가 격리 후 included) · `module.exports`에 `main`/`parseArgv` 부재(L728-747) · `:580` `exclusions_digest` producer 실재 · `:171-216` `failing`/`redaction_ok`/`files_total` 실재 · `enumerate.js`의 `enumerateTests`/`exclusionsDigest`/`normalizeExclusions` export와 `Array.isArray` throw — 전부 계획 서술과 일치했다. `## Validation` 인라인 `node -e`의 API 사용(`en.enumerateTests({trackedFiles,exclusions})`, `en.exclusionsDigest`, `process.argv[1]`)이 실제 시그니처와 맞는지, 검사 4a/4b의 합성 measurement가 실제 producer 모양(ok/exit_code/redaction_ok/per_file/failing/exclusions_digest)과 일치하는지 확인했고 일치했다. 4b의 산술(삭제 후 `tracked = basis−1`이 `floor = basis−(max_allowed_deletions+1)` 위에 남는가 · `--base-ref HEAD`가 삭제 축에서 판별력을 갖는가)을 직접 계산해 반증을 시도했으나 성립했다. `## Files to Change`의 모든 CREATE/UPDATE 경로에 짝 test가 배정돼 있는지 대조했고(`container-check.js`·`exclusions.js`·`ci-required-checks.js`·`run.js` 가드 전부 배정됨), Validation 검사가 참조하는 경로(`.claude/_meta/data/2026-09-01-suite-baseline.json`, fixture `exclusions-no-ticket.json`)의 실재/생성 여부도 확인했다. 위 둘 외에는 반증 가능한 결함을 찾지 못했다. |
| invariant | pass | 열려는 게이트를 하나씩 시도했다: (1) measurement producer 우회 — 커밋된 `measurement.json` + step skip/재배치(단언 1d·2b2가 닫음), `--files-from`·중복 `--exclude-from`을 전수 실행 줄에 덧붙이기(각각 stage 2 `unexplained`·`digest_mismatch`로 fail-closed 확인), `--allow-codex`(Task 4 가드). (2) 삭제 래칫 — 삭제+추가 상쇄, rename, glob `allow_deletions`, `base_set` 공집합, `--base-ref HEAD` 치환·중복 플래그: 전부 (k) 여섯 분기와 fail-closed 아홉이 덮음. base가 merge-base인지 실제 산술로 확인(HEAD 부모가 옛 tip이라 R17 처방 성립). (3) floor 산술 — `tracked_basis −(D+1)` 도출식을 정상 삭제 2사이클·절단 B·면제 한도 삭제에 대해 손으로 풀어 영구 `below_floor` 재발 없음 확인. (4) 러너 종료코드 계약 인용 검증 — `run.js:179-183`(`Number(exit_code)\|\|0`), `:213-214`(`per_file: ok ? perFile : null`), `:725`, `:489-505`(spawn 실패), `:532-542`(신호 종료 → `incomplete-report` → ok:false)로 stage 0 차단력 실재 확인. (5) `enumerate.js` 실측 — `normalizeExclusions`가 `ticket`을 버리고 digest가 `pattern+reason`만 해싱함을 확인했으나 게이트 판정에 영향 없음(digest는 정합 검사로 이미 강등돼 있음), `enumerateTests`의 included∪excluded=tracked 구성 보장 확인. (6) Validation 블록의 인라인 `node -e` 오라클이 실재 export(`enumerateTests`·`exclusionsDigest`)를 부르는지, `--base-ref HEAD`가 index 대 커밋 트리 차이로 4b에서 실제로 발화하는지 확인 — 성립한다. (7) 자기 test step 위치가 2b2의 순서 쌍에서 빠진 것을 공격했으나, 어느 위치든 step 실패가 job을 붉게 만들므로 침식 아님. HIGH/CRITICAL은 찾지 못했다. |

## Measurement

<!-- Written by plan-review/cli.js record on EVERY exit path, pass or halt.
     Machine-readable; do not hand-edit. A null field means the axis was
     not observed, never that it was zero. -->

```json
{
  "verdict": "converged",
  "source": "multi-agent",
  "layers": {
    "l1": "converged",
    "l2": "converged",
    "l3": "not fired"
  },
  "quorum": {
    "responded": 4,
    "required": 3,
    "roles": 4,
    "of": 4,
    "passed": true
  },
  "wall_clock_ms": 339389,
  "halt_stage": null,
  "backlog_appended": null,
  "backlog_skipped_nonblocking": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:e078f716d2981dd67ffc5162d3e42746e341200f704e307c7d6398ba1c34e3fa",
  "plan_path": ".claude/plans/ci-full-suite-m3w.plan.md",
  "recorded_at": "2026-09-04T05:25:08.264Z"
}
```
