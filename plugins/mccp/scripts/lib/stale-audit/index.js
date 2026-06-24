'use strict';

// Dashboard Truthfulness M3 — stale-audit facade.
//
// 결정적 enumerate(active 항목 산출) + apply(비파괴 마커 삽입)를 묶는다. 평가(추론)는
// `/mccp:dashboard-audit` agent 가 담당 — 이 facade 는 결정적 레이어만. loud fail-open.

const { enumerate } = require('./enumerate');
const { apply } = require('./apply');
const locate = require('./locate');

module.exports = {
  enumerate,
  apply,
  findRisksTableLine: locate.findRisksTableLine,
  findMilestoneRow: locate.findMilestoneRow,
};
