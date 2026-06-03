# mccp — My Claude Code Plugin

ECC 게이트 핵심을 self-contained Apache-2.0 plugin으로 패키징한 개인용 Claude Code 확장.

> **상태**: 초기 부트스트랩(v0.1.0). [.plan/mccp-bootstrap.plan.md](.plan/mccp-bootstrap.plan.md) 참고.

## 무엇을 하는가

Claude Code의 `/mccp:*` namespace에 게이트 시스템을 제공한다:

| Command               | 역할                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| `/mccp:plan`          | Phase 7 자동 게이트 — plan 작성 → Codex adversarial review → receipt write → 다음 명령 핸드오프 |
| `/mccp:prp-implement` | Phase 2.5 게이트 — Implement-Codex review + cross-gate dedupe                                   |
| `/mccp:pr`            | PR 게이트 — 디자인/보안/Codex review 통합                                                       |
| `/mccp:code-review`   | PR 게이트 + code-reviewer agent                                                                 |
| `/mccp:receipt-*`     | receipt 작성·검증·상태 조회                                                                     |

게이트의 enforcement는 command 본문 + hook + receipt CLI script가 직접 수행한다. 별도 rule 파일 배포 없음.

## 설치

```bash
# 1. marketplace 추가 (private repo면 git auth 사전 설정 필요)
/plugin marketplace add https://github.com/idenn207/mccp

# 2. plugin install
/plugin install mccp@mccp

# 3. (필수) Codex CLI 인증
/codex:setup
```

새 Claude Code 세션을 시작하면 `/mccp:*` 명령이 활성화된다.

## 제거

```bash
/plugin uninstall mccp@mccp
/plugin marketplace remove mccp
```

## 자급자족 (R1)

mccp는 `~/.claude/` 완전 삭제 + Claude 재설치 + mccp install만으로 동작한다. `~/.claude/rules/`, `~/.claude/scripts/`, `~/.claude/hooks/`, `~/.claude/agents/`의 별도 설치를 요구하지 않는다. 모든 의존성이 `plugins/mccp/` 안에 포함된다.

## 라이선스

Apache License 2.0. 자세한 사항은 [LICENSE](LICENSE) 참조.

ECC(MIT)와 impeccable(Apache-2.0)에서 파생된 컴포넌트 정보는 [NOTICE](NOTICE) 참조.

## 게이트 설계 노트

원본 ECC §0 Autonomy Contract의 설계 의도는 [docs/gate-design.md](docs/gate-design.md)에 보존되어 있다 (학습용, enforcement는 코드에서 직접 수행).

## 환경변수 / 운영 토글

`MCCP_*` / `ECC_*` 환경변수 전체 카탈로그(✅ live / 🚧 v0.2.2·setup·S10b 예정 포함)는 [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md)에 정리되어 있다.

