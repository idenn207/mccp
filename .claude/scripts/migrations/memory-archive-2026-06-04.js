#!/usr/bin/env node
// Milestone 0 Task A.3 Step 3 — MEMORY.md demotion (Codex R1 Finding 5 absorption).
// Demotes v0.2.x cycle memory entries to `## Archive (historical reference)` section.
// Preserves: roadmap entry + feedback-cost-not-stop-signal.
//
// Usage:
//   node memory-archive-2026-06-04.js --memory <path> --dry-run
//   node memory-archive-2026-06-04.js --memory <path> --apply

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_MEMORY_PATH = 'C:/Users/skypark207/.claude/projects/c---project-my-my-claude-code-plugin/memory/MEMORY.md';

const DEMOTE_SLUGS = [
  'mccp-v0.2.3-cycle',
  'mccp-v0.2-continuation',
  'mccp-v0.2-s9-dogfood',
  'mccp-v0.2-plan-converged',
  'mccp-bootstrap-progress',
  'mccp-direction-decision',
  'ecc-hook-malfunction-observation',
  'ecc-autonomy-infra',
];

const PRESERVE_SLUGS = [
  'mccp-roadmap',
  'feedback-cost-not-stop-signal',
];

function parseArgs(argv) {
  const args = { memory: DEFAULT_MEMORY_PATH, dryRun: false, apply: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--apply') args.apply = true;
    else if (a === '--memory') args.memory = argv[++i];
  }
  if (!args.dryRun && !args.apply) {
    console.error('Usage: --dry-run | --apply [--memory <path>]');
    process.exit(2);
  }
  if (args.dryRun && args.apply) {
    console.error('Cannot combine --dry-run and --apply.');
    process.exit(2);
  }
  return args;
}

function slugFromLink(line) {
  // Match `- [Title](slug.md) — ...` or `- [Title](path/slug.md)`
  const m = line.match(/\]\(([^)]+?)\)/);
  if (!m) return null;
  const href = m[1];
  const base = path.basename(href);
  if (!base.endsWith('.md')) return null;
  return base.slice(0, -3);
}

function bucketize(lines) {
  const kept = [];
  const demoted = [];
  const unrecognized = [];
  const archiveExisting = [];
  let inArchive = false;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (/^## Archive/i.test(line)) {
      inArchive = true;
      continue;
    }
    if (inArchive) {
      if (line.startsWith('- ')) archiveExisting.push(line);
      continue;
    }
    if (!line.startsWith('- ')) continue;
    const slug = slugFromLink(line);
    if (!slug) {
      unrecognized.push(line);
      continue;
    }
    if (PRESERVE_SLUGS.includes(slug)) {
      kept.push(line);
    } else if (DEMOTE_SLUGS.includes(slug)) {
      demoted.push(line);
    } else {
      unrecognized.push(line);
    }
  }
  return { kept, demoted, unrecognized, archiveExisting };
}

function buildNewContent({ kept, demoted, unrecognized, archiveExisting }) {
  const out = [];
  out.push(...kept);
  if (unrecognized.length) out.push(...unrecognized);
  const archive = [...archiveExisting, ...demoted];
  if (archive.length) {
    out.push('');
    out.push('## Archive (historical reference)');
    out.push('');
    out.push(...archive);
  }
  return out.join('\n') + '\n';
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function verifyAllSlugsPresent(content) {
  const all = [...PRESERVE_SLUGS, ...DEMOTE_SLUGS];
  const missing = [];
  for (const s of all) {
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\]\\([^)]*\\b${escaped}\\.md\\)|\\[\\[${escaped}\\]\\]`);
    if (!re.test(content)) missing.push(s);
  }
  return missing;
}

function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(args.memory)) {
    console.error(`MEMORY.md not found at ${args.memory}`);
    process.exit(1);
  }
  const original = fs.readFileSync(args.memory, 'utf8');
  const originalSha = sha256(original);
  const lines = original.split(/\n/);
  const buckets = bucketize(lines);
  const newContent = buildNewContent(buckets);
  const newSha = sha256(newContent);

  const report = {
    memory_path: args.memory,
    pre_migration_sha256: originalSha,
    post_migration_sha256_preview: newSha,
    counts: {
      kept: buckets.kept.length,
      demoted: buckets.demoted.length,
      unrecognized: buckets.unrecognized.length,
      archive_existing: buckets.archiveExisting.length,
    },
    kept_slugs: buckets.kept.map(slugFromLink),
    demoted_slugs: buckets.demoted.map(slugFromLink),
    unrecognized_lines: buckets.unrecognized,
  };

  const missing = verifyAllSlugsPresent(newContent);
  if (missing.length) {
    console.error('MIGRATION ABORTED — slugs missing from new content:', missing);
    process.exit(1);
  }

  if (args.dryRun) {
    console.log('DRY-RUN — no file written.');
    console.log(JSON.stringify(report, null, 2));
    console.log('--- NEW CONTENT PREVIEW ---');
    process.stdout.write(newContent);
    return;
  }

  // --apply path: write atomic backup adjacent to target, then overwrite.
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const backup = `${args.memory}.bak.preApply.${ts}`;
  fs.writeFileSync(backup, original, 'utf8');
  fs.writeFileSync(args.memory, newContent, 'utf8');
  const readBack = fs.readFileSync(args.memory, 'utf8');
  if (sha256(readBack) !== newSha) {
    console.error('Post-write checksum mismatch — restoring backup.');
    fs.writeFileSync(args.memory, original, 'utf8');
    process.exit(1);
  }
  const missingAfter = verifyAllSlugsPresent(readBack);
  if (missingAfter.length) {
    console.error('Post-write slug verification failed — restoring backup. Missing:', missingAfter);
    fs.writeFileSync(args.memory, original, 'utf8');
    process.exit(1);
  }
  console.log('APPLIED.');
  console.log(`Backup: ${backup}`);
  console.log(JSON.stringify(report, null, 2));
}

main();
