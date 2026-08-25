# impeccable 탐지 계약 M3 — 작업 노트

> plan 본문(`.claude/plans/impeccable-detection-contract-m3.plan.md`)은 `mccp-plan-codex`
> receipt에 `plan_hash`로 결속돼 있어 편집하면 stale이 된다(§3.11 guard 2). 그래서 게이트
> 산출물·사전 측정·라이브 증거는 전부 이 파일이 소유한다 — M1·M2 선례와 같은 자리.

## Codex Implementation Review

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review`
  (fail-closed Bash wrapper, v0.2.2) · `--timeout-ms 900000` · `--impeccable-available`
  (design-scope preamble 적용) · detached 실행(codex 900s > Bash 600s)
- 라운드 수: 1 (`MCCP_REVIEW_SINGLE_PASS=deadline_pressure`로 캡 1 고정 — `effectiveRoundCap`
  실측 `{"cap":1,"pinned":true,"reason":"deadline_pressure"}`)
- envelope: `classification=ok` · `blocking=false` · `durationMs=331813` · 저장 위치는
  worktree gitdir의 `mccp/tmp/codex-implement.json`
- 합치 결론: verdict `needs-attention` → `deriveGateVerdict` 실측
  `{"verdict":"divergent","source":"structured","rawVerdict":"needs-attention"}`.
  **source가 `structured`**라 자유텍스트 fallback이 아니다. HIGH 3 · MEDIUM 2 전건을 구현
  계약으로 흡수했고, 흡수 불가한 잔여 1축(guard test의 CI 등재)만 backlog로 이연한다.
- 이 라운드의 focus는 plan이 **선-확정하지 않은** implement-time 결정 9건이었다(eclipsed 원소
  형태 · 승자 식별 방식 · cleanup 모듈 배치 · 삭제 primitive · 심볼릭 링크 거부 깊이 ·
  배너 순수 함수 위치 · 재배선 stderr 계약 · guard test 정규식 정밀도 · 오류 반환형).
  즉 5건 중 4건이 내가 물은 자리에 정확히 떨어졌다.

- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 Cleanup containment can be bypassed through symlinked ancestors | HIGH | ACCEPT_NOW | 실재. plan 규칙 (3)은 **대상만** `lstat`한다. `.claude` 나 `.claude/skills` 가 junction이면 어휘적 경로는 그대로 일치하는데 실제 디렉토리는 repo 밖일 수 있다 — 재귀 삭제 앞에서 이건 봉쇄 실패다. realpath 봉쇄(앵커→대상 사이 전 조상 심볼릭 링크 거부 + 대상 realpath가 기대 부모를 벗어나면 거부)를 `git rm`/`fs.rmSync` **이전에** 둔다 |
  | F2 git rm is not tied to a cleanup postcondition | MEDIUM | ACCEPT_NOW | §3.14는 MEDIUM을 이연 대상으로 두지만 이 항목은 **새로 쓰는 모듈의 반환 계약 자체**라 이연할 대상이 아니다. 계약 없이 쓰면 일부러 덜 정확한 모듈을 만드는 것이 된다. 닫힌 사유 `git-rm-failed` · `partial-removal` 을 추가하고, 삭제 뒤 재-resolve로 대상 `SKILL.md` 부재를 증명한 뒤에만 성공을 반환한다 |
  | F3 The LLM call-form contract is underspecified | HIGH | ACCEPT_NOW | 실재. plan은 "stderr로 리터럴 호출형을 출력한다"까지만 정하고 **리터럴 자체와 부재 시 분기**를 정하지 않았다. Task 7이 사본을 지운 뒤 본문이 모호하면 모델이 bare 이름을 계속 불러 전 게이트가 `unknown_skill`이 된다 — plan이 막으려던 바로 그 실패다. 정확한 한 줄을 고정하고 guard test가 그 리터럴을 단언하며, 그 줄이 없으면 이름을 추정하지 않고 기존 `SKILL_AVAIL=0` 행(fallback note + skip)으로 간다 |
  | F4 Paired assertion is not a commit-time invariant | HIGH | ACCEPT_NOW (부분) + 1축 이연 | 두 주장이 섞여 있고 **둘 다 실측으로 참**이다. (a) 강제 지점: `.github/workflows/` 에 등재된 test는 `pr-phase-guard` · `pr-phase-lock-f11` · `gitignore-provision` **셋뿐**이라 `impeccable-guard.test.js`는 어떤 CI도 돌리지 않는다 → plan의 "커밋 시점에 잡는다"는 **거짓**이다. 문서를 정정해 실제 강제 지점(이 사이클의 `## Validation`이 돌리는 로컬 test)을 그대로 말하고, CI 등재는 새 축이므로 backlog. (b) 정규식 정밀도: 본문에 역사적 산문 언급이 남아 있어 전문 스캔은 살아 있는 배선의 증거가 못 된다 → 검사를 detect/call-form 블록에 앵커한다. 흡수하는 것은 (b)와 (a)의 정정이지 CI 신설이 아니다 |
  | F5 Eclipsed derivation does not pin winner identity | MEDIUM | ACCEPT_NOW | F2와 같은 이유로 이연 대상이 아니다 — 이것은 내가 focus #2로 직접 물은 구현 결정이고, identity 포착이 3-way 비교보다 엄격히 정확하면서 비용이 0이다. 승자 행을 **그것을 고른 분기에서 객체 identity로 포착**하고 `eclipsed`를 identity 비교로 도출한다. source·invocation·path가 모두 같은 중복 행 fixture로 고정한다 |

- Deferred to backlog: 1 (F4(a)의 CI 등재 축) → `.claude/plans/codex-findings-backlog.md`
- Open Questions: 없음 (auto-CRITICAL 카탈로그 해당 0건 — security boundary·atomic state·schema
  breakage 중 어느 것도 미해소로 남지 않는다. F1이 security boundary 계열이지만 ACCEPT_NOW로
  그 자리에서 닫힌다)
- Codex session 참조: threadId `01a029f7-9339-72e1-9db2-f3cf783ecb2b`

### 내가 독립적으로 관측한 것 (Codex 지적과 별개)

`impeccable-resolve.test.js:439` "the bare invocation equals the literal name mccp command
bodies call"은 `commands/*.md` **전체**를 스캔해 `Skill(<name>` 리터럴을 모으고, 임시
디렉토리에서 해소한 `impeccable` 이 그 집합에 있는지 단언한다. Task 6이 4개 본문의 bare
리터럴을 걷어내도 `plan-prd.md:395`의 산문 한 줄(`Skill(impeccable)`)이 남아 **그 test는
red가 되지 않는다.** CLAUDE.md §3.17이 "그 test가 red가 되므로 조용히 일어나지는 않는다"고
적은 보호막은 따라서 얇다. 이는 Codex F4(b)와 같은 결함의 다른 얼굴이고, plan Task 6이
`plan-prd.md`에 대해 "단언이 애초에 참을 검사하고 있지 않았다"고 지적한 것과도 같은 축이다.
두 test의 앵커를 함께 교체한다.

### Security Reviewer

- 호출: `Task(security-reviewer)` — "review proposed implementation" (Phase 3 EXECUTE **이전**이라
  대상은 산출 코드가 아니라 설계다). 결과: CRITICAL 1 · HIGH 4 · MEDIUM 4 · LOW 1.
- **이 리뷰어는 `tool_uses=0`으로 파일을 하나도 읽지 않았다.** 기존 코드에 대한 사실 주장은
  전부 미검증 추정이므로 판정 전에 소스와 대조했고, 그 대조가 HIGH 2건을 뒤집었다.
- 명령 본문(`prp-implement.md` 2.5.5)은 "CRITICAL/HIGH → MCCP-GATE-STOP"을 규정하지만
  §3.14가 정한 절차(CRITICAL/HIGH는 **그 자리에서 흡수**, 기각은 증거 첨부)를 적용해 전건을
  처리하고 진행한다 — M2 선례와 같다. 아래 판정은 전부 file:line 인용을 갖는다.

| # | Severity | Finding | Verdict | 근거 |
|---|---|---|---|---|
| S1 | CRITICAL → **HIGH 강등** 후 ACCEPT_NOW (형태 변경) | 조상 심볼릭 링크/junction 우회 | 축은 실재(= Codex F1, 이미 수용) · **제시된 CRITICAL 시나리오는 미성립** | repo root 자체가 junction이면 기대 부모와 대상이 **같은 junction을 통과해 동일하게 해소**되므로 봉쇄가 깨지지 않는다. 리뷰어는 "`git rm -r`가 `D:\shadow\.claude`를 재귀 삭제한다"고 썼으나 삭제 대상은 `.claude`가 아니라 impeccable 디렉토리 하나다. 제안한 fix("repo root가 심볼릭 링크면 throw")는 심볼릭 경로 아래 사는 **정상 저장소를 전부 거부**한다(macOS `/tmp`, Windows junction 개발 드라이브). 채택 형태는 **앵커(project=repoRoot, user=homedir)와 대상 사이의 조상만** 거부하는 것 — 앵커 위쪽은 사용자 자신의 환경이고, 그것을 재지정할 수 있는 주체는 이미 더 직접적인 수단을 갖는다(`impeccable-detect.js:252-256`이 `installPath`에 대해 쓰는 것과 같은 논거) |
| S2 | HIGH | check↔delete 사이 TOCTOU | ACCEPT_NOW (**완화**로 명시) | 삭제 직전 realpath 재확인을 넣는다. 다만 이것은 창을 **좁힐 뿐 닫지 않는다** — 마지막 확인과 syscall 사이는 여전히 열려 있다. 닫았다고 적지 않고 주석과 문서에 완화임을 명시한다 |
| S3 | HIGH | `git rm -r` 옵션/셸 주입 | ACCEPT_NOW | 실재하는 설계 제약. `execFileSync('git', ['rm','-r','--quiet','--', target], {cwd})` — `--` 구분자 필수, 셸 보간 금지. `exec`/템플릿 문자열을 쓰지 않는다 |
| S4 | HIGH | `pluginName` 미검증 → invocation 주입 | **REJECT (증거)** | 미성립. 비상수 invocation 조립 지점은 `impeccable-detect.js:289` **하나**이고 두 절반이 모두 고정이다. 키를 받아들이는 매처가 `IMPECCABLE_PLUGIN_KEY_PATTERN = /^impeccable@/`(`:62`)라 키는 반드시 `impeccable@`로 시작하고, `pluginNameFromRegistryKey`(`:242-245`)는 **첫** `@` 앞을 자르므로 반환값은 항상 리터럴 `impeccable`이다(`impeccable@evil@x` 도 `impeccable`). legacy 분기는 `key === 'impeccable'` 정확 일치(`:63`). 나머지 절반 `name`은 `SKILL_DIR_NAME_PATTERN`(`:67`)을 통과해야 한다(`:275`). 리뷰어 시나리오는 registry의 `name` **필드**를 읽는다고 가정했으나 코드는 **키**에서 파생한다 |
| S5 | HIGH | invocation 개행 주입으로 stderr 한 줄 계약 위조 | **REJECT (증거)** | S4의 귀결. 전 invocation 값은 리터럴 `impeccable`(`:236`·`:342`·`:359`·`:384`) 또는 `impeccable:<[A-Za-z0-9_-]+>`(`:289`) 또는 `null`(`:319`·`:432`)이고, 나머지 둘(`:397`·`:420`)은 검증된 행에서 복사한다. 개행이 들어갈 자리가 구조적으로 없다 |
| S6 | MEDIUM | `apply()`가 plan 시점 상태를 신뢰 | ACCEPT_NOW | 새 모듈의 계약이라 이연 대상이 아니다. `plan()` 결과는 정보성이고 `apply()`는 승자 판정·경로 봉쇄·tracked 여부를 **전부 재수행**한다 |
| S7 | MEDIUM | 삭제 후 검증 부재 | ACCEPT_NOW | Codex F2와 동일 항목 — 이미 수용 |
| S8 | MEDIUM | untracked 재귀 삭제의 TOCTOU | ACCEPT_NOW | S2와 같은 처리(같은 완화, 같은 한계 표기) |
| S9 | MEDIUM | 대소문자 무시 파일시스템 충돌 | ACCEPT_NOW | 어휘 문자열이 아니라 **양쪽 realpath를 비교**한다. `realpathSync`가 Windows에서 실제 대소문자로 정규화하므로 별도 소문자 비교가 불필요하다 |
| S10 | LOW | `~` 확장은 `os.homedir()` | 이미 만족 | 기존 오라클이 그렇게 한다(`impeccable-detect.js:330`). 신규 모듈도 같은 형태를 쓴다 |

- 채택한 stderr 계약: 리뷰어는 델리미터 블록이나 임시 JSON 파일을 제안했으나 **채택하지
  않는다.** S4·S5가 미성립이라 값이 구조적으로 안전하고, 델리미터 3줄은 이 저장소의 다른
  게이트 stderr 관례(`[mccp:...]` 접두 한 줄)와 어긋난다. Codex F3이 요구한 "정확한 한 줄"은
  단일 리터럴로 충족한다.

### 게이트 실행 중 관측 — stale plugin cache가 탐지 답을 뒤집었다

Phase 2.5.5b의 detect를 명령 본문대로 `${CLAUDE_PLUGIN_ROOT}`(= `~/.claude/plugins/cache/mccp/mccp/1.31.0`)
로 돌리면 `skill_available:false` · `reason:"skill-missing"` 이 나오고 `impeccable_*` 필드가
**하나도 없다**. 그 캐시에 `resolutionFields` 문자열이 **0회** 등장한다 — 즉 M1(1.31.1) 이전
빌드다. 같은 저장소에서 worktree 오라클은 `skill_available:true` · `silent_skip:true(no-signal)` ·
`invocation:"impeccable"` · `source:"project"` · `version:"3.5.0"` 을 낸다.

이 차이는 표기가 아니라 **차단 여부**를 가른다. 캐시 답을 쓰면 결정 트리의 `SKILL_AVAIL=0` 행이
발화해 `--impeccable-skipped --impeccable-skip-reason skill-missing` 이 receipt에 실리고,
`mccp-implement-codex`는 strict gate라 그 receipt가 downstream `/mccp:pr` 을 **막는다**. 그런데
그 차단 사유는 M1이 이미 제거한 거짓 신호다(하드코딩 키 `impeccable@anthropics` + 디렉토리
존재만 확인하는 pre-M1 술어). 그래서 worktree 오라클의 답을 채택해 `--impeccable-silent-skip
--impeccable-silent-skip-reason no-signal`(정보성)로 기록했다. 실측 receipt:
`impeccable_skipped:false` · `impeccable_silent_skip:true`.

`design_signal:false`인 것은 정상이다 — 이 게이트는 Phase 3 EXECUTE **이전**에 돌고, 그 시점의
diff는 아직 `impeccable-detect.js`(whitelist 축 b)를 건드리지 않았다. 구조적 공백이며 Phase 3.7
grounding이 그 자리를 덮는다.

사용자 조치: `claude plugin update` 로 1.31.2 이상을 설치해야 이 세션 밖의 hook도 M1·M2 술어로
동작한다. 이 저장소의 cache 목록은 1.31.0에서 끊겨 있다.

## Task 0 — 라이브 사전 측정

### (a) 재배선 표적이 실제로 열리는가 — **성공**

- 관측 명령: `Skill(impeccable:impeccable, "critique m3-detection-contract-probe")`
- 원시 출력(머리): `Launching skill: impeccable:impeccable` 에 이어 본문이 열렸고, 런타임이
  보고한 base directory는
  `C:\Users\skypark207\.claude\plugins\cache\impeccable\impeccable\4.1.1\skills\impeccable`
- **판정: 표적 실재.** namespaced 호출이 해소되며, 이 저장소에 project 3.5.0 사본이 있는
  상태에서도 **plugin 4.1.1 본문**을 연다. 두 채널이 서로 다른 이름에 답하므로 shadow 관계가
  아니라는 오라클의 규칙이 라이브에서 확인됐다.
- 부수 관측: 4.1.1 본문은 `<skill-base-dir>` 를 쓰라고 **명시적으로 지시**하고
  `.claude/skills/impeccable/scripts` 는 "런타임이 base directory를 보고하지 않을 때의
  fallback"이라고 적는다. 즉 4.1.1은 경로 간접화를 이미 스스로 처리한다.

### (b) 권한 프롬프트 — **이 환경에서는 구조적으로 결론 불가, 그러나 영향 없음이 증명됨**

- 관측 명령: `node "<4.1.1 cache abs>/skills/impeccable/scripts/context.mjs" --target plugins/mccp/scripts/lib/renderer/html.js`
- 원시 결과: **exit 0**, PRODUCT.md 본문을 정상 출력. 프롬프트 없음.
- **이 관측만으로는 판정할 수 없다.** 이 세션은 bypass-permissions 모드라 프롬프트가 뜰 자리가
  애초에 없다. "glob이 매치해서 안 떴다"와 "모드가 눌렀다"를 구분하지 못한다.
- 대신 frontmatter와 ambient 권한을 직접 대조해 공백을 좁혔다:
  - 4.1.1 `allowed-tools`: `Bash(npx impeccable *)` · `Bash(node .claude/skills/impeccable/scripts/*)`
    → 두 번째가 **project 상대 glob**이라 cache 절대경로 호출과 매치하지 않는다. plan의 전제는 사실이다.
  - 3.5.0 `allowed-tools`: `Bash(npx impeccable *)` **뿐** — node glob 자체가 없다.
  - ambient `~/.claude/settings.json` allow: `Bash(node ~/.claude/scripts/ecc-receipt/cli.js *)` ·
    `Bash(node C:\Users\skypark207\.claude\scripts\ecc-receipt\cli.js *)` **2행뿐**. 프로젝트
    `.claude/settings.json` 에는 `permissions` 키가 아예 없다(`null`).
- **판정: 권한 축을 이 milestone에 추가하지 않는다.** plan이 "실질 영향이 없을 가능성이 크다"고
  적은 가설이 이제 가정이 아니라 증거를 갖는다 — ambient allow 목록은 `node ${CLAUDE_PLUGIN_ROOT}/scripts/*`
  도 덮지 않으므로, 권한 공백은 impeccable 고유가 아니라 **mccp 게이트 전체가 공유하는 baseline**이다.
  impeccable 경로만 골라 `permissions.allow` 를 제안하면 나머지 게이트가 여전히 같은 공백에 있는
  채로 한 축만 특별대우하는 것이 된다. UI10의 발동 조건은 "도구 권한 때문에 게이트가 멎으면"인데
  멎은 것이 없다.
- 잔여로 남기는 것: 비-bypass 모드에서의 실측은 이 세션이 할 수 없다. PRD Open Questions에
  그대로 남긴다.

### 분기 판정

(a) 성공이므로 **Task 6·7을 진행한다.** (b)가 프롬프트를 띄우지 않았고 권한 공백이
impeccable 고유가 아님이 확인됐으므로 권한 축을 추가하지 않고, 사본 제거도 이연하지 않는다.
따라서 `## Acceptance` 의 후반 4개 항목이 **적용 대상**이며, PRD milestone 3은 Task 7이
착지한 경우에만 `complete` 가 된다.

## 구현 중 발견 — 규칙 1과 2가 함께 걸리면 `removable`이 구조적으로 빈다

Task 4를 쓰면서 드러난 것이고 plan이 예고하지 않았다. 세 규칙을 함께 놓으면 이렇게 된다:

- 승자는 **항상 bare 소스**다(bare가 하나라도 있으면 그것이 이긴다 — `impeccable-detect.js:371`).
- bare가 둘이면 `shadowed` → 규칙 6이 전부 거부.
- bare가 하나면 그것이 **승자** → 규칙 1이 거부. 그리고 남은 eclipsed 행은 plugin뿐 → 규칙 2가 거부.
- bare가 없으면 승자는 plugin이고 eclipsed도 plugin뿐 → 규칙 2가 거부.

즉 `MCCP_IMPECCABLE_SKILL=available` 로 env 행이 승자가 되는 경우를 빼면 **`removable`은 항상
빈 배열**이다. 이 저장소의 실측이 그 예다 — `plan` 이 `nothing-eclipsed` + plugin 1건
`plugin-not-removable` 을 낸다.

**규칙을 바꾸지 않았다.** 규칙 1과 2는 plan의 명시 약속이고 각각 안전 근거(승자를 지우면 게이트가
죽는다 / plugin cache 삭제는 레지스트리와 디스크를 어긋나게 한다)가 있다. UI3·UI6이 그 방향을
지지한다. 대신 **Task 5의 setup 화면이 이 사실에 정직해야 한다** — `removable.length > 0` 일 때만
제거 선택지를 보이고, eclipsed는 있는데 removable이 비면 경로를 보이고 mccp가 어느 쪽도 지우지
않는 이유를 말한다. 없는 행동을 권하는 화면을 만들지 않는다.

이 저장소의 3.5.0 사본이 사라지는 경로는 이 도구가 아니라 **Task 7의 `git rm`** 이다. 그것이
plan의 설계이기도 하다(Task 7이 tool 호출이 아니라 `git rm -r` 을 지시한다). 두 축이 애초에
분리돼 있었던 것이고, 이번에 드러난 것은 "정리 도구가 이 저장소의 사례에는 쓰이지 않는다"는 사실
자체다.

회귀로 고정했다 — `impeccable-cleanup.test.js` 의 `rules 1+2 jointly: with real sources only,
nothing is ever removable`. 나중에 bare 사본을 제거 가능하게 만들려는 milestone은 이 test를
의도적으로 붉히면서 규칙을 바꿔야 한다. 조용히 넓히는 경로가 없다.

## Task 9 — 라이브 완주 관측

### 관측한 것 (재배선 + 사본 제거 이후, env 우회 없음)

전제 확인: `MCCP_IMPECCABLE_SKILL` unset · `MCCP_FORCE_PR_WITHOUT_IMPECCABLE` unset (UI1).

1. **detect (implement 모드) 원시 출력**

   ```json
   {
     "skill_available": true,
     "design_signal": true,
     "reason": "ok",
     "silent_skip": false,
     "signal_files": [
       "plugins/mccp/scripts/lib/impeccable-detect.js",
       "plugins/mccp/scripts/lib/renderer/html.js",
       "plugins/mccp/scripts/lib/renderer/markdown.js"
     ],
     "impeccable_invocation": "impeccable:impeccable",
     "impeccable_source": "plugin",
     "impeccable_version": "4.1.1",
     "impeccable_eclipsed": []
   }
   ```

2. **재배선된 carrier가 낸 줄** — `[mccp:impeccable] call-form: Skill(impeccable:impeccable, ...)`

3. **그 줄이 나르는 이름을 실제로 호출** — `Skill(impeccable:impeccable, "critique impeccable-detection-contract-m3")`
   → 본문이 열렸고 런타임이 보고한 base directory는
   `C:\Users\skypark207\.claude\plugins\cache\impeccable\impeccable\4.1.1\skills\impeccable`.

즉 **탐지 → 이름 결정 → 호출**의 세 단계가 plugin 채널만으로, env 우회 없이 연결된다. M3 이전에는
이 구성에서 3단계가 항상 `unknown_skill`이었다.

### receipt 상태

- 경로: `.claude/receipts/mccp-implement-codex/impeccable-detection-contract-m3.json`
- `meta.impeccable_skipped` = **false** (Task 9가 요구한 "참이 아니다"를 충족)
- `meta.impeccable_silent_skip` = `true`, 사유 `no-signal`
- `meta.security_skipped` = false · `resolution.codex_verdict` = `divergent`

### 이 회차가 **완주하지 않은** 것 — 그대로 적는다

- **이 receipt의 `silent_skip=true`는 재배선의 결과가 아니라 게이트 실행 시점의 결과다.**
  `prp-implement`의 디자인 게이트(2.5.5b)는 Phase 3 EXECUTE **이전**에 돌고, 그 시점의 diff는
  아직 `impeccable-detect.js`를 건드리지 않아 `design_signal=0`이었다. 위 1번의 `design_signal=true`는
  EXECUTE **이후** 상태이고, 같은 회차의 게이트가 그것을 본 것이 아니다. 이것은 M3의 결함이 아니라
  게이트 위치의 구조적 성질이며 `docs/gate-design.md`가 이미 소유한 사실이다.
- 따라서 **디자인 축이 발화한 채로 봉인된 게이트 receipt는 아직 없다.** 그 receipt는 이 사이클의
  `/mccp:pr`(mode=pr, 같은 signal_files를 본다)이 만들며, 이 노트를 쓰는 시점에 아직 실행되지
  않았다. 통과했다고 적지 않는다.
- **디자인 critique 자체를 수행하지 않았다.** 3번의 호출은 경로가 열리는지를 보는 관측이고, 이번
  변경 표면은 전부 control plane이다(오라클 · 명령 본문 · version 리터럴 2건). 렌더되는 UI가 없어
  critique가 판정할 대상이 없다. plan 단계의 `## Design Critique`가 이미 CONVERGED로 기록돼 있다.
- **stale plugin cache는 여전히 1.31.0이다.** 이 저장소 코드는 재배선됐지만 사용자 환경의 설치본은
  M1 이전이라, 이 세션 밖의 hook과 `${CLAUDE_PLUGIN_ROOT}` 경유 호출은 여전히 옛 술어로 돈다.
  `claude plugin update` 가 필요하고 그것은 사용자 조치다(Bash에서 `claude` 바이너리 ENOENT).
