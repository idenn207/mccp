'use strict';

// W3C CSS Color Module Level 4 §16.4 — OKLCH → OKLab → linear sRGB → sRGB → WCAG luminance
// Dep-0. Pure functions. Used by tests/a11y-contrast.test.js and tests/oklch-conformance.test.js.

function oklchToOklab(L, C, h) {
  const hRad = (h * Math.PI) / 180;
  return { L: L, a: C * Math.cos(hRad), b: C * Math.sin(hRad) };
}

// OKLab → linear sRGB via M2 (OKLab → LMS') → cube → M1^-1 (LMS → linear sRGB)
function oklabToLinearSrgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return {
    r: +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  };
}

function linearSrgbTosRgb(L) {
  if (L <= 0.0031308) return 12.92 * L;
  return 1.055 * Math.pow(L, 1 / 2.4) - 0.055;
}

function clamp01(x) {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function oklchToSrgb(L, C, h) {
  const lab = oklchToOklab(L, C, h);
  const lin = oklabToLinearSrgb(lab.L, lab.a, lab.b);
  return {
    r: clamp01(linearSrgbTosRgb(lin.r)),
    g: clamp01(linearSrgbTosRgb(lin.g)),
    b: clamp01(linearSrgbTosRgb(lin.b)),
  };
}

// sRGB (0..1) → WCAG 2.2 relative luminance
// First reverse companding, then 0.2126 R + 0.7152 G + 0.0722 B.
function sRgbChannelToLinear(c) {
  if (c <= 0.04045) return c / 12.92;
  return Math.pow((c + 0.055) / 1.055, 2.4);
}

function sRGBtoLuminance(R, G, B) {
  const rLin = sRgbChannelToLinear(R);
  const gLin = sRgbChannelToLinear(G);
  const bLin = sRgbChannelToLinear(B);
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

function oklchToLuminance(L, C, h) {
  const rgb = oklchToSrgb(L, C, h);
  return sRGBtoLuminance(rgb.r, rgb.g, rgb.b);
}

function contrastRatio(lumA, lumB) {
  const L1 = Math.max(lumA, lumB);
  const L2 = Math.min(lumA, lumB);
  return (L1 + 0.05) / (L2 + 0.05);
}

function contrastRatioOKLCH(fg, bg) {
  const lumFg = oklchToLuminance(fg.L, fg.C, fg.h);
  const lumBg = oklchToLuminance(bg.L, bg.C, bg.h);
  return contrastRatio(lumFg, lumBg);
}

module.exports = {
  oklchToOklab,
  oklabToLinearSrgb,
  linearSrgbTosRgb,
  sRgbChannelToLinear,
  sRGBtoLuminance,
  oklchToSrgb,
  oklchToLuminance,
  contrastRatio,
  contrastRatioOKLCH,
};
