# Plan: Codex 비활성 정책의 라운드 불변성 (M1)

**Source PRD**: `.claude/prds/codex-disabled-round-invariant.prd.md`
**Selected Milestone**: 1 — 정책이 라운드 불변이 된다
**Complexity**: Medium

## Summary

`MCCP_CODEX_DISABLED`를 게이트 진입 시 저장소 단위 아티팩트에 봉인하고, **Codex 호출의 유일한 chokepoint인 `codex-invoke.js`가 그 봉인을 읽는다.** 라운드가 몇 번 돌든, 그 라운드를 무엇이 개시하든, spawn 직전 판정이 `봉인 OR env`이므로 실행 중 env를 지워도 Codex는 호출되지 않는다. 세 게이트가 공유하는 `effectiveRoundCap`의 캡 pin은 그 위에 얹는 **2차 방어**이고, 명령 본문의 해제 금지 조항은 3차다. 정책이 꺼져 있으면 기존 경로는 한 글자도 바뀌지 않는다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 작업은 새 worktree에서 진행한다 | direction |
| UI2 | 수정 축은 기계적 cap pin, 명령 본문 해제 금지 가드, 문서 어휘 정정, 회귀 test 네 가지를 모두 포함한다 | direction |
| UI3 | 정책은 게이트 진입 시 아티팩트로 봉인하고 이후 라운드는 env가 아니라 그 봉인을 읽는다 | constraint |
| UI4 | plan 과 prp-implement 와 pr 세 게이트 전부에 적용한다 | constraint |
| UI5 | Codex 사용량이 부족한 상태이므로 이 작업 자체가 Codex를 호출해서는 안 된다 | constraint |
| UI6 | 고쳐야 할 대상은 R1에는 적용되고 R2에서 무시되는 비대칭이다 | direction |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 모듈 형태 | `plugins/mccp/scripts/lib/review-single-pass.js:1-35` | use strict, 왜 존재하는지 적은 헤더 주석, Object.freeze 상수, 순수 파서 함수, 말미 module.exports 객체 리터럴 |
| env 판독 | `plugins/mccp/scripts/lib/env-contract/value.js:86-96` | 인라인 문자열 비교 금지. 항상 envValue.parseBool(env, NAME) — kind와 default는 registry가 소유 |
| spawn 직전 short-circuit | `plugins/mccp/scripts/lib/codex-invoke.js:207-226` | 정책 판정은 registry 해소와 spawn보다 앞에서 끝낸다. 반환은 ok:true, classification:disabled, blocking:false, advisory:false |
| 오라클 순수성 | `plugins/mccp/scripts/lib/review-single-pass.js:5-7` | 판정 함수는 process.env를 직접 읽지 않고 주입받는다. 주입 가능해야 단위 test로 경계를 고정할 수 있다 |
| 아티팩트 봉인 + 읽기 되돌림 | `plugins/mccp/commands/plan.md:2144-2152` | write 후 즉시 read-back, 불일치면 fail-closed. "0을 반환했지만 빈 파일이 남는" 실패 모드는 exit code만으로 못 잡는다 |
| 지우고-쓰기 순서 | `plugins/mccp/commands/plan.md` 5.2e (proof.json rm -f 후 write) | 먼저 지우고 그 다음에 쓴다. 나중에 지우면 unlink 실패 시 stale 산출물이 살아남아 다음 소비자가 읽는다 |
| worktree-safe git dir | `plugins/mccp/commands/prp-implement.md:220` | git rev-parse --git-dir. worktree에서 .git은 파일이라 하드코딩하면 깨진다 |
| 불량값 실패 방향 | `plugins/mccp/scripts/lib/review-single-pass.js:9-14` | parseSinglePass는 fail-closed(오타가 게이트를 열면 안 됨), parseRoundCap은 fail-open(오타가 라운드를 무한히 열면 안 됨) |
| 단위 test | `plugins/mccp/scripts/lib/tests/review-single-pass.test.js:1-40` | node:test + withCapturedStderr / captureExit 헬퍼 |
| 명령 본문 정적 test | `plugins/mccp/scripts/lib/tests/review-single-pass-command-body.test.js:26-40` | bashBlocks()로 fenced bash 블록만 스캔. 산문의 같은 토큰을 배선으로 오인하지 않는다 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/codex-policy.js` | CREATE | 봉인·판독 오라클 + seal/read/clear CLI. spawn 없는 git-dir 해소 포함 |
| `plugins/mccp/scripts/lib/codex-invoke.js` | UPDATE | 1차 방어 — spawn 직전 short-circuit이 env 단독이 아니라 봉인 OR env를 본다 |
| `plugins/mccp/scripts/lib/review-single-pass.js` | UPDATE | 2차 방어 — effectiveRoundCap이 codex-disabled 축을 알게 한다 |
| `plugins/mccp/commands/plan.md` | UPDATE | 5.0 진입 봉인, 5.4 캡 판독에 정책 주입, 해제 금지 조항 |
| `plugins/mccp/commands/prp-implement.md` | UPDATE | 2.5 진입 봉인, 2.5.4 캡 판독, 해제 금지 조항 |
| `plugins/mccp/commands/pr.md` | UPDATE | Phase 0 봉인, 캡 판독, 해제 금지 조항 + 하드코딩된 MCCP_GATE_ROUND_CAP 산문을 오라클 참조로 교정 |
| `plugins/mccp/scripts/lib/tests/codex-policy.test.js` | CREATE | 봉인 오라클 회귀 test |
| `plugins/mccp/scripts/lib/tests/codex-invoke.test.js` | UPDATE | 봉인 기반 short-circuit 회귀 test (이 버그의 핵심 회귀) |
| `plugins/mccp/scripts/lib/tests/review-single-pass.test.js` | UPDATE | 캡 pin 회귀 test (정책 on/off 양쪽) |
| `plugins/mccp/scripts/lib/tests/review-single-pass-command-body.test.js` | UPDATE | 세 본문의 배선 + 해제 금지 조항 존재 정적 단언 |
| `docs/environment/gates.md` | UPDATE | MCCP_CODEX_DISABLED 절의 1회성 보일러플레이트를 영구 정책 문언으로 교체 + 봉인 계약 서술 |
| `CLAUDE.md` | UPDATE | 3.3 복구 목록에 "이 플래그는 1회성이 아니며 게이트가 해제하지 않는다" 명시 |
| `CHANGELOG.md` | UPDATE | 릴리스 행 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version bump |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 |

## Design Decisions

**DD1 — 1차 방어는 `codex-invoke.js`이지 라운드 캡이 아니다 (R1 invariant CRITICAL 흡수).** 초안은 `effectiveRoundCap`의 캡 pin을 주 방어로 삼았다. 그것은 틀렸다 — 캡을 읽는 블록이 `plugins/mccp/commands/plan.md` 5.4의 escalation 산문 **안**에 있어서, LLM이 그 블록을 실행해야만 캡이 걸린다. 즉 A축도 결국 산문 의존이고, 그것은 이 PRD가 닫으려는 실패와 **같은 계열**이다. 진짜 chokepoint는 `plugins/mccp/scripts/lib/codex-invoke.js:213`이다 — 세 게이트의 모든 Codex 호출이 예외 없이 이 함수를 지나며, 즉흥으로 구성된 R2 호출도 지난다. 그래서 정책 판정을 그 지점으로 옮긴다. 캡 pin은 폐기하지 않고 2차 방어로 남긴다(라운드를 여는 비용 자체를 없앤다).

**DD2 — 봉인 키는 저장소 단위 단일 파일이다.** `MCCP_CODEX_DISABLED`는 env 수준 운영자 정책이지 decision 수준 사실이 아니므로 gate와 decision으로 키잉하는 것은 과잉이었고, 무엇보다 `codex-invoke.js`는 gate id도 decision slug도 인자로 받지 않는다. 경로는 `<git-dir>/mccp/tmp/codex-policy.json` 하나다. `.claude/state/plan-review/`가 아닌 이유는 둘이다. (a) `plugins/mccp/commands/plan.md` 5.2 진입이 그 디렉토리를 통째로 purge하므로 5.0에서 쓴 봉인이 5.4에 도달하지 못한다. (b) `.gitignore`는 `.claude/state/` 아래를 경로별로 무시하므로 새 디렉토리는 기본 git-tracked가 되어 런타임 산출물이 커밋 대상이 된다. git-dir은 세 게이트가 이미 쓰는 위치이고 worktree-safe이며 워크트리 밖이라 어떤 diff에도 나타나지 않는다. gitignore 변경 0건.

**DD3 — 판정은 OR이지 precedence가 아니다.** `resolveCodexDisabled = sealedDisabled || envDisabled`. precedence(봉인 우선)를 쓰면 실행 중 env를 켜서 Codex를 끄는 정상 조작이 무시된다. OR은 단조롭다 — 한 번 봉인된 disabled는 env를 지워도 되살아나지 않고(이번 버그가 닫히는 지점), 실행 중 env를 켜면 즉시 적용된다(비용이 줄어드는 방향). 봉인 부재는 env 단독으로 떨어지므로 봉인을 못 쓴 환경에서도 오늘보다 나빠지지 않는다 — PRD Open Question 1의 답이며 `parseRoundCap`의 fail-open 얼굴을 따른다. 여기서 fail-closed(봉인 부재를 disabled로 간주)를 택하면 이 플래그를 쓴 적 없는 다수 사용자의 Codex가 조용히 꺼진다.

**DD4 — 보장의 경계는 "1회 게이트 실행"이다 (R1 architect HIGH 흡수).** 봉인이 막는 것은 한 번의 게이트 실행 안에서 env가 바뀌는 것이다. 게이트를 다시 호출하면 진입 시 봉인이 새 env로 덮어써지고 그것이 옳다 — 운영자가 `MCCP_CODEX_DISABLED`를 끄고 게이트를 다시 돌렸다면 정책을 바꾼 것이지 우회한 것이 아니다. 이 구분을 적어 두지 않으면 "봉인이 영구 lock"이라는 잘못된 기대가 생기고, 그 기대는 stale 봉인을 버그가 아니라 사양으로 만든다. 호출 경계를 넘는 lock이 필요하면 그것은 별도 기능(운영자 명시 lock)이지 이 PRD가 아니다.

**DD5 — 봉인에는 나이 상한 6시간이 있고 상수는 export된다.** stale true 봉인이 OR을 통해 Codex를 영원히 끄는 것을 막는다. 게이트 1회 실행은 6시간을 넘지 않는다(codex 타임아웃 900s, 게이트 deadline 1200~2400s)므로 그보다 오래된 봉인은 부재로 취급한다. 임의 knob이 아니라 게이트 최장 실행 시간에서 나온 상한이고, env 축은 그대로 살아 있으므로 이 판정이 정책을 잃게 만들지 않는다. **상수 `MAX_SEAL_AGE_MS`는 module.exports에 실려 test가 그 값을 직접 단언한다** — 산문에만 있는 상한은 검증할 대상이 없다(R1 invariant HIGH 흡수). 운영자의 명시 탈출구는 새 env 토글이 아니라 `codex-policy.js clear` 서브커맨드다(토글은 registry와 문서와 lint 계약을 늘리는 반면 서브커맨드는 늘리지 않는다).

**DD6 — `readPolicy`는 부재와 만료와 판독불가를 구분해 보고한다 (R1 invariant HIGH 흡수).** 셋을 같은 `{found:false}`로 접으면 "정책이 조용히 강등됐다"를 운영자가 관측할 수 없다. 반환은 `{ found, codexDisabled, reason, ageMs }`이고 `reason`은 `ok` 또는 `absent` 또는 `expired` 또는 `unreadable`이다. 판정(`resolveCodexDisabled`)은 셋을 동일 취급하지만(전부 env fallback) 기록은 구분한다 — 판정과 진단은 다른 축이다.

**DD7 — `pinned`와 `reason`의 의미는 보존하고 축을 새 필드로 나눈다.** 기존 세 본문의 stderr 한 줄은 `pinned to N by MCCP_REVIEW_SINGLE_PASS=` + reason 을 찍는다. codex 축이 reason을 채우면 그 줄이 거짓말을 한다. 그래서 reason은 single-pass 사유 전용으로 두고(없으면 null), 어느 축이 pin했는지는 `pinnedBy`(single-pass / codex-disabled / single-pass+codex-disabled)가, 사람이 읽을 문장은 `note`가 나른다. 셸은 note를 그대로 출력만 하므로 문구가 코드 한 곳에 산다.

**DD8 — 주입 기본값은 env다.** `effectiveRoundCap(env)` 단독 호출은 env에서 codex-disabled를 직접 읽어 호출부 수정 없이도 절반은 고쳐진다. 봉인을 주입한 호출만이 env 변조에 면역이다. 이 분리가 있어야 배선을 빠뜨린 게이트가 조용히 옛 동작으로 남지 않는다.

**DD9 — 세 층이 주장하는 것이 서로 다르다.** 1차(`codex-invoke.js`)는 기계다: 어떤 호출자든 spawn을 못 한다. 2차(캡 pin)는 게이트가 캡 블록을 실행할 때만 걸리는 부분 기계다. 3차(산문 금지조항)는 강제되지 않는다 — `CLAUDE.md` 3.15와 memory `round-cap-is-prose-not-enforced`의 실측대로다. 정적 test는 3차 조항의 존재만 고정하고 이행은 주장하지 않는다. 이 세 문장을 구분해 적는 것이 이 계획의 정직성 조건이다.

## Tasks

### Task 1: codex-policy.js 봉인 오라클

- **Action**: `plugins/mccp/scripts/lib/codex-policy.js` 신설.
  - `resolveGitDir(startDir)` — spawn 없이 위로 올라가며 `.git`을 찾는다. 디렉토리면 그 경로, 파일이면 `gitdir:` 한 줄을 읽어 그 경로(worktree). `codex-invoke.js`가 매 호출마다 git을 spawn하면 안 되므로 순수 fs이고 프로세스 단위로 캐시한다. 못 찾으면 null.
  - `sealPolicy({ gitDir, env, now })` — 기존 파일을 먼저 unlink하고 `{ codex_disabled, sealed_at }`를 `<gitDir>/mccp/tmp/codex-policy.json`에 write, 즉시 read-back, 불일치면 throw.
  - `readPolicy({ gitDir, now })` → `{ found, codexDisabled, reason, ageMs }` (DD6).
  - `resolveCodexDisabled({ gitDir, env, now })` → boolean (DD3의 OR). gitDir이 null이면 env 단독.
  - `clearPolicy({ gitDir })` — 봉인 삭제(운영자 명시 탈출구, DD5).
  - `MAX_SEAL_AGE_MS`를 export 한다(DD5).
  - env는 반드시 `env-contract/value#parseBool`로 읽는다.
  - CLI: `seal`(성공과 실패 모두 exit 0 — 봉인 실패가 게이트를 막아서는 안 된다. 실패 시 안정 prefix `[mccp:codex-policy] SEAL FAILED:` 로 loud stderr) · `read`(JSON stdout) · `clear`.
- **Mirror**: 모듈 형태는 `plugins/mccp/scripts/lib/review-single-pass.js:1-35`, env 판독은 `plugins/mccp/scripts/lib/env-contract/value.js:86-96`, write+read-back은 `plugins/mccp/commands/plan.md:2144-2152`, 지우고-쓰기 순서는 `plugins/mccp/commands/plan.md` 5.2e.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/codex-policy.test.js`

### Task 2: codex-invoke.js — 1차 방어 (DD1)

- **Action**: `plugins/mccp/scripts/lib/codex-invoke.js:213`의 `envValue.parseBool(env, 'MCCP_CODEX_DISABLED')` 단독 판정을 `codex-policy#resolveCodexDisabled({ gitDir, env })`로 바꾼다. 반환 형태와 classification과 blocking과 advisory는 무변경(ok:true, classification:disabled, blocking:false, advisory:false) — 하류 14종 classification 계약과 receipt stamp 경로가 그대로 살아야 한다.
  - `opts.gitDir` 주입을 허용하고(test 격리), 미주입 시 `resolveGitDir(process.cwd())`.
  - fail-open: `codex-policy` require 실패와 판독 실패는 env 단독으로 강등하고 loud stderr. 정책 모듈이 깨져서 Codex 호출이 막히면 안 된다.
  - 판정이 봉인에서 왔는지 env에서 왔는지를 stderr 한 줄로 남긴다(DD6의 진단 축).
- **Mirror**: `plugins/mccp/scripts/lib/codex-invoke.js:207-226`의 spawn-직전 short-circuit 구조를 그대로 유지하고 조건식만 교체.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/codex-invoke.test.js`

### Task 3: effectiveRoundCap — 2차 방어

- **Action**: `plugins/mccp/scripts/lib/review-single-pass.js`에 `ENV_CODEX_DISABLED = 'MCCP_CODEX_DISABLED'` 상수 추가. `effectiveRoundCap(env, opts)`가 `opts.codexDisabled`(불리언, 미주입 시 `envValue.parseBool(env, ENV_CODEX_DISABLED)`)를 읽어 참이면 `cap = MIN_ROUND_CAP`. 반환에 `pinnedBy`와 `note` 추가(DD7). `reason` 의미 무변경. `parseSinglePass`와 `parseRoundCap`은 무변경. 헤더 주석에 근거를 적는다 — "Codex가 꺼진 상태에서 라운드 2가 물을 리뷰어는 없다. 캡이 1보다 큰 것은 knob이 아니라 모순이다. 다만 이 층은 캡 블록이 실행될 때만 걸리므로 2차 방어다(DD1)."
- **Mirror**: 기존 `effectiveRoundCap`의 pin 논증 구조(정책이 상위, 캡이 하위 조정값)를 그대로 확장.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/review-single-pass.test.js`

### Task 4: 세 명령 본문 배선 + 해제 금지 조항 — 3차 방어

- **Action**:
  - 각 게이트 진입부(`plugins/mccp/commands/plan.md` 5.0 머리, `plugins/mccp/commands/prp-implement.md` 2.5 머리, `plugins/mccp/commands/pr.md` Phase 0)에 봉인 블록 추가. `seal`은 스스로 git-dir을 해소하고 실패해도 exit 0이므로 게이트를 막지 않는다.

    ```bash
    node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-policy.js" seal 1>&2
    ```

  - 각 캡 판독 블록(`plugins/mccp/commands/plan.md:2202-2207`, `plugins/mccp/commands/prp-implement.md:324-329`, `plugins/mccp/commands/pr.md:556-561`)을 아래 형태로 교체한다. R1 invariant CRITICAL 흡수 — 배선을 산문으로만 두지 않는다.

    ```bash
    ROUND_CAP_JSON=$(node -e '
      const root = process.argv[1];
      const policy = require(root + "/scripts/lib/codex-policy");
      const { effectiveRoundCap } = require(root + "/scripts/lib/review-single-pass");
      const gitDir = policy.resolveGitDir(process.cwd());
      const codexDisabled = policy.resolveCodexDisabled({ gitDir: gitDir, env: process.env });
      process.stdout.write(JSON.stringify(effectiveRoundCap(process.env, { codexDisabled: codexDisabled })));
    ' "${CLAUDE_PLUGIN_ROOT}")
    ROUND_CAP=$(node -e 'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync(0,"utf8")).cap))}catch{process.stdout.write("1")}' <<<"$ROUND_CAP_JSON")
    node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));if(j.note)process.stderr.write("[mccp:round-cap] "+j.note+"\n")}catch(_){}' <<<"$ROUND_CAP_JSON"
    ```

    `plugins/mccp/commands/pr.md`는 이 값을 지금처럼 `export MCCP_GATE_ROUND_CAP=`로 자식 프로세스에 넘긴다(그 게이트의 기계적 강제는 무변경).
  - 각 escalation 산문(`plugins/mccp/commands/plan.md:2196`, `plugins/mccp/commands/prp-implement.md:316`, `plugins/mccp/commands/pr.md:634`) 바로 뒤에 삽입한다.

    > **Codex가 비활성이면 R2는 존재하지 않는다.** 캡이 1로 pin되어 있고, 설령 그 캡을 지나쳐 호출하더라도 `codex-invoke.js`가 spawn 직전에 `disabled`로 short-circuit한다.
    >
    > **`MCCP_CODEX_DISABLED`는 1회성 escape가 아니라 영구 운영자 정책이다.** 게이트는 어떤 라운드에서도 이 변수를 해제하거나 override하거나 `0`으로 재설정하지 않는다. R1이 이를 소진하지 않는다.

  - `plugins/mccp/commands/pr.md:635`의 하드코딩된 `MCCP_GATE_ROUND_CAP` 산문을 `$ROUND_CAP`(오라클 산출) 참조로 교정.
- **Mirror**: worktree-safe git dir은 `plugins/mccp/commands/prp-implement.md:220`. fenced 블록 배치와 stderr 관례는 각 파일의 기존 캡 블록.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/review-single-pass-command-body.test.js`

### Task 5: 회귀 test

- **Action**:
  - `codex-policy.test.js` 신설 — 봉인 왕복 · read-back 불일치 throw · `MAX_SEAL_AGE_MS` 값 직접 단언(DD5) · 나이 초과는 reason expired · 부재는 reason absent · 파손 JSON은 reason unreadable · OR 판정 4조합 · gitDir이 null이면 env 단독 · `resolveGitDir`이 worktree의 `.git` 파일에서 gitdir 경로를 읽어낸다 · clear 후 부재 · CLI seal이 실패해도 exit 0이고 stderr에 안정 prefix가 남는다.
  - `codex-invoke.test.js` 확장 — 이 버그의 핵심 회귀: 봉인이 codex_disabled true이고 `env.MCCP_CODEX_DISABLED`가 `'0'`일 때 `invokeAdversarialReview`가 classification disabled와 blocking false와 advisory false를 반환하고 spawn이 일어나지 않는다(durationMs 거의 0). 그리고 봉인 부재 + env off이면 기존 경로 그대로. 정책 모듈 파손 시 env 단독 fail-open.
  - `review-single-pass.test.js` 확장 — 정책 on + `MCCP_GATE_ROUND_CAP=3` 이면 cap 1 / pinned true / pinnedBy codex-disabled / reason null, 정책 off면 기존 반환 무변경, 두 축 동시면 pinnedBy single-pass+codex-disabled, 주입값이 env를 이긴다.
  - `review-single-pass-command-body.test.js` 확장 — 세 본문 각각이 (i) fenced 블록에서 codex-policy를 seal하고 (ii) 같은 모듈로 resolveCodexDisabled를 읽어 effectiveRoundCap에 두 번째 인자를 넘기며 (iii) 해제 금지 문장을 포함함을 단언. 헤더에 DD9(3차 조항은 존재만 고정, 이행은 미주장)를 적는다.
- **Mirror**: `plugins/mccp/scripts/lib/tests/review-single-pass.test.js:1-40`의 node:test + 캡처 헬퍼, 정적 test의 bashBlocks() fenced-only 스캔.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/codex-policy.test.js plugins/mccp/scripts/lib/tests/codex-invoke.test.js plugins/mccp/scripts/lib/tests/review-single-pass.test.js plugins/mccp/scripts/lib/tests/review-single-pass-command-body.test.js`

### Task 6: 문서 어휘 정정

- **Action**: `docs/environment/gates.md`의 MCCP_CODEX_DISABLED 절에서 형제 1회성 escape들과 공유하던 "한 호출에만 적용하려면 셸에서 앞에 붙인다" 보일러플레이트를 제거하고, 이 토글이 영구 운영자 정책이며 게이트가 스스로 해제하지 않는다는 문언과 진짜 1회성 형제들과의 대비를 적는다. 봉인 계약(DD2와 DD4와 DD5)과 clear 서브커맨드도 여기서 서술한다. 사용 예시의 bash fence는 삭제하지 말고 정책 설정 예시로 교체한다(lint L7이 실행 가능한 예시를 요구). `CLAUDE.md` 3.3 복구 목록에도 같은 한 줄을 추가한다.
- **Mirror**: 같은 파일의 MCCP_ALLOW_CODEX_UNAVAILABLE 절이 이미 쓰는 "차이" 대비 문단 형식.
- **Validate**: `node plugins/mccp/scripts/lib/env-contract/lint.js` 와 `node plugins/mccp/scripts/lib/instruction-contract/lint.js --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md`

### Task 7: 버전 동기 4면

- **Action**: `plugin.json` version bump, `renderer/html.js` page-foot, `renderer/markdown.js` derived 줄, `CHANGELOG.md` 새 헤딩. 목표 번호는 PR 직전에 재계산한다(`CLAUDE.md` 3.7 forward-only, 실측 재발 4회). 현재 main 최대치는 1.32.2이고 미머지 sibling worktree가 1.32.3과 1.32.5와 1.33.0을 이미 선언했으므로 착지 후보는 1.32.6이다.
- **Mirror**: `CLAUDE.md` 3.7 "동기 대상 4면" 표.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`

## Validation

```bash
node --test plugins/mccp/scripts/lib/tests/codex-policy.test.js
node --test plugins/mccp/scripts/lib/tests/codex-invoke.test.js
node --test plugins/mccp/scripts/lib/tests/review-single-pass.test.js
node --test plugins/mccp/scripts/lib/tests/review-single-pass-command-body.test.js
node --test plugins/mccp/scripts/lib/tests/plan-review-command-body.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js
node plugins/mccp/scripts/lib/env-contract/lint.js
node plugins/mccp/scripts/lib/instruction-contract/lint.js --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md
```

라이브 경로 완주 — 단위 test로는 증명되지 않는 축. 네 케이스를 모두 돌린다(R1 invariant HIGH 흡수 — happy path 단독은 acceptance가 아니다).

```bash
# (1) 핵심 회귀 — 봉인 후 env를 지워도 Codex가 spawn되지 않는다
MCCP_CODEX_DISABLED=1 node plugins/mccp/scripts/lib/codex-policy.js seal
MCCP_CODEX_DISABLED=0 MCCP_GATE_ROUND_CAP=3 node -e '
  const p = require("./plugins/mccp/scripts/lib/codex-policy");
  const inv = require("./plugins/mccp/scripts/lib/codex-invoke");
  const { effectiveRoundCap } = require("./plugins/mccp/scripts/lib/review-single-pass");
  const gitDir = p.resolveGitDir(process.cwd());
  const disabled = p.resolveCodexDisabled({ gitDir: gitDir, env: process.env });
  const r = inv.invokeAdversarialReview("dogfood", { env: process.env });
  console.log(JSON.stringify({ disabled: disabled, classification: r.classification,
    blocking: r.blocking, cap: effectiveRoundCap(process.env, { codexDisabled: disabled }) }));
'
# 기대: disabled true, classification "disabled", blocking false, cap.cap 1, cap.pinnedBy "codex-disabled"

# (2) stale — 봉인을 6h 넘게 늙히면 부재로 떨어지고 env가 정책을 되찾는다
node -e 'const p=require("./plugins/mccp/scripts/lib/codex-policy");const g=p.resolveGitDir(process.cwd());
  console.log(JSON.stringify(p.readPolicy({gitDir:g, now: Date.now()+p.MAX_SEAL_AGE_MS+1000})));'
# 기대: found false, reason "expired"

# (3) 판독 불가 — 파손된 봉인은 unreadable로 보고되고 게이트를 막지 않는다
# (4) clear — 운영자 탈출구가 실제로 봉인을 지운다
node plugins/mccp/scripts/lib/codex-policy.js clear
node plugins/mccp/scripts/lib/codex-policy.js read
# 기대: found false, reason "absent"
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| codex-invoke.js 변경이 14종 classification 계약을 깨뜨린다 | 중간 | 반환 형태와 enum과 blocking/advisory를 무변경으로 두고 조건식만 교체(Task 2). 기존 codex-invoke.test.js 전건이 무수정으로 green이어야 한다 |
| 매 호출 git-dir 해소가 비용이 된다 | 낮음 | spawn 없는 fs 상향 탐색 + 프로세스 단위 캐시(Task 1). git rev-parse 호출 0건 |
| 정책 모듈 파손이 Codex 호출을 막는다 | 낮음 | Task 2의 fail-open — require 실패와 판독 실패는 env 단독으로 강등 + loud stderr |
| stale 봉인이 Codex 재활성 뒤에도 끈다 | 중간 | DD5의 6h 상한 + 진입마다 덮어쓰기 + clear 서브커맨드. env 축은 독립적으로 살아 있다 |
| 봉인 write 실패의 조용한 강등 | 중간 | 안정 prefix `[mccp:codex-policy] SEAL FAILED:` 로 loud stderr(Task 1). exit 0은 유지 — 봉인 실패로 게이트를 막으면 새 코드가 파이프라인 전체를 세운다. 실패 시 동작은 오늘과 동일(env 단독)이다 |
| 캡 pin이 Codex 라운드가 아닌 다른 루프까지 좁힌다 | 낮음 | effectiveRoundCap 소비처는 세 게이트의 Codex 라운드 3곳뿐임이 실측됨(`plugins/mccp/commands/plan.md:2203`, `plugins/mccp/commands/prp-implement.md:325`, `plugins/mccp/commands/pr.md:557`). 패널 캡과 MCCP_SANTA_ROUND_CAP은 별도 축 |
| 정책 off 사용자에게 회귀 | 낮음 | 봉인 부재 + env off이면 resolveCodexDisabled가 false라 모든 경로가 기존 그대로. 기존 test 전건을 무수정으로 통과시키는 것이 acceptance |
| 3차(산문) 조항이 지켜지지 않는다 | 중간 | DD9대로 강제되지 않음을 명시. 1차가 기계이므로 이 층의 불이행이 정책을 깨뜨리지 않는다 |
| 이 사이클 자체가 Codex 리뷰를 못 받는다 (UI5) | 확실 | plan 게이트는 MCCP_PLAN_REVIEW=multi-agent의 L2 패널이 리뷰하고 PR 게이트는 skipped verdict를 정직하게 봉인한다. 리뷰 부재를 수렴으로 위장하지 않으며 cross-gate dedupe도 열리지 않는다 |
| 병렬 브랜치 version 충돌 (실측 4회 재발) | 중간 | Task 7이 번호를 미리 고정하지 않고 PR 직전 재계산. sibling 3개가 이미 1.32.3과 1.32.5와 1.33.0 선언 중 |

## Acceptance

- [ ] 모든 task 완료
- [ ] Validation 전건 통과
- [ ] 패턴을 재발명하지 않고 미러링 (특히 spawn-직전 short-circuit 구조, write+read-back, fenced-only 정적 스캔, parseBool 경유 env 판독)
- [ ] 라이브 경로 완주 4 케이스 전부: (1) 봉인 후 MCCP_CODEX_DISABLED=0 에서 classification disabled이고 spawn이 없다 · (2) 6h 초과는 reason expired · (3) 파손 봉인은 reason unreadable이고 게이트가 진행된다 · (4) clear 후 reason absent. 이 실행들이 PRD 가설을 반증 가능하게 만든다 — 단위 test 통과만으로 완료를 주장하지 않는다
- [ ] MAX_SEAL_AGE_MS 가 export되고 test가 그 값을 직접 단언한다
- [ ] 정책 off 상태에서 기존 review-single-pass.test.js 와 codex-invoke.test.js 가 무수정으로 green
- [ ] docs/environment/gates.md 에 1회성 보일러플레이트가 0건, 영구 정책 문언과 봉인 계약이 존재

## Design Critique

- 호출: `Skill(impeccable, "critique …")` — call form은 impeccable-detect 오라클이 해소 (v1.31.3 M3)
- 라운드: 1 (R0, cap 2)
- verdict: **CONVERGED**
- 실측 근거: H1 heading depth 최대 3 (`####` 이상 0건) · H2 계획 문서에 색 토큰 없음(비해당) · H3 MD0xx와 raw HTML entity 0건
- H4 관측 2건은 MEDIUM이라 backlog 이연 (CLAUDE.md 3.14 — HIGH/CRITICAL만 그 자리에서 흡수):
  - `Risks` 표가 상위 3행 초과분을 details로 접지 않음. 접기를 적용하지 않은 근거: 이 앵커의 대상은 렌더 뷰포트이고, 계획 문서는 L2 패널 리뷰어가 전문을 읽는 표면이라 접기가 곧 리뷰 대상 은폐가 된다.
  - `Files to Change` 동일. 추가 근거: CLAUDE.md 1.2의 dedupe planned-matcher가 plan 표 첫 열을 git diff 경로와 리터럴 대조하므로, 접기는 그 대조를 해친다.

## Design Routing Guide

routing mode: auto (implement 단계에서 유효). plan 단계는 아무것도 invoke하지 않으며 아래는 구현자를 위한 체크리스트다.

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

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->
