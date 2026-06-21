'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { contrastRatioOKLCH } = require('../parsers/oklch-contrast');

// Production OKLCH tokens — must match html.js OKLCH_LIGHT + OKLCH_DARK blocks.
// Light
const T_LIGHT = {
  bg:           { L: 0.99, C: 0.0,   h: 0   },
  ink:          { L: 0.20, C: 0.005, h: 250 },
  muted:        { L: 0.45, C: 0.008, h: 250 },
  accent:       { L: 0.55, C: 0.18,  h: 230 },
  statusBlocked:{ L: 0.55, C: 0.18,  h: 25  },
};
// Dark
const T_DARK = {
  bg:           { L: 0.18, C: 0.0,   h: 0   },
  ink:          { L: 0.92, C: 0.005, h: 250 },
  muted:        { L: 0.65, C: 0.008, h: 250 },
  accent:       { L: 0.70, C: 0.15,  h: 230 },
  statusBlocked:{ L: 0.65, C: 0.20,  h: 25  },
};

function strictGe(ratio, target, label) {
  assert.ok(
    ratio >= target,
    label + ' contrast=' + ratio.toFixed(2) + ' < target=' + target,
  );
}

test('Light — ink vs bg ≥ 7:1 (body text WCAG AAA)', () => {
  strictGe(contrastRatioOKLCH(T_LIGHT.ink, T_LIGHT.bg), 7, 'light ink/bg');
});

test('Light — muted vs bg ≥ 4.5:1 (secondary text WCAG AA)', () => {
  strictGe(contrastRatioOKLCH(T_LIGHT.muted, T_LIGHT.bg), 4.5, 'light muted/bg');
});

test('Light — accent vs bg ≥ 3:1 (large/link WCAG AA)', () => {
  strictGe(contrastRatioOKLCH(T_LIGHT.accent, T_LIGHT.bg), 3, 'light accent/bg');
});

test('Light — status-blocked vs bg ≥ 4.5:1 (severity text WCAG AA)', () => {
  strictGe(contrastRatioOKLCH(T_LIGHT.statusBlocked, T_LIGHT.bg), 4.5, 'light blocked/bg');
});

test('Dark — ink vs bg ≥ 7:1 (body text WCAG AAA)', () => {
  strictGe(contrastRatioOKLCH(T_DARK.ink, T_DARK.bg), 7, 'dark ink/bg');
});

test('Dark — muted vs bg ≥ 4.5:1 (secondary text WCAG AA)', () => {
  strictGe(contrastRatioOKLCH(T_DARK.muted, T_DARK.bg), 4.5, 'dark muted/bg');
});

test('Dark — accent vs bg ≥ 3:1 (large/link WCAG AA)', () => {
  strictGe(contrastRatioOKLCH(T_DARK.accent, T_DARK.bg), 3, 'dark accent/bg');
});

test('Dark — status-blocked vs bg ≥ 4.5:1 (severity text WCAG AA)', () => {
  strictGe(contrastRatioOKLCH(T_DARK.statusBlocked, T_DARK.bg), 4.5, 'dark blocked/bg');
});
