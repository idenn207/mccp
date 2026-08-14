# Implement-Codex Review — setup-gitignore-m1

> `/mccp:prp-implement` Phase 2.5가 발행한 게이트 기록. **plan 본문이 아니라 여기 사는 이유**:
> plan 본문에 append하면 plan hash가 바뀌어 상류 `mccp-plan-codex` 봉인(그 리뷰가 본 바이트)이
> stale이 된다 — plan이 스스로 기록한 "고정점 모순"의 implement 축 재현이다. 두 봉인을 모두
> 보존하려면 이 게이트의 기록은 sibling 파일이어야 한다. `/mccp:prp-implement` 2.5.6 Step A는
> `<plan or notes path>`를 검증 대상으로 명시하므로 계약 안이다.


## Codex Implementation Review

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2). `--impeccable-available` (design-scope preamble 적용). classification=`ok`, structured `result.verdict`=`needs-attention` → 게이트 verdict `divergent`.
- 라운드 수: 1 (cap=1, `MCCP_GATE_ROUND_CAP` 미설정)
- 합치 결론: Codex HIGH 1건과 security HIGH 2건은 모두 **plan이 계약으로 확정하지 않고 구현자에게 남긴 축**을 짚었다 — 오류 `reason`의 폐쇄성 · lock 대기 정책 · symlink/파일 모드. 셋 다 plan 본문과 모순되지 않고 그 위에 **좁히는 방향**이라 구현 계약으로 확정해 흡수했다. plan 수정 없이 구현에서 닫힌다.
- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 — 고정 reason enum이 일반 예외 메시지로 붕괴 | HIGH | **ACCEPT_NOW** | plan의 stdout 스키마가 `reason`에 "그 외 throw 메시지"를 허용해, `plugin.json` 파싱·fs 권한·lock 내부 오류가 OS/Node별 문자열로 새어 나온다. 소비자(Task 3 Phase 5)가 분기하는 프로토콜 값이 환경마다 달라지므로 이연 불가 |
  | F2 — lock 경합의 대기·timeout 정책 미정의 | MEDIUM | **ACCEPT_NOW** | plan은 후행 writer가 "기다렸다 noop exit 0"을 요구하면서 최대 대기·재시도 간격·timeout 사유를 정하지 않았다. 즉시 실패도 무한 대기도 계약을 만족한다고 읽혀 Windows child-process test가 스케줄링에 좌우된다 |
  | F3 — 구현이 작업 트리에 없어 안전성 주장을 검증 불가 | MEDIUM | **REJECTED_BY_DESIGN** | 결함이 아니라 **게이트 순서**다. Implement-Codex는 command 계약상 Phase 3 EXECUTE **이전**에 돌므로 구현 diff가 존재할 수 없다. 산출 diff의 리뷰 소유처는 PR-Codex이고, 이 decision은 plan receipt가 `divergent`라 cross-gate dedupe가 fail-closed로 막혀 PR에서 Codex가 **반드시 실발화**한다 — 검증 요구는 그 지점에서 충족된다 |

- 흡수 내역 (구현 계약으로 확정, plan 본문 무수정):
  - **F1** → `reason`을 **폐쇄 enum**으로 고정: `not-a-git-repo` · `git-unavailable` · `git-error` · `marker-damaged` · `concurrent-modification` · `lock-timeout` · `symlink-target` · `internal-error`. 모든 예상 실패는 `.reason`을 실은 `ProvisionError` subclass로 변환하고, CLI 최상위 catch는 **비-subclass 예외를 `internal-error`로 매핑**한다. 원문 메시지는 stderr + `detail` 필드에만 싣는다. plan의 "그 외 throw 메시지" 버킷을 `internal-error` 하나로 좁히는 것이며 exit code 계약(비-skip은 전부 exit 1)은 불변.
  - **F2** → lock 획득 계약 확정: **최대 대기 10초**, poll 간격 50ms, `EEXIST`는 대기 신호이지 오류가 아님, 초과 시 `reason:'lock-timeout'` + **exit 1**. lease 만료 정지 시나리오(60초 lease + PID 생존 tri-state)에서 회수 거부는 이 10초 대기 후 `lock-timeout`으로 표면화되므로, plan이 요구한 "후행 writer exit 1"이 타이밍이 아니라 **계약**으로 결정된다.

### Security Reviewer

`Task(mccp:security-reviewer)` 실발화 — 5개 축(경로 처리 · git spawn · 파일 쓰기/TOCTOU · advisory lock · 탐지 경로) 중 3개 PASS, 2개에서 gap. CRITICAL 0건이라 게이트 통과.

| # | Severity | Verdict | 흡수 |
|---|---|---|---|
| S1 — `.gitignore` 대상이 symlink일 때 append가 링크를 따라간다 | **HIGH** | **ACCEPT_NOW** | Node `fs`는 기본적으로 symlink를 따르므로 공격자가 `.gitignore`를 임의 파일로의 symlink로 미리 놓으면 `'a'` append가 그 파일에 쓴다. `'wx'`(create)는 symlink 존재 자체로 `EEXIST`라 안전하지만 append/force-update 경로가 열려 있다. **쓰기 전 `fs.lstatSync(target)`로 symlink를 검출하면 `reason:'symlink-target'` + exit 1 무변경**으로 거부한다 — 안전 경계를 계산해 허용하지 않고 **거부**를 택한 것은, `.gitignore`가 symlink인 정당한 형상이 없고 허용 판정 로직이 그 자체로 새 공격면이기 때문 |
| S2 — tmp 파일 모드 미지정 | **HIGH** | **ACCEPT_NOW** | Node 기본 `0o666 & ~umask`(통상 `0o644`)라 world-readable. lock 파일이 `0o600`인 것과 어긋난다. **tmp·lock·`.bak` 전부 `mode: 0o600`으로 생성**한다 |
| S3 — `.bak` 덮어쓰기 동작·모드 불명확 | MEDIUM | **ACCEPT_NOW** | `.bak`은 `--force-update` 전용 1회전 백업이며 **기존 `.bak`을 덮어쓴다**(영구 아카이브가 아님)는 것을 코드 주석과 Phase 5 보고 문구로 명시. 모드는 S2와 함께 `0o600` |
| S4 — PID 재사용 창 | MEDIUM | **ACCEPT_NOW (문서화)** | 리뷰어 자신이 low-risk로 판정. lock이 target별(`<target>.lock`)이라 같은 PID + 같은 저장소 + 같은 순간이 동시에 성립해야 한다. **코드 주석으로 알려진 한계를 남기고** 로직은 바꾸지 않는다 — 여기서 추가 방어를 넣으면 §3.6이 경고한 "lock마다 다른 정책"을 하나 더 만든다 |

경로 처리(`--repo` → `cwd` → `resolveRepoRoot` 반환값만 쓰기 대상) · git spawn(배열 인자 + `LC_ALL=C` + 앵커된 stderr 매칭) · 탐지 경로(read-only, 파괴 동작 없음)는 **PASS**로 판정됐다.

- Deferred to backlog: 0건
- Open Questions: 없음 (CRITICAL 0건). ROLLOUT-1은 plan이 이미 기록한 배포 전제이지 이 게이트의 미해결 질문이 아니다.
- Codex session 참조: `.claude/receipts/mccp-implement-codex/setup-gitignore-m1.json`의 `resolution.codex_verdict`가 정본. 원본 payload는 `.git/worktrees/setup-gitignore/mccp/tmp/codex-implement.json`.
