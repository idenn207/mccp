---
description: 대시보드의 active 위험/질문/마일스톤을 현재 구조와 대조 평가(증거 인용)해 해결/obsolete 항목에 비파괴 해결 마커를 단다 (human-gate, 재실행 가능). Dashboard Truthfulness M3.
argument-hint: "[--limit N]"
---

# /mccp:dashboard-audit

> If I disappear silently, run `/mccp:trace` or check `.claude/state/hook-trace/<session_id>/`

대시보드(`.claude/cache/status.html` + `STATUS.md`)에 누적된 위험/미해결 질문/마일스톤 중 **구조가 바뀌어 더 이상 유효하지 않은** 항목을 *평가*해 메인에서 빼낸다. 평가(추론)는 이 명령(agent)에만 있고, 은퇴는 소스 `.md`에 다는 **비파괴 해결 마커**(`<!--mccp:resolved …-->`)로 표현된다 — render는 결정적 마커 reader라 추정 0(레이어 분리, derive/render의 read-only·LLM-free 불변).

**핵심 불변식**:
- **human-gate**: 소스 편집(파괴적 아니어도)이므로 평가 제안 → 사용자 승인 → 적용. 자동 적용 안 함.
- **증거 인용 필수**: 해결/obsolete 판정은 근거(mitigation 구현/결정/commit/참조 구조 소멸) 인용 필수. 불확실하면 **live 보수 default**(은퇴 안 함).
- **비파괴·되돌리기**: 마커는 소스 행 보존(주석/체크박스만 추가). 마커 삭제로 되돌리기. render는 collapse(제거 아님).
- **재실행 가능**: 표준 capability. 언제든 다시 실행해 누적분 정리.

## Phase 0 — ENUMERATE (결정적 스크립트)

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/stale-audit/enumerate.js" --json ${ARGUMENTS:+$ARGUMENTS} > "$(git rev-parse --git-dir)/mccp/tmp/audit-enum.json" 2>/dev/null || \
  node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/stale-audit/enumerate.js" --json
```

산출 `{ items: [ref...], scanned, total, truncated }`. 각 ref:
- `{kind:'risk', source, ordinal, text, lineNumber}`
- `{kind:'oq', source, lineNumber, text}`
- `{kind:'milestone', source(prd), name, status:'in-progress', lineNumber}`

items가 비면 안내 후 STOP("정리할 active 항목 없음"). `truncated:true`면 `--limit`로 cap된 상태이니 사용자에게 잔여(`total`)를 알린다.

## Phase 1 — EVALUATE (agent, 증거 인용)

각 항목을 **현재 코드/문서 구조와 대조**해 verdict를 판정한다. **추론은 여기에만** 존재한다.

| Verdict | 의미 | 판정 조건(증거 필수) |
|---|---|---|
| `live` | 여전히 유효 | 기본값. 해결/obsolete 근거가 불충분하면 무조건 live. |
| `resolved` | 해결됨 | mitigation이 실제 구현됨 / 결정이 내려짐 / 관련 commit·테스트 존재 — **인용**. |
| `obsolete` | 더 이상 무관 | 참조하던 구조/경로/기능이 소멸 — **인용**(grep로 부재 확인). |

평가 방법(`code-reviewer`/`santa-method` 패턴 — 증거 기반·보수적):
1. ref의 `source` plan/PRD를 Read해 항목 전문·맥락 파악.
2. Grep/Read로 현재 구조 확인 — mitigation이 가리키는 파일·함수·테스트가 실제 존재/구현됐는가, 위험이 참조하는 경로가 아직 있는가.
3. 마일스톤(in-progress): 해당 plan이 실제 ship(완료 receipt/ledger/CHANGELOG/merge)됐으면 `complete`, 폐기됐으면 `dropped`, 진행 중이면 `live`.
4. **불확실 → live**. 거짓 은퇴(미해결을 해결로 숨김)가 거짓 유지보다 훨씬 해롭다.

비용 관리: complete/dropped 마일스톤이 참조하는 plan의 위험/OQ가 가장 stale 후보 — 우선 평가. 항목이 많으면 `--limit`로 분할 실행(재실행 가능).

## Phase 2 — PROPOSE + HUMAN-GATE

`resolved`/`obsolete`로 판정된 항목만 제안 테이블로 제시(`live`는 무변경, 표시 안 함):

```
## 제안 — 해결/obsolete 마킹 후보 (N건)

| # | kind | source | item | verdict | reason | evidence |
|---|------|--------|------|---------|--------|----------|
| 1 | risk | …m1.plan.md | 위험 텍스트 | resolved | 완화책 X가 commit abc에 구현 | `lib/x.js:42` 존재 |
| 2 | oq   | …m2.plan.md | 질문 텍스트 | obsolete | 참조 구조 Y 소멸 | grep Y → 0 hit |
```

그 후 사용자에게 **명시 승인**을 요청한다(자동 적용 금지). 사용자는 전체 승인 / 일부 선택(번호) / 거부 중 택. 승인된 항목만 Phase 3로.

> 승인 없이 Phase 3 진입 금지. 사용자가 일부만 승인하면 그 부분집합만 apply.

## Phase 3 — APPLY (결정적 스크립트, 비파괴)

승인된 항목을 ref+reason 배열로 직렬화해 결정적 applier에 전달한다(평가 결과를 코드가 다시 추론하지 않음):

```bash
GITDIR=$(git rev-parse --git-dir); mkdir -p "$GITDIR/mccp/tmp"
REFS_FILE="$GITDIR/mccp/tmp/audit-approved.json"
# 승인된 항목을 [{kind, source, ordinal|lineNumber|name, text, reason, newStatus?}] 로 기록.
# risk → ordinal, oq → lineNumber, milestone → name + newStatus(complete|dropped).
# reason 은 Phase 1 의 근거를 한 문장으로(applier 가 escapeMarkerReason 으로 |/"/--> 정리).
cat > "$REFS_FILE" <<'JSON'
[ ... 승인된 ref 배열 ... ]
JSON
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/stale-audit/apply.js" --refs-file "$REFS_FILE" --json
```

applier 보증(Codex 재설계 F3): per-file lock + content-hash compare-and-swap(rename 직전 재-read, 불일치 abort) + 파일당 1 트랜잭션 batch + idempotent(이미 마커면 skip) + 편집 후 표 재-parse 무손상 검증(실패 시 rollback) + 오매칭 skip+경고.

결과 `{ applied, skipped, aborted, errors, files }`를 확인 — `aborted`/`errors`가 있으면 사용자에게 보고(파일이 평가 중 외부 편집됨 → 재실행 권장). `skipped`의 `idempotent`/`text mismatch`도 정직히 보고.

## Phase 4 — RENDER

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/derive/cli.js" render
```

`.claude/cache/STATUS.md` + `status.html` 재생성. 마킹된 항목은 메인에서 사라지고 "해결됨 N건" 접힘으로만 노출(되돌리기 가능). 마일스톤 status flip은 즉시 반영(진행중=실제).

## Phase 5 — OUTPUT

```
## Dashboard Audit 완료

- 평가: {total} active 항목 (risk {r} · oq {q} · milestone {m})
- 제안: {proposed}건 (resolved {res} · obsolete {obs})
- 승인·적용: {applied}건  ·  skip {skipped}  ·  abort {aborted}
- 렌더: .claude/cache/status.html 갱신 — 해결됨 접힘 {resolvedCount}건

### Next
- status.html을 육안 확인(브라우저). 되돌리려면 소스 `.md`의 `<!--mccp:resolved …-->` 마커 삭제 후 재-render.
- 잔여(truncated) 있으면 `/mccp:dashboard-audit --limit N` 재실행.
```

## Out of scope

- 자동 적용(human-gate 필수).
- render-side 추정 은퇴(폐기 — 명시 마커만이 진실원).
- `⚠ Ledger mismatch` 전역 배너(PRD OQ #6 — M4/후속. 마커 기반 은퇴엔 ledger drift 무관).
- STATE.md OQ 은퇴(STATE.md OQ는 항상 active — 마커 미적용).

## See also

- `/mccp:dashboard-refresh` — 평가 없이 단순 재-render.
- [plan: Dashboard Truthfulness M3](../../.claude/plans/dashboard-truthfulness-m3-stale-audit.plan.md)
- [docs/v1.3.0-observability/dashboard-surface.md](../../docs/v1.3.0-observability/dashboard-surface.md) — 해결 마커 컨벤션.
