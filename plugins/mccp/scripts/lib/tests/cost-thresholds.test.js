'use strict';

const test = require('node:test');
const assert = require('node:assert');

const thresholds = require('../cost-thresholds');
const costState = require('../cost-state');

function withEnv(name, value, fn) {
  const had = Object.prototype.hasOwnProperty.call(process.env, name);
  const prev = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try { fn(); }
  finally {
    if (had) process.env[name] = prev;
    else delete process.env[name];
  }
}

function silenceStderr(fn) {
  const orig = process.stderr.write.bind(process.stderr);
  const lines = [];
  process.stderr.write = function (s) { lines.push(String(s)); return true; };
  try { fn(); }
  finally { process.stderr.write = orig; }
  return lines.join('');
}

test('default thresholds = 50/80/100', () => {
  withEnv(thresholds.ENV_NAME, undefined, () => {
    const t = thresholds.getHandoffCostThresholds();
    assert.deepStrictEqual(t, { notice: 50, warning: 80, critical: 100 });
  });
});

test('env override valid → applies', () => {
  withEnv(thresholds.ENV_NAME, '40,70,90', () => {
    const t = thresholds.getHandoffCostThresholds();
    assert.deepStrictEqual(t, { notice: 40, warning: 70, critical: 90 });
  });
});

test('env override with extra whitespace → trimmed', () => {
  withEnv(thresholds.ENV_NAME, ' 30 , 60 , 95 ', () => {
    const t = thresholds.getHandoffCostThresholds();
    assert.deepStrictEqual(t, { notice: 30, warning: 60, critical: 95 });
  });
});

test('env override wrong part count → default + warn', () => {
  withEnv(thresholds.ENV_NAME, '50,80', () => {
    const stderr = silenceStderr(() => {
      const t = thresholds.getHandoffCostThresholds();
      assert.deepStrictEqual(t, { notice: 50, warning: 80, critical: 100 });
    });
    assert.match(stderr, /must be "notice,warning,critical"/);
  });
});

test('env override non-finite → default + warn', () => {
  withEnv(thresholds.ENV_NAME, '50,abc,100', () => {
    const stderr = silenceStderr(() => {
      const t = thresholds.getHandoffCostThresholds();
      assert.deepStrictEqual(t, { notice: 50, warning: 80, critical: 100 });
    });
    assert.match(stderr, /non-positive\/non-finite/);
  });
});

test('env override negative → default + warn', () => {
  withEnv(thresholds.ENV_NAME, '-5,50,100', () => {
    const stderr = silenceStderr(() => {
      const t = thresholds.getHandoffCostThresholds();
      assert.deepStrictEqual(t, { notice: 50, warning: 80, critical: 100 });
    });
    assert.match(stderr, /non-positive\/non-finite/);
  });
});

test('env override invariant violated (notice >= warning) → default + warn', () => {
  withEnv(thresholds.ENV_NAME, '80,50,100', () => {
    const stderr = silenceStderr(() => {
      const t = thresholds.getHandoffCostThresholds();
      assert.deepStrictEqual(t, { notice: 50, warning: 80, critical: 100 });
    });
    assert.match(stderr, /invariant notice<warning<critical/);
  });
});

test('env override empty string → default (no warn)', () => {
  withEnv(thresholds.ENV_NAME, '', () => {
    const stderr = silenceStderr(() => {
      const t = thresholds.getHandoffCostThresholds();
      assert.deepStrictEqual(t, { notice: 50, warning: 80, critical: 100 });
    });
    assert.strictEqual(stderr, '');
  });
});

test('cost-state.tierFor boundaries match thresholds', () => {
  withEnv(thresholds.ENV_NAME, undefined, () => {
    assert.strictEqual(costState.tierFor(0), 'green');
    assert.strictEqual(costState.tierFor(49.99), 'green');
    assert.strictEqual(costState.tierFor(50), 'notice');
    assert.strictEqual(costState.tierFor(79.99), 'notice');
    assert.strictEqual(costState.tierFor(80), 'warning');
    assert.strictEqual(costState.tierFor(99.99), 'warning');
    assert.strictEqual(costState.tierFor(100), 'critical');
    assert.strictEqual(costState.tierFor(150), 'critical');
    assert.strictEqual(costState.tierFor(NaN), 'green');
    assert.strictEqual(costState.tierFor(undefined), 'green');
  });
});

test('cost-state.tierFor honors env override', () => {
  withEnv(thresholds.ENV_NAME, '20,40,60', () => {
    assert.strictEqual(costState.tierFor(19), 'green');
    assert.strictEqual(costState.tierFor(20), 'notice');
    assert.strictEqual(costState.tierFor(40), 'warning');
    assert.strictEqual(costState.tierFor(60), 'critical');
  });
});
