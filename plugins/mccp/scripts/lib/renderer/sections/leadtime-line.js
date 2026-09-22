'use strict';

// leadtime-observability M3 — 리드타임 한 줄 섹션.
//
// `model.leadtime`(derive M3 투영)의 순수 함수. `{md, html}` 또는 `null`.
//
// ── 이 섹션이 다른 섹션과 다른 점: hide 조건이 하나뿐이다 (DD3) ──────────────
//
// `msw-metrics`의 graceful-hide는 "아직 측정 전"을 조용히 넘긴다. 이 축은 PRD가
// 명시적으로 **"없으면 없다고 적으라"**고 요구했으므로(UI3) hide 조건을 좁힌다:
//
//   축이 계산되지 않았다 (키 부재 **또는** 값이 null) → 렌더하지 않는다
//   state === 'ok'                                    → 값 + 커버리지
//   state === 'degraded'                              → 값 + 커버리지 + 손상 꼬리표
//   state === 'blind' 또는 측정 가능 0                → `미산출` + 사유 + 커버리지
//   한쪽 앵커만 조인됨                                → 그 축만 값, 나머지 `미산출`
//   이 함수가 throw                                   → `safeSection`의 ⚠ (기존 관례)
//
// **hide 술어에 `null` 을 포함하는 것이 요점이다.** plan DD3 1행은 "키 부재"라고
// 적었지만 `emptyModel` 이 키를 항상 선언하고 `scanLeadtime` 이 `leadtimeScan:false`
// 에서 `null` 을 돌려주므로, 실제 판별자는 값이다. `null` 에 `미산출` 을 찍으면
// 측정하지 않은 축에 대해 없는 기록을 소급 주장하는 것이 되어 UI10 을 어긴다.
// 반대로 `null` 을 역참조하면 `safeSection` ⚠ 로 떨어져 관측 부재가 렌더 결함처럼
// 보인다 — DD3 이 명시적으로 금지한 두 방향이 정확히 이 한 줄에 걸려 있다.
//
// ── §3.9 Output Constraints 준수 근거 ────────────────────────────────────────
//
//   (1) 정보 위계 · heading depth ≤ 3 — 신규 heading **0개**. 이미 있는 대시보드
//       블록 안의 한 줄이고 자기 heading 을 갖지 않는다.
//   (2) 강조색 화면당 1개 — 신규 CSS 클래스 0개. 기존 `mono`/`muted` 재사용이라
//       hero verdict 가 유일한 loud accent 라는 위계를 건드리지 않는다.
//   (3) raw markdown marker 금지 — 투영에 자유 문자열이 없다(DD12). 주입할 마커의
//       소스가 구조적으로 존재하지 않으므로 escaping 이 규율이 아니라 불필요해진다.
//   (4) 한 화면 항목 수 상한 — 값 항목 3개(패널 · ledger · hash)로 상한 내.

const { formatLeadtimeLine } = require('../../leadtime-surface');

function renderLeadtimeLine(model, formatUtils) {
  const m = model || {};
  // 유일한 hide 조건. 축이 계산되지 않았다는 사실만 숨기고, 값 부재는 숨기지 않는다.
  if (!('leadtime' in m)) return null;
  const summary = m.leadtime;
  if (summary === null || summary === undefined) return null;

  const line = formatLeadtimeLine(summary);
  const note = line.parts.note;

  const escapeHtml = (formatUtils && formatUtils.escapeHtml)
    || ((s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));

  // note 는 **문단**으로 분리한다(M4 DD5). 빈 줄 없이 잇는 단일 개행은 CommonMark 의
  // soft break 라 두 줄이 한 문단으로 접히는데, 바로 아래 html 은 `<p>` 둘을 낸다.
  // 그러면 두 면의 정보는 같아도 **구조가 다르고**, PRODUCT.md Design Principle 4 가
  // 요구하는 것은 "동일 정보, 다른 표현"이지 "다른 구조"가 아니다.
  const md = note ? (line.text + '\n\n' + note) : line.text;
  const html = '<p class="mono muted">' + escapeHtml(line.text) + '</p>'
    + (note ? '<p class="muted">' + escapeHtml(note) + '</p>' : '');

  return { md: md, html: html, text: line.text, note: note };
}

module.exports = { renderLeadtimeLine: renderLeadtimeLine };
