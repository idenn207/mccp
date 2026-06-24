'use strict';

// Dashboard Truthfulness M3 — stale-audit 라인 위치 헬퍼 (pure).
//
// enumerate 와 apply 가 *동일* 위치 로직을 공유해, enumerate 가 산출한 ref 의
// lineNumber 가 apply 시점에 같은 라인을 가리킨다(parser-parity). 모두 1-indexed
// lineNumber 반환(parseOpenQuestions 와 동일 컨벤션). throw 안 함.

const { stripLineMarker } = require('../renderer/parsers/resolution-marker');

// `lines` 에서 heading(`## <title>`) 다음 표 영역의 데이터 행 라인 인덱스(0-base)
// 배열을 반환. 표 separator(`|---`) 이후 `|` 로 시작하는 비-separator 행만, 다음
// `##` heading 또는 비-표 라인에서 종료.
function tableDataLineIndexes(lines, headingTitle) {
  const out = [];
  let inSection = false;
  let inTable = false;
  const headRe = new RegExp('^##\\s+' + headingTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (/^##\s/.test(raw)) {
      if (inSection) break; // 다음 ## → 섹션 종료
      if (headRe.test(raw)) { inSection = true; inTable = false; }
      continue;
    }
    if (!inSection) continue;
    const line = stripLineMarker(raw).line;
    const trimmed = line.trim();
    if (/^\|\s*-+/.test(trimmed)) { inTable = true; continue; }
    if (!inTable) continue;
    if (!trimmed.startsWith('|')) { if (trimmed === '') continue; break; }
    out.push(i);
  }
  return out;
}

// `## Risks` 표의 ordinal-th 데이터 행 1-indexed lineNumber. 미발견 시 null.
// parseRisks 는 3/4-cell 행만 keep(그 외 malformed skip)하고 ordinal 을 keep-rows
// 인덱스로 매긴다 — locate 도 동일 필터를 적용해야 ordinal 정합(off-by-one 방지,
// enumerate↔apply parity 불변). embedded `|` 로 cell 수가 어긋난 행이 있으면
// 두 파서가 같은 행을 skip한다.
function findRisksTableLine(lines, ordinal) {
  const idxs = tableDataLineIndexes(lines, 'Risks');
  const kept = [];
  for (const i of idxs) {
    const line = stripLineMarker(lines[i]).line.trim();
    const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    if (cells.length === 3 || cells.length === 4) kept.push(i);
  }
  if (ordinal < 0 || ordinal >= kept.length) return null;
  return kept[ordinal] + 1;
}

// `## Delivery Milestones` 표에서 name(2번째 셀) 일치 행. { lineNumber(1-base),
// cells } 반환, 미발견 시 null. 마커 strip 후 셀 split.
function findMilestoneRow(lines, name) {
  const idxs = tableDataLineIndexes(lines, 'Delivery Milestones');
  const target = String(name == null ? '' : name).trim();
  for (const i of idxs) {
    const line = stripLineMarker(lines[i]).line;
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    if (cells.length >= 5 && cells[1] === target) {
      return { lineNumber: i + 1, cells };
    }
  }
  return null;
}

module.exports = { tableDataLineIndexes, findRisksTableLine, findMilestoneRow };
