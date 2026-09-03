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

# 3. 의존성 + 인증 한 번에
/mccp:setup
```

설치가 받는 것은 **`release` 채널**이다 — `marketplace.json`의 plugin `source`가
`git-subdir` + `ref: release`를 가리키므로, 위 명령이 해소하는 본문은 `main`이 아니라
`release` 브랜치의 것이다. `main`은 dogfood trunk이고 릴리스는 PRD 단위로 잘려
`release`를 그 지점으로 옮기는 별도 행위다. 즉 main 머지가 곧 **plugin 본문**
배포는 아니다.

닫히는 표면은 그 본문뿐이다 — marketplace 등록(`known_marketplaces.json`)의 mccp
항목에는 `ref`가 없어 clone은 계속 `main`을 추종한다. 따라서 `marketplace.json` 자체의
편집(`source`·`ref` 변경 등)은 여전히 머지 즉시 설치에 도달한다. 이 잔여는 M3이 소유한다.

설치 명령 자체는 바뀌지 않는다 — 위 3줄 그대로다.

`main` 본문을 실제로 써 보려면 별도 경로가 있다. worktree를 가리키는 세션 단위 설치이며
전역 설치 상태를 바꾸지 않는다 — 절차와 한계는 [docs/dogfood-install.md](docs/dogfood-install.md)가
소유한다. 기본은 모든 프로젝트에서 `release`에 머무는 것이고, main을 시험하려는 프로젝트만
그 절차로 opt-in한다.

`/mccp:setup`은 idempotent — codex plugin이 없거나 impeccable **skill이 해소되지 않을 때** 사용자 동의 후 설치, 인증 미완료 시 `!codex login` 또는 `MCCP_CODEX_DISABLED=1` 옵션 제공. 이미 모든 게 갖춰진 상태면 zero-install로 통과한다. impeccable 판정 기준은 PATH의 바이너리가 아니라 mccp 명령 본문이 부르는 이름이 실제로 열리는지다 — 어느 공식 채널로 설치했든 해소되면 다시 묻지 않는다.

새 Claude Code 세션을 시작하면 `/mccp:*` 명령이 활성화된다.

### 수동 단계 (`/mccp:setup` 미사용 시)

```bash
/plugin marketplace add openai/codex-plugin-cc --scope user
/plugin install codex@openai-codex
/plugin marketplace add pbakaus/impeccable
/plugin install impeccable@impeccable
/codex:setup
```

impeccable은 CLI 채널로도 설치할 수 있다(저장소 루트에서 `npx impeccable install`).
두 채널은 게이트 발화 관점에서 동등하지 않다 — plugin 채널은 skill을
`impeccable:impeccable`로 등록하는데 mccp 명령 본문은 bare `Skill(impeccable, ...)`를
부르므로, plugin 단독 설치는 디자인 게이트를 `unknown_skill`로 떨어뜨린다. 오늘 게이트를
발화시키려면 bare 이름을 배포하는 CLI 채널이 필요하다(호출부 재배선은 예정된 작업이다).

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

