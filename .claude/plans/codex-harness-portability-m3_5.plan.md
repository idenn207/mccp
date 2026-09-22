# Plan: codex-ship (M3.5 hotfix)

**Source PRD**: .claude/prds/codex-harness-portability.prd.md
**Selected Milestone**: 3.5 — codex-ship (hotfix)
**Complexity**: Small

## Summary

Codex 하네스에서 mccp가 **설치되고 발화하는 상태**를 운영자 한 번의 명령으로 만든다. M1이
프로브에 배선한 비대화형 trust 승인 경로를 제품 표면(`codex-bootstrap.js`)으로 승격하고,
그 산출물이 `release` 채널에 도달하도록 첫 릴리스 컷을 수행한다. 새 능력을 열지 않는다 —
M1~M3가 이미 만든 것을 **닿게** 한다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | M4와 M5를 모두 돌릴 토큰이 남지 않았으므로 최소한의 수정으로 Codex 이관을 진행한다 | direction |
| UI2 | PRD에 3.5 hotfix 마일스톤을 추가하고 그 사유를 함께 적는다 | constraint |
| UI3 | 그 마일스톤이 배포 시점임을 PRD에 명시한다 | constraint |
| UI4 | M4부터는 Codex에서 plugin을 호출해 작업할 예정이다 | direction |
| UI5 | 바로 Codex에서 호출 가능하도록 구현을 진행한다 | constraint |
| UI6 | 부트스트랩 도구와 릴리스 컷까지 이번 범위에 포함한다 | constraint |
| UI7 | 게이트는 단일 통과로 돌리되 Codex 리뷰 1라운드는 반드시 실행한다 | constraint |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 순수/부수효과 분리 | `plugins/mccp/scripts/lib/command-reach.js:94-107` · `:235-244` | `resolveCandidate()`는 순수하고 `resolved`를 주장하지 않는다. fs를 만지는 `verify()`에서만 성립을 주장하고, CLI shim은 verify 뒤에만 exit 0 |
| TOML 조립 | `scripts/codex-probe/cli.js:159-170` | `buildTrustBlock`이 순수 함수라 test가 실제 spawn 없이 형태를 단언한다. 이 블록이 어긋나면 발화 0이 되고 그것은 "hook이 없다"와 같은 모양이다 |
| app-server 왕복 | `scripts/codex-probe/hooks-list.js:1-11` | 비동기 JSON-RPC 왕복은 별도 파일이 하고 호출자는 `spawnSync` 한 번으로 부른다 |
| 추측 금지 | `scripts/codex-probe/cli.js:94-103` | `<key>`와 기대 hash를 계산하지 않고 `hooks/list`가 준 값을 그대로 쓴다 |
| Naming | `plugins/mccp/scripts/lib/{command-reach,harness-ingress}.js` | 축 이름 kebab-case, 서브커맨드형 CLI shim을 같은 파일 말미에 둔다 |
| Tests | `plugins/mccp/scripts/lib/tests/command-reach.test.js` | `node --test`, 순수 함수는 fs·spawn 없이 단언 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `.claude/prds/codex-harness-portability.prd.md` | UPDATE | M3.5 행 + 사유 블록 (UI2·UI3) — 선행 착지 완료 |
| `plugins/mccp/scripts/lib/codex-bootstrap.js` | CREATE | 설치 상태 진단 + 멱등 trust 승인 + 도달 검증 오라클과 CLI |
| `plugins/mccp/scripts/lib/tests/codex-bootstrap.test.js` | CREATE | 순수 함수(merge·plan·verdict) 단위 test |
| `docs/codex-harness-portability/m3_5-codex-ship.md` | CREATE | 판정 + 운영자 런북(설치→trust→검증→컷) |
| `docs/release-channel.md` | UPDATE | 첫 컷 실행 후 §2 라벨을 `미측정`→`측정됨`으로, 실측 원문 등재 |
| `CHANGELOG.md` | UPDATE | `## [Unreleased]`에 M3.5 항목 |
| `.claude/PRPs/reports/codex-harness-portability-m3_5-report.md` | CREATE | 구현 결과·이탈·미충족 기록 |

`plugins/mccp/.claude-plugin/plugin.json`은 **바꾸지 않는다** — 브랜치는 번호를 선언하지
않는다(PRD 결정 4 · CLAUDE.md §3.7 우산 결정 1). 번호는 Task 6의 릴리스 컷이 정한다.

## Tasks

### Task 1: 멱등 trust 병합 오라클 — **mccp 소유 hook에 한정**
- **Action**: `codex-bootstrap.js`에 `mergeTrustBlocks(existingToml, hooks)` 순수 함수를 만든다.
  프로브의 `buildTrustBlock`은 스크래치 home에 **append-only**로 쓴다 — 매 실행이 새 파일이라
  중복이 생길 수 없기 때문이다. 제품은 실재하는 `~/.codex/config.toml`을 반복 수정하므로
  같은 함수를 그대로 쓰면 재실행마다 `[hooks.state."<key>"]`가 중복 누적된다. 병합은 같은
  key의 기존 블록을 **교체**하고, mccp가 쓰지 않은 나머지 본문은 바이트 그대로 보존한다.
  `shortHookKey`도 함께 승격한다(감사값 없는 절대경로를 레코드에 싣지 않는다).

  **승인 대상은 세 조건을 모두 만족하는 hook뿐이다** (R1 security/HIGH + L3 high 흡수).
  프로브의 `grantHookTrust`는 `hooks/list` 반환 **전량**에 `enabled=true`를 쓴다 — 스크래치
  home에서는 무해했으나 실사용 home에서 그대로 하면 운영자의 **서드파티 hook 전부**를
  무차별 승인하는 권한 상승이다. 조건:
  1. **선언원이 mccp다.** key의 첫 구간이 `mccp@<marketplace>`인 것만. `config.toml` 선언
     hook과 타 plugin hook은 건드리지 않는다.
  2. **`trustStatus`가 `modified`이면 승인하지 않고 보고한다.** `modified`는 승인 후 본문이
     바뀌었다는 뜻이고, 그것이 Codex trust 모델이 존재하는 이유다. 변조 신호를 지우는 것은
     승인이 아니라 은폐다.
  3. **운영자가 `enabled = false`로 끈 항목은 덮지 않는다.** 명시적으로 끈 것을 켜는 것은
     부트스트랩의 권한 밖이다. 보고하고 넘어간다.

  백업은 이 저장소가 비밀 인접 파일에 쓰는 원자적 관용구를 그대로 쓴다 —
  `fs.writeFileSync(dest, data, { flag: 'wx', mode: 0o600 })`. `copyFileSync`의 mode 보존은
  Node 공개 API의 보장이 아니고, 백업본은 trust 해시 전량과 운영자의 provider 설정을 담는다.
- **Mirror**: `scripts/codex-probe/cli.js:159-170` (순수 TOML 조립) · `:136-143` (`shortHookKey`) ·
  `:443` (`{ flag:'wx', mode:0o600 }` 원자적 관용구)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/codex-bootstrap.test.js` — (a) 같은
  hook 집합으로 두 번 병합한 결과가 한 번 병합한 결과와 **바이트 동일**, (b) 무관한 기존
  섹션(`[tui]`·`[projects]`)과 **타 plugin의 `[hooks.state]` 블록**이 보존, (c) `modified`
  hook과 `enabled=false` hook이 **승인 목록에서 제외**되고 보고 목록에 남을 것.

### Task 2: 상태 진단 (`status`)
- **Action**: `codex-bootstrap.js status [--json]`이 넷을 잰다 — (a) `codex` 바이너리와 버전,
  (b) marketplace/plugin 등록 여부, (c) `hooks/list`가 보고하는 hook과 각 `trustStatus`,
  (d) `command-reach.js verify`가 `plan` 본문에 도달하는가. **판정하지 않고 관측만 낸다**
  — 각 축은 `ok` / `missing` / `unmeasured` 셋 중 하나이고, 잴 수 없었던 것은 `missing`이
  아니라 `unmeasured`다(M1·M3의 판정 규칙과 같은 형태: 통제 없는 미발화는 부재의 증거가 아니다).
- **Mirror**: `scripts/codex-probe/cli.js:105-127` (`listHooks` — `hooks/list` spawnSync 왕복)
- **Validate**: 실제 환경에서 `node plugins/mccp/scripts/lib/codex-bootstrap.js status --json`이
  현재 상태(설치 없음 · trust 0건)를 정확히 보고할 것.

### Task 3: 부트스트랩 (`bootstrap`) — dry-run이 기본
- **Action**: `bootstrap [--apply]`가 순서대로 수행한다: marketplace 등록 → plugin 설치 →
  `hooks/list` → trust 병합 → 도달 검증. **`--apply` 없이는 한 바이트도 쓰지 않고** 칠 명령과
  바뀔 내용만 출력한다. 사용자 홈의 `config.toml`을 고치는 것은 되돌리기 어려운 외부 상태
  변경이므로 기본이 관측이어야 한다. `--apply` 시 `config.toml`을 같은 디렉토리에
  `config.toml.mccp-backup-<ISO>`로 먼저 복사한다.
  Codex 자신의 명령(`codex plugin marketplace add` · `codex plugin add`)은 **감싸되 재해석하지
  않는다** — 종료 코드와 stderr를 그대로 표면화한다. 우리가 성공/실패를 다시 판정하면 그
  판정이 Codex의 것과 어긋나는 날 조용히 틀린다.
- **Mirror**: `scripts/codex-probe/cli.js:197-207` (argv 배열 + `shell:false`, 문자열 보간 금지) ·
  `command-reach.js:264-274` (verify 뒤에만 exit 0)
- **Validate**: `--apply` 없이 실행했을 때 `~/.codex/config.toml`의 sha256이 전후 동일할 것.

### Task 4: 성공 조건은 **발화 축**에 결속한다 — 파일 해소는 그 축이 아니다
- **Action**: `bootstrap --apply`는 **두 축이 모두 성립할 때만** exit 0을 낸다. R1의 네 리뷰어와
  L3가 독립적으로 같은 것을 지목했다 — **파일이 해소된다는 사실은 hook이 발화한다는 사실이
  아니다.** 초안은 후자를 주장하면서 전자만 쟀다.

  **축 (i) — 발화(1차 축).** `hooks/list`를 다시 불러 mccp hook이 `trustStatus === 'trusted'`로
  보고되는지 확인한다. 이것이 M1이 실제로 통제를 세운 축이고, 음성 대조가 **성립하는 유일한
  축**이다: hash를 한 바이트 틀리면 `trustStatus`가 `modified`가 되고 발화가 0이 된다
  (M1 실측). trust 승인 대상이 0건이면 성공이 아니라 실패다.

  **축 (ii) — 해소(2차 축), 단 하네스를 구별해서.** `command-reach.js verify()`를 부르되
  반환값의 **`rootSource`가 `R-d:codex-cache`인지 검사한다**. `resolved:true`만 보면 안 되는
  이유는 셋이다: (a) `verify()`의 root 루프는 codex-cache가 0건이면 `R-d:claude-cache`로
  폴백하므로 Codex 설치가 0건이어도 Claude 사본으로 성립한다, (b) `ROOT_ENV_NAMES`
  (`MCCP_PLUGIN_ROOT`·`CLAUDE_PLUGIN_ROOT`·`CODEX_PLUGIN_ROOT`)와 `MCCP_PLUGIN_ROOT_HINT`가
  R-d보다 **먼저** 오므로 개발 셸의 env가 살아 있으면 로컬 워크트리가 승자가 된다,
  (c) `harness === 'claude'`면 `verify()`가 즉시 단락되어 `resolved:true`를 낼 수 없다
  (`command-reach.js:152-157`). 그래서 이 호출은 **자식 프로세스**에서 그 네 env를 지우고
  `MCCP_HARNESS=codex`·`CODEX_HOME`을 명시한 채 돌린다.

  둘 중 하나라도 어긋나면 exit 비영점 + **어느 축이 왜 깨졌는지** 지목한다. "설치는 성공하는데
  게이트는 한 번도 발화하지 않는다"가 PRD Problem이 지목한 실패 모드이므로, 그 축을 재지 않는
  검증으로 exit 0을 내는 것은 제품이 그 실패 모드를 **다시 만드는 것**이다.
- **Mirror**: `command-reach.js:235-244` (`rootSource` 반환) · `:152-157` (claude 단락) ·
  `scripts/codex-probe/cli.js:105-127` (`hooks/list` 왕복)
- **Validate**: 음성 대조는 **축 (i)** 에 건다 — `config.toml`의 `trusted_hash`를 한 글자 틀리게
  심으면 `hooks/list`가 `modified`를 보고하고 `bootstrap --apply`가 exit 비영점일 것. 축 (ii)의
  음성 대조는 `~/.codex`를 비운 채 `CLAUDE_PLUGIN_ROOT`를 세팅하고 돌렸을 때 `rootSource`
  불일치로 비영점일 것.

### Task 5: 런북 문서 — 산출물은 **redact 관문을 지나서만** 들어간다
- **Action**: `docs/codex-harness-portability/m3_5-codex-ship.md`에 판정과 절차를 쓴다 —
  실측 상태(설치 0 · trust 0) · 부트스트랩 3단계 · 릴리스 컷과의 순서 · **주장하지 않는 것**
  (명령 본문의 실행 가능성은 M4 소유, 도구 어휘 부재는 그대로 남는다).

  **`codex-bootstrap.js`는 신규 producer이므로 DD10 관문을 지난다** (R1 security/HIGH 흡수).
  이 도구의 출력은 정의상 절대경로를 담는다 — hook key의 첫 구간이 선언원 경로이고
  (`cli.js:132-135`), `verify()`의 `root`·`commandPath`는 realpath 절대경로다
  (`command-reach.js:235-244`). 그 값을 git-tracked 문서·report에 **붙여 넣는 것**이 이
  milestone의 acceptance이므로, `redact-gate.js`를 거치지 않으면 §3.12가 `meta.cwd`로 이미 한 번
  갚은 유출을 새 표면에서 다시 연다. 관문이 producer마다가 아니라 **하나**인 것이 그 파일의
  설계 이유이고(`redact-gate.js:3-13`), 신규 producer가 그것을 우회하면 그 설계가 거짓이 된다.
  따라서 문서·report에 싣는 모든 출력은 `redact-gate.js --check`를 통과한 것이어야 하며,
  통과하지 못하면 **값을 조용히 치환하지 않고** producer를 고친다(관문은 판정만 한다).
- **Mirror**: `docs/codex-harness-portability/m3-command-reach.md` (사전에 못박은 판정 규칙 →
  축별 판정 → 주장하지 않는 것) · `scripts/codex-probe/redact-gate.js:3-13` (단일 fail-closed 관문)
- **Validate**: 문서가 지목하는 명령이 전부 실재할 것(`grep`으로 경로 대조) +
  `node scripts/codex-probe/redact-gate.js --check`가 신규 산출물에 대해 exit 0일 것.

### Task 6: 릴리스 컷 (PR 머지 **후**) — 컷은 trust를 무효화한다
- **Action**: [docs/release-channel.md](../../docs/release-channel.md) §2 절차를 그대로 수행한다 —
  선행조건 3종 → 번호 `2.0.0` → 다섯 면 한 커밋 → `MCCP_RELEASE_CUT` 사유와 함께 가드 통과 →
  태그 → `release` fast-forward → 좌표 확인. 컷이 끝나면 §2 라벨을 `미측정`에서 `측정됨`으로
  바꾸고 실측 원문을 등재한다.

  **컷 뒤에 trust를 다시 승인해야 한다** (L3 high 흡수). `trusted_hash`는 hook **본문**의
  해시이므로, 컷이 `release`를 옮겨 사용자가 새 본문을 설치하는 순간 기존 승인은
  `trustStatus=modified`가 되고 발화가 0으로 돌아간다. 즉 순서는 `설치 → trust → 컷`이 아니라
  **`컷 → 설치 → trust → 검증`** 이다. Task 3의 부트스트랩이 멱등인 것이 여기서 값을 한다 —
  컷 뒤에 같은 명령을 다시 돌리면 된다. 이 순서를 Task 5의 런북에 명시한다.
- **Mirror**: `docs/release-channel.md` §2.1~§2.5
- **Validate**: `git ls-remote origin refs/heads/release`가 컷 커밋을 가리키고, 컷 **뒤에** 돌린
  `bootstrap --apply`가 Task 4의 두 축을 모두 통과해 exit 0일 것.

## Validation

```bash
# 1. 단위 test (신규 + 기존 회귀)
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 \
  plugins/mccp/scripts/lib/tests/codex-bootstrap.test.js \
  plugins/mccp/scripts/lib/tests/command-reach.test.js \
  plugins/mccp/scripts/lib/tests/harness-ingress.test.js

# 2. 브랜치가 번호를 선언하지 않는다 (PRD 결정 4)
node scripts/version-declaration-guard.js --base origin/main

# 3. 상태 진단이 현재 환경을 정확히 보고한다
node plugins/mccp/scripts/lib/codex-bootstrap.js status --json

# 4. dry-run이 한 바이트도 쓰지 않는다 (음성 대조).
#    스크래치는 worktree-safe git dir 아래에 둔다 — 절대 tmp 경로를 문서에 싣지 않는다
#    (DD10 관문의 `posix-tmp` 규칙. 실측: 초안이 이 규칙에 걸렸다).
SCRATCH="$(git rev-parse --git-path mccp/tmp)"; mkdir -p "$SCRATCH"
sha256sum ~/.codex/config.toml > "$SCRATCH/cfg.before"
node plugins/mccp/scripts/lib/codex-bootstrap.js bootstrap
sha256sum -c "$SCRATCH/cfg.before"

# 5. 결합 인벤토리 회귀 — 새 표면이 미열거로 남지 않았는가.
#    `unlisted`/`fossil`은 배열이 아니라 **숫자**다(실측: keys = […,"unlisted",
#    "unlisted_items","fossil","fossil_items",…]). 초안의 `j.unlisted && j.unlisted.length`는
#    0 이 falsy 라 어떤 회귀에도 항상 exit 0 을 내는 항진이었다(R1 test/HIGH).
node scripts/codex-probe/scan-coupling.js --json | \
  node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));if(typeof j.unlisted!=="number"||typeof j.fossil!=="number"){console.error("scan output shape changed");process.exit(2)}process.exit((j.unlisted!==0||j.fossil!==0)?1:0)'

# 6. 신규 producer 의 산출물이 DD10 관문을 지나는가 (fail-closed).
#    관문은 파일 단위다 — `--check <file>`. 인자 없이 부르면 usage 를 내고 끝난다.
for f in docs/codex-harness-portability/m3_5-codex-ship.md \
         .claude/PRPs/reports/codex-harness-portability-m3_5-report.md; do
  node scripts/codex-probe/redact-gate.js --check "$f" || exit 1
done
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| trust 병합이 사용자의 `config.toml`을 손상시킨다 | 낮음 | dry-run 기본 + `wx`/`0600` 백업 + 멱등 test(두 번 병합 = 한 번 병합, 타 plugin 블록 보존) |
| 부트스트랩이 서드파티 hook을 무차별 승인해 trust 경계를 무력화한다 | **높음(초안)** | Task 1의 3조건(선언원=mccp · `modified` 미승인 · `enabled=false` 존중)으로 닫는다. 프로브 함수를 그대로 승격하면 이 위험이 실현된다 |
| `hooks/list`가 hook을 0건 보고해 승인할 것이 없다 | 중 | 그것을 성공으로 반올림하지 않는다 — Task 4 축 (i)이 `trustStatus==='trusted'`를 **직접** 재므로 승인 0건은 exit 비영점이다. (초안은 이 완화를 `command-reach.verify()`에 걸었는데 그 함수는 hook·trust·hash를 한 번도 읽지 않아 완화가 성립하지 않았다 — R1 test/HIGH) |
| 설치는 되는데 발화하지 않는다(PRD Problem의 실패 모드 재현) | 중 | Task 4 축 (i)이 **발화**를 재고 축 (ii)가 `rootSource==='R-d:codex-cache'`로 하네스를 구별한다. 파일 해소만으로는 exit 0이 나오지 않는다 |
| 릴리스 컷이 첫 실행이라 절차에 미발견 구멍이 있다 | 중 | §2.1 선행조건을 쌍으로 재고(정방향만 재면 항상 0을 내는 검사와 구별되지 않는다), 실패 시 §4 롤백. 컷은 PR 머지 뒤라 이 브랜치의 receipt와 무관 |
| `${CLAUDE_PLUGIN_ROOT}` 치환 축이 여전히 `unmeasured`라 Codex hook이 시작조차 못 한다 | 중 | M3가 이미 그은 경계다. 부트스트랩은 그 축에 의존하지 않는다(`bootstrap.js#resolveRoot()`의 `__dirname` 폴백). 도달 검증이 이 위험을 **탐지**하되 해소는 주장하지 않는다 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)

라이브 산출물 — 아래가 나오지 않으면 이 milestone은 닫히지 않는다:

- [ ] `node …/codex-bootstrap.js status --json`의 실행 전/후 출력 두 벌 (설치 0·trust 0 → 설치 1·trust N) — **`redact-gate.js --check` 통과본**
- [ ] `bootstrap --apply` 실행 로그와 그 뒤 `~/.codex/config.toml`의 `[hooks.state.…]` 블록
- [ ] 음성 대조 1건 — `trusted_hash`를 한 글자 틀리게 심었을 때 `hooks/list`가 `modified`를 보고하고 `bootstrap --apply`가 비영점으로 끝난 출력 (**축 (i) 발화**에 건다 — 파일 해소 축에는 이 대조가 성립하지 않는다)
- [ ] `git ls-remote origin refs/heads/release`가 컷 커밋을 가리키는 출력
- [ ] Codex 세션에서 `run-command` skill로 mccp 명령 본문 1건을 실제로 연 stdout

## Review Absorption (R1, 2026-09-10)

L2 패널 4/4 `fail`(HIGH 9) + L3 Codex `divergent`(high 3 · medium 1). 라운드는 **1회**이고
재리뷰하지 않는다(§3.16). 아래는 그 라운드에서 **흡수한 것**이고, 나머지는
[codex-findings-backlog.md](codex-findings-backlog.md)에 이연했다(§3.14).

네 리뷰어와 Codex가 **독립적으로 같은 결함 둘**을 지목했다. 그것이 이 흡수의 핵심이다.

| # | 지목 | 어디서 | 흡수 |
|---|---|---|---|
| A1 | 파일 해소를 hook 발화의 성공 조건으로 쓸 수 없다 | architect·test·invariant HIGH + L3 high | Task 4를 두 축으로 재설계. 축 (i) `trustStatus==='trusted'`가 1차 |
| A2 | `verify()`가 codex-cache 0건이면 claude-cache로 폴백하고, R-a env가 R-d보다 먼저다 | architect·security·invariant HIGH | 축 (ii)가 `rootSource==='R-d:codex-cache'`를 요구하고, env 4종을 지운 자식 프로세스에서 실행 |
| A3 | 음성 대조가 검사 대상과 무관하다(trust hash를 틀려도 `verify()`는 그것을 안 읽는다) | architect·test HIGH | 음성 대조를 축 (i)로 옮김. Acceptance 문구도 함께 |
| A4 | trust 병합이 서드파티 hook 전량을 무차별 승인한다 | security HIGH + L3 high | Task 1에 3조건(선언원=mccp · `modified` 미승인 · `enabled=false` 존중) |
| A5 | 신규 producer가 DD10 redact 관문을 지나지 않는다 | security HIGH | Task 5가 관문 통과를 결속, Validation 6번 신설 |
| A6 | Validation 5번이 항진이다(`unlisted`는 숫자라 `0 &&`가 항상 falsy) | test HIGH | 실측으로 출력 shape을 확인하고 검사식 교체 + shape 변경 시 exit 2 |
| A7 | 컷이 hook 본문을 바꾸므로 기존 trust가 `modified`가 된다 | L3 high | Task 6 순서를 `컷 → 설치 → trust → 검증`으로 고정 |
| A8 | 백업 파일의 권한·생성 방식이 미지정 | security MEDIUM | Task 1이 `{flag:'wx', mode:0o600}` 관용구를 명시 |
| A9 | Mirror 인용 행 번호가 실제 정의와 어긋남 | architect LOW | 다섯 인용 전부 실측값으로 정정 |

### PR-Codex R1 (2026-09-10) — 구현 단계 흡수

plan 게이트가 발행을 거부한 뒤 구현이 착지했고, `/mccp:pr`의 PR-Codex가 R1에서 **실재하는
HIGH 2건**을 더 찾았다. dedupe가 열리지 않아(receipt 부재) 실제로 발화한 결과다.

| # | 지목 | severity | 흡수 |
|---|---|---|---|
| P1 | TOML 병합이 기존 설정을 삭제하고 비활성 hook을 다시 켠다 — 주석 붙은 헤더 · 배열 테이블 · `enabled = false # comment` 셋 다 유효한 TOML에서 재현 | high | 파서를 경계 인식 기준으로 재작성(따옴표 존중 주석 제거 · `[[...]]` 경계 · 우리 블록 판정 분리). 회귀 6건 |
| P2 | 게이트가 꺼져 있어도 부트스트랩이 성공한다 — `resolveIngress`는 `MCCP_HARNESS` 양성 신호가 없으면 `enabled:false`인데 검증이 그 축을 안 봤다 | high | 성공 조건에 **축 (iii) ingress** 추가. 회귀 2건 |
| P3 | 생성된 C2 프로브에 항상 JS 구문 오류 | medium | backlog 이연(§3.14) — L3도 같은 것을 지적했다 |

P1은 실측으로 확증했다 — 수정 전 세 케이스 전부 `false`, 수정 후 전부 `true`.
P2도 마찬가지다(`verifyIngress({})` → `ok:false`).

**이 라운드도 재리뷰하지 않았다.** 수정본은 PR-Codex R2를 받지 않았고, 그 사실은 report가
기록한다.

### security-reviewer R1 (2026-09-10) — 두 건은 위 P1 수정이 절반만 된 것이었다

2.5.5 의무 호출이 **HIGH 4건**을 더 냈고 전부 라이브 재현했다.

| # | 지목 | severity | 흡수 |
|---|---|---|---|
| S1 | `]`를 품은 인용 헤더가 여전히 삼켜진다 — `[^\]]*`가 리터럴 `]`를 못 넘는다 | high | 경계를 정규식 캡처가 아니라 **구조**로 판정(첫 글자 `[` · 끝 글자 `]`), 소유 판정은 `OUR_BLOCK_RE`로 분리 |
| S2 | 따옴표 존중이 큰따옴표뿐 — TOML 리터럴 문자열(`'…'`)의 `#`가 헤더를 자른다 | high | `stripTomlComment`이 basic·literal 두 형식을 추적(리터럴은 이스케이프 없음까지) |
| S3 | 설정 쓰기가 symlink를 따라가 임의 파일을 truncate하고, 원자적이지 않다 | high | `writeConfigAtomic` — `lstat` symlink 거부 + tmp+rename. 부수적으로 `0600`이 실제 적용됨(MEDIUM 1건 동반 해소) |
| S4 | plugin **이름만** 보고 우리 것이라 판정 — 어느 marketplace의 `mccp`든 통과 | high | marketplace까지 대조. 이름만 같으면 `mccp-name-from-untrusted-marketplace`로 구별 거부. 확장은 `--trust-marketplace` 명시 전용 |
| S5 | `MCCP_CODEX_BIN`이 `hooks/list` 자식에 전파 안 됨 | medium | backlog 이연(§3.14) |

**S1·S2는 P1 수정이 절반만 된 것이었다.** 같은 버그 클래스에 트리거만 달랐고, 그것을
"고쳤다"고 적은 것이 이 사이클에서 가장 정직하지 못했던 지점이다. 그래서 이번에는 문자열
패턴을 넓히는 대신 **판정 구조를 바꿨다** — 경계는 관대하게, 소유는 엄격하게, 둘을 분리.

**이 흡수가 주장하지 않는 것**: plan을 고쳤을 뿐 재리뷰하지 않았으므로, 흡수본 자체는
리뷰를 받지 않았다. `reviewed_plan_hash`는 흡수 **이전** 본문에 묶여 있고 그 사실은 receipt와
이 절이 함께 기록한다.

## Gate Deviation (2026-09-10)

**`mccp-plan-codex` receipt가 없다.** 게이트는 정상 작동했고 발행을 거부했다 — 아래가 그 경위다.

- L2 패널 4/4 `fail`(HIGH 9) · L3 Codex `divergent`. `decide`가 exit 12.
- `MCCP_REVIEW_SINGLE_PASS`가 켜져 있었으나 **완화되지 않았다.** §3.15 DD2대로 단일통과는
  L2 패널의 *반복*만 없애고 **L3 cross-model 이견은 완화 대상이 아니다**. 설계대로다.
- HIGH 9건을 R1 안에서 흡수했고(위 `## Review Absorption`) MEDIUM/LOW 4건은 backlog로 이연했다.
- 흡수로 plan 본문이 바뀌었으므로 `reviewed_plan_hash`
  (`sha256:818b2c4d2bb696191f340157d663c50661e93c0bbbf6ee3e106bc7736f5cd72f`)는 **흡수 이전**
  본문에 묶여 있다. 즉 **흡수본 자체는 리뷰를 받지 않았다.**
- 라운드 캡이 `1`로 봉인돼(`review-rounds seal cap=1 pinned-by=single-pass`) R2는
  `emit-workflow-args`가 거부한다. §3.16이 "라운드를 늘리지 않는 것"을 요지로 하므로 캡을
  올리지 않았다.

**따라서 `MCCP_SKIP_RECEIPT`로 구현 단계에 진입한다** — §3.16이 명시 허용하는 audited 우회이고,
사유는 이 절이다. 우회한 것은 **receipt chain 검증 하나**이며 Implement-Codex 게이트는 그대로
발화한다. receipt를 위조하지 않았고 verdict를 `converged`로 세탁하지도 않았다 — 발행 자체가
없다는 사실을 여기 남긴다.

리뷰 원문: [.claude/reviews/plan-review-codex-harness-portability.md](../reviews/plan-review-codex-harness-portability.md)
(`halt_stage: 5.2e` · `wall_clock_ms: 550873` · `verdict: divergent`).

## Codex Adversarial Review

> 게이트는 `mode=hybrid`로 돌았고 Codex는 L3 층에서 발화했다(`invoked:true` · `verdict:divergent` · `classification=ok verdict-source=structured`). 그 결과와 L2 패널 findings의 흡수는 위 `## Review Absorption`이, receipt 미발행 사유는 `## Gate Deviation`이 소유한다. 이 절은 `mode=codex` 경로 전용이라 비어 있다.

## External Research Provenance

- Source PRD: .claude/prds/codex-harness-portability.prd.md
- References section sha256: 418212b71a4c1719a2686c561b4ccfa35258753ea632cf71be75fe0fc9d96efa
- Stamped at: 2026-09-10T02:06:55.566Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt's plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.
