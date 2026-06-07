#!/usr/bin/env node
'use strict';

// body-builder — atomic insert/replace of named heading sections in a
// body-file. Used by /mccp:pr Phase 2.5.4 (codex section), 2.5.5b
// (security override) and 2.5.1/5b (impeccable design review).
//
// v0.2.8 Task 2.6.1-followup F10 — replaces the heredoc + persistent
// re-write pattern in pr.md with a single Node CLI call so pr-phase-guard's
// allowlist can reduce to one helper-path pattern.
//
// Argv:
//   --section codex|security|impeccable
//   --body-file <path>     (existing body draft; created if missing)
//   --content-file <path>  (content to write under the section heading;
//                           must NOT start with the heading line itself)
//   [--cwd <path>]
// Stdout (JSON): { ok, body_file, section, action: 'created'|'replaced' }

const fs = require('fs');
const path = require('path');
const { parseArgs, emit, fail } = require('./_args');

const SECTION_HEADINGS = {
  codex: '## Codex Adversarial Review',
  security: '## Security Reviewer Override',
  impeccable: '## Impeccable Override',
  design: '## Design Review',
};

function readBodyOrEmpty(bodyFile) {
  try { return fs.readFileSync(bodyFile, 'utf8'); }
  catch (err) {
    if (err.code === 'ENOENT') return '';
    throw err;
  }
}

// Splits body into sections keyed by `## Heading` line. Sections preserve
// order; the synthesized order on write is the insertion order of keys
// plus the freshly-set section appended/replaced in place.
function splitSections(body) {
  const lines = body.split(/\r?\n/);
  const sections = [];
  let current = { heading: null, lines: [] };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^## /.test(line)) {
      if (current.heading !== null || current.lines.length > 0) {
        sections.push(current);
      }
      current = { heading: line, lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);
  return sections;
}

function joinSections(sections) {
  const parts = [];
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (s.heading !== null) parts.push(s.heading);
    parts.push(s.lines.join('\n'));
  }
  return parts.join('\n').replace(/\n+$/, '\n');
}

// Insert or replace a named heading section. Returns { body, action }.
function upsertSection(body, heading, content) {
  const sections = splitSections(body);
  let replaced = false;
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].heading === heading) {
      sections[i].lines = ['', content, ''];
      replaced = true;
      break;
    }
  }
  if (!replaced) {
    sections.push({ heading: heading, lines: ['', content, ''] });
  }
  return { body: joinSections(sections), action: replaced ? 'replaced' : 'created' };
}

function atomicWrite(target, body) {
  const dir = path.dirname(target);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = target + '.tmp-' + process.pid + '-' + Date.now();
  fs.writeFileSync(tmp, body, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, target);
}

function run(args) {
  if (!args.section) return fail('--section <codex|security|impeccable|design> required');
  const heading = SECTION_HEADINGS[args.section];
  if (!heading) return fail('unknown --section value: ' + args.section);
  if (!args['body-file']) return fail('--body-file <path> required');
  if (!args['content-file']) return fail('--content-file <path> required');

  let content;
  try { content = fs.readFileSync(args['content-file'], 'utf8'); }
  catch (err) { return fail('cannot read --content-file: ' + err.message); }

  // Defense: strip a leading duplicate heading if caller included it.
  content = content.replace(/^\s*## [^\n]*\n+/, '').replace(/\s+$/, '');

  const existing = readBodyOrEmpty(args['body-file']);
  const result = upsertSection(existing, heading, content);
  try { atomicWrite(args['body-file'], result.body); }
  catch (err) { return fail('atomic write failed: ' + err.message); }

  return emit({
    ok: true,
    body_file: args['body-file'],
    section: args.section,
    heading: heading,
    action: result.action,
    bytes: Buffer.byteLength(result.body, 'utf8'),
  }, 0);
}

if (require.main === module) {
  process.exit(run(parseArgs(process.argv.slice(2))));
}

module.exports = {
  run,
  upsertSection,
  splitSections,
  joinSections,
  SECTION_HEADINGS,
};
