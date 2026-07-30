'use strict';

// Regression guard for the derive-source layer of MSW metrics.
// 이 층은 원래 테스트가 없어(standalone CLI 경로만 검증됨) 두 결함이 새어나갔다:
//   - toggle-usage: scanDir이 byName만 채우고 count를 갱신 안 해 denominator 항상 0
//     → B3가 실제 corpus에서 항상 insufficient
//   - handoff-items: derive source 자체가 미등록 → A4가 항상 'source unavailable'

const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const { scanToggleUsage } = require('../../derive/sources/toggle-usage');
const { scanHandoffItems } = require('../../derive/sources/handoff-items');

test('toggle-usage: denominator counts distinct toggles on real repo surface', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
  const r = scanToggleUsage(repoRoot);
  assert.strictEqual(r.ok, true);
  // repo에는 수십 개의 MCCP_* 토글이 존재 — denominator는 절대 0이면 안 된다
  // (count가 갱신 안 되던 회귀).
  assert.ok(r.denominator > 50, `denominator should exceed 50, got ${r.denominator}`);
});

test('handoff-items source: computes items_left/restored from sidecar files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a4-src-'));
  const sdir = path.join(root, '.claude', 'state');
  fs.mkdirSync(sdir, { recursive: true });

  // 이전 세션이 3개 남김; 그 중 2개는 현재에도 미완(plan + fix-task), 1개는 사라짐
  fs.writeFileSync(path.join(sdir, 'prev.handoff-items.json'), JSON.stringify({
    items: [
      { type: 'plan', id: 'p1.plan.md' },
      { type: 'fix_task', id: 'fix-task' },
      { type: 'plan', id: 'gone.plan.md' },
    ],
  }));
  fs.mkdirSync(path.join(root, '.claude', 'plans'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'plans', 'p1.plan.md'), '# in progress, no status line');
  fs.writeFileSync(path.join(sdir, 'fix-task.md'), 'unresolved');

  const r = scanHandoffItems(root);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.items_left_count, 3, 'distinct items left by prior session');
  assert.strictEqual(r.items_restored_count, 2, 'items still unfinished = restored');
});

test('handoff-items source: dedupes items across multiple prior sidecar files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a4-dedupe-'));
  const sdir = path.join(root, '.claude', 'state');
  fs.mkdirSync(sdir, { recursive: true });

  // 같은 (type,id)를 두 파일이 나열 — distinct 1로 계상돼야(중복 계상 시 A4 > 1)
  const items = { items: [{ type: 'fix_task', id: 'fix-task' }] };
  fs.writeFileSync(path.join(sdir, 's1.handoff-items.json'), JSON.stringify(items));
  fs.writeFileSync(path.join(sdir, 's2.handoff-items.json'), JSON.stringify(items));
  fs.writeFileSync(path.join(sdir, 'fix-task.md'), 'unresolved');

  const r = scanHandoffItems(root);
  assert.strictEqual(r.items_left_count, 1, 'duplicate (type,id) counted once in denominator');
  assert.strictEqual(r.items_restored_count, 1, 'restored count never exceeds denominator');
});

test('handoff-items source: empty state dir returns ok with zero counts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a4-empty-'));
  const r = scanHandoffItems(root);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.items_left_count, 0);
  assert.strictEqual(r.items_restored_count, 0);
});
