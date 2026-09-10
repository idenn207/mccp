# Report — codex-harness-portability M3.5 (codex-ship hotfix)

- **Plan**: [.claude/plans/codex-harness-portability-m3_5.plan.md](../../plans/codex-harness-portability-m3_5.plan.md)
- **PRD**: [.claude/prds/codex-harness-portability.prd.md](../../prds/codex-harness-portability.prd.md)
- **Branch**: `meta-codex-harness-portability` · **Date**: 2026-09-10
- **plugin.json version**: **미선언** (PRD 결정 4 · CLAUDE.md §3.7 우산 결정 1)

## 무엇을 했는가

M1이 프로브에 배선한 비대화형 hook-trust 승인 경로를 제품 표면
(`plugins/mccp/scripts/lib/codex-bootstrap.js`)으로 승격했다. 새 능력은 열지 않았다 —
M1~M3가 이미 만든 것을 운영자 한 번의 명령으로 **닿게** 한다.

| 파일 | 동작 |
|---|---|
| `plugins/mccp/scripts/lib/codex-bootstrap.js` | CREATE — 순수 오라클 5 + fs/spawn 계층 + CLI(`status`·`bootstrap`) |
| `plugins/mccp/scripts/lib/codex-hooks-list.js` | MOVE — `scripts/codex-probe/hooks-list.js`에서 이전(단일 원본) |
| `plugins/mccp/scripts/lib/tests/codex-bootstrap.test.js` | CREATE — 10 test |
| `scripts/codex-probe/cli.js` | UPDATE — 이전된 경로로 재배선 |
| `docs/codex-harness-portability/m3_5-codex-ship.md` | CREATE — 판정 + 런북 |
| `.claude/prds/codex-harness-portability.prd.md` | UPDATE — M3.5 행 + 사유 블록 |

`hooks-list.js`는 **사본이 아니라 이전**이다. 제품 부트스트랩이 같은 app-server 왕복을
필요로 하는데 `scripts/codex-probe/`는 배포 트리 밖이라 설치된 환경에 존재하지 않는다.
사본을 두면 갈라지므로 옮기고 프로브가 이쪽을 부른다.

## 게이트가 실제로 잡았다 — 그리고 실측이 확증했다

plan 게이트(`mode=hybrid`)에서 L2 패널 **4/4 `fail`**(HIGH 9) + L3 Codex **`divergent`**.
네 리뷰어와 Codex가 **독립적으로 같은 결함 둘**을 지목했다.

초안은 `bootstrap --apply`의 성공 조건을 `command-reach.js verify()`의 `resolved:true`
하나에 걸었다. 구현 후 실측한 값이 그 지적을 확증한다 — mccp가 Codex에 **설치되지 않은**
상태에서:

```json
"reach": {
  "axis": "missing",
  "detail": "resolved via R-d:claude-cache, not the Codex plugin cache — this does NOT prove Codex reach",
  "root_source": "R-d:claude-cache"
}
```

`verify()`는 codex 캐시가 비면 claude 캐시로 폴백한다. 즉 초안대로였다면 **Codex 설치 0건인
이 상태에서 exit 0**이 나왔을 것이고, 그것은 PRD Problem이 지목한 "설치는 되는데 발화하지
않는다"를 제품이 그대로 재현하는 것이다. 흡수 9건의 목록은 plan의 `## Review Absorption`이
소유한다.

## 라이브 산출물

### status (부트스트랩 전, 2026-09-10)

```
cli    : ok       codex-cli 0.153.4
config : missing  trust_blocks_total=0 trust_blocks_mccp=0 exists=true
hooks  : missing  total=0 mccp=0 mccp_trusted=0
reach  : missing  root_source=R-d:claude-cache
exit 1
```

### dry-run 무변경 (음성 대조)

```
  ok  codex-cli — codex-cli 0.153.4
  ok  plugin-add — DRY-RUN: codex plugin add mccp
  ok  select-trustable — grant=0 skipped=0
 FAIL select-trustable — no mccp-declared hook is eligible for trust
exit 1
config.toml sha256 전후 동일: YES · 생성된 백업: 0건
```

승인 대상 0건을 **성공으로 반올림하지 않는다**는 판정 규칙 2가 여기서 실증된다.

### 단위 test

`node --test plugins/mccp/scripts/lib/tests/codex-bootstrap.test.js` → **10/10 pass**.
그중 하나는 구조적 결속이다 — `REACH_ENV_TO_CLEAR`가 `command-reach.js`의
`ROOT_ENV_NAMES`를 전부 덮는지 대조하므로, 그쪽에 새 env가 추가되고 여기 반영되지 않으면
test가 red가 된다(산문이 아니라 기계가 지킨다).

## PR-Codex R1도 실재 결함을 잡았다

receipt가 없어 cross-gate dedupe가 열리지 않았고(residual 122 파일), PR-Codex가 실제로
발화해 `needs-attention`으로 HIGH 2건을 냈다. 둘 다 재현됐고 둘 다 흡수했다.

- **P1 — TOML 병합이 기존 설정을 삭제하고 비활성 hook을 다시 켠다.** 초안의 헤더 정규식이
  트레일링 주석과 배열 테이블을 헤더로 보지 않아, 직전 trust 블록의 범위가 그 섹션을 삼키고
  교체가 **운영자의 설정을 지웠다**. `enabled = false # comment`도 인식하지 못해 명시적으로
  끈 hook을 **다시 켰다**. 수정 전 세 케이스 전부 `false`, 수정 후 전부 `true`.
- **P2 — 게이트가 꺼져 있어도 부트스트랩이 성공한다.** `resolveIngress`는 `MCCP_HARNESS`
  양성 신호가 없으면 `enabled:false`이고 호출자는 아무 일도 하지 않는데, 검증이 그 축을
  보지 않아 `bootstrap.ok=true`와 `ingress.enabled=false`가 동시에 성립했다. 성공 조건에
  **축 (iii)** 을 추가했다. 실측: `verifyIngress({})` → `ok:false`.
- **P3 (medium)** — 생성된 C2 프로브의 JS 구문 오류. §3.14대로 backlog 이연(L3도 같은 지적).

수정 후 `status --json`이 5축을 보고하며 `ingress: missing`을 정확히 드러낸다 — R1이 지적한
"꺼진 게이트를 성공으로 보고" 상태를 이제 잡는다. 단위 test 18/18.

**수정본은 PR-Codex R2를 받지 않았다.** R1 원장이 소진돼 두 번째 `/mccp:pr`은 캡에 걸리고,
§3.16이 라운드를 늘리지 않는 것을 요지로 한다. 흡수의 정당성은 재현 실측과 회귀 test 8건이
뒷받침하되, cross-model 재검증은 없다 — 그 사실을 반올림하지 않고 여기 적는다.

## security-reviewer도 실재 결함을 잡았다 — 그중 둘은 내 수정이 절반만 된 것이었다

2.5.5 의무 호출로 돌린 `mccp:security-reviewer`가 **HIGH 4건**을 더 냈고 전부 라이브로
재현했다. 정직하게 적자면 그중 둘은 PR-Codex R1에서 "고쳤다"고 한 것이 **절반만 된
것**이었다.

- **S1 — `]`를 품은 인용 헤더가 여전히 삼켜졌다.** 수정한 정규식이 `[^\]]*`를 써서 리터럴
  `]`를 넘지 못했고, `[my_section."weird]key"]`(완전히 유효한 TOML)가 헤더로 인식되지 않아
  직전 trust 블록이 그 섹션을 삼켰다. R1이 닫았다는 것과 **같은 버그 클래스, 다른 트리거**다.
  경계 판정을 정규식 캡처에서 **구조 판정**(첫 글자 `[` · 끝 글자 `]`)으로 바꾸고, 소유
  판정은 별도의 엄격한 패턴(`OUR_BLOCK_RE`)으로 분리했다.
- **S2 — 따옴표 존중이 큰따옴표만이었다.** TOML 리터럴 문자열(`'...'`)의 `#`를 주석으로
  잘라내 `['prod#server']`가 헤더 인식에 실패했고 같은 삭제가 일어났다. `stripTomlComment`이
  두 따옴표 형식을 모두 추적한다(리터럴 문자열은 이스케이프가 없다는 점까지).
- **S3 — 설정 쓰기가 symlink를 따라가고 원자적이지 않았다.** `fs.writeFileSync`의 기본
  `'w'`는 symlink를 따라가 **대상 파일을 truncate**한다(실측 재현). read와 write 사이에
  `codex plugin add`(최대 300s) + `hooks/list` 왕복 둘이 들어가 TOCTOU 창이 분 단위였다.
  `writeConfigAtomic`이 `lstat`로 symlink를 거부하고 tmp+rename으로 원자적으로 쓴다.
- **S4 — plugin 이름만 보고 "우리 것"이라 판정했다.** `origin.split('@')[0] === 'mccp'`는
  **어느 marketplace의** `mccp`든 통과시킨다. 비대화형 신뢰 승인의 유일한 관문이 그렇게
  느슨하면 동명 위장 plugin의 hook에 실행 신뢰를 주게 되고, 그것은 `selectTrustable`
  docstring이 막겠다고 적은 바로 그 권한 상승이다. marketplace까지 대조하고, 이름은 맞는데
  marketplace가 다르면 `mccp-name-from-untrusted-marketplace`로 **구별해서** 거부한다.
  운영자는 `--trust-marketplace <name>`으로 명시적으로만 넓힐 수 있다.

**MEDIUM 2건 중 하나는 S3 수정이 부수적으로 닫았다** — `{mode:0o600}`이 기존 파일에
no-op이던 문제가 tmp+rename으로 실제 적용된다(실측 `644 → 600`). 나머지 하나
(`MCCP_CODEX_BIN`이 `hooks/list` 자식에 전파되지 않음)는 §3.14대로 backlog로 이연했다.

리뷰어가 **고쳐졌다고 확인한 것**도 기록한다: probe env allowlist · ingress 축 · R1의 세
TOML 케이스 · `command-reach` realpath containment · `receipt-prompt-submit` FIFO/symlink
가드 · 프로브의 `grantHookTrust`가 실제 home을 겨눌 수 없다는 것 · redact 관문 우회 없음.

test 8건 추가, 전체 **100/100** green.

## 미충족 — 반올림하지 않는다

- **축 (iii) ingress가 현재 `missing`이다.** `MCCP_HARNESS=codex`가 이 셸에 없다. 그리고
  Codex가 띄우는 hook 자식이 그 env를 상속하는지는 **별개 미측정 축**이다 — `hooks.json`에
  `env` 필드가 없고 Codex hook 정의에 주입 경로가 측정된 바 없다(M3의 `${CLAUDE_PLUGIN_ROOT}`
  축과 같은 경계). 즉 부트스트랩이 exit 0을 내려면 그 축이 먼저 닫혀야 한다.
- **`bootstrap --apply`를 실행하지 않았다.** `marketplace.json`이 `ref: release`이므로 컷
  **전에** 설치하면 M1~M3를 모르는 옛 본문이 설치된다. 순서는 `컷 → 설치 → trust → 검증`이고
  컷은 PR 머지 뒤다(Task 6).
- **축 (i) 발화 음성 대조 미실시.** hash를 틀리게 심어 `modified`를 유도하는 대조는 mccp hook이
  실재해야 성립하는데 지금은 0건이다. 컷·설치 뒤에 수행한다.
- **릴리스 컷 미수행.** `git ls-remote origin refs/heads/release` 산출물 없음.
- **Codex 세션에서 `run-command`로 명령 본문을 연 stdout 없음.** 위 둘의 후행이다.

즉 plan의 Acceptance 라이브 산출물 5종 중 **2종 충족 · 3종 미충족**이다. milestone은 아직
닫히지 않는다.

## 이탈 (Deviations)

1. **`mccp-plan-codex` receipt 미발행.** 게이트는 정상 작동했고 발행을 거부했다 —
   L3 `divergent`이고 §3.15 DD2대로 단일통과는 L2 반복만 없애지 cross-model 이견을 완화하지
   않는다. HIGH 9건을 R1 안에서 흡수했으나 plan 본문이 바뀌어 `reviewed_plan_hash`
   (`sha256:818b2c4d…`)는 **흡수 이전** 본문에 묶여 있다. 즉 흡수본 자체는 리뷰를 받지 않았다.
   라운드 캡이 `1`로 봉인돼 R2는 거부된다. 운영자 승인 하에 §3.16이 명시 허용하는 audited
   우회로 구현에 진입했다. 상세는 plan의 `## Gate Deviation`.
2. **`/mccp:prp-implement`를 거치지 않고 직접 구현했다.** 변경 범위가 작고(파일 6개) plan이
   상세하며, receipt가 없어 cross-gate dedupe가 열리지 않으므로 `/mccp:pr`의 PR-Codex가 반드시
   발화한다 — 구현은 그 지점에서 cross-model 리뷰를 받는다.
3. **Phase 2.5 fan-out을 공식 opt-out했다**(`MCCP_PLAN_FANOUT=off`). 토큰 예산 제약이고,
   fan-out은 GROUND enhancement이자 fail-open이라 게이트가 아니다.
4. **MEDIUM/LOW 4건을 backlog로 이연했다**(§3.14). `.claude/plans/codex-findings-backlog.md`.

## 다음

컷 → 설치 → trust → 검증. 그 뒤 M4(reviewer-inversion)는 Codex 하네스에서 이어간다.
