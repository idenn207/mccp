'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  oklchToOklab,
  oklabToLinearSrgb,
  linearSrgbTosRgb,
  sRgbChannelToLinear,
  sRGBtoLuminance,
  oklchToSrgb,
  oklchToLuminance,
  contrastRatio,
} = require('../parsers/oklch-contrast');

const EPS = 0.005;

function approxEq(actual, expected, eps, label) {
  assert.ok(
    Math.abs(actual - expected) <= eps,
    label + ' actual=' + actual + ' expected=' + expected + ' diff=' + Math.abs(actual - expected),
  );
}

test('oklchToOklab — h=0 → a=C, b=0', () => {
  const lab = oklchToOklab(0.5, 0.1, 0);
  approxEq(lab.L, 0.5, EPS, 'L');
  approxEq(lab.a, 0.1, EPS, 'a');
  approxEq(lab.b, 0.0, EPS, 'b');
});

test('oklchToOklab — h=90 → a=0, b=C', () => {
  const lab = oklchToOklab(0.5, 0.1, 90);
  approxEq(lab.L, 0.5, EPS, 'L');
  approxEq(lab.a, 0.0, EPS, 'a');
  approxEq(lab.b, 0.1, EPS, 'b');
});

test('linearSrgbTosRgb — gamma boundary 0.0031308 → 0.04045', () => {
  approxEq(linearSrgbTosRgb(0.0031308), 0.04045, 0.001, 'boundary');
  approxEq(linearSrgbTosRgb(0.0), 0.0, EPS, 'zero');
  approxEq(linearSrgbTosRgb(1.0), 1.0, EPS, 'one');
});

test('sRgbChannelToLinear — gamma inverse boundary', () => {
  approxEq(sRgbChannelToLinear(0.04045), 0.0031308, 0.001, 'boundary inverse');
  approxEq(sRgbChannelToLinear(0.0), 0.0, EPS, 'zero');
  approxEq(sRgbChannelToLinear(1.0), 1.0, EPS, 'one');
});

test('sRGBtoLuminance — white = 1.0, black = 0.0, midgray ≈ 0.214', () => {
  approxEq(sRGBtoLuminance(1, 1, 1), 1.0, EPS, 'white');
  approxEq(sRGBtoLuminance(0, 0, 0), 0.0, EPS, 'black');
  // sRGB(0.5,0.5,0.5) → linear ≈ 0.2140
  approxEq(sRGBtoLuminance(0.5, 0.5, 0.5), 0.2140, 0.01, '50% gray');
});

test('oklchToSrgb spec vector — white (L=1, C=0)', () => {
  const rgb = oklchToSrgb(1.0, 0.0, 0);
  approxEq(rgb.r, 1.0, EPS, 'r');
  approxEq(rgb.g, 1.0, EPS, 'g');
  approxEq(rgb.b, 1.0, EPS, 'b');
});

test('oklchToSrgb spec vector — black (L=0, C=0)', () => {
  const rgb = oklchToSrgb(0.0, 0.0, 0);
  approxEq(rgb.r, 0.0, EPS, 'r');
  approxEq(rgb.g, 0.0, EPS, 'g');
  approxEq(rgb.b, 0.0, EPS, 'b');
});

test('contrastRatio — black vs white = 21:1', () => {
  const ratio = contrastRatio(1.0, 0.0);
  assert.ok(Math.abs(ratio - 21) <= 0.1, 'ratio=' + ratio);
});

test('contrastRatio — identical luminance = 1:1', () => {
  approxEq(contrastRatio(0.5, 0.5), 1.0, EPS, 'identity');
});

test('oklchToLuminance — bg-light L=0.99 → high luminance ≥ 0.95', () => {
  const lum = oklchToLuminance(0.99, 0.0, 0);
  assert.ok(lum >= 0.95, 'bg-light lum=' + lum + ' < 0.95');
});

test('oklchToLuminance — bg-dark L=0.18 → low luminance ≤ 0.05', () => {
  const lum = oklchToLuminance(0.18, 0.0, 0);
  assert.ok(lum <= 0.05, 'bg-dark lum=' + lum + ' > 0.05');
});
