# Milestone Closures

이 디렉토리의 파일은 `/mccp:milestone-close <milestone-id>` 출력물입니다. 직접 편집 금지 — `/mccp:milestone-close`가 작성한 closure document는 plan body의 `## Milestone Closure Provenance` 섹션에서 sha256으로 stamping되어 mutation 시 다음 `/mccp:pr` validate에서 `plan_hash` mismatch로 mechanical하게 detect됩니다.

## 형식 (frontmatter-less plain markdown, 4 sections)

```markdown
# Milestone Closure — <milestone-id>

## Milestone
- ID         : <milestone-id>
- Name       : <full row name from PRD Delivery Milestones>
- Plan       : <relative path to source plan>
- Status     : done | failed | skipped
- Closed at  : <ISO timestamp>
- Closed by  : /mccp:milestone-close (run_id=<uuid>)

## Acceptance Condition
<acceptance condition passed to /goal — paste verbatim or summary>

## Goal Loop Result
<user grammar response — masked through derive/mask.js#applySecretMask>

## Provenance
- Lock run_id        : <uuid>
- Lock owner session : <session_id at lock enter>
- Plan source        : <relative path>
- Detection signal   : <JSON snapshot of goal-detect signal_ref>
- mccp version       : <plugin.json version at write time>
```

## Invariants

- **No secrets, no PII**: closure document body는 `derive/mask.js#applySecretMask`를 통해 작성되며 raw evaluator output paste는 금지. README spec 위반 시 추후 milestone에서 mechanical enforcement (pre-commit hook으로 mask diff verify) 검토 — S5 security absorption.
- **git-tracked**: closure document는 receipt chain audit 산출물이므로 commit 대상. `.gitignore` 적용 안 함.
- **idempotent re-write**: 동일 `<milestone-id>`로 `/mccp:milestone-close` 재호출 시 본 디렉토리의 파일은 REPLACE (not append). plan body의 `## Milestone Closure Provenance` 섹션도 REPLACE.
- **public-facing**: 본 디렉토리의 파일은 공개 audit 산출물로 간주됩니다. 민감 정보는 mask 통과 후에만 inject.

## See also

- [`docs/automation-modernization/integration-template.md`](../../docs/automation-modernization/integration-template.md) §9 (axis C reference)
- [`plugins/mccp/commands/milestone-close.md`](../../plugins/mccp/commands/milestone-close.md) (slash command body)
- [`plugins/mccp/scripts/lib/goal-phase-lock.js`](../../plugins/mccp/scripts/lib/goal-phase-lock.js) (multi-turn isolation lock)
- CLAUDE.md §3.7 (plugin.json version bump policy — closure documents에는 plugin.json version stamp 포함됨)
