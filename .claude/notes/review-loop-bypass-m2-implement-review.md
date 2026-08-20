# Implement-Codex Review — review-loop-bypass M2

> Sibling artifact. The review section lives here, NOT in the plan body: injecting a
> section into `.claude/plans/review-loop-bypass-m2.plan.md` changes its
> `planAwareMarkdownHash` (only frontmatter `status`/`pr`/`completed_at` are stripped —
> `hash.js:93`), which would make the sealed `mccp-plan-codex` receipt STALE and block
> this cycle's own `/mccp:pr` at the v1.23.5 staleness guard.

## Codex Implementation Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 0 — `MCCP_CODEX_DISABLED=1` env policy (classification=`disabled`, first-class skip)
- 합치 결론: Codex는 env 정책으로 미발화. 리뷰 축은 security-reviewer 서브에이전트가 담당했고 그 판정이 아래에 있다. `CODEX_VERDICT=skipped`
- YAGNI Triage: 해당 없음 (Codex finding 0건)
- Deferred to backlog: 4 → `.claude/plans/codex-findings-backlog.md`
- Open Questions: 없음
- Codex session 참조: n/a (spawn 직전 short-circuit, durationMs=0)

### Implement-time decisions (2.5.2)

plan이 사전 확정하지 않은 축:

1. `deriveBacklogRows` 서명에 `repoRoot`를 **추가**한다 — plan 서명은 `{decision, planPath, slug, today}`였으나 DD4가 요구한 repo-relative 정규화를 순수 함수가 계산할 수 없다(L2 security R5 F1이 지목한 자기모순).
2. CLI `--plan`은 `resolveContained`로 검증한 뒤 repo-relative로 정규화해 오라클에 넘긴다 — 셸 호출자가 정규화를 우회할 수 없는 지점을 CLI 진입부 하나로 고정한다(R5 F3).
3. 파일 쓰기는 전체 rewrite가 아니라 `fs.appendFileSync` 단일 호출이다 — read-modify-write 창을 없애 동시 writer의 overwrite 유실을 구조적으로 제거한다.
4. `backlog.json` 아티팩트 형태: `{appended, skipped_duplicate, skipped_nonblocking, rows}`.
5. 통합 test 1건을 추가한다 — 헤더를 지운 backlog 사본에 대고 `backlog-append`를 실제로 spawn해 exit 12 + 본문 무변경을 확인한다(L2 test R5 F1+F2가 반복 지적한 축).

### Security Reviewer

`Task(mccp:security-reviewer)` 실행됨 — 실제 발화, fallback 없음. CRITICAL 4 · HIGH 8 · MEDIUM 3.

**흡수 (그 자리에서 설계에 반영)**

| # | Sev | Finding | 흡수 방식 |
|---|---|---|---|
| C2 | CRITICAL | 동시 append가 서로의 write를 덮어써 행이 유실된다 | 전체 rewrite를 하지 않는다. 중복 스캔은 read, 쓰기는 `appendFileSync` **단일 호출**. append-only 원장이라 read-modify-write가 애초에 불필요하다 |
| C3 | CRITICAL | 절대경로가 git-tracked 파일로 유출된다 (E7 재현) | `repoRoot` 인자 + `path.relative` + `path.sep` → `/` 통일. `write.js:39-59` `normalizeReceiptCwd` 선례 그대로 |
| C1 | CRITICAL→MED | digest8 충돌로 신규 finding이 조용히 skip된다 | 규모 전제 불일치로 강등(backlog 참조). 다만 **silent 축은 닫는다** — 중복 skip마다 loud stderr + `skipped_duplicate` 카운트 |
| H5 | HIGH | repo 밖 경로 · `..` traversal 미검증 | `path.relative` 결과가 `..`로 시작하면 `<outside-repo>` placeholder로 떨어뜨린다 |
| H6 | HIGH | bare CR이 이스케이프되지 않는다 | `[\r\n]+` → 단일 공백 (`fix-task.js:52` `oneLineExcerpt`와 같은 규약 — plan Mirror가 지목한 것) |
| H7 | HIGH | 200자 절단이 엔티티·서로게이트 중간에 떨어진다 | 절단을 **이스케이프 이전** raw 텍스트에 적용한다(엔티티는 절단 후 생성되므로 잘릴 수 없다) + 절단 경계가 high surrogate면 한 칸 물린다 |
| H8 | HIGH | partial write가 표를 영구 손상시킨다 | 모든 행을 하나의 문자열로 조립해 `appendFileSync` 1회. 부분 실패 표면이 최소화된다 |
| H9 | HIGH | claim 안의 `id=`가 중복 스캔을 오염시킨다 | `escapeCell`이 claim의 `id=`를 `id&#61;`로 치환한다. 셀 안 리터럴 `id=`는 우리가 붙인 태그뿐이 되고, 스캔 정규식도 `id=<hex8>` 뒤 셀 종료를 앵커로 요구한다 |
| H10 | HIGH | 파일이 개행으로 끝나지 않으면 새 행이 앞 행에 붙는다 | append 전 마지막 바이트를 검사해 `\n`이 없으면 선행 추가 |
| H11 | HIGH | Windows 백슬래시가 그대로 커밋된다 | C3와 같은 정규화에서 함께 처리 |
| H13 | MEDIUM | 헤더 부재 시 append 거부 | plan Task 1이 이미 요구한 fail-closed. `HEADER_RE`를 소비자와 같은 정규식으로 재사용 |

**기각·이연 (증거와 함께 backlog에 1줄씩)**

| # | Sev | 판정 |
|---|---|---|
| C4 | CRITICAL | **기각** — `&#124;`에는 리터럴 파이프가 없다. `backlog.js:37`의 `split(/\s*\|\s*/)`은 리터럴 파이프에만 반응하므로 분할되지 않는다. 리뷰어가 엔티티를 `&#` + 파이프 + `24;`로 오독했고, 제시된 split 결과 예시가 그 오독의 산물이다 |
| H12 | HIGH | **부분 흡수** — 유실 축은 C2 흡수로 닫혔고 중복 축만 남는다. lock 도입은 §3.6의 lock 표면을 넷째로 늘리는 비용이라 이연 |
| M14 | MEDIUM | **해당 없음** — `id=` 태그는 `escapeCell` **밖**에서 `renderRow`가 조립하므로 절단 대상이 아니다 |
| M15 | MEDIUM | 이연 — CLI 경로는 `resolveContained`의 `realpathSync`가 덮는다 |

CRITICAL/HIGH 중 미해소로 남은 것은 없다 → MCCP-GATE-STOP 조건 미충족. Phase 3 진입.

### Design Review

`impeccable-detect --mode implement` → `skill_available:true` · `design_signal:false` · `silent_skip:true` · reason `no-signal`.
현재 diff에 렌더 표면이 없다(EXECUTE 이전). `--impeccable-silent-skip --impeccable-silent-skip-reason no-signal`을 receipt에 forward한다.
Task 6의 footer version 2면은 EXECUTE 이후 diff에 나타나므로 Phase 3.6/3.7의 post-EXECUTE 축이 다시 평가한다.
