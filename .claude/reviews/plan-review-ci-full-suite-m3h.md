# Plan Review Panel — ci-full-suite-m3h

**Plan**: `.claude/plans/ci-full-suite-m3h.plan.md` · **Plan version**: `sha256:68b4d2255d54816dc6de381c3c09b8c699c7ff73e1282cc224fe859f9669f6f0`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired
**Halted at**: `5.2e`

> Reason: L2 quorum not satisfied: 7 blocking finding(s): architect/HIGH, architect/FAIL, test/HIGH, test/HIGH

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | HIGH | 축 D의 절단 B는 '판별자가 stage 번호'라는 전제 위에 서 있는데, gate.js의 stage 2는 삭제 래칫과 커버리지의 나머지 세 조건이 **공유하는** 칸이라 판별력이 없다. 즉 B가 요구하는 증거는 래칫이 죽어 있어도 다른 커버리지 실패로 똑같이 만족될 수 있다. | plan Task 2b (c) 'green ∧ 커버리지 ok=false면 stage=2' 와 같은 Task 2b (k) '--base-ref가 주어지면 missing … 비어 있지 않으면 stage=2에서 차단' — 같은 stage. 그런데 Validation 4b(plan:1032)는 `if (j.stage !== 2) … '삭제 래칫이 아니라 다른 이유로 죽었다'`로 stage 2를 래칫의 판별자로 사용한다. 실제로 4b는 검사 7의 measurement(삭제 **전** 실행, per_file에 삭제 대상 포함)를 삭제 **후**의 tracked(=git rm 이후 git ls-files)와 대조하므로, 래칫이 없어도 커버리지 축이 stage 2로 죽을 개연성이 높다 — 그 방향(executed인데 tracked 아님)은 Task 2의 분기 (1)~(13) 어디에도 정의돼 있지 않다. |
| architect | MEDIUM | DD9가 R8에서 **철회한** 부등식 `tracked_head < tracked_base`가 Task 7과 Acceptance 경로의 수용 사유로 그대로 남아 있다 — 정본 래칫(경로 집합 차)과 어긋난 stale 사양이다. | plan:487-489 '앞 라운드는 이것을 `tracked_head < tracked_base` 부등식으로 적었고 … 거짓이었다' vs plan:860 '그런데도 `tracked_head < tracked_base`가 걸려 2단계가 막는다' 와 plan:922 (e4) '`gate.js`가 `stage=2`로 차단하고 그 사유가 `tracked_head < tracked_base`다'. 구현자가 (e4)를 그대로 따르면 철회된 개수 비교를 다시 만들거나, 존재하지 않는 사유 문자열을 요구하게 된다. |
| architect | LOW | `--assert-accounted`의 조건 수가 DD2(셋)와 Task 2(넷)에서 어긋난다 — 게이트 판정식의 소유자가 둘로 갈린 형태다. | plan:225 '게이트 플래그는 `--assert-accounted`이고 조건은 **셋의 논리곱**이다' vs plan:605-607 '`--assert-accounted`(DD2의 **3조건 논리곱** — … 그리고 `tracked >= floor`' — 후자는 실질 4조건이다. |
| security | LOW | DD9 declares a `workflow_dispatch` degradation path (`base=absent` → static floor only), but the only gate invocation the plan writes hardcodes `--base-ref origin/${{ github.base_ref }}` with no `\|\| 'main'` fallback, unlike the precedent it mirrors. If that dispatch path is ever wired, `github.base_ref` is empty and the flag expands to `--base-ref origin/`, which is present-but-unresolvable — Task 2b's fail-closed six turns that into a hard red, not the documented `base=absent` static-floor path. The declared degraded mode is unreachable as specified. | plan L796 `--base-ref origin/${{ github.base_ref }}` vs plan L501-503 ("`workflow_dispatch`에는 base가 없고, 그때는 출력이 `base=absent`를 싣고 정적 floor로만 판정한다") and the mirrored precedent `.github/workflows/version-declaration-gate.yml:60,68` which uses `${{ github.base_ref \|\| 'main' }}`. |
| test | HIGH | 축 D-B(삭제 래칫)의 수용 증거와 로컬 왕복 검사가 판별력을 갖지 못한다 — `stage=2`는 삭제 래칫과 커버리지 실패를 구분하지 못하는데, 계획은 그 stage 번호 하나만 단언한다. 이는 R7/R8이 축 A에서 이미 흡수한 결함("비영점만 보면 다른 이유로 죽은 것과 구분 안 된다")의 삭제 축 재현이다. | plan `## Validation` 4b L1032: `if (j.stage !== 2) { console.error("FAIL: stage="+j.stage+" — 삭제 래칫이 아니라 다른 이유로 죽었다") }` — stage 번호 외 어떤 사유도 검사하지 않는다. 그런데 DD3 판정표 L297은 stage 2를 `computeCoverage(...).ok` 실패로 정의하고 DD9 L484는 삭제 차단도 "2단계에서 차단"이라 적는다. 즉 unexplained·max_excluded_files·digest 불일치 어느 것으로 죽어도 같은 stage 2가 나오고, 메시지가 주장하는 판별은 성립하지 않는다. Success Metric 4를 닫는 것이 B라고 계획 스스로 적는다(L55, L861). |
| test | HIGH | Task 7 (e4)와 DD5 B 서술이 DD9가 **거짓이라고 철회한** 판정식을 여전히 수용 조건으로 인용한다 — 게이트가 계산하지 않는 조건을 CI 증거로 요구하므로 그 Acceptance 항목은 기록될 수 없거나, 기록되면 거짓이다. | DD9 L487-489: "앞 라운드는 이것을 `tracked_head < tracked_base` 부등식으로 적었고 … **거짓이었다**" → 판정을 `missing = base_set \\ head_set` 경로 집합 차로 교체. 그런데 Task 7 B 근거 L860("그런데도 `tracked_head < tracked_base`가 걸려 2단계가 막는다")과 Task 7 Validate (e4) L921-922("`stage=2`로 차단하고 **그 사유가 `tracked_head < tracked_base`**다")가 그 부등식을 그대로 들고 있다. Acceptance 3-B(L1226-1227)가 이 (e4)를 증거로 지목한다. |
| test | MEDIUM | DD4의 fork-PR 방어 항목(최소 권한 · `persist-credentials:false` · `actions/*` SHA pin · `pull_request_target` 미사용)은 Risks 표의 mitigation으로 load-bearing인데 **어떤 test도 그것을 단언하지 않는다** — `paths` 부재는 오라클이 단언하면서 같은 파일의 같은 성질인 이 넷은 빠졌고, 라이브 green 완주도 그 소실을 볼 수 없다. | DD4 L341-343이 넷을 못박고 Risks L1199가 그것을 유일 mitigation으로 든다. 그러나 Task 7의 `wiring-cut.test.js` 단언 집합은 L886-899의 셋뿐(판정 줄 토큰 · `fetch-depth:0`+base fetch · 앞 두 단계 · `paths` 부재)이고, (f) 합성 fixture 목록 L926-929에도 permissions/pin/`pull_request_target` 분기가 0건이다. 오라클이 이미 그 YAML을 파싱하므로 사거리 밖이라는 사유도 없다. |
| test | MEDIUM | `## Validation` 7b는 로컬(Windows)에서 통과할 수 없는 검사인데 형제 검사와 달리 허용 분기가 없다 — 계획 스스로 Windows 전용 red의 존재 가능성을 사전 규칙으로 등재한다. | L1058-1061의 `gate.js` 호출에는 `\|\| note` 완화가 없고, DD3 1단계가 `exit_code === 0`(스위트 green)을 요구한다(L296). 반면 DD8 L527-529는 "Windows 전용 red가 **1건 이상**이면" 분기를 사전 선언해 Windows 로컬 red를 가능한 상태로 둔다(Task 6). 바로 위 검사 7은 같은 상황을 `\|\| echo "note: …"`로 허용한다(L1050-1051) — 비대칭이며, 7b를 통과시키는 유일한 로컬 경로는 Windows red 격리이고 그것은 Task 6이 측정 후에 결정할 사항이다. |
| test | LOW | Task 4의 가드는 `main()` 안의 플래그 파싱 지점에 놓이는데 `main`/`parseArgv`가 export되지 않아 seam이 spawn뿐이다 — Task 2b가 같은 문제에 대해 `spawnSync` seam을 명시한 것과 달리 Task 4 Validate는 seam을 지목하지 않아, 순수 호출로 단언하면 가드가 배선되지 않아도 green일 수 있다. | `scripts/test-suite/run.js:728-747` module.exports에 `main`·`parseArgv` 없음. Task 4 Action L730 "`--allow-codex` 플래그 파싱 지점", Validate L742-745는 `node --test scripts/tests/test-suite.test.js`만 지목. 대조: Task 2b L695-699가 "이 분기들은 `child_process.spawnSync`로 **CLI를 실제로 띄워**"를 명시한다. |
| invariant | HIGH | DD2/DD7이 CRITICAL로 흡수한 '한 줄로 게이트가 열린다'를 막는 상수 `max_excluded_files`(그리고 DD9의 `tracked` floor)의 **초기값 자체가 어떤 기계에도 pin되지 않는다**. 두 상수의 짝 단언이 모두 한 방향(>= / <=)이라, 구현자가 `max_excluded_files: 368`·`tracked: 0`으로 파일을 만들어도 게이트 조건(`excluded.length <= max_excluded_files`, `tracked >= floor`)과 test가 **전부 green**이다. DD7이 '앞의 둘은 현재 값과 같게 시작한다'(plan:421)고 적은 것은 산문뿐이며, 같은 계획이 자기 항목 수 상한에는 **등가 단언**('상한 상수와 파일 항목 수 일치 단언', plan:717)을 걸어 놓아 비대칭이 드러난다. 즉 R2가 닫았다고 적은 CRITICAL 경로가 상수 헤드룸으로 되열린다 — 게이트 모양은 남고 막는 것만 사라지는, DD9가 floor slack에 대해 스스로 서술한 그 실패 모드가 `max_excluded_files` 축에는 처방 없이 남아 있다(base 대조 래칫은 삭제 축만 덮고 격리 축은 안 덮는다). | plan 719-724: "`.github/test-suite-floor.json`의 `tracked` floor가 그 시점 tracked 개수 **이하**이고, `max_excluded_files`가 격리 목록의 실제 확장 파일 수 **이상**이다 … 둘 다 **한 방향**인 것이 의도다" vs plan:421 "앞의 둘은 임의 숫자를 피해 **현재 값과 같게** 시작한다"(산문) / plan:228-233(한 줄 glob이 전 파일을 excluded로 만드는 경로) / plan:717(항목 수 상한은 등가 단언) |
| invariant | MEDIUM | 축 D 절단 B의 **수용 오라클이 이 계획이 명시적으로 폐기한 부등식을 요구**한다. DD9는 `tracked_head < tracked_base` 부등식을 '거짓이었다'며 경로 집합 차(`missing = base_set − head_set`)로 교체했고, Task 2b (k)는 그 부등식으로의 회귀가 **붉어져야 한다**고 단언을 못박는다. 그런데 Task 7 (e4)와 Acceptance 3-B의 근거 서술은 여전히 `tracked_head < tracked_base`를 게이트의 차단 사유로 요구한다. 구현자가 (e4)를 문자 그대로 만족시키려면 (k)가 red로 잡도록 설계된 구현으로 되돌아가야 한다 — 증거 요건과 회귀 가드가 서로를 부정한다. | plan:922 "`gate.js`가 `stage=2`로 차단하고 그 사유가 `tracked_head < tracked_base`다" · plan:860 동일 문구 vs plan:487-489 "앞 라운드는 이것을 `tracked_head < tracked_base` 부등식으로 적었고 그때 함께 적은 …는 **거짓이었다**" · plan:689-690 "삭제 1건 + 추가 1건 → 여전히 차단(개수 비교였다면 통과했을 구성이다 … 이 분기가 그 부등식으로의 회귀를 붉게 만든다)" |
| invariant | MEDIUM | DD7의 핵심 통제('게이트가 **그 경로만** 읽는다')가 어떤 단언에도 배선되지 않았다. 절단 오라클은 판정 줄 안에서 토큰 `--exclude-from`의 **존재**만 확인하고 그 **값**이 `.github/test-suite-exclusions.json`인지는 단언하지 않는다. 같은 PR에서 인자 값을 다른 경로(리뷰 표면이 좁은 파일)로 바꾸면 격리 목록의 정본성이 사라지는데 오라클·단위 test·CI 어느 것도 붉어지지 않는다 — 이 계획이 반복해 경계한 '텍스트는 남고 배선이 바뀐다' 형태다. | plan:886-887 "그 `run:` 줄 **안에** `gate.js` · `--measurement` · `--exclude-from` · `--floor-from` · `--base-ref`가 전부 있다"(값 단언 없음) vs plan:418-419 "격리 목록을 `.github/test-suite-exclusions.json` 한 파일에 두고 게이트가 **그 경로만** 읽는다"; plan:926-929의 합성 fixture 목록도 '인자를 지운 YAML'만 열거하고 '값을 바꾼 YAML'이 없다 |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | plan 전문과 PRD를 읽고, 인용된 소스를 직접 확인했다: run.js:214(`per_file: ok ? perFile : null`) · :269/:302-305(files_total 검증) · :577-580(files_total·exclusions_digest 실재) · :666-679(--exclude-from 로드가 --list보다 앞이라 Task 3 재배선 단언이 성립) · :725(`return result.ok ? 0 : 1`) — 이 인용들은 plan이 주장하는 대로였다. 다음을 깨보려 했으나 실패했다: (a) DD9 base 대조가 base tip을 쓰므로 뒤처진 브랜치가 영구 red가 되는가 — `pull_request`는 merge ref를 체크아웃하므로 base의 신규 추가가 head 집합에 들어와 성립하지 않았다; (b) DD7 재배선이 `--list` 경로를 비껴가는가 — exclusions 로드가 list 분기보다 앞이라 성립; (c) Task 4 가드를 childEnv에서 플래그 파싱으로 옮긴 것이 가드를 약화시키는가 — 막으려는 지점과 같은 자리라 성립하지 않음; (d) 절단 A의 순환성 — 심는 것이 신호이고 stage 1이 판별자라 유효. 깨진 것은 stage 번호를 판별자로 삼는 절단 B 쪽(HIGH)과 철회된 부등식의 잔존(MEDIUM), 조건 수 드리프트(LOW)였다. |
| security | pass | Attacked (1) fork-PR ACE/token surface for a merge-blocking `pull_request` workflow with no paths filter — DD4 pins `contents: read`, `persist-credentials: false`, SHA-pinned actions, no `pull_request_target`, no secrets; residual widened *frequency* of artifact exposure is explicitly self-corrected at plan L347-350, not hidden. (2) Gate forgery / self-judging tree (measurement JSON, ratchet constants, and judge modules all PR-controlled) — landed nothing new: DD4a enumerates exactly this, including `git_sha`/`ci_run_id` not being compared to HEAD (verified `run.js:575-576`) and `redaction_ok` being post-publication detection. (3) Coverage-gate bypass via a single `**/*.test.js` exclusion — closed by `max_excluded_files` on expanded file count (`enumerate.js` globToRegExp confirmed to expand `**` across separators) plus digest anchoring. (4) Deletion ratchet bypass by add/delete offset, rename, or untracking — path-set difference `base_set \\\\ head_set` is insensitive to additions and catches renames; `--apply-delete` is specified as `git rm` so the index (what `git ls-files` reads) actually changes. (5) `allow_deletions` as a forged-approval field — it is path-scoped, self-expiring after merge, and its tracked-file edit is the same review surface DD7/DD4a already concede. (6) Leakage into durable artifacts — Task 9 merges a CI measurement into git-tracked `.claude/_meta/data/2026-09-01-suite-baseline.json`, but `--merge-into` rejects `redaction_ok !== true` (`run.js:321-326` cited, `validateElement` verified) and `redact.js:163-168` covers `/home/runner` and `file://` shapes, so the cwd-leak precedent is not reopened on a new field. (7) `--allow-codex` guard relocation to the flag-parse point — verified `run.js:655-664` is the sole CLI entry for both the normal and `--merge-into` paths, and `childEnv` (`:450-459`) is the seam the two existing tests call directly, so the move is not a weakening. (8) Untrusted `${{ }}` interpolation into `run:` — only `github.base_ref` is used, which is not attacker-controllable in a fork PR. Only the LOW inconsistency above survived. |
| test | fail | 플랜이 인용한 소스를 직접 대조했다: `run.js:179-183`(foldChunks가 `null` exit_code를 0으로 접음), `:206-219`·`:213-214`(`per_file: ok ? perFile : null` + 주석), `:568-604`(`exclusions_digest`·`files_total`·`redaction_ok` 실재), `:666-679`(`--list`가 `enumerated.included` 출력), `:725`(`return result.ok ? 0 : 1`), `:728-747`(export 목록). DD2·DD3·DD9의 사실 주장은 전부 소스와 일치했고, `exclusions_digest`가 실제 producer 산출물에 존재하므로 Task 2 (9) 분기는 합성 fixture 함정이 아니다. Task 2b (g)의 `ok:false ∧ exit_code:0` 조합도 foldChunks로 실재함을 확인했다. 반증을 시도했으나 반박에 실패한 축: 분모 채널 gate-경로 짝 단언(i), (k)의 삭제+추가 상쇄 분기, 주석/범위 위양성 짝 단언(f2)(e), `--apply-delete`의 index 반영 요구. 결함을 찾은 축: 축 D-B의 stage 판별력, 철회된 부등식이 Acceptance 증거로 남은 drift, DD4 방어 넷의 무-단언, 7b의 로컬 만족 불가, Task 4 seam 미지정. |
| invariant | fail | DD3의 4단계 판정 순서를 unknown 입력으로 공격했다(measurement 키 부재·`ok:false ∧ exit_code:0` 접힘·`per_file: null` — 전부 fail-closed로 덮여 있어 통과 못 시킴). gate.js의 fail-closed 여섯과 Validation 4b의 판별력(stage 번호 단언, `--base-ref HEAD` 해소, gate가 JSON을 못 쓰면 `require` throw로 loud 실패)을 추적했고 fail-open 분기를 못 찾았다. DD9 base 대조의 상쇄(삭제 1 + 추가 1)·`allow_deletions` 면제 소진·`workflow_dispatch`에 base 부재 경로도 봤고 전부 처방이 있다. `exclusions_digest` 앵커링, Task 4 가드 위치 이동, wiring-cut 복원의 `git status --porcelain` 왕복, DD4a의 위조 축 미폐쇄 명시 기록도 확인했다 — 이들은 방어 가능하다. 실제로 열리는 것을 찾은 곳은 셋이다: 래칫 **상수 초기값**이 한 방향 단언뿐이라 헤드룸으로 게이트가 열리는 축, 절단 B 수용 오라클이 폐기된 부등식을 요구해 회귀 가드와 충돌하는 축, `--exclude-from` **값**이 어디에도 단언되지 않아 DD7의 '그 경로만' 통제가 산문으로만 존재하는 축. |

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
  "wall_clock_ms": 201575,
  "halt_stage": "5.2e",
  "backlog_appended": null,
  "backlog_skipped_nonblocking": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:68b4d2255d54816dc6de381c3c09b8c699c7ff73e1282cc224fe859f9669f6f0",
  "plan_path": ".claude/plans/ci-full-suite-m3h.plan.md",
  "recorded_at": "2026-09-04T03:07:58.619Z"
}
```
