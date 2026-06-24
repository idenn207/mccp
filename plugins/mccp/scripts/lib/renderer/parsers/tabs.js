'use strict';

// Dashboard Truthfulness M3-b — CSS-only 탭 빌더(순수 함수, JS 의존 0).
//
// hidden radio + flex `order` + 인접 `:checked + label + panel` 형제 선택자로
// 패널을 토글한다. static/SSH 서빙에서도 견고(JS 없음). risks/open-questions 가
// 단일 SSoT 로 공유 — 트레일링 `해결됨 N건 <details>`(M3-a) 를 대체해 미해결을
// default 노출하고 완화/해결 이력을 탭 뒤로 보낸다(메인 흐름에서 큰 숫자 제거).
//
// 구조(탭당 인접 triple): <input.tab-radio> <label.tab> <section.tab-panel>
//   flex `order` 가 label 들을 상단 행, panel 들을 하단으로 reflow 한다. CSS 인접
//   선택자는 DOM 순서로 매칭(시각 order 무관)하므로 패널당 unique 선택자가 불필요 —
//   `.tab-radio:checked + .tab + .tab-panel`(generic) 한 줄로 임의 개수 탭 지원.
// a11y: native radio group(좌우 화살표 네비) + for/id label 연결. 시각 숨김 radio 는
//   display:none 이 아닌 opacity:0 + 1px(포커스 가능 유지). focus 는 인접 label 에 표출.

// buildTabs(spec, formatUtils)
//   spec.name        — radio group 이름(섹션 키 기반). input id prefix.
//   spec.tabs[].id   — name 과 결합할 안정 접미(기본 index).
//   spec.tabs[].label   — 탭 라벨 평문(escapeHtml).
//   spec.tabs[].count   — 우측 neutral 뱃지(없으면 생략, 강조색 0 — Constraint 2).
//   spec.tabs[].panelHtml — 패널 inner html(호출자가 안전 보장).
//   spec.tabs[].checked   — default 선택 탭(미지정 시 첫 탭).
function buildTabs(spec, formatUtils) {
  const fu = formatUtils || {};
  const escapeHtml = typeof fu.escapeHtml === 'function' ? fu.escapeHtml : (x) => String(x == null ? '' : x);
  const escapeAttr = typeof fu.escapeAttr === 'function' ? fu.escapeAttr : escapeHtml;
  const tabs = spec && Array.isArray(spec.tabs) ? spec.tabs : [];
  if (tabs.length === 0) return '';
  const name = String((spec && spec.name) || 'tabs');
  const hasChecked = tabs.some((t) => t && t.checked);

  const out = ['<div class="tabs" role="presentation">'];
  tabs.forEach((t, i) => {
    const inputId = name + '-' + String(t && t.id != null ? t.id : i);
    const panelId = inputId + '-panel';
    const checked = (hasChecked ? !!(t && t.checked) : i === 0) ? ' checked' : '';
    const countHtml = (t && t.count != null && t.count !== '')
      ? ' <span class="tab-count">' + escapeHtml(String(t.count)) + '</span>'
      : '';
    out.push('<input class="tab-radio" type="radio" name="' + escapeAttr(name) + '"'
      + ' id="' + escapeAttr(inputId) + '" aria-controls="' + escapeAttr(panelId) + '"' + checked + '>');
    out.push('<label class="tab" for="' + escapeAttr(inputId) + '">'
      + escapeHtml((t && t.label) || '') + countHtml + '</label>');
    out.push('<section class="tab-panel" id="' + escapeAttr(panelId) + '"'
      + ' aria-label="' + escapeAttr((t && t.label) || '') + '">'
      + ((t && t.panelHtml) || '') + '</section>');
  });
  out.push('</div>');
  return out.join('');
}

module.exports = { buildTabs };
