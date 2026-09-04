# Plan: release-channel-separation M3 — release-runbook

**Source PRD**: .claude/prds/release-channel-separation.prd.md
**Selected Milestone**: M3 release-runbook
**Complexity**: Small

## Summary

`docs/release-channel.md`를 만들어 **릴리스 컷 절차**(version bump → tag → `release`
fast-forward → 확인)와 **롤백 절차**를 기록한다. 내용은 상상이 아니라 M1이 실제로 실행한
것의 전사다 — 명령·출력·소요 시간은 전부
[m1-report](.claude/PRPs/reports/release-channel-separation-m1-report.md)에 원문으로
남아 있고, M3은 그것을 절차 형태로 옮긴다.

**이 마일스톤을 규정하는 제약은 하나다: M1이 리허설을 돌린 노출 0 창이 이미 닫혔다.**
`ref: release`를 가진 `marketplace.json`은 머지됐고(`origin/main`), 그래서 오늘
`release`를 움직이는 것은 실험이 아니라 **운영자 자신의 다른 프로젝트 설치에 대한 실제
배포**다. M1 보고서가 그 구분을 명시적으로 세웠다("머지 후에 `release`를 되감으면 그것은
실험이 아니라 실제 강등 배포다"). 따라서 M3은 **2차 라이브 리허설을 하지 않는다.** M3의
라이브 완주는 런북의 **읽기 전용 절반**(선행조건 관측과 확인 블록)이고, 쓰기 절반의 증거는
M1의 실측 기록이다. 무엇이 측정됐고 무엇이 전사인지는 문서가 라벨로 구분한다.

M3은 또한 앞의 두 마일스톤이 자기에게 넘긴 것들을 닫는다 — `marketplace.json` 자체의 편집이
머지 즉시 도달하는 잔여(README:42가 "이 잔여는 M3이 소유한다"고 적었다) · 컷 트리거(PRD
Risks가 "M3의 런북이 정한다"고 적었다) · 릴리스 컷의 CHANGELOG 소유(PRD Out of scope가
"M3이 정한다"고 적었다) · PRD Open Question 1(M1이 답했으나 체크되지 않은 채 남았다) ·
2 · 3 · 5.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | M3은 M1의 라이브 검증이 무엇을 했는지 본 다음에 작성한다 — 상상이 아니라 기록이어야 한다 | direction |
| UI2 | 릴리스 컷 절차(version bump → tag → `release` fast-forward → 확인)와 롤백 절차가 `docs/release-channel.md`에 기록된다 | constraint |
| UI3 | 릴리스 자동화(CI에서 tag + fast-forward)는 하지 않는다. 수동 절차가 먼저 한 번 돌아야 자동화할 대상이 생긴다 | exclusion |
| UI4 | 단일 릴리스 라인만 둔다. v1 유지 라인은 만들지 않는다 | exclusion |
| UI5 | `sha`를 쓰지 않고 `ref`만 둔다. 릴리스는 `release`를 fast-forward하는 행위다. 사고 대응 시에만 `sha`를 일시적으로 추가한다 | constraint |
| UI6 | 다음 릴리스 컷의 번호는 `2.0.0`이고 시점은 운영자가 정한다 | direction |
| UI7 | 릴리스 컷마다 태그를 함께 찍는다 — 태그가 있으면 `sha` 없이도 되돌릴 좌표가 남는다 | constraint |
| UI8 | 컷 트리거를 PRD 완료에 결속하는 것은 M3의 런북이 정한다 | direction |
| UI9 | 릴리스 컷이 CHANGELOG를 어떻게 소유하는지는 M3이 정한다 | direction |
| UI10 | `marketplace.json` 자체의 편집이 머지 즉시 사용자에게 도달하는 잔여는 M3이 소유한다 | direction |
| UI11 | §3.7 버전 체계 자체는 바꾸지 않는다. 번호의 **소유자**만 브랜치에서 릴리스 컷으로 옮긴다 | constraint |
| UI12 | 각 구현의 실측 테스트는 marketplace 배포가 아니라 별도 설치 경로로 진행한다 | direction |
| UI13 | 30분에서 4시간이 된 회귀의 근인은 규명하지 않는다 | exclusion |
| UI14 | in-flight worktree가 이미 선언한 version은 회수하지 않는다 | exclusion |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Docs | `docs/dogfood-install.md` | 절차는 `docs/`가 소유하고 README·CLAUDE.md에는 포인터만 — M2가 이 PRD 안에서 세운 형태 |
| 금지 서술 | `docs/dogfood-install.md:72-84` | "캐시를 직접 고치는 것은 금지다" — 금지 · 근거 · 대체 경로를 한 절로 묶는다 |
| Evidence | `.claude/PRPs/reports/release-channel-separation-m1-report.md` | 실행된 명령과 출력을 원문으로 싣고 **경로만** `<HOME>` · `<PLUGINS>`로 치환한다 |
| 판별력 | `.claude/plans/release-channel-separation-m1.plan.md L29-35` | 관측은 실패할 수 있어야 한다 — 무변화 단독은 "채널이 잡고 있다"와 "기구가 죽었다"를 구별하지 못한다 |
| 기계 강제 | `scripts/version-declaration-guard.js:126-141` | 컷 면제는 `MCCP_RELEASE_CUT`이고 **값이 곧 사유**다. 런북은 이 규칙을 재기술하지 않고 가드를 호출한다 |
| Lease | `.claude/PRPs/reports/release-channel-separation-m1-report.md` D3 | 모든 force-push는 `--force-with-lease=<관측 SHA>` — 인자 없는 lease도, bare `--force`도 쓰지 않는다 |

## Multi-Perspective Fan-out

<!-- Auto-injected by /mccp:plan Phase 2.5 fan-out (read-only). -->
<!-- 두 가지만 손댔다. (1) 축약된 plan 경로 인용을 repo-root full 경로로 한정했다.
     (2) 그 인용의 `:NNN` 접미를 ` LNNN`으로 바꿨다 — 이 절이 아래에서 이미 쓰던 형태다.
     finding의 내용은 한 글자도 바뀌지 않았다.

     (2)의 근거를 정정한다. 이 자리에는 "L1 C6이 해소되지 않는 인용을 차단하기 때문"이라고
     적혀 있었고 그 방향이 **반대였다** — (1)이 C6을 고친 것이 아니라 깨뜨렸다. `CITATION_RE`
     (l1-check.js L66)의 첫 문자 클래스가 `[A-Za-z0-9_]`라 선행 `.`를 먹지 못하므로
     `.claude/x.md:<n>`은 `claude/x.md`로 잘려 나오고, 그 값은 `CITATION_BASES` 어느 base로도
     해소되지 않는다(`.claude` ≠ `claude`). 축약형(`x.plan.md:<n>`)도 마찬가지로 해소되지
     않으므로 **`.claude/` 파일을 가리키는 콜론 인용에는 통과하는 형태가 없다.** C6이 검사하는
     것은 `path:line` 형태뿐이고 바탕 경로 언급은 "prose, not a claim about a location"이라
     검사 대상이 아니므로(l1-check.js L64-65), 경로는 full로 두고 접미만 산문형으로 옮기면
     정확성과 C6 통과가 동시에 성립한다. 실측: 이 편집 전 L1 divergent(C6 ×2) → 편집 후
     converged. 검사기 한계 자체는 backlog로 이연했다(2026-09-04). -->

**Coverage**: 4/4 perspectives (architect, security, test, explorer) · spent ~38k.

### Findings (severity-ranked)

- **[CRITICAL][explorer]** M1's report .claude/PRPs/reports/release-channel-separation-m1-report.md is the mandated raw material for the runbook — M3 must transcribe from it, not invent new release-cut steps. — M1 plan Task 11 (.claude/plans/release-channel-separation-m1.plan.md L337-341): '이것이 M3 런북의 원재료다 — M3은 상상해서 쓰지 않고 여기서 옮겨 적는다(UI7). 런북 자체를 여기서 쓰지 않는다.'
- **[HIGH][test]** PRD M3 (release-runbook) has no plan yet and no acceptance-level validation spec — the PRD itself only says the runbook 'records' M1's procedure into docs/release-channel.md, with no stated command/assertion that proves the runbook is correct rather than merely prose. — PRD L80: '3 | release-runbook | 릴리스 컷 절차(...)와 롤백 절차가 docs/release-channel.md에 기록된다 | pending | —'
- **[HIGH][test]** Risk row 'channel을 나눈 뒤 운영자가 릴리스 컷을 잊어 사용자가 몇 달째 1.33.6에 머문다' is rated Likelihood=높음 and explicitly marked as unresolved by M1 and deferred to M3 — but the PRD gives M3 no acceptance criterion that actually forces a cadence trigger to exist (e.g., a check that fires when release lags main by N milestones); without a concrete oracle this risk stays open even after M3 ships. — PRD L99: '채널을 나눈 뒤 운영자가 릴리스 컷을 잊어... 높음 | 중 | 이 위험은 실재하며 M1이 해결하지 않는다... 컷 트리거를 PRD 완료에 결속하는 것은 M3의 런북이 정한다'
- **[HIGH][explorer]** The upcoming plan is almost certainly for M3 (release-runbook, status=pending). M1 and M2 are both complete — the plan should NOT re-derive channel-pin mechanics or dogfood-install procedure from scratch; it must transcribe M1's actual live-verification steps per PRD line 51 ('M3은 M1의 라이브 검증이 무엇을 했는지 본 다음에 작성한다') and UI7 in the M1 plan. — PRD .claude/prds/release-channel-separation.prd.md L78-80 (Delivery Milestones table: M1 complete, M2 complete, M3 pending) and :51 ('M3은 M1의 라이브 검증이 무엇을 했는지 본 다음에 작성한다')
- **[HIGH][explorer]** The exact rollback/verification command sequence (release ref move, tag, uninstall+reinstall fallback, cache backup as last resort) already exists fully spelled out in M1's plan Task 9 steps 6a/6b/6c and Task 2 — the runbook should reuse this literally rather than re-deriving a new rollback procedure. — .claude/plans/release-channel-separation-m1.plan.md L240-306 (Task 9 step 6: 상향 대조/하향 왕복/복원 3-path recovery: (1) update (2) uninstall+재설치 (3) 캐시 백업)
- **[HIGH][explorer]** version-declaration-guard.js already exists at repo root and is the canonical machine enforcement for 'branches don't declare version' — M3's runbook must reference/reuse this tool for the release-cut step (MCCP_RELEASE_CUT env) rather than re-describing bump mechanics from scratch. — scripts/version-declaration-guard.js:1-34 (header comment fully describes purpose, MCCP_RELEASE_CUT toggle, CI wiring)
- **[MEDIUM][architect]** M3's deliverable is a manual, human-executed runbook (docs/release-channel.md) with zero mechanical enforcement — there is no gate, script, or CI check verifying that a release cut actually followed the documented steps (bump -> tag -> fast-forward -> verify). This is a structural gap versus every other milestone axis in this codebase, which pairs prose with an enforcing script (e.g. version-declaration-guard.js for §3.7). — PRD L80: 'release-runbook — 릴리스 컷 절차(...)와 롤백 절차가 docs/release-channel.md에 기록된다.' PRD Risks L99: '채널을 나눈 뒤 운영자가 릴리스 컷을 잊어 사용자가 몇 달째 1.33.6에 머문다 — Likelihood 높음... 이 위험은 실재하며 M1이 해결하지 않는다.' No script equivalent to scripts/version-declaration-guard.js is scoped for the release-cut step itself.
- **[MEDIUM][architect]** Open Question 2 (whether version declaration moves from plugin.json to marketplace entry) is structurally significant to M3's scope but left unresolved — if M3's runbook assumes plugin.json remains the version SoT and that question is later answered 'yes', the runbook and CLAUDE.md §3.7 bump-location guidance go stale simultaneously, a two-surface drift risk the plan should flag as a dependency rather than leave as a bare open question. — PRD L87: '옮기지 않으면 결정 1은 관례로만 남는다. 비용·부작용 미조사.' This directly affects where release-runbook's 'version bump' step points.
- **[MEDIUM][architect]** M3 additionally decides CHANGELOG ownership semantics for release cuts, which is a cross-cutting concern already governed by CLAUDE.md §3.7's Unreleased-block convention and the version-declaration-guard.js CHANGELOG-heading check. M3 risks silently redefining a contract that a currently-shipped guard script already enforces structurally, without the plan naming that guard as a constraint. — PRD Out of scope L70: 'CHANGELOG 구조 변경 — 릴리스 컷이 CHANGELOG를 어떻게 소유하는지는 M3이 정한다. MVP 밖.' CLAUDE.md §3.7: 'CHANGELOG.md의 ## [Unreleased] 아래에 쌓이고, 릴리스 컷이 그 블록에 번호를 부여한다' plus scripts/version-declaration-guard.js checks for new ## [X.Y.Z] headings appearing pre-release-cut.
- **[MEDIUM][security]** PRD 결정 2는 `sha`를 쓰지 않고 `ref: release`만 사용하기로 못박았다 — 이는 immutable pin을 포기하는 것으로, `release` 브랜치에 write 권한을 가진 어떤 계정이 침해되면(또는 실수로) 임의 커밋으로 강제 이동될 수 있고 사용자는 다음 `claude plugin update`에서 그 내용을 그대로 받는다. 서명·해시 검증 메커니즘이 명시되지 않음. — PRD L60: "'sha'를 쓰지 않고 'ref'만 둔다... 다만 이 선택은 불변 핀을 포기하는 것이므로, 특정 커밋에 못박아야 하는 사고 대응 시에는 sha를 일시적으로 추가한다" — 사고 대응은 사후 대책일 뿐 사전 예방(브랜치 보호 규칙, force-push 금지 등)은 Scope/Risk 어디에도 없음
- **[MEDIUM][security]** `release` 브랜치에 대한 GitHub 저장소 branch protection(force-push 금지, 승인 리뷰 요구 등)이 PRD/M3 계획 범위 어디에도 명시되지 않았다 — release 브랜치가 일반 브랜치와 동일한 push 권한 모델을 가진다면 릴리스 컷 절차(fast-forward)를 우회한 임의 커밋 배포가 기술적으로 가능하다. — PRD Open Question 3: "'release'가 fast-forward 불가가 되는 경우의 처리... 강제 이동을 허용할 것인지" — 이는 무결성 통제가 아니라 편의성 논의로만 다뤄짐. M3(release-runbook)이 이 절차를 문서화할 예정이나 아직 pending
- **[MEDIUM][security]** 롤백이 version 하향을 요구하는데 Claude Code CLI가 실제로 이를 수용하는지 미검증 상태(Open Question 1)로 M3 런북 작성 시점까지 이어질 수 있다 — 검증 없이 '롤백 가능'이라고 런북에 기술하면 실제 사고 시 운영자가 거짓 안전망을 신뢰하게 되는 문서-실태 불일치 위험. — PRD L86 Open Question 1: "2.0.0에서 1.33.6으로 되돌릴 때 업데이트가 발생하는지 M1의 라이브 검증이 답해야 한다" — M1 status는 complete(L78)이나 이 질문이 checked([x])되지 않은 채 남아 있음(L86 unchecked)
- **[MEDIUM][test]** Open Question 1 (does the CLI accept a version downgrade during rollback) is only answered empirically for a single case (1.33.6 → ab6bcaa=1.33.4) in M1's Task 9-6b live rehearsal; the PRD does not commit to re-validating this each release cut, and M3's runbook risks encoding an unverified generalization from n=1. — PRD L86: 'M1의 라이브 검증이 답해야 한다' and M1 plan Task 9-6b note '6b가 거부로 끝났다면...'
- **[MEDIUM][test]** PRD Success Metric 1 ('사용자 노출 릴리스 수... 목표 PRD 단위 = 2~3주 1회') has no automated oracle defined — the 'how to measure' column cites a manual git log command but no test or CI check enforces the cadence; drift will only be caught by an operator remembering to look. — PRD L41: '어떻게 측정 | `git log release -- plugins/mccp/.claude-plugin/plugin.json` | 운영자 → 초과 시 컷 기준 재검토'
- **[MEDIUM][test]** M1 plan set a strong precedent of positive-control validation (Task 9-6a upward diff, channel-coordinate gate with literal expected SHA, before/after pairing to avoid unfalsifiable checks) — M3's plan for the runbook doc + rollback procedure should mirror this pattern (i.e., prove the runbook's rollback steps actually work by re-executing a real version bump+rollback, not just document prose) or explicitly state why a dry validation is acceptable for a docs-only milestone. — M1 plan L29-35 ('그 검증은 양성 대조(positive control)를 갖는다...') and L429 Risk row on unfalsifiable validation
- **[MEDIUM][explorer]** docs/dogfood-install.md explicitly declares it does NOT own release-cut/rollback/ref-move content and defers to docs/release-channel.md (M3's target file) — this boundary must be respected so the new doc doesn't duplicate dogfood-install's scope. — docs/dogfood-install.md:113-116: '릴리스 컷, 롤백, release ref의 이동 — 전부 M3 소유이고 docs/release-channel.md가 그 축을 갖는다. 이 문서는 배포 좌표를 하나도 움직이지 않는다.'
- **[MEDIUM][explorer]** PRD Open Question 3 ('release가 fast-forward 불가가 되는 경우의 처리') and Open Question 5 (autoUpdate: true 유지 여부) remain unchecked/unresolved — M3's runbook is the natural place to close or explicitly punt them, but the PRD gives no existing code path for either; plan should not assume prior art exists here. — PRD :88 (unchecked OQ on fast-forward failure) and :90 (unchecked OQ on autoUpdate)
- **[MEDIUM][explorer]** The release tag naming convention ('mccp--v1.33.6', matching 'claude plugin tag' format) was already established and pushed by M1 Task 3 — M3 runbook must reuse this exact tag naming scheme for future release cuts, not invent a new one. — .claude/plans/release-channel-separation-m1.plan.md L136-146 (Task 3: 'mccp--v1.33.6' 태그 name matches 'claude plugin tag' naming convention)
- **[LOW][architect]** The release-cut boundary (who/what writes plugin.json version, tags, and fast-forwards release) is left ambiguous — PRD explicitly defers automation but the M3 runbook doesn't state whether it should scaffold even a manual-invoke checklist script as a lower-risk seam for future automation. — PRD L71: '릴리스 자동화(CI에서 tag + fast-forward) — 수동 절차가 먼저 한 번 돌아야 자동화할 대상이 생긴다.' No mention of even a manual-invoke helper script analogous to version-declaration-guard.js.
- **[LOW][architect]** docs/release-channel.md must describe 'what M1 actually did' but M1's actual live-verification steps live only in the M1 plan file and git history — no canonical single source of truth is designated for M3 to derive from, risking drift once the M1 plan is archived per §3.11 once this PRD completes. — PRD L51: '특히 M3은 M1의 라이브 검증이 무엇을 했는지 본 다음에 작성한다.' CLAUDE.md §3.11 describes archived/ folder convention for completed PRDs+plans — once C0 completes, the M1 plan.md relocates to .claude/PRPs/plans/archived/, yet nothing requires M3's runbook to self-contain enough detail to not depend on that plan file remaining discoverable.
- **[LOW][security]** `known_marketplaces.json`의 source-type 전환(상대경로 → git-subdir + 원격 URL)이 기존 설치에 미치는 영향이 '미검증'으로 남아 있었고, 원격 fetch 경로로 전환하는 행위 자체가 attack surface를 로컬 파일시스템에서 네트워크(GitHub) 종속으로 확장한다 — MITM/DNS spoofing/GitHub 계정 탈취 시나리오가 새로 열리나 PRD Risk 표에는 '설치 파손' 관점만 있고 '악성 콘텐츠 주입' 관점이 없다. — PRD L23 Evidence 미검증 항목, L96 Risk 표 1행("기존 설치를 깨뜨린다"만 언급, integrity/tampering 언급 없음); marketplace.json L9-14가 https://github.com/idenn207/mccp.git 을 고정 소스로 지정
- **[LOW][security]** dogfood-install.md의 `--plugin-dir` 세션 opt-in 절차는 임의 로컬 worktree 경로를 hook 실행 표면으로 승격시킨다 — 다른 프로젝트에서 신뢰할 수 없는(또는 아직 리뷰 전인) worktree를 가리키면 그 세션의 모든 hook(SessionStart/Stop/PreCompact 등 29개)이 검증 안 된 코드로 실행된다. 문서는 이를 편의 기능으로만 서술하고 신뢰 경계 경고가 없다. — docs/dogfood-install.md L45-63 — 절차 3~4단계가 '표면이 전부 로드된다'를 성공 기준으로만 서술; L100-104 '한계' 섹션도 strictKnownMarketplaces 언급만 있고 신뢰되지 않은 worktree hook 실행 위험은 미기재
- **[LOW][test]** CHANGELOG structure ownership by the release cut is explicitly Out of Scope for the whole PRD but M3's outcome description implies it must define at least the cut procedure touching CHANGELOG — the PRD's own scope boundary conflicts with M3's stated Outcome, creating ambiguity in what M3's validation must cover. — PRD L70 'CHANGELOG 구조 변경 — 릴리스 컷이 CHANGELOG를 어떻게 소유하는지는 M3이 정한다. MVP 밖이다.' vs L80 M3 Outcome '릴리스 컷 절차(version bump → tag → release fast-forward → 확인)'
- **[LOW][test]** 'sha' pin fallback (PRD 결정 2) as an incident-response escape hatch has no defined test/validation trigger — the PRD says sha can be added 'temporarily' during incident response but never specifies who/what verifies it is removed afterward, risking silent permanent pinning that defeats 결정 2's ref-only design. — PRD L60: '특정 커밋에 못박아야 하는 사고 대응 시에는 sha를 일시적으로 추가한다'
- **[LOW][explorer]** CLAUDE.md §3.7 already documents the 4-surface version sync convention (plugin.json, html.js footer, markdown.js footer, CHANGELOG) and the forward-only bump collision resolution pattern — the runbook's version-bump step should point to §3.7 rather than restate it. — CLAUDE.md §3.7 '병렬 브랜치 version 충돌 — forward-only 상향' section; also mirrored in M1 plan's Patterns to Mirror table row 'Naming | html.js:1419'

### Meta-gaps

- No draft plan exists yet for M3 (release-runbook) — this fan-out was invoked with 'draft plan not yet written', so findings above are PRD-level and should be re-validated once the actual plan.md's Files to Change / User Intent tables exist.  _(architect)_
- PRD doesn't specify whether the runbook is prescriptive-only (docs) or should also produce a checklist/template artifact that future release-cut sessions fill in and commit as an audit trail (analogous to receipts) — affects whether M3's output is a single doc or doc+template pair.  _(architect)_
- No stated plan for what happens structurally when 'release' becomes non-fast-forwardable (PRD Open Question 3, unresolved) — could materially change the runbook's shape (force-push section vs. ancestor-invariant section) if M3 doesn't pick a stance.  _(architect)_
- PRD/M3 범위에 release 브랜치 자체의 접근통제(branch protection, 누가 fast-forward/force-push 권한을 갖는지)에 대한 명시적 정책이 없다 — M3 런북 작성 시 반드시 채워야 할 축.  _(security)_
- sha 미고정 결정(결정 2)의 보안적 대가(공급망 무결성 상실)가 '편의 vs 안전' 트레이드오프로 프레이밍되지 않았고, PRD Risk 표는 이를 '되돌릴 수 없는 브랜치 이동' 문제로만 축소했다 — 무결성/변조 관점이 빠짐.  _(security)_
- dogfood-install.md는 --plugin-dir로 여는 worktree의 출처 신뢰성(리뷰 여부, 협업자 공유 worktree 여부)에 대한 경계를 정하지 않았다.  _(security)_
- M2 롤백 검증(Open Question 1)이 M1 complete 이후에도 unchecked 상태로 남아, M3 런북이 미검증 전제 위에 작성될 위험이 문서 자체에 내재.  _(security)_
- PRD/M3 scope gives no explicit acceptance test for 'the runbook correctly enables a rollback' beyond re-reading M1's already-executed evidence — a plan should specify whether M3 requires a *second* live rehearsal (independent proof the doc is followable) or relies solely on transcribing M1's already-verified steps.  _(test)_
- No oracle is defined for detecting release-cadence drift (Success Metric 1) automatically; this is a docs-only PRD but the metric it exists to protect is operational, not documentable.  _(test)_
- PRD Open Question about autoUpdate:true retention is unresolved and untested — M3's runbook will encode assumptions about auto-delivery that haven't been validated (rollback + autoUpdate interaction untested).  _(test)_
- No mention of who/what verifies docs/release-channel.md stays in sync with actual release practice over time (regression risk: docs drift is invisible to CI since this is a manual-procedure milestone).  _(test)_
- No draft plan file exists yet for M3 — this fan-out ran against the PRD + M1/M2 plans only; the actual Files to Change / Tasks table for M3 cannot be cross-checked against a draft.  _(explorer)_
- PRD Out-of-scope explicitly excludes 'CHANGELOG 구조 변경' from C0 entirely (PRD:70) and defers that to M3 — but M3's own scope description (PRD:80) only mentions 'version bump → tag → release fast-forward → 확인' + rollback procedure; whether M3 should also decide CHANGELOG ownership under release cuts is ambiguous and not resolved by the PRD.  _(explorer)_
- No prior art exists in the codebase for an actual release-cut automation script (PRD Out-of-scope explicitly excludes CI automation: '릴리스 자동화(CI에서 tag + fast-forward)') — the runbook is necessarily a manual/doc-only artifact; a draft plan proposing any script/tool CREATE for the cut procedure itself would contradict PRD scope.  _(explorer)_

### Patterns to mirror

- scripts/version-declaration-guard.js + .github/workflows/version-declaration-gate.yml — three-axis mechanical check pattern (declaration / half-declaration / number-squatting); M3 could mirror this shape for a lightweight release-cut verifier even if manual-invoke only, per CLAUDE.md §3.7 decision-1 enforcement model.  _(architect)_
- M1 plan's convention 'docs/*.md owns background prose, CLAUDE.md/PRD holds only a pointer' (M1 plan Patterns to Mirror row: 'Docs | docs/gate-design.md | 배경 산문은 docs/가 소유하고 CLAUDE.md에는 포인터만 상주') — M3's docs/release-channel.md should follow the same locus-ownership split rather than duplicating procedure text into CLAUDE.md.  _(architect)_
- M1 plan's positive-control testing discipline (verification must be able to fail, not just observe an already-true state) — if M3's runbook includes a 'confirm release cut worked' step, it should specify a state that would fail if the cut didn't happen, not just re-check values that were already correct pre-cut.  _(architect)_
- PRD가 이미 '롤백 시 태그를 남긴다'는 완화책을 Risk 표(L97)에서 스스로 제시함 — 이 패턴(불변 좌표를 별도로 보존)을 release 브랜치 보호에도 확장 가능.  _(security)_
- docs/dogfood-install.md L72-84 '캐시를 직접 고치는 것은 금지다' 섹션의 명시적 금지+근거 서술 패턴은 release 브랜치 force-push 금지 규정을 문서화할 때 동일한 형식으로 재사용 가능.  _(security)_
- M1 plan's positive-control validation pattern (Task 9-6a: force an actual state change and observe it flip, rather than only checking absence-of-change which is indistinguishable from a dead update mechanism) — file: .claude/plans/release-channel-separation-m1.plan.md L29-35, L240-260  _(test)_
- M1 plan's 'channel coordinate gate' pre-PR literal-SHA assertion pattern to prevent unreviewed state leaking to users — .claude/plans/release-channel-separation-m1.plan.md Task 9 step 8 (L281-289) and ## Validation block (L384-386)  _(test)_
- M1's H4 pattern of redacting absolute paths in git-tracked report files via <PLUGINS>/<HOME> substitution, verified by a grep-for-leakage assertion — .claude/plans/release-channel-separation-m1.plan.md L343-356, L455  _(test)_
- M1's explicit 'Acceptance' section enumerating the exact evidentiary excerpts a report file must contain (not just 'tasks complete') — .claude/plans/release-channel-separation-m1.plan.md L442-467  _(test)_
- docs/gate-design.md pattern of '## 상세' anchors referenced from CLAUDE.md pointer-only sections (CLAUDE.md §3.9-3.18 all follow this) — docs/release-channel.md should likely follow the same background-doc-owns-detail / CLAUDE.md-owns-pointer split if the runbook needs a CLAUDE.md mention.  _(explorer)_
- release-channel-separation-m1.plan.md Task 11's H4 redaction pattern (absolute paths -> <PLUGINS>/<HOME> substitution) for any report/log excerpts the M3 runbook transcribes verbatim.  _(explorer)_
- scripts/version-declaration-guard.js MCCP_RELEASE_CUT env-as-reason pattern (value IS the reason, same shape as MCCP_REVIEW_SINGLE_PASS in §3.15) — reuse this convention rather than introducing a separate reason variable for release-cut runbook steps.  _(explorer)_

## Design Decisions

여기 있는 것은 **저자의 판단**이고 `## User Intent`의 사용자 진술과 구분된다.

**DD1 — 2차 라이브 리허설을 하지 않는다.** M1의 리허설(상향 대조 · 하향 왕복 · 복원)은
`origin/main`의 `marketplace.json`이 아직 상대 경로였을 때, 즉 `release`를 해소하는 소비자가
리허설 clone 하나뿐이던 창에서 수행됐다. 그 창은 PR #168 머지와 함께 닫혔다. 지금 같은
리허설을 반복하면 운영자의 실제 설치가 두 번 강등·복귀하며, 그것은 이 PRD가 없애려는 바로
그 행위(검증되지 않은 상태의 사용자 도달)다. **대신 M3은 읽기 전용 절반을 실제로 완주한다** —
`git ls-remote` · `merge-base --is-ancestor` 쌍 · 설치 상태 · 태그 실재 · branch protection
관측. 쓰기 절반은 M1이 이미 측정했고 그 원문이 보고서에 있다.

**DD2 — 새 스크립트도 CI 워크플로도 만들지 않는다.** fan-out의 architect MEDIUM이 "다른 모든
축은 산문에 강제기를 짝지었는데 M3만 순수 산문"이라고 지적했고, 그것은 사실이다. 그럼에도
만들지 않는 이유는 UI3이다 — **컷은 아직 단 한 번도 실행된 적이 없다.** 실행된 적 없는 절차를
자동화하면 자동화가 무엇을 지키는지 아무도 모른다. 강제기가 필요한 축(브랜치가 번호를
선언하지 않는다)은 이미 `version-declaration-guard.js` + CI가 갖고 있고, 런북은 그것을
호출한다. 컷 자체의 기계화는 첫 컷이 수동으로 한 번 돈 뒤의 축이며 backlog가 소유한다.

**DD3 — PRD Open Question 2는 "다른 수단으로 닫힘"으로 종결한다.** 그 질문의 전제는
"옮기지 않으면 결정 1은 관례로만 남는다"였는데, `scripts/version-declaration-guard.js` +
`.github/workflows/version-declaration-gate.yml`이 선언 위치를 옮기지 **않고** 기계화했다.
전제가 거짓이 됐으므로 질문은 조사 대상이 아니라 기록 대상이다. 선언 위치는 `plugin.json`에
그대로 두고, 그 결과 런북의 bump 단계는 §3.7의 4면 동기와 같은 표면을 가리킨다.

**DD4 — OQ3의 답: `release`는 항상 `main`의 조상이다.** 컷은 fast-forward **전용**이고, 유일한
비-FF 이동은 **롤백**이다. 롤백은 우발이 아니라 의도된 강제 이동이라 (i) 되돌릴 좌표 태그가
먼저 존재하고 (ii) `--force-with-lease=<관측 SHA>`로 결속하고 (iii) 사후에 그 사실이 기록된다.
FF가 깨졌다면(main rebase · release에서 먼저 나간 hot-fix) 답은 `release`를 강제로 전진시키는
것이 아니라 **main에 먼저 착지시킨 뒤 새 번호로 다시 컷**하는 것이다. 강제 전진을 허용하면
`git log origin/release..origin/main`이 의미를 잃고, 그 명령이 곧 컷 트리거의 관측 수단이다.

**DD5 — OQ5의 답: `autoUpdate: true`를 유지한다.** 근거는 추측이 아니라 M1 Acceptance 5의
실측이다 — clone이 사람 개입 없이 `origin/main`을 따라가는 동안 설치는 `1.33.6`/`647dfec`에
고정돼 있었다. 즉 채널 분리 후 auto-update가 최신으로 유지하는 것은 *marketplace clone*이고,
*plugin 본문*은 `release`가 잡는다. **한정**: 컷으로 `release`가 움직였을 때 사용자가
`claude plugin update`를 **명시적으로 실행하지 않고도** 받는지는 측정되지 않았다 — M1은 매번
그 명령을 직접 실행했다. 런북은 그 한정을 적고, 컷의 "확인" 단계가 명시 실행을 전제한다.

**DD6 — OQ9(CHANGELOG 소유)의 답: 컷이 `## [Unreleased]` 블록에 번호를 부여한다.** 착지한
작업은 번호 없는 그 블록에 쌓이고(이미 현행), 컷은 그 헤딩을 `## [X.Y.Z] — YYYY-MM-DD`로
바꾸고 그 위에 빈 `## [Unreleased]`를 새로 연다. 같은 컷에서 `currently \`X.Y.Z\`` 노트도
움직인다 — 그 둘과 footer 2면이 가드가 재는 네 얼굴이므로 **한 커밋 안에서 함께** 바뀌어야
한다. **PRD가 out-of-scope로 둔 "CHANGELOG 구조 변경"과 구분한다**: M3은 컷이 그 블록을
어떻게 소비하는지를 정할 뿐, 기존 이력의 붕괴(역전 2건 · `1.9.0` 중복 — 이미 backlog)를
건드리지 않는다.

**DD7 — `release` 브랜치 보호는 관측만 하고 설정하지 않는다.** fan-out security가 MEDIUM 2건으로
지적했고 실측 결과 보호는 **없다**(`gh api …/branches/release/protection` → 404). 설정하지 않는
이유는 두 가지다: (i) 이 저장소의 push 주체가 1인이라 오늘의 위협 모델은 계정 침해가 아니라
운영자 오조작이고, 그것은 런북의 lease 규칙이 다룬다 (ii) 보호를 켜면 롤백의 강제 이동이
막히는데, 그 상호작용은 측정된 바 없다 — 검증 없이 켜면 사고 대응 경로를 사고 중에 처음
발견하게 된다. 런북은 현재 상태(보호 없음)와 켤 때의 명령·상호작용 미지를 함께 적고,
설정은 backlog 축으로 넘긴다. §3.14대로 MEDIUM은 흡수하지 않고 증거와 함께 이연한다.

**DD8 — `MCCP_RELEASE_CUT`의 소유자는 런북이지 env registry가 아니다.** 이 변수는 저장소의
릴리스 정책이지 플러그인 런타임 토글이 아니다(가드 헤더가 같은 이유로 배포되지 않는
repo-root `scripts/`에 산다). registry의 정의역은 `docs/ENVIRONMENT.md` §3이 말하는 **운영
토글**이고, 배포 트리 밖의 릴리스 정책 변수는 그 정의역 밖이다.

**이것은 판단이지 기계가 강제하는 사실이 아니다 (L2 architect HIGH 흡수).** 이 자리에는
"registry에 넣으면 `env-contract/lint.js` L8/L10이 요구하는 런타임 read site가
`plugins/mccp/` 안에 없어 구조적으로 만족 불가"라고 적혀 있었고 **그 명제는 거짓이다** —
`env-contract/lint.js:536`은 evidence를 `path.join(root, rel)`로, 즉 **repo root 기준**으로
해소하므로 경로 도메인 제약이 없고, `scripts/version-declaration-guard.js:131`의
`const raw = env.MCCP_RELEASE_CUT;`는 L10 정방향의 ±2줄 창을 그대로 만족한다. 경로 제약은
`not-consumed` 역방향(`docs/environment/` 앵커 요구)에만 존재한다. 즉 registry에 넣는 것은
**가능하고**, 넣지 않는 것은 정의역에 대한 선택이다. 거짓 근거를 내구 문서에 봉인하지 않기
위해 근거를 교체하고, 강제기가 없다는 사실을 런북이 함께 적는다.

**DD9 — 런북은 자기완결적이어야 한다.** 이 PRD가 완료되면 §3.11대로 PRD와 plan이
`archived/`로 이동한다(보고서는 이동하지 않는다). 따라서 런북은 절차 본문을
`release-channel-separation-m1.plan.md` · `-m2.plan.md`에 의존해서는 안 되고, 인용이 필요하면
`.claude/PRPs/reports/`를 가리킨다. `## Validation` 검사 7이 이것을 기계로 잰다.

## Files to Change

| File | Action | Why |
|---|---|---|
| `docs/release-channel.md` | CREATE | M3의 본 산출물. 채널 구조 · 컷 절차 · 롤백 절차 · FF 불가 처리 · 컷 트리거 · CHANGELOG 소유 · 잔여와 한계 |
| `README.md` | UPDATE | 42행 "이 잔여는 M3이 소유한다"가 가리킬 목적지가 생겼다 — 포인터를 단다. 설치 명령 3줄은 무변경 |
| `CLAUDE.md` | UPDATE | §3.7의 릴리스 컷 문단(`MCCP_RELEASE_CUT`)이 절차 문서를 가리킨다. 절차 자체는 옮기지 않는다 — 포인터만 상주(§3.7 S3.7 resident 유지) |
| `.claude/prds/release-channel-separation.prd.md` | UPDATE | M3 행 `pending` → `in-progress` + `Plan` 셀. Open Question 1 체크 + 2·3·5에 답 기입 |
| `CHANGELOG.md` | UPDATE | `## [Unreleased]`에 M3 항목. **번호를 선언하지 않는다** — 우산 결정 1 |
| `.claude/plans/codex-findings-backlog.md` | UPDATE | DD2·DD7이 이연한 축과 게이트의 MEDIUM/LOW를 §3.14대로 적재 |
| `.claude/PRPs/reports/release-channel-separation-m3-report.md` | CREATE | 읽기 전용 실측의 원문. Acceptance가 이 파일을 요구하므로 표에 없으면 착지 vehicle이 정의되지 않는다 |

**건드리지 않는 것**: `.claude-plugin/marketplace.json`(릴리스 좌표) ·
`plugins/mccp/.claude-plugin/plugin.json`(우산 결정 1 — 브랜치는 번호를 선언하지 않는다) ·
두 renderer footer · `scripts/`(DD2) · `.github/workflows/`(DD2) · `docs/dogfood-install.md`
(M2 소유이고 그 문서가 릴리스 축을 이 문서에 넘겼다).

## Tasks

### Task 1: 브랜치를 세우고 삭제 사고를 검사한다

- **Action**: 작업은 `.worktrees/c0-release-channel-separation/`에서 하고(§3.8, M1·M2와 같은
  worktree) 브랜치는 `release-channel-m3-release-runbook`을 `origin/main`에서 딴다. M2는
  이미 머지됐으므로(`52e11d7`) 병합이 아니라 분기다.
- **Mirror**: CLAUDE.md §3.5.1 — 머지·리베이스가 반대편 신규 파일을 조용히 지운 선례
- **Validate**: `git diff --diff-filter=D --name-only origin/main...HEAD` 0건 ∧
  `git status --porcelain -uall`에 예상 밖 유입 0건 (`## Validation` 검사 11·12)

### Task 2: 릴리스 좌표의 현재 상태를 읽기 전용으로 실측한다

- **Action**: 아래를 실행하고 출력을 그대로 보고서에 싣는다. **어떤 좌표도 움직이지 않는다.**
  1. `git ls-remote origin refs/heads/release` — 채널 좌표 (원격 직접 읽기; 캐시된
     remote-tracking ref는 기구 사망과 무이동을 구별하지 못한다)
  2. **FF 판정 쌍** — `git merge-base --is-ancestor origin/release origin/main`(0이어야 한다)과
     그 **역방향**(비영점이어야 한다). 한쪽만 재면 "항상 0을 내는 검사"와 구별되지 않는다
  3. `git rev-list --count origin/release..origin/main` + `release` tip 커밋 날짜 — 컷 트리거의
     오늘 값
  4. `git ls-remote --tags origin` — `mccp--v1.33.6` 실재 (UI7이 말하는 되돌릴 좌표)
  5. `installed_plugins.json`의 `mccp@mccp` 항목 — `version` · `gitCommitSha` (경로는 `<HOME>`
     치환). `origin/release`와 일치하는지가 채널이 잡고 있다는 오늘의 증거다
  6. `gh api repos/idenn207/mccp/branches/release/protection` — 보호 유무 (DD7)
- **Mirror**: M1 보고서의 관측 **쌍** 형식 — 단독 값은 판정하지 않는다
- **Validate**: 6항 전부 보고서에 원문 수록. 2번이 쌍으로 기록되지 않으면 미완

### Task 3: `docs/release-channel.md`를 쓴다

- **Action**: 7개 절. 각 절은 **측정됨 / 전사됨 / 미측정** 중 하나로 라벨된다.
  1. **이 채널이 무엇인가** — `marketplace.json`의 `git-subdir` + `ref: release`. main은 dogfood
     trunk. 닫히는 표면은 plugin 본문 하나뿐이라는 한정 (M1이 세운 문장을 재사용하되 재기술).
  2. **릴리스 컷** — 선행조건(FF 가능 · 작업 트리 청결 · `## [Unreleased]` 비어있지 않음) →
     번호 결정(§3.7 판정 기준 그대로, 다음 컷은 `2.0.0` — UI6) → 4면 + CHANGELOG 헤딩을
     **한 커밋**으로(DD6) → `MCCP_RELEASE_CUT="<사유>"`로 가드 통과(값이 곧 사유, ≥30자·≥3단어) →
     main 머지 → 태그 `mccp--v<X.Y.Z>` → `release` **fast-forward** → 확인.
  3. **롤백** — M1이 실제로 실행한 것의 전사: 되돌릴 좌표(태그) 확인 → `git ls-remote`로 현재
     SHA 관측 → `--force-with-lease=refs/heads/release:<관측 SHA>` → `claude plugin update` →
     설치 `version`·`gitCommitSha` 확인. **실측값을 함께 적는다**: 하향 수용됨
     (`1.33.7 → 1.33.4`), 소요 12초, 대체 경로(uninstall+재설치 · 캐시 백업 복원)는
     사용되지 않았고 최후 수단으로만 남는다. **n=1 한정**을 명시한다 — 측정된 하향은 patch
     범위 1건이고 major 경계(`2.0.0 → 1.x`)는 측정된 바 없다.
  4. **fast-forward가 불가해졌을 때** — DD4. 강제 전진 금지 · main 경유 재컷 · bare `--force`
     금지와 그 이유.
  5. **컷 트리거** — UI8. PRD 완료(우산 자식 1개 종료)가 기본 트리거이고, 지표 1의 목표
     케이던스(PRD 단위 = 2~3주 1회)가 상한 감각이다. 관측 명령
     `git rev-list --count origin/release..origin/main` + tip 날짜. **"노출 감소"의 실패 모드가
     "노출 0"이라는 것**과, M3이 알람을 만들지 않는다는 것을 함께 적는다(UI3).
  6. **컷 밖에서도 사용자에게 즉시 도달하는 것** — UI10. `known_marketplaces.json`의 mccp 항목에
     `ref`가 없어 clone은 main을 추종하므로 `.claude-plugin/marketplace.json` **자체의 편집**은
     머지 즉시 도달한다. 그래서 그 파일은 릴리스 표면으로 취급하고, 편집 시 이 런북의 확인
     절차를 함께 돈다. 형태 단언(`git-subdir` · `ref: release` · `sha` 부재)이 그 파일의
     드리프트 탐지기이며, **그 단언이 사이클마다 실행돼야만 작동한다**는 약점을 적는다.
  7. **한계** — 컷은 아직 한 번도 실행되지 않았다 · 롤백은 n=1 · autoUpdate 하 자동 도달
     미측정(DD5) · branch protection 없음(DD7) · 측정 OS 1종.
- **Mirror**: `docs/dogfood-install.md`의 절 구성과 "금지 + 근거 + 대체 경로" 형태
- **Validate**: `## Validation` 검사 5·7·8·9

### Task 4: README에 포인터를 단다

- **Action**: 42행의 "이 잔여는 M3이 소유한다"를 목적지가 있는 문장으로 바꾼다(잔여 서술 자체는
  유지 — 사실이 변한 것이 아니라 소유자가 문서를 갖게 된 것이다). 설치 명령 3줄 무변경.
- **Validate**: 검사 6 (`release-channel` 포인터 존재) ∧ 설치 명령 블록 diff 0줄

### Task 5: CLAUDE.md §3.7에 포인터를 단다

- **Action**: "릴리스 컷만이 유일한 합법 경로이고, 그때는 `MCCP_RELEASE_CUT`에 사유를 담아
  켠다" 문단에 절차 문서 포인터를 붙인다. **절차를 옮기지 않는다** — §3.7은 resident로
  남고(instruction-contract ledger S3.7) 배경 산문은 `docs/`가 소유한다.
- **Validate**: 검사 6 ∧ 검사 10(`instruction-contract/lint.js` exit 0)

### Task 6: PRD를 갱신한다

- **Action**: (i) M3 행 `pending` → `in-progress`, `Plan` 셀에 이 계획 경로.
  (ii) Open Question 1을 `[x]`로 바꾸고 답과 근거 위치(M1 보고서 Acceptance 2)를 적는다 —
  M1이 답했는데 체크가 남아 fan-out security·test가 "미검증 전제 위에 런북을 쓴다"고 읽었다.
  (iii) OQ2·3·5에 각각 DD3·DD4·DD5의 답을 기입한다. **OQ4는 M2가 이미 닫았다** — 손대지 않는다.
- **Validate**: 검사 9 — PRD의 미체크 Open Question이 0건

### Task 7: CHANGELOG `## [Unreleased]`에 항목을 더한다

- **Action**: Added에 M3 항목. **번호가 붙은 헤딩을 만들지 않고 4면을 건드리지 않는다** —
  우산 결정 1. 이 마일스톤이 그 규칙의 소유자이므로 위반은 이중으로 비싸다.
- **Validate**: 검사 4 (`version-declaration-guard.js` exit 0)

### Task 8: 이연 축을 backlog에 적재한다

- **Action**: 최소 3건 — (a) 컷 절차의 기계화(첫 수동 컷 이후, DD2) (b) `release` branch
  protection 설정과 롤백 강제 이동의 상호작용 측정(DD7) (c) `marketplace.json` 형태 단언의
  CI화(Task 3-6의 약점). 게이트가 내는 MEDIUM/LOW도 같은 형식으로 §3.14대로 적재한다.
- **Validate**: 검사 13 — backlog에 이 사이클 날짜 행이 ≥3건

### Task 9: 보고서를 쓰고 유출을 검사한다

- **Action**: Task 2의 원문 + 라이브 완주 기록 + 편차. 경로는 `<HOME>`·`<PLUGINS>` 치환(H4).
  M1 close-out이 흡수한 교훈을 그대로 적용한다 — **기록을 남기는 것과 리터럴을 남기는 것은
  다르다**: grep 패턴을 인용할 때도 계정명 리터럴을 본문에 두지 않는다.
- **Validate**: 검사 8 (추가된 줄의 절대 경로 0건)

## Validation

이 블록은 **열거된 축의 게이트이지 이 마일스톤의 유일한 기계 지점이 아니다.** 여기 없는
축 — 런북이 실제로 실행된 명령만 담았는가, 라벨이 **정직한가**(컷 절이 정말 미측정인가) — 은
사람이 본다. 라벨의 **존재**는 검사 15가 기계로 잡는다(L2 test HIGH 흡수 — 이전에는 그 축만
기계 지점이 없었다). 각 검사는 실패 시 **비영점으로 끝난다**: `set -eu` 위에 축마다 명시
guard가 붙는다.

```bash
set -eu

# ── 1. 채널 불변 — M3은 릴리스 좌표를 하나도 움직이지 않는다 ─────────────────────
#
# 로컬 remote-tracking ref가 아니라 **원격을 직접** 읽는다. fetch가 실패하든 성공하고도
# ref를 갱신하지 못하든 캐시된 값이 그대로 해소돼 리터럴 비교가 통과하면, "기구 사망"과
# "채널 무이동"이 같은 모습이 된다 (M2 검사 1이 같은 이유로 ls-remote를 쓴다).
REMOTE_RELEASE=$(git ls-remote origin refs/heads/release | cut -f1)
[ -n "$REMOTE_RELEASE" ] \
  || { echo 'HALT: cannot read refs/heads/release from origin — the channel anchor observed nothing'; exit 1; }
#
# **이 리터럴에는 수명이 있다 (L2 architect LOW 흡수).** 검사가 재려는 명제는 "이 브랜치가
# 좌표를 움직였는가"인데 실제로 재는 것은 "원격 release가 이 커밋에 있는가"다. 둘은 첫
# 릴리스 컷 전까지만 일치한다 — 운영자가 컷을 하면(시점은 PRD 결정 3대로 운영자 소유) 이
# 검사는 붉어지고, **그 붉음은 결함이 아니라 채널이 실제로 움직였다는 뜻**이다. 그때의
# 정답은 검사를 지우는 것이 아니라 리터럴을 그 컷의 좌표로 갱신하는 것이다.
[ "$REMOTE_RELEASE" = "647dfecba75eecd9287ee538ca5f7056c7ba71da" ] \
  || { echo "HALT: origin/release=$REMOTE_RELEASE — either this branch moved the channel, or the first release cut has happened and this literal needs updating to that cut's coordinate"; exit 1; }

# ── 2. 릴리스 표면 무변경 — 이 브랜치의 diff에 배포 좌표 파일이 없다 ─────────────
#
# `git diff | grep -q`를 쓰지 않는다. 파이프라인의 종료코드는 grep의 것이고, git이 죽으면
# grep은 빈 입력에 1을 돌려 `if`가 거짓이 된다 — 즉 **기구 사망이 "무변경"으로 읽힌다**
# (M2 검사 2가 실측으로 확인한 형태).
git rev-parse --verify origin/main >/dev/null 2>&1 \
  || { echo 'HALT: origin/main is not resolvable — an unrunnable check must not read as clean'; exit 1; }
CHANGED_ALL=$(git diff --name-only origin/main...HEAD) \
  || { echo 'HALT: git diff failed — instrument failure, not an untouched surface'; exit 1; }
for f in '.claude-plugin/marketplace.json' \
         'plugins/mccp/.claude-plugin/plugin.json' \
         'plugins/mccp/scripts/lib/renderer/html.js' \
         'plugins/mccp/scripts/lib/renderer/markdown.js'; do
  if printf '%s\n' "$CHANGED_ALL" | grep -qx "$f"; then
    echo "HALT: M3 touched a release surface it declared untouched: $f"; exit 1
  fi
done

# ── 3. 릴리스 manifest 형태 재단언 — `sha` 임시 핀의 잔존 탐지기 ─────────────────
#
# UI5는 사고 대응 시 `sha`를 **일시적으로** 추가하는 것을 허용한다. 그 "일시"를 지키는
# 기계가 없으면 조용한 영구 핀이 되어 결정 2가 죽는다. 이 단언이 그 탐지기이고, 매
# 사이클 실행돼야만 작동한다는 것이 그 약점이다 — 런북 6절이 그 약점을 적는다.
node -e "
const s=JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json','utf8')).plugins[0].source;
const bad=[];
if (typeof s!=='object'||s===null) bad.push('source is not an object');
else {
  if (s.source!=='git-subdir') bad.push('source.source='+JSON.stringify(s.source));
  if (s.ref!=='release')       bad.push('source.ref='+JSON.stringify(s.ref));
  if (s.path!=='plugins/mccp') bad.push('source.path='+JSON.stringify(s.path));
  if (!s.url)                  bad.push('source.url missing');
  if ('sha' in s)              bad.push('source.sha present — a temporary incident pin outlived its incident');
}
if (bad.length) { console.error('FAIL: '+bad.join(' | ')); process.exit(1); }
console.log('ok: release manifest shape intact');
" || { echo 'HALT: release manifest shape assertion failed'; exit 1; }

# ── 4. 이 브랜치가 version을 선언하지 않았는가 ───────────────────────────────────
#
# 판정은 이 계획이 아니라 저장소 인프라가 소유한다 — 오라클을 재구현하지 않고 호출한다.
# 두 벌을 쓰면 drift가 시간 문제다. M3은 이 규칙의 소유 마일스톤이므로 위반은 이중으로
# 비싸다.
#
# **주변 env가 이 게이트를 조용히 열 수 있다 (L2 invariant MEDIUM · security LOW 흡수).**
# `releaseCutReason`은 `MCCP_RELEASE_CUT`이 세팅돼 있으면 위반이 있어도 exit 0을 내는데
# (`scripts/version-declaration-guard.js:239`), 이 런북이 바로 그 변수를 쓰라고 가르치므로 운영자
# 셸에 남을 개연성이 실재한다. §3.12에서 ambient `codex_disabled`가 proof로 인정되던 결함과
# 같은 형태라 같은 방향으로 닫는다 — 면제는 **명시적일 때만** 유효하다.
[ -z "${MCCP_RELEASE_CUT:-}" ] \
  || { echo 'HALT: MCCP_RELEASE_CUT is set in this shell — the guard would exempt this branch on an ambient value. This is a milestone PR, not a release cut: unset it and re-run.'; exit 1; }
node scripts/version-declaration-guard.js --base origin/main \
  || { echo 'HALT: this branch declares a version — see umbrella decision 1'; exit 1; }

# ── 5. 산출물 실재 ───────────────────────────────────────────────────────────────
test -f docs/release-channel.md \
  || { echo 'HALT: M3 deliverable missing'; exit 1; }
test -f .claude/PRPs/reports/release-channel-separation-m3-report.md \
  || { echo 'HALT: M3 report missing — the leak detector below would report clean on an absent file'; exit 1; }

# ── 6. 포인터 — 절차는 docs가 소유하고 나머지는 가리키기만 한다 ──────────────────
grep -q 'docs/release-channel.md' README.md \
  || { echo 'HALT: README has no pointer to the runbook'; exit 1; }
grep -q 'docs/release-channel.md' CLAUDE.md \
  || { echo 'HALT: CLAUDE.md 3.7 has no pointer to the runbook'; exit 1; }

# ── 7. 런북 자기완결성 — 아카이브될 파일에 절차를 의존하지 않는다 ────────────────
#
# 이 PRD가 완료되면 §3.11대로 plan이 .claude/PRPs/plans/archived/ 로 이동한다. 보고서는
# 이동하지 않으므로 인용은 보고서를 가리켜야 한다.
#
# **범위가 불변식보다 좁았다 (L2 architect MEDIUM · test MEDIUM 흡수).** 이전 형태는 m1·m2
# plan **두 파일만** 열거해서 이 마일스톤 자신의 plan(`-m3`)과 PRD를 놓쳤는데, §3.11은
# 그 둘도 각각 `.claude/PRPs/plans/archived/`와 `.claude/prds/archived/`로 옮긴다. 이동
# 대상 전체를 형태로 잡는다.
if grep -nE '\.claude/(plans/[A-Za-z0-9._-]+\.plan\.md|PRPs/plans/[A-Za-z0-9._-]+\.plan\.md|prds/[A-Za-z0-9._-]+\.prd\.md)' docs/release-channel.md; then
  echo 'HALT: the runbook cites a plan or PRD that archiving will relocate — cite .claude/PRPs/reports/ (which does not move) instead'; exit 1
fi

# ── 8. 좌표 정직성 — 런북이 인용하는 커밋 SHA가 전부 실재한다 ────────────────────
#
# 지어낸 좌표를 막는 유일한 기계 검사다. 16진 토큰(≥7자)을 전부 뽑아 해소를 요구하므로,
# 영어 단어가 우연히 16진으로만 이뤄져도 실패한다 — 그때의 정답은 검사 완화가 아니라
# **좌표 문서에서 모호한 16진 토큰을 치우는 것**이다(fail-closed 방향).
for TOK in $(grep -oE '\b[0-9a-f]{7,40}\b' docs/release-channel.md | sort -u); do
  git cat-file -e "${TOK}^{commit}" 2>/dev/null \
    || { echo "HALT: runbook cites an unresolvable coordinate: $TOK"; exit 1; }
done

# ── 9. bare force 금지 — lease 없는 강제 이동을 문서가 권하지 않는다 ─────────────
#
# M1 D3이 흡수한 규율(모든 force-push는 관측 SHA에 결속된 명시 lease)을 문서가 어기면
# 그 규율은 이 사이클 이후 사라진다.
#
# **금지 형태는 셋인데 하나만 잡고 있었다 (L2 security · test · invariant 세 관점이 독립적으로
# 지적).** `## Patterns to Mirror`는 "인자 없는 lease도, bare `--force`도 쓰지 않는다"고
# 적는데 이전 정규식은 bare `--force`만 봤다 — `git push -f`, refspec `+release:release`,
# 그리고 **인자 없는 `--force-with-lease`**(D3이 지목한 바로 그 footgun이자 올바른 형태처럼
# 보이는 것)가 전부 통과했다. 파괴적 명령을 가르치는 유일 산출물에서 게이트가 게이트처럼
# 보이면서 금지 대부분을 통과시키는 상태였다.
if grep -nE 'git push[^|]*(--force([^-]|$)|(^| )-f( |$)|[^A-Za-z0-9_]\+[A-Za-z0-9_./-]+:)' docs/release-channel.md; then
  echo 'HALT: the runbook shows a forced push without an explicit lease (bare --force, -f, or a + refspec)'; exit 1
fi
if grep -nE '\-\-force-with-lease([^=]|$)' docs/release-channel.md; then
  echo 'HALT: the runbook shows an argument-less --force-with-lease — it must bind to an observed SHA (--force-with-lease=refs/heads/release:<sha>)'; exit 1
fi

# ── 10. PRD Open Question이 전부 닫혔다 ──────────────────────────────────────────
#
# M1이 답한 OQ1이 unchecked로 남아 fan-out의 두 관점이 "미검증 전제"로 읽었다. 남은
# 미체크가 있으면 이 사이클이 그것을 답했거나, 답하지 않았음을 PRD에 명시해야 한다.
OPEN_Q=$(grep -c '^- \[ \] \*\*' .claude/prds/release-channel-separation.prd.md || true)
[ "$OPEN_Q" = "0" ] \
  || { echo "HALT: $OPEN_Q Open Question(s) still unchecked in the PRD"; exit 1; }

# ── 11. 문서 계약 lint (CLAUDE.md 편집) ──────────────────────────────────────────
node plugins/mccp/scripts/lib/instruction-contract/lint.js \
  --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md \
  || { echo 'HALT: instruction-contract lint failed'; exit 1; }

# ── 12. 삭제 사고 + 트리 오염 (§3.5.1) ───────────────────────────────────────────
DELETED=$(git diff --diff-filter=D --name-only origin/main...HEAD) \
  || { echo 'HALT: git diff failed while checking deletions'; exit 1; }
[ -z "$DELETED" ] \
  || { echo "HALT: this branch deletes files: $DELETED"; exit 1; }

# ── 13. 경로 유출 — 이 브랜치가 **추가한** 줄에 절대 경로 0건 ────────────────────
#
# 이름(계정명)이 아니라 **형태**를 본다: 드라이브 문자 · POSIX 홈 루트 · MSYS 드라이브 ·
# UNC. 전문이 아니라 추가된 줄만 보는 것은 선재 항목이 이 검사를 결정론적으로 붉게
# 만들기 때문이다 (M2 검사 7의 R2 흡수와 같은 형태).
#
# **두 결함을 함께 닫는다 (L2 security MEDIUM ×2 · invariant LOW 흡수).** (i) 이전 형태는
# 검사 2가 스스로 금지한 파이프라인 패턴이었다 — `git diff | grep | grep -v || true`는
# git이 죽어도 `$ADDED`가 비어 유출 게이트가 "깨끗함"으로 통과한다. 이 저장소의 단 하나뿐인
# 유출 탐지기가 fail-open이었다. (ii) pathspec이 이 브랜치가 쓰는 tracked 7파일 중 4개만
# 덮었다 — Task 8이 backlog에, Task 6이 PRD에 이 사이클의 증거를 적는데 그 둘과 CHANGELOG가
# 빠져 있었다.
git rev-parse --verify origin/main >/dev/null 2>&1 \
  || { echo 'HALT: origin/main is not resolvable — the leak detector cannot run, and an unrunnable detector must not read as clean'; exit 1; }
RAW_DIFF=$(git diff --unified=0 origin/main...HEAD -- \
             docs README.md CLAUDE.md CHANGELOG.md \
             .claude/PRPs/reports .claude/prds .claude/plans/codex-findings-backlog.md) \
  || { echo 'HALT: git diff failed while scanning for leaked paths — instrument failure, not a clean tree'; exit 1; }
ADDED=$(printf '%s\n' "$RAW_DIFF" | grep '^+' | grep -v '^+++' || true)
if printf '%s\n' "$ADDED" | grep -qE '(^|[^A-Za-z0-9])[A-Za-z]:[\\/]|/home/[A-Za-z0-9._-]+/|/[a-z]/Users/|\\\\\\\\[A-Za-z0-9._-]+\\\\'; then
  echo 'HALT: an added line carries an absolute path — redact with <HOME>/<PLUGINS>'; exit 1
fi

# ── 14. 이연 축이 실제로 적재됐다 ────────────────────────────────────────────────
#
# **행 형식이 canonical writer와 어긋나 있었다 (L2 architect MEDIUM · test LOW 흡수).**
# `plan-review/backlog-append.js:170`은 `'| ' + ...`로 **선행 파이프**를 내고
# `derive/sources/backlog.js:41-43`이 그것을 canonical이라 적으며 파일의 최신 블록도 전부
# 그 형태다. 선행 파이프 없는 줄만 세면 규격대로 적재했을 때 0을 세어 HALT하고, 통과시키려면
# 비정규 형태를 쓰게 된다 — 게이트가 잘못된 형식을 유도하는 상태였다.
BACKLOG_ROWS=$(grep -c "^| $(date +%Y-%m-%d) |" .claude/plans/codex-findings-backlog.md || true)
[ "$BACKLOG_ROWS" -ge 3 ] \
  || { echo "HALT: deferred axes not recorded (found $BACKLOG_ROWS rows dated today, need >=3)"; exit 1; }

# ── 15. 증거 라벨 — 이 마일스톤이 자기 유일한 실패 모드라 부른 축 ────────────────
#
# **L2 test HIGH 흡수.** Risks가 "라벨을 숨기는 것이 유일한 실패"라 적고 Acceptance가 "각
# 절이 측정됨/전사됨/미측정으로 라벨된다"고 요구하는데, 그 축만 기계 지점이 없고 훨씬 가벼운
# 성질들(bare force · plan 인용 · 포인터 문자열)은 각각 grep을 받았다. 그 비대칭은 정당화되지
# 않는다 — 단언이 자명하게 greppable하기 때문이다.
#
# 이 검사가 재는 것은 **라벨의 존재**이지 정직성이 아니다. 정직성(컷 절이 정말 미측정인가)은
# 여전히 사람이 본다. 그러나 라벨을 아예 빠뜨리는 것 — 이 마일스톤이 지목한 실패 형태 — 은
# 이제 기계가 막는다.
node -e "
const fs=require('fs');
const t=fs.readFileSync('docs/release-channel.md','utf8');
const bad=[];
t.split(/\n(?=## )/).forEach(function(sec){
  const m=/^## (.+)/.exec(sec);
  if(!m) return;
  if(!/(측정됨|전사됨|미측정)/.test(sec)) bad.push(m[1].trim());
});
if(bad.length){console.error('FAIL: sections carrying no evidence label: '+bad.join(' | '));process.exit(1);}
console.log('ok: every section carries an evidence label');
" || { echo 'HALT: a runbook section carries no 측정됨/전사됨/미측정 label — the one failure mode this milestone named for itself'; exit 1; }

echo 'ALL VALIDATION CHECKS PASSED'
```

**라이브 완주 (단위 검사와 별개)** — 위 블록은 산출물을 검사할 뿐 절차가 도는 것을 보지
않는다. Task 2의 6항을 실제로 실행하고 그 출력을 보고서 `## 실측 원문`에 싣는 것이 이
마일스톤의 경로 완주이며, 특히 **FF 판정 쌍**(정방향 0 / 역방향 비영점)이 없으면 그 검사는
"항상 통과하는 관측"과 구별되지 않는다.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 런북이 **한 번도 실행되지 않은 절차**(컷)를 기술한다 | **확실 (설계상)** | 절마다 측정됨/전사됨/미측정 라벨을 붙인다. 컷 절이 "미측정"이라는 사실이 문서의 1급 내용이며, 그것을 숨기는 것이 유일한 실패다. 첫 컷이 돌면 그 실측으로 라벨이 바뀐다 |
| 2차 라이브 리허설을 하지 않아 롤백 주장이 M1의 n=1에 의존한다 | **확실 (설계상)** | DD1. 대안은 실제 배포 강등이고 그것이 더 나쁘다. n=1과 그 범위(patch 하향 1건, major 경계 미측정)를 런북이 명시한다 |
| 순수 산문이라 강제기가 없어 문서가 실무와 어긋난다 | 중 | DD2 — 컷이 수동으로 한 번 돌기 전의 자동화는 무엇을 지키는지 모른다. 대신 (a) `## Validation` 검사 3·8·9가 문서의 검증 가능한 부분을 기계로 잡고 (b) 기계화가 backlog 축으로 등재된다 |
| 컷을 잊어 사용자가 몇 달째 `1.33.6`에 머문다 | **높음** | **M3이 닫지 않는다.** 런북이 트리거와 관측 명령을 정의할 뿐 알람은 만들지 않는다(UI3). PRD Risks가 이미 "노출 감소의 실패 모드는 노출 0"이라 적었고, 오늘 값(2일 · 138커밋)을 보고서가 남겨 다음 사이클이 대조할 수 있게 한다 |
| `release` 보호가 없어 절차를 우회한 push가 기술적으로 가능하다 | 중 | DD7 — 관측하고 적되 켜지 않는다. 오늘 위협 모델은 계정 침해가 아니라 운영자 오조작이고 lease 규칙이 그것을 다룬다. 보호와 롤백 강제 이동의 상호작용은 미측정이라 사고 중에 처음 발견하지 않도록 backlog로 넘긴다 |
| 검사 8이 영어 단어를 커밋 SHA로 오인해 붉어진다 | 낮음 | fail-closed 방향이라 안전하다. 정답은 검사 완화가 아니라 좌표 문서에서 그 토큰을 치우는 것이며 그 판단이 주석에 있다 |
| PRD Open Question을 전부 닫으면서 근거 없이 닫는다 | 중 | 각 답이 근거를 함께 싣는다 — OQ1은 M1 Acceptance 2, OQ2는 가드+CI의 실재, OQ3은 DD4의 논증, OQ5는 M1 Acceptance 5의 실측과 그 한정. 근거를 못 대는 질문은 닫지 않고 남긴다 |

## Acceptance

- [x] All tasks complete
- [x] Validation passes (검사 1~15 전건 exit 0 — 검사 15는 L2 test HIGH 흡수로 신설됐다)
- [x] Patterns mirrored, not reinvented
- [x] **게이트/경로를 실제로 1회 완주하고 산출물을 확인** — Task 2의 6항을 실행하고 그 출력이
      보고서 `## 실측 원문`에 원문으로 실린다. 특히 **FF 판정 쌍**(정방향 exit 0 · 역방향
      비영점)과 **설치 상태 쌍**(`version`·`gitCommitSha`가 `origin/release`와 일치)이 함께
      있어야 한다 — 단독 값은 채널이 잡고 있다는 것을 증명하지 못한다
- [x] `docs/release-channel.md`가 Task 3의 7절을 갖고, 각 절이 측정됨/전사됨/미측정으로
      라벨된다
- [x] 롤백 절이 M1의 실측값(`1.33.7 → 1.33.4` 하향 수용 · 12초 · 대체 경로 미사용)을 담고
      **n=1 한정**을 명시한다
- [x] PRD Open Question 1·2·3·5가 답 또는 명시 이연으로 닫히고, 각 답이 근거 위치를 갖는다
- [x] 릴리스 좌표 무이동 — `origin/release`가 `647dfec…`에서 움직이지 않았고
      `.claude-plugin/marketplace.json` diff가 0줄이다

## External Research Provenance

- Source PRD: .claude/prds/release-channel-separation.prd.md
- References section sha256: 53a925d7dee3c6675e30dd695f7deb1d82e5e496b092c060a609975356528d3b
- Stamped at: 2026-09-03T08:51:50.815Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt's plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.

## Design Critique

- 탐지: `skill_available=true` · `design_signal=true` · `signal_files=["<keyword:design>"]` ·
  `impeccable_invocation=impeccable` (source `user`, v4.0.4)
- 트리거의 성격: **렌더링 표면이 아니라 키워드다.** 이 계획서에는 `## Design Decisions` ·
  `frontend-design-direction` · `design-critique` 같은 낱말이 있지만 이 마일스톤이 만드는
  산출물은 `docs/release-channel.md` 한 개의 산문 문서이고, `## Files to Change`가
  렌더러 두 면(`renderer/html.js` · `renderer/markdown.js`)을 **명시적으로 건드리지
  않는 것**으로 못박는다. 즉 critique이 볼 렌더 표면이 존재하지 않는다.
- SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md`
  `## Output Constraints` 4개 앵커를 Read함. 이 계획서 자체에 대해서도 H15(heading depth ≤ 3)는
  성립한다 — 최대 깊이가 `###`이다.
- 결과: findings 0건 → `decideCritique({findings: [], round: 0, cap: 2})` = **CONVERGED**
  (rounds=1, cap=`MCCP_DESIGN_CRITIQUE_MAX_RETRY` 기본 2)
- receipt로 전달: `--design-critique-rounds 1 --design-critique-verdict converged`

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->

## Design Routing Guide

routing mode: auto (effective at implement stage). At implement the design gate routes these
stage-appropriate impeccable commands; here they are a checklist only.

**이 마일스톤에서는 어느 행도 발화하지 않을 것으로 예상된다** — 산출물이 산문 문서 한 개이고
`## Files to Change`가 렌더링 표면을 명시적으로 제외하므로, implement 단계의
`renderingSurface=0` 분기가 refine/discovery를 강등한다. 표를 싣는 이유는 오라클이 낸 것을
숨기지 않기 위해서다.

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

## Review Absorption — L2 패널 round 0

이 절은 `/mccp:plan` Phase 5.2의 L2 반박 패널이 이 계획서에 대해 **실제로 낸 판정**과 그
처리를 기록한다. 원문은 [.claude/reviews/plan-review-release-channel-separation-m3.md](.claude/reviews/plan-review-release-channel-separation-m3.md)에 있다.

**판정: `divergent` — quorum 3/4 미충족 (pass 2 · fail 2, responded 4).** blocking finding
4건(architect HIGH·FAIL, test HIGH·FAIL). 이 계획서는 그래서 **승인 receipt 없이** 착지한다
(아래 "게이트 상태" 참조).

| 관점 | verdict | 지적 | 처리 |
|---|---|---|---|
| architect | fail | DD8이 "기계가 이미 강제한다"는 **거짓 명제**를 근거로 삼음 (HIGH) | **흡수** — 근거 교체 + 반증 기록 |
| architect | fail | 검사 7이 DD9 불변식보다 좁음 (MEDIUM) | **흡수** — 이동 대상 전체를 형태로 매칭 |
| architect | fail | 검사 14의 backlog 행 형식이 canonical writer와 어긋남 (MEDIUM) | **흡수** — 선행 파이프 |
| architect | fail | 검사 1의 리터럴 SHA가 첫 컷에 붉어짐 (LOW) | **흡수** — 수명을 주석과 실패 메시지에 명시 |
| security | pass | 검사 9가 금지 3형태 중 1형태만 잡음 (MEDIUM) | **흡수** — 3형태 + 인자 없는 lease |
| security | pass | 검사 13의 pathspec이 tracked 7파일 중 4개만 덮음 (MEDIUM) | **흡수** — PRD·backlog·CHANGELOG 추가 |
| security | pass | 검사 13이 기구 사망 시 fail-open (MEDIUM) | **흡수** — liveness guard + 분리 대입 |
| security | pass | ambient `MCCP_RELEASE_CUT`이 검사 4를 면제 (LOW) | **흡수** — 부재 단언 선행 |
| test | fail | 이 마일스톤이 **자기 유일한 실패 모드**라 부른 라벨 축만 기계 지점이 없음 (HIGH) | **흡수** — 검사 15 신설 |
| test | fail | 검사 7 범위 (MEDIUM) · 검사 9 절반 (MEDIUM) · 검사 14 형식 (LOW) | **흡수** (architect·security와 동일 축) |
| invariant | pass | 검사 4 ambient env (MEDIUM) · 검사 9 절반 (MEDIUM) · 검사 13 fail-open (LOW) | **흡수** (동일 축) |

**15건 전건 흡수, 이연 0건.** §3.14는 HIGH/CRITICAL만 그 자리에서 흡수하고 MEDIUM/LOW는
이연하라고 정하지만, 여기 MEDIUM/LOW는 **제품 지적이 아니라 이 계획서의 `## Validation`
블록 자체의 결함**이다 — 그 블록은 implement 단계의 계약이므로, 알면서 깨진 게이트를 실어
보내는 것이 이연이 아니라 손실이다. 흡수는 전부 **round 0 안에서** 끝났고 라운드를 늘리지
않았다(§3.16).

**수렴이 신호였다.** 검사 9는 세 관점이, 검사 13·14·7·4는 각각 두 관점이 독립적으로
지적했다. 서로를 볼 수 없는 리뷰어들이 같은 줄에 모인 것이 그 지적들을 MEDIUM 표기보다
무겁게 읽은 근거다.

**게이트 상태 — 이 계획서는 승인되지 않았다.** 흡수가 계획 본문을 바꿨으므로 `emit-workflow-args`가
봉인한 `reviewed_plan_hash`(`sha256:3097ebb3…`)와 디스크의 본문이 더는 일치하지 않는다.
DD13 결속상 그 상태에서는 어떤 receipt도 봉인될 수 없고, 라운드 캡(`MCCP_GATE_ROUND_CAP=1`,
`rounds_so_far=1`)이 재리뷰를 거부하므로 이 사이클에서 승인은 성립하지 않는다. 위조하지
않는 쪽을 택했다 — **`mccp-plan-codex` receipt는 작성되지 않았다.** 이 저장소는
`MCCP_RECEIPT_GATE_MODE=soft`라 누락 receipt는 `/mccp:prp-implement` 진입을 막지 않으며,
그 진입이 승인을 뜻하지 않는다는 사실이 여기 기록으로 남는다.

### 재진입 후속 (2026-09-04) — 라운드를 늘리지 않고 확인한 것

`/mccp:plan`을 같은 plan으로 다시 불렀다. 새 라운드는 열지 않았고(§3.16), 원장을 소비하지
않는 `l1`·`decide`만 돌려 위 "게이트 상태" 문단이 **추론이 아니라 측정**이 되게 했다.

| 확인 | 방법 | 결과 |
|---|---|---|
| 재리뷰 가능 여부 | `.claude/state/review-rounds/mccp-plan-codex__release-channel-separation-m3.json` | `rounds:[{index:0}]` · 봉인 `cap:1` → 2라운드는 거부된다 |
| receipt 봉인 가능 여부 | `decide --mode multi-agent` (원장 미소비) | `unavailable` · exit 12 · "plan changed after L2 read it" |
| 단일통과 토글로 열리는가 | 같은 호출에 `MCCP_REVIEW_SINGLE_PASS=deferred_to_prd_completion` | **열리지 않는다** — DD13 결속이 완화 분기보다 위라 `unavailable`은 완화 대상이 아니다(§3.15) |

즉 이 사이클에서 승인 receipt가 없는 것은 선택이 아니라 **기계적 귀결**이다. 위 표가 그
사실의 재현 절차다.

**한 건을 더 고쳤다 — 흡수가 만든 L1 회귀.** 위 표를 재는 과정에서 L1이 `C6_UNRESOLVED_CITATION`
2건으로 divergent를 냈다(R0의 `l1.json`은 `converged` · 위반 0). 원인은 흡수 편집이 fan-out
인용을 `.claude/…` full 경로로 한정한 것이었고, 그 편집의 주석은 근거를 **반대로** 적고
있었다(정정문은 그 자리에 남겼다). `CITATION_RE`가 선행 점을 먹지 못해 `.claude/`를 가리키는
콜론 인용은 통과 형태가 아예 없으므로, 경로는 full로 두고 접미만 이 절이 이미 쓰던 산문형
(` LNNN`)으로 옮겼다 — 5건, 2 rel. 실측: 편집 후 L1 `converged` · 위반 0. 검사기 한계 자체는
제품 결함이지만 이 마일스톤의 `Files to Change` 밖이라 §3.14대로 backlog에 이연했다
(2026-09-04 MEDIUM 1행, `scanBacklog` 파싱 확인 `invalid_count=0`).

**이연 총계 1건.** 위 "15건 전건 흡수"는 그대로다 — 이 1건은 R0 패널의 지적이 아니라 재진입
과정에서 새로 관측된 축이다.

## Codex Implementation Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 결과: `classification=disabled` · `blocking=false` · `durationMs=1` — spawn 직전 short-circuit
- 라운드 수: 1 (봉인된 캡 `cap=1 mode=enforce pinned-by=codex-disabled`)
- 합치 결론: **Codex는 발화하지 않았다.** `MCCP_CODEX_DISABLED=1`이 이 환경의 영구 운영자
  정책이고 2.5.0이 그것을 `codex-policy.json`에 봉인했다. 이것은 장애가 아니라 정책이며,
  receipt는 `codex_verdict=skipped`로 그 사실을 그대로 봉인한다 — cross-gate dedupe는
  `converged`가 아닌 모든 값에 fail-closed이므로 `/mccp:pr`에서 PR-Codex가 실제로 발화한다.

> Codex skipped per MCCP_CODEX_DISABLED=1

- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | (none) | — | — | 리뷰어가 발화하지 않아 finding이 존재하지 않는다. 빈 표를 남기는 것은 "지적이 없었다"와 "묻지 않았다"를 구별하기 위해서다 |

- Deferred to backlog: 0 (이 게이트에서 생긴 것 — Task 8이 적재하는 축은 별개)
- Open Questions: 없음
- Codex session 참조: 없음 (프로세스가 생성되지 않았다)

### Security Reviewer

호출하지 않았다. 2.5.5의 발화 조건은 auth · crypto · secrets · input validation ·
SQL/cmd injection · SSRF · path traversal · privilege escalation이고, 이 마일스톤의
`Files to Change`는 산문 문서 · PRD · CHANGELOG · backlog · 보고서로 그중 어디에도
해당하지 않는다. 인접한 축 하나(추가된 줄의 절대 경로 유출)는 `## Validation` 검사 13이
기계로 잡으므로 산문 판단에 맡기지 않는다. `security_skipped` 플래그는 **세우지 않는다** —
그 플래그는 호출이 실패했을 때의 auto-fallback 표식이지 "호출 조건 미성립"의 표식이 아니다.

### Design Review

- 탐지: `skill_available=true` · `design_signal=false` · `reason=no-signal` ·
  `silent_skip=true` · `impeccable_invocation=impeccable`
- plan 단계에서는 `design_signal=true`였다(키워드 기반). implement 단계의 탐지기는 diff를
  보고, 이 시점의 diff에는 렌더링 표면이 없다 — plan의 `## Design Routing Guide`가 예상한
  그대로다. critique retry loop과 stage routing은 트리거 미발화로 돌지 않았고,
  2.5.5c의 design-direction 캡처도 일어나지 않았으므로 **Phase 3.7은 no-op**이다.
- receipt로 전달: `--impeccable-silent-skip --impeccable-silent-skip-reason "no-signal"`

### 진입 조건 — 이 receipt가 승인을 뜻하지 않는 이유

`mccp-plan-codex/release-channel-separation-m3.json`은 **존재하지 않는다**. 위
`## Review Absorption` 절이 기록한 대로 DD13 plan-hash 결속과 소진된 라운드 캡이 함께
그 receipt의 봉인을 구조적으로 불가능하게 만들었고, 이 사이클은 위조 대신 부재를 택했다.
`/mccp:prp-implement` 진입은 운영자가 명시한 감사 override(`MCCP_SKIP_INTENT_GATE`)로
이뤄졌으며 그 사유 원문은 PR 본문에 싣는다. 진입이 승인이 아니라는 사실이 여기 남는다.
