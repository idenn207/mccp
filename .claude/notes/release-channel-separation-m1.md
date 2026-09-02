# Note: release-channel-separation M1 — implement-gate record

> `.claude/plans/release-channel-separation-m1.plan.md`는 `mccp-plan-codex` receipt의
> `plan_hash`로 봉인돼 있다. 그 본문에 이 절을 주입하면 guard 2(staleness)가 즉시
> 발동해 `/mccp:pr` 2.5.8/2.5.9가 막힌다(실측: 편집 직후 validate `stale` 1건).
> 그래서 `/mccp:prp-implement` Phase 2.5.4가 허용하는 대체 경로인 이 notes 파일에
> 기록을 둔다 — 상류 게이트에 감사 우회를 쓰지 않는 쪽이 저렴하다.

## Codex Implementation Review

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review`
  (fail-closed Bash wrapper, `--impeccable-available` design-scope preamble 적용)
- 라운드 수: 1 (R1) · cap 3 · classification `ok` · blocking `false` · 58.9s
- 구조적 verdict: `needs-attention` → gate verdict **`divergent`**
- 합치 결론: 세 HIGH 모두 실재하며 그 자리에서 흡수했다. 그러나 **흡수를 확인한
  라운드가 없으므로 receipt에는 실제 R1 verdict인 `divergent`를 봉인한다** — §3.16대로
  라운드를 늘리지 않고, 위장된 `converged` 대신 정직한 비수렴을 남긴다. 그 결과
  cross-gate dedupe가 닫힌 채로 유지되어 `/mccp:pr`에서 PR-Codex가 실제로 발화한다.
- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 인자 없는 `--force-with-lease`는 관측한 SHA에 결속되지 않는다 | HIGH | ACCEPT_NOW | 구현 시 모든 force-push를 `--force-with-lease=refs/heads/release:<관측 SHA>`로 고정하고 `git ls-remote`로 사후 확인 |
  | F2 Task 10이 머지 후라 이 실행에서 Task 11·Acceptance가 성립 불가 | HIGH | ACCEPT_NOW | 보고서를 **pre-merge 미완성**으로 명시 발행하고 M1 완료·Acceptance 충족을 주장하지 않는다. 착지 vehicle을 명명한다 |
  | F3 리허설이 공유 라이브 설치를 배타 없이 변경한다 | HIGH | ACCEPT_NOW | 소유자 메타데이터를 담은 lock + 각 변경·복원 직전 baseline 해시 재검증(CAS) + 병행 세션 열거를 Task 9에 추가 |

- 흡수 상세:
  - **F1** — Task 9-6a/6b/6c와 8단계 좌표 게이트의 force-push는 전부
    `RELEASE_SHA=$(git ls-remote origin refs/heads/release | cut -f1)`로 값을 먼저 관측한 뒤
    `--force-with-lease=refs/heads/release:$RELEASE_SHA` 형태로 실행하고, push 직후
    `git ls-remote`로 결과 SHA를 다시 읽어 대조한다. plan 본문은 인자 없는 형태를 적었으나
    구현은 더 엄격한 쪽을 취한다.
  - **F2** — Codex의 지적이 정확하다. Task 10은 **머지 후**에만 실행 가능하고 Acceptance 5는
    10-2·10-3의 쌍을 요구하므로, 이 implement 실행은 M1을 완료시킬 수 없다. 따라서
    (i) 보고서 상단에 `STATUS: PRE-MERGE — INCOMPLETE`를 명시하고 Task 10·Acceptance 5
    자리에 관측값 대신 **실행할 명령**을 둔다, (ii) PRD의 M1 행은 `in-progress`에 머문다
    (Task 8이 이미 그 값이다 — `complete`로 올리지 않는다), (iii) 착지 vehicle은
    **머지 직후 같은 보고서 파일을 완성하는 후속 커밋**이며 그때까지 M1은 미완료다.
    `/mccp:prp-implement`가 Acceptance를 충족했다고 보고하지 않는다.
  - **F3** — Task 9 리허설 전체를 `$HOME/.claude/backup/mccp-m1-<ts>/rehearsal.lock`
    (PID · host · session · ISO 시각 · 대상 3종의 sha256) 아래에서 수행하고,
    각 mutation과 복원 직전에 3종 포인터 JSON의 sha256을 다시 읽어 lock에 봉인된 값과
    **일치할 때만** 진행한다(불일치 = 타 세션이 개입 → 즉시 중단하고 보고서에 기록).
    시작 시 `~/.claude/plugins/` 하위 및 실행 중 Claude 프로세스를 열거해 보고서에 남긴다.

- 기각한 처방(§3.14 — 증거와 함께 backlog로 이연):
  - F2의 "post-merge 전용 milestone/PR을 신설하라" — PRD가 M1을 단일 마일스톤으로 고정했고
    (UI7) 구조 재설계는 §3.16이 금지한 재계획이다. 대신 미완료를 정직하게 표기하고 착지
    vehicle을 명명하는 것으로 같은 실패(허위 완료 판정)를 닫는다.
  - F3의 "sibling Claude 세션을 탐지해 정지시켜라" — 타 세션 강제 종료는 이 마일스톤의
    권한 범위 밖이고 사용자 작업을 파괴한다. 열거 + CAS 재검증 + 중단으로 대체한다.

- Deferred to backlog: 2 → `.claude/plans/codex-findings-backlog.md`
- Open Questions: none (세 HIGH 모두 흡수 · DIVERGENT_UNRESOLVED 아님)
- Codex session 참조: `codex-invoke` envelope, classification=ok, 58983ms


### Security Reviewer

`Task(security-reviewer, "review proposed implementation: …")` 정상 완주(435s · 17 tool use).
auto-fallback 없음 → receipt에 `security_skipped` 미forward.

판정: **CRITICAL 0 · HIGH 1 · MEDIUM 3 · LOW 2.**

- **HIGH (§5) — `## Validation`의 채널 좌표 게이트가 구문 오류로 판별력 0이다.**
  `plan.md:386`의
  `[ "$(git rev-parse origin/release)" = "647dfec…" ] \n  || { echo 'HALT: …'; exit 1; }`
  에서 `\n`이 실제 개행이 아니라 리터럴 두 글자라 `[`가 `missing ']'`로 파싱 실패하고,
  `||` 분기가 **값과 무관하게 항상** 발화한다(리뷰어가 직접 실행해 재현). 이것은 plan이
  스스로 "통과하지 않으면 PR을 열지 않는다"고 규정한, 미리뷰 코드 배포를 막는 **리터럴
  기대값 게이트 두 곳 중 하나**다. 실패 방향은 안전 쪽(거짓 HALT)이지만 정상 상태에서도
  항상 실패로 보이므로, 구현자가 "버그려니" 하고 조건을 뒤집어 '고치면' fail-closed 성질이
  조용히 사라진다 — 그것이 실제 위협이다.

  **흡수 형태**: plan 본문은 고치지 않는다. `mccp-plan-codex` receipt의 `plan_hash`가 그
  바이트를 봉인하고 있어 편집하면 guard 2(staleness)가 발동해 `/mccp:pr` 2.5.8/2.5.9가
  막힌다(실측). 대신 **구현이 의미상 의도된 단언을 정확히 실행**한다:

  ```bash
  git fetch origin release
  ACTUAL=$(git rev-parse origin/release)
  if [ "$ACTUAL" != "647dfecba75eecd9287ee538ca5f7056c7ba71da" ]; then
    echo "HALT: origin/release is not at the release coordinate (actual=$ACTUAL)"; exit 1
  fi
  ```

  극성은 **그대로**다 — 완화가 아니라 문법 정정이다(불일치 = HALT). 실행 결과를 보고서에
  원문으로 남기고, plan 본문 정정은 backlog `id=d7d1f4a0`이 이미 보유한다.

- MEDIUM (§1) — `refs/heads/release`에 branch protection이 없고 `sha`도 pin하지 않아
  보완 통제가 0이다. 실측: origin은 public, collaborator 2명, `main`에도 protection 부재
  (`gh api .../branches/main/protection` → 404). **신뢰 경계는 넓어지지 않는다**(오늘도
  `known_marketplaces.json`이 `ref` 없이 main을 추종한다). §3.14대로 backlog → M3 런북.
- MEDIUM (§4a) — `installPath` sanitizer의 truthy 가드가 사실상 죽은 코드.
  backlog `id=8090f33e` 기보유. **다만 구현은 이 결함을 물려받지 않는다** — 보고서 치환을
  `os.homedir()` 파생 접두 비교로 구현한다.
- MEDIUM (§4b) — 유출 검사 grep이 이 머신의 드라이브 문자·계정명에 하드코딩.
  backlog `id=163266e6` 기보유. 구현은 plan의 리터럴 grep **과** homedir 파생 검사를
  **둘 다** 돌린다.
- LOW (§2) — 채널 좌표 게이트가 CI required check가 아니라 산문 규율이다. backlog → M3.
- 정보성 — force-push의 제3자 도달은 **없음**이 실측 확인됐다(`refs/heads/release` origin
  부재 · 워크플로우 2종 모두 `branches: [main]` 한정 · `release`/`mccp--v*` 트리거 0건).
  백업 목적지 고정과 `<PLUGINS>` 치환도 정확한 완화라고 독립 확인됐다.

`MCCP-GATE-STOP`을 발동하지 않는 근거: 유일한 HIGH는 **산출물이 아니라 plan 문서의 검증
스니펫**에 있고, 위 형태로 그 자리에서 흡수했다(§3.14). 미해소 HIGH 0건.

### Design Review

`impeccable-detect.js detect --mode implement` → `skill_available=true` ·
`design_signal=false` · `silent_skip=true` · `reason=no-signal`. EXECUTE 이전이라 diff가
비어 있어 렌더 표면이 아직 존재하지 않는다 — critique retry loop·stage routing·grounding
capture 모두 미발화. receipt에 `--impeccable-silent-skip --impeccable-silent-skip-reason
no-signal` forward. 산출 후 표면은 Phase 3.6(finish 라우팅)과 Phase 3.7(H15 grounding lint)이
재도출해 본다.
