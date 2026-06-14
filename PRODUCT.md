# Product

## Register

product

## Users

**Primary**: PM-mode solo developer (skypark207). 자기 자신을 PM으로 정의하고 AI가 작성한 코드는 보지 않으며, PR 단위로 outcome만 검토·승인한다. mccp-installed 임의 프로젝트에 진입했을 때 첫 60초 안에 in-progress / blocked / next-step / risk 4축을 식별하는 것이 목표.

**Context of use**: Claude Code chat 인터페이스 + 새 세션 진입 시점이 핵심. CLI 출력 옆에 정적 HTML dashboard(`.claude/cache/status.html`)와 plain text 동등본(`.claude/cache/STATUS.md`)을 별도 surface로 본다. 데스크탑 단일 환경 가정 — 모바일/태블릿은 v1.x scope 외.

**Job to be done**: AI agent가 수행 중인 SDLC 작업(PRD → plan → implement → review → PR)의 *현재 위치, 막힘, 다음 행동, 위험*을 grep 없이 한눈에 파악. `.md` 파일을 직접 읽거나 수정하지 않고, 분석·의견·심사 형태의 요약을 통해 의사결정.

## Product Purpose

mccp(My Claude Code Plugin)는 Claude Code 위에서 AI agent의 PRD → plan → implement → review → PR 파이프라인을 자동화하고, Codex와의 cross-model adversarial review로 그 산출물에 chain-of-custody(receipt JSON + cryptographic hash)를 박는 Claude Code plugin이다. 단일 사용자가 PM 역할로 *최종 검토만* 수행하면서 6~24개월 프로젝트를 유지보수할 수 있도록, AI agent 활동의 audit / 진행도 / blocker / risk를 표준화된 표면으로 노출하는 것이 미션.

v1.1 Observability Surface II는 이 파이프라인의 derive-only **PM 콘솔**을 추가한다. mccp가 만든 산출물(`.claude/` 하위 .md + JSON receipt)이 8종 이상 분산돼 사용자가 한눈에 보지 못하던 문제를, 단일 정적 HTML과 동등 plain text로 해결한다.

성공 정의: 사용자가 임의의 mccp-installed 프로젝트에 진입했을 때 60초 안에 4축을 식별하고, 주관 이해 confidence 8/10에 도달 (현재 ~3/10 추정).

## Brand Personality

**Calm · Decisive · Compact**

- **Calm**: 시끄럽지 않다. hero number, gradient card, animated badge, 컬러 폭격 부재. 정보는 정적, 톤은 차분.
- **Decisive**: 모든 verdict는 명확한 1줄. "혹시", "아마도"는 사용 금지. AI가 판단을 회피하면 raw finding을 그대로 노출 — 회피보다 정직.
- **Compact**: 한 화면에 5섹션이 스트레스 없이 들어간다. 디테일은 cell 클릭으로 진입 (요약 우선, 깊이는 on-demand).

**Voice**: 임원 브리핑(too formal)과 회계 감사 보고서(too dry) 사이의 중간 톤. `"12 plans active · 2 blocked · next: PR review for v0.3.6"` 같은 텔레그래픽 한 줄이 기준. 형용사 줄이기, 동사+명사 선호.

**Emotional goal**: dashboard를 처음 열 때 사용자가 느낄 감정은 *안도감* (계속 잘 굴러가고 있음) 또는 *명확한 다음 행동* (여기를 보면 됨). 화려함, 흥분, 알람 톤은 회피.

**언어**: 한국어 primary. 기술 식별자(receipt id, gate name, decision_id 등)는 영어 그대로 — 번역 시 의미 손실.

## Anti-references

다음 카테고리처럼 보이면 안 된다:

1. **SaaS hero-metric dashboards** — Datadog / Mixpanel / Amplitude 류의 dashboard hero. 거대 숫자 + gradient 카드 + sparkline 더미. metric을 광고하는 형태. mccp는 PM 보고이지 metric 광고가 아님.

2. **AI-cream "warm minimal" landing pages** — 2026 AI 디폴트 외관. Warm-neutral cream/sand bg + serif heading + 작은 caps eyebrow (`01 · ABOUT`) + 균일 카드 그리드. PM 콘솔이 아니라 vendor landing의 saturated 클리셰. mccp는 카테고리부터 다름.

3. **Bloomberg terminal / 거래소 UI** — 검정 배경 + 형광 컬러 + 데이터 밀도 극대화 + tick 단위 깜빡임. PM 모드에는 노이즈 + 의사결정 부담.

**적용 룰**: 위 3 카테고리의 디자인 시그니처(hero number, gradient card, warm-neutral cream + serif, 형광 다크 모드, 작은 caps eyebrow, 균일 카드 그리드)는 mccp UI에서 기본 차단. 명확한 trade-off 근거 없이 채택 금지. Codex/santa-loop review 단계에서 이 anti-refs를 hard-reject 룰로 적용.

**Allowed dev-adjacent**: mono 폰트, 텔레그래픽 카피, 절제된 팔레트 같은 *차분한 dev 미감*은 허용. Linear / Vercel dashboard / Plain editor의 평정심 텍스트 톤은 OK. dev-tool *maximalism* (file tree, diff viewer, commit graph)만 금지.

## Design Principles

1. **Derive, don't author.** 사용자가 보는 모든 화면은 `.claude/` 하위 source(.md + receipt JSON)로부터 derive된다. UI는 source의 *시각화*이지 source 자체가 아니다. cache가 stale이면 정직하게 "Last refreshed: X seconds ago" 노출. *Why*: source 이중화 방지 + Single Source of Truth invariant 보존.

2. **PM voice, not engineer voice.** 모든 카피와 verdict는 PM이 보고받는 형태로 쓴다. commit SHA, hash, raw receipt JSON, 절대 경로는 detail 진입 후에 등장. 첫 화면 = 1줄 verdict + 4축 status. *Why*: primary user가 자기를 PM으로 정의했고 AI 코드 자체는 보지 않음.

3. **Quiet by default, loud on demand.** 색상/모션/타이포는 평소 절제. 빨강(blocked), 노랑(stale 60s+, secret 탐지)은 *예외 신호*로만 등장. alert fatigue 없는 dashboard 목표. *Why*: 안도감 / 명확한 다음 행동 emotional goal과 정합.

4. **One source of truth, multiple views.** 같은 derive 데이터에서 STATUS.md(text)와 status.html(visual) 두 포맷이 나온다. 둘은 항상 동일 정보, 다른 표현. HTML이 진실 source가 되는 일 없음. *Why*: SSH / 스크린 리더 / 키보드 only 환경에서도 전체 정보 접근 가능 (accessibility + 도구 독립성).

5. **Hard invariant — never user .md direct edit.** 사용자가 에디터로 `.md`를 직접 타이핑/수정하는 요구는 mccp 어떤 surface에서도 발생하지 않는다. AI가 chat Q&A로 답변을 받아 자동 작성하는 패턴(`/mccp:plan-prd`, `/impeccable init`)은 invariant 위반이 *아니다* — 사용자의 손이 파일을 만지지 않으므로. *Why*: primary user가 .md 직접 편집 비용(commit 마다 lint, 위치 찾기, 형식 유지)을 명시적으로 거부. v1.1 Observability Surface II PRD success metric 중 하나가 이 invariant 위반 0.

## Accessibility & Inclusion

- **WCAG 2.2 AA 준수.** 본문 4.5:1 명도 대비, 큰 글자(≥18px or bold ≥14px) 3:1. placeholder text도 4.5:1.
- **Color + icon 이중 표기.** status (pending / in-progress / blocked / done)는 색상 단독이 아니라 항상 색 + 아이콘 + 텍스트로 식별 가능. 색맹 사용자가 모든 정보 접근 가능.
- **prefers-reduced-motion honor.** 모든 transition / animation에 reduced-motion 대안(crossfade 또는 즉시 전환). 모션이 *부재해도 dashboard 동작이 동일* 해야 함 — 모션은 enhancement, 절대 기능의 일부 아님.
- **Plain text fallback.** `status.html` 옆에 항상 `STATUS.md`가 동시 생성. 스크린 리더 / 키보드 only / 시각 장애 / SSH 원격 / 텍스트 전용 터미널 환경 등 어떤 시나리오에서도 plain text로 전체 정보 접근 가능.
- **단일 사용자 가정.** 다국어, 다중 사용자, 다중 권한은 v1.x scope 외. 한국어 UI primary, 영어는 식별자(receipt id, gate name 등)에서만.

---

*Co-created with skypark207 on 2026-06-13 via `/impeccable init` (Q&A → AI auto-write pattern, invariant-compliant).*
