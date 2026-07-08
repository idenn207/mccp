# Plan: Audit Remediation P4 — dispatch·work-isolation 강건화 (재스코프)

**Source PRD**: `.claude/prds/audit-remediation-followup.prd.md`
**Selected Milestone**: P4 — dispatch·work-isolation 강건화 (1.20.8)
**Complexity**: Low (재스코프 후 doc/guard patch)
**Base**: origin/main (1.20.7, #91 workflow-orchestration M2a 반영)

> **재스코프 사유 (필독)**: 원 P4 plan(1.20.6 base)은 격리 implement 위임의 `pending`
> collapse를 `dispatch-cli.js:cmdMerge`에 **F1(pending-split graceful-degrade)** +
> **F2(receipt anchoring 검증)**로 닫으려 했다. 그러나 병렬 진행된 **#91(v1.20.7
> workflow-orchestration M2a, 이미 머지)**이 동일 서브시스템을 `deriveVerdict`/
> `cmdReconcile`(3자 reconcile: return ∧ envelope ∧ store)로 재작성하며 원 P4의 핵심을
> **이미 대체**했다:
>
> - **pending** → #91 `deriveVerdict` rule (3): `reconcile-mismatch`로 **fail-closed HALT**
>   (의도적 — work.md Step 3.gate의 double-worker 위험 차단). F1 graceful-degrade와 상반.
> - **anchoring** → #91 `deriveVerdict` F3 post-hoc store 검증(marker + 3-flag ==
>   `expectedAnchor` → `unanchored` HALT). F2와 완전 중복.
> - `cmdMerge`는 work.md가 `cmdReconcile`(Step 3.gate)로 이관하며 **dead-path**가 됐다.
>
> **결정(사용자 승인)**: #91의 fail-closed 수용. F1 graceful-degrade는 `/mccp:resume`
> 복구 경로가 이미 커버 + #91 의도와 정합하지 않아 폐기. F2는 #91 F3와 중복이라 폐기.
> 재스코프 P4 = **B#6 + B#13 잔여 delta만** #91 model 위에 착지(작은 patch — full
> /mccp:plan + Codex gate 사이클 불요). 원 plan의 `cmdMerge`/work.md Step 3.I 변경은
> 채택하지 않음(stale 브랜치 `v1-20-7-dispatch-work-isolation` 커밋 33aea39에 참조 보존).

## Summary

원 P4의 A①(pending collapse) + F1 + F2는 #91에 흡수/대체됐다. 잔여 additive delta:

- **B#6** — `prp-implement.md` Phase 2.5.6 receipt-write exit-code 미표면화. `WRITE_EXIT=$?`
  캡처 후 non-zero면 `[MCCP-GATE-STOP]` surface(exit 12=`DISPATCH_MARKER_MISSING_FIELDS`
  vs 1 보존) + Phase 3 EXECUTE 진입 전 hard-stop. 이전엔 실패한 receipt write 위에서
  Phase 3가 조용히 시작될 수 있었다.
- **B#13** — dispatch-worker 3-flag attribution doc. 미forward는 이제 controller의
  Step 3.gate `deriveVerdict` F3가 `unanchored` verdict로 HALT하는 mechanical backstop이
  받친다(원 초안의 `cmdMerge` 참조 → `deriveVerdict`/Step 3.gate로 정정).

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/commands/prp-implement.md` | UPDATE | Phase 2.5.6 exit-code guard(B#6) + 3-flag attribution doc(B#13, `deriveVerdict` 참조) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.20.7 → 1.20.8` patch bump(§3.7) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | footer `→ v1.20.8` |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | footer `→ v1.20.8` |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATE | footer 버전 assert `→ v1.20.8` (test 名 + escaped-regex assert 2쌍) |
| `CHANGELOG.md` | UPDATE | 신규 `[1.20.8]` 섹션(재스코프 + Superseded 명시) |
| `.claude/prds/audit-remediation-followup.prd.md` | UPDATE | P4 재스코프 + P4/P5/P6 버전 cascade 1.20.8/1.20.9/1.20.10(#91=1.20.7 점유 반영) |

## Validation

```bash
# 버전 surface 테스트 (escaped-regex assert 포함)
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# #91 dispatch 서브시스템 무회귀 (재스코프가 코드 미변경임을 확인)
node --test plugins/mccp/scripts/lib/tests/dispatch-cli.test.js \
             plugins/mccp/scripts/lib/implement-dispatch/tests/result-schema.test.js

# 버전 drift 0 (footer/plugin.json에 구버전 잔존 없어야) — escaped-regex 포함 검사
grep -rn "1\.20\.7" plugins/mccp/.claude-plugin/plugin.json \
  plugins/mccp/scripts/lib/renderer/html.js plugins/mccp/scripts/lib/renderer/markdown.js \
  && echo "DRIFT" || echo "clean"
```

## Acceptance

- [x] B#6 — 2.5.6 receipt-write 실패가 non-zero exit로 표면화(exit 12 문서화), Phase 3 진입 전 stop
- [x] B#13 — 3-flag attribution doc를 `deriveVerdict`/Step 3.gate anchor 검증 참조로 갱신
- [x] F1/F2 폐기 — #91 `deriveVerdict`가 pending fail-closed + anchoring F3를 이미 소유
- [x] 버전 surface 4면 1.20.8 동기(i18n 테스트 green, drift 0)
- [x] dispatch 코드 무변경(재스코프는 doc/guard/version만) → #91 dual-review·receipt chain 무손상

## Notes

이 재스코프 plan은 원 plan(1.20.6 base, `cmdMerge` F1/F2)을 대체한다. Codex Adversarial
Review는 재실행하지 않는다 — 코드 변경 0(prp-implement.md는 command doc, 나머지는 version
문자열)이고 dispatch 로직은 #91이 이미 dual-review를 통과했으므로. PR 시 cross-gate dedupe
미충족이면 `MCCP_PR_SKIP_CODEX_REVIEW` audited escape 또는 소형 patch로 처리(P1 PR #86 회고 mirror).
