'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { scanPlans } = require('../sources/plans');
const { tmpRepo, cleanup, writeText } = require('./helpers');

// Codex F1 — 평문 `**Source PRD**: path` 와 백틱 path 도 source_prd 추출되어야 함.
// (기존 regex는 마크다운 링크 `[label](path)` 만 매칭해 평문 PRD discovery 누락)
test('source_prd: 링크/평문/백틱 세 형태 모두 추출', () => {
  const root = tmpRepo('mccp-plans-prd-');
  try {
    writeText(path.join(root, '.claude/plans/link.plan.md'),
      '# Plan\n\n**Source PRD**: [.claude/prds/x.prd.md](../prds/x.prd.md)\n');
    writeText(path.join(root, '.claude/plans/plain.plan.md'),
      '# Plan\n\n**Source PRD**: .claude/prds/y.prd.md\n');
    writeText(path.join(root, '.claude/plans/tick.plan.md'),
      '# Plan\n\n**Source PRD**: `.claude/prds/z.prd.md`\n');
    writeText(path.join(root, '.claude/plans/none.plan.md'),
      '# Plan\n\nno source line here\n');

    const out = scanPlans(root);
    const by = (slug) => out.items.find(i => i.slug === slug);

    assert.equal(by('link').source_prd.path, '../prds/x.prd.md');
    assert.equal(by('plain').source_prd.path, '.claude/prds/y.prd.md');
    assert.equal(by('tick').source_prd.path, '.claude/prds/z.prd.md'); // 백틱 strip
    assert.equal(by('none').source_prd, null);
  } finally {
    cleanup(root);
  }
});
