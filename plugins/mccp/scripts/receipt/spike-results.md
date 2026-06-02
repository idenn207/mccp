---
name: spike-results
description: Phase 0 spike — Claude Code hook 시스템에서 어느 매처가 작동하는지, /ecc:* wrapper에 필요한 이벤트가 실제 지원되는지 조사 결과
date: 2026-06-02
status: blocking — 본 결과에 따라 본 plan의 enforcement 모델이 바뀜
---

# Phase 0 Spike Results — Hook System Capabilities

## TL;DR

**최종 결론 (2026-06-02 공식 문서 확인 후 갱신):** Claude Code 공식 hooks 문서가 `UserPromptSubmit`과 `UserPromptExpansion` 두 이벤트를 모두 노출한다. 후자는 슬래시 명령 expand 시점에 `command_name` 매처로 발화한다 — 우리 목적에 정확히 맞는 이벤트.

→ 원안의 "명령 제출 시점 차단" 메커니즘이 **그대로 구현 가능**. 본 spike 초기 결론(transcript 우회 fallback)은 폐기.

### 1차 결론 (폐기됨, 참고용)

> 처음엔 `~/.claude/hooks/hooks.json`과 README에 `UserPromptSubmit`이 안 보인다는 이유로 "없다"고 판단했다. 그러나 그 파일은 ECC 설치 인공물이고, ECC가 그 이벤트를 사용하지 않을 뿐 Claude Code 자체는 지원한다. 공식 문서 직접 확인이 spike의 정답이었다.

## 확인된 hook 이벤트 (현 설치 기준)

`~/.claude/hooks/hooks.json`의 `.hooks` 키 + `~/.claude/hooks/README.md` 종합:

| Event | Available | 매처 형태 | 사용 가능성 |
|---|---|---|---|
| `PreToolUse` | ✓ | tool 이름 (`Bash`, `Write`, `Edit`, `MultiEdit`, `Skill`, `*`) | exit 2 → 차단 |
| `PostToolUse` | ✓ | 동일 | block 불가, audit만 |
| `PostToolUseFailure` | ✓ | 동일 | block 불가 |
| `Stop` | ✓ | matcher 없음 (every response 후) | 각 응답 종료 후 1회. transcript 접근 가능 |
| `SessionStart` | ✓ | 없음 | 세션 시작 1회 |
| `SessionEnd` | ✓ | 없음 | 세션 종료 1회 |
| `PreCompact` | ✓ | 없음 | compact 직전 |

## 공식 문서 직접 확인 (https://code.claude.com/docs/en/hooks, 2026-06-02)

ECC가 사용하지 않는다고 해서 Claude Code가 지원하지 않는 것이 아님. 공식 문서 기준:

| Event | Status | 본 plan에 미치는 영향 |
|---|---|---|
| `UserPromptSubmit` | **존재** — 사용자 prompt 제출 직후 발화. 모든 prompt에 발화. `decision:"block"` 가능. 30s timeout. matcher 없음 | 원안 그대로 가능. 다만 모든 prompt 발화이므로 prompt 본문에서 `/ecc:` 접두사 자체 필터 필요 |
| `UserPromptExpansion` | **존재, 우리에게 정확히 맞는 이벤트** — 슬래시 명령 expand 시점. `command_name` 매처 지원. 문서 명시: "`/skillname` 직접 입력은 PreToolUse Skill을 우회하지만 UserPromptExpansion은 그 경로를 잡는다" | **이게 정답.** matcher로 `ecc:*` 한정 가능 |
| `PreToolUse(SlashCommand)` 매처 | **부재** — built-in tool 매처는 `Bash`/`Edit`/`Write`/`Skill`/`Notebook`/MCP. SlashCommand는 매처 대상이 아님 | 폐기 |

### 추가로 확인된 유용 이벤트

`Setup`, `PermissionRequest`, `PermissionDenied`, `PostToolBatch`, `MessageDisplay`, `SubagentStart/Stop`, `TaskCreated/Completed`, `StopFailure`, `TeammateIdle`, `InstructionsLoaded`, `ConfigChange`, `CwdChanged`, `FileChanged`, `WorktreeCreate/Remove`, `PostCompact`, `Elicitation/ElicitationResult`. 본 plan 직접 사용은 없지만 향후 확장 여지.

## 확인된 인접 사실

- `Stop` hook은 매 응답 후 발화하며 transcript 경로를 받는다 (README: "Persists session state when transcript path is available")
- `PreToolUse *` 매처는 실제 작동한다 (governance-capture hook가 이걸 사용)
- exit code 2 → 차단은 PreToolUse에서 작동 (README: "PreToolUse hooks ... can block (exit code 2)")
- hook script는 stdin으로 JSON event payload를 받는다 (관행)
- 기존 사용자 hook은 PowerShell(`impeccable-guard.ps1`, `impeccable-flag.ps1`)과 Node.js 두 가지로 혼재. 본 plan은 Node.js로 통일 권장

## 추가 발견 — `~/.claude/hooks/hooks.json`의 의미

49KB짜리 hooks.json이 user 영역에 있다. 처음엔 영속적 user 설정으로 보였지만, README는 명확하게:

> The checked-in file is plugin/repo-oriented and is meant to be installed through the ECC installer or loaded as a plugin.

→ ECC 설치 시 user 영역에 복사되어 plugin script(`~/.claude/plugins/marketplaces/ecc/scripts/hooks/*.js`)를 가리킨다. 즉 **이 파일도 ECC 설치 인공물이므로 직접 편집은 휘발 위험**. 우리는 `~/.claude/settings.json` 본체에 hook을 등록하는 쪽이 안전하다.

## Enforcement 메커니즘 (확정안 — UserPromptExpansion 기반)

원안의 명령 차단 메커니즘이 그대로 가능:

```
사용자 /ecc:plan
  → UserPromptExpansion hook 발화 (command_name="ecc:plan" 매처)
  → script: preflight 검증 (선행 phase receipt 존재/hash 일치 등)
  → decision:"block" 또는 exit 2 → 명령 자체가 처리되지 않음
  → 사용자에게 차단 사유 보고

(통과 시)
  → Claude가 /ecc:plan 본체 실행
  → plan 파일 작성

Claude 응답 종료
  → Stop hook 발화 (matcher 없음)
  → script가 transcript에서 직전 /ecc:* 명령 식별
  → receipt 생성 phase였으면 → 산출 파일 추출 → write
  → receipt 검증 phase였으면 → 잔존 audit 결과 보고
```

### 폐기된 1차 안

> PreToolUse `*` + transcript 파싱으로 "첫 tool call 차단" — 더 이상 필요 없음. UserPromptExpansion이 정확히 명령 시점에 발화하므로 transcript 의존성과 lag 비용을 모두 제거한다.

## 본 변경이 본 plan에 미치는 영향

### 살아남는 항목
- Receipt JSON 스키마 (9 필드) ✓
- Hash 유틸 (markdown canonicalize + SHA-256) ✓
- `<repo>/.claude/receipts/` 저장 ✓
- `~/.claude/scripts/ecc-receipt/` CLI ✓
- `~/.claude/rules/ecc/common/ecc-command-gates.md` 룰 동기화 ✓
- Phase 5의 fallback `~/.claude/commands/ecc-receipt-*.md` ✓

### 수정되는 항목
- **Hook 매처 재정의**: PreToolUse `*` + Stop (UserPromptSubmit/SlashCommand 폐기)
- **Enforcement lag**: "명령 차단" → "첫 tool call 차단" (사용자 체감은 거의 동일)
- **Transcript 의존성 신규 추가**: 두 hook 모두 transcript 파일을 읽어야 최근 `/ecc:*` 명령 식별 가능. transcript 위치/포맷이 새로운 의존성

### 신규 리스크 (확정안 기준)

| Risk | 가능성 | 완화 |
|---|---|---|
| `UserPromptExpansion` 30s timeout 안에 preflight 끝나지 않음 | LOW | preflight는 파일 read + hash 검증만. 보통 <100ms. 다만 receipt 100건 이상 누적 시 인덱스 캐싱 필요 |
| `command_name` 매처 regex 문법 미문서화 — `^ecc:`가 작동하는지 불확실 | MEDIUM | 설치 시점에 sanity check: `/ecc:status` 같은 가벼운 명령으로 매처 발화 확인 |
| Stop hook transcript 포맷이 Claude Code 버전마다 다름 | MEDIUM | hook script가 포맷 자동 감지 + 디버그 모드(`ECC_RECEIPT_DEBUG=1`)로 raw dump. transcript 의존은 "write only" 경로에만 남음 |
| `decision:"block"` JSON 응답 형식이 stdin/stdout 어느 쪽인지 명확치 않음 | LOW | 공식 문서를 한 번 더 확인하거나 작동하지 않을 시 exit 2로 fallback |

## 결정 필요사항 (재정리)

### A. Enforcement 강도 선택

본 spike 결과로 enforcement 모델이 갈렸다. 셋 중 택일:

1. **A1. Hard gate (PreToolUse `*` 기반 첫 tool call 차단)** — 권장
   - 기능: 명령 차단과 사실상 동일. exit 2로 첫 effect tool 차단
   - 비용: transcript 파싱 의존성 + 모든 tool call에 hook fast-path 통과 (~2ms)
   - 위험: transcript 포맷 변경에 취약

2. **A2. Soft gate (Stop hook만, 차단 없이 audit + 다음 turn에 경고)**
   - 기능: 명령은 다 통과. Stop hook가 다음 turn에 "이전 응답에서 receipt가 missing"이라고 시스템 reminder 주입
   - 비용: 거의 없음 (Stop hook만)
   - 위험: Claude가 reminder를 무시할 수 있음 → advisory 회귀

3. **A3. Bash-only gate (PreToolUse `Bash` matcher만, Bash 호출 시에만 차단)**
   - 기능: `/ecc:prp-implement` 같은 phase가 첫 Bash 호출에서 차단됨. Edit/Write로 끝나는 phase는 못 잡음
   - 비용: 최소
   - 위험: enforcement 빈틈

### B. 답변되지 않은 4개 (이전과 동일)

- N1·N3·N4 정의 한 줄씩
- Receipt 저장: `<repo>/.claude/receipts/` (기본값으로 진행 중)
- 언어: Node.js (기본값으로 진행 중)
- Plan-Codex 게이트: 본 spike 결과 + A 선택지 답변 후 호출 권장

## 권장

A1(Hard gate) + Node.js + per-repo 저장 + N1·N3·N4 정의 확인 후 Plan-Codex 호출. spike는 코드 작성 전 단계이므로 본격 Phase 1 진입 전 사용자 확인이 안전.
