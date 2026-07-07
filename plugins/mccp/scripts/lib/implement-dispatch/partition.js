'use strict';

// workflow-orchestration M2b Task 1 — disjoint-partition oracle.
//
// M2b unlocks N-worker parallel implement, but only when the workers edit
// STRICTLY DISJOINT file-sets — that is the correctness premise the frontier
// grounding rests on ("worktree isolation when agents would otherwise conflict";
// contrapositive: disjoint file-sets never conflict, so merge-back is
// structurally clean). `partitionPlan` splits a plan's Files-to-Change + Tasks
// into groups whose file-sets are pairwise disjoint. Any overlap — a file two
// tasks touch, a mirror/dependency edge between tasks, or a shared generated
// manifest (plugin.json / CHANGELOG / lockfile / cache / PRD) — MERGES the
// affected groups so the parallel workers can never race on the same file.
// Fully entangled (or unparseable) input collapses to a single partition
// (n=1 = the M2a single-worker path).
//
// PURE function — no fs, no Agent, no Date/random. Mirrors the plan-fanout
// oracle split (tested lib + self-contained Workflow port) and mergeEnvelopes'
// aggregate reasoning (dispatch-controller.js:216-266).
//
// Codex R1 F2 absorption — dependency-aware collapse. Filename-disjointness
// alone is not enough: (a) generated/shared outputs (lockfiles, snapshots,
// `.claude/cache/*`, plugin.json / CHANGELOG.md / CLAUDE.md / `.claude/prds/*`
// shared manifests) are commonly appended by MANY tasks, so any task touching
// one is SERIALIZED with every other shared-output toucher; (b) explicit
// import/test-impact edges (dependencyEdges) union the tasks they connect. A
// partition that is "disjoint by name" but touches a shared manifest is
// pre-collapsed here so it never produces a runtime merge conflict.

const DEFAULT_MAX_WORKERS = 4;

// Shared generated/manifest outputs — frozen catalogue. A task that touches ANY
// of these is serialized with every other shared-output toucher (Codex F2 (a)).
// Kept deliberately broad: these are files that version-bump / changelog /
// dashboard / PRD-cell tasks routinely append to across milestones, so treating
// one as belonging to a single partition is fragile.
const SHARED_OUTPUT_PATTERNS = Object.freeze([
  /(^|\/)package-lock\.json$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)bun\.lockb$/,
  /(^|\/)plugin\.json$/,          // .claude-plugin/plugin.json
  /(^|\/)CHANGELOG\.md$/,
  /(^|\/)CLAUDE\.md$/,
  /\.claude\/cache\//,            // generated dashboard artifacts (STATUS.md / status.html)
  /\.claude\/prds\//,             // shared PRD manifest (milestone-cell edits)
  /\.snap$/,                      // jest/vitest snapshots
]);

function isSharedOutput(p) {
  if (typeof p !== 'string' || p.length === 0) return false;
  const norm = p.replace(/\\/g, '/');
  for (let i = 0; i < SHARED_OUTPUT_PATTERNS.length; i++) {
    if (SHARED_OUTPUT_PATTERNS[i].test(norm)) return true;
  }
  return false;
}

// Minimal union-find over string keys.
function makeUF() {
  const parent = Object.create(null);
  function add(x) { if (!(x in parent)) parent[x] = x; }
  function find(x) {
    add(x);
    let root = x;
    while (parent[root] !== root) root = parent[root];
    // path compression
    let cur = x;
    while (parent[cur] !== root) { const nxt = parent[cur]; parent[cur] = root; cur = nxt; }
    return root;
  }
  function union(a, b) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }
  return { add: add, find: find, union: union, parent: parent };
}

function normPath(p) {
  return typeof p === 'string' ? p.replace(/\\/g, '/').trim() : '';
}

function result(over) {
  return Object.assign({
    partitions: [],
    n: 1,
    reason: 'unknown',
    collapsed: false,
  }, over || {});
}

// partitionPlan({ planFiles, tasks, maxWorkers, dependencyEdges })
//   planFiles      — [{ path, taskIds:[] }]  (a file + the task ids that touch it)
//   tasks          — [{ id, mirrors:[] }]    (a task + the task ids it depends on)
//   maxWorkers     — positive int cap on partition count (default 4)
//   dependencyEdges— optional [[taskIdA, taskIdB], ...] import/test-impact edges (F2 b)
//
// → { partitions:[{files:[],taskIds:[]}], n, reason, collapsed }
//
// collapsed = true when the result has fewer partitions than the ideal fully-
// split-by-task count (numTasks) — i.e., overlap / dependency / shared-output /
// cap forced a merge — OR the plan was empty / unparseable.
function partitionPlan(input) {
  input = input || {};
  const maxWorkersRaw = input.maxWorkers;
  const maxWorkers = (Number.isInteger(maxWorkersRaw) && maxWorkersRaw >= 1)
    ? maxWorkersRaw : DEFAULT_MAX_WORKERS;

  let planFiles = input.planFiles;
  let tasks = input.tasks;

  // Defensive parse — malformed input collapses to N=1 (fail-closed).
  if (!Array.isArray(planFiles)) planFiles = [];
  if (!Array.isArray(tasks)) {
    return result({ n: 1, reason: 'parse-error', collapsed: true });
  }

  // Collect the task-id universe (from tasks[] plus any id referenced by a file).
  const taskIds = [];
  const seenTask = Object.create(null);
  const mirrorsById = Object.create(null);
  tasks.forEach(function (t) {
    if (!t || typeof t !== 'object') return;
    const id = typeof t.id === 'string' ? t.id.trim() : '';
    if (id.length === 0 || seenTask[id]) return;
    seenTask[id] = true;
    taskIds.push(id);
    mirrorsById[id] = Array.isArray(t.mirrors)
      ? t.mirrors.filter(function (m) { return typeof m === 'string' && m.trim().length > 0; })
        .map(function (m) { return m.trim(); })
      : [];
  });

  // file → normalized path, with the (deduped) set of task ids that touch it.
  const fileTouchers = Object.create(null); // normPath → Set-like {taskId: true}
  const fileOrder = [];
  planFiles.forEach(function (f) {
    if (!f || typeof f !== 'object') return;
    const p = normPath(f.path);
    if (p.length === 0) return;
    if (!(p in fileTouchers)) { fileTouchers[p] = Object.create(null); fileOrder.push(p); }
    const ids = Array.isArray(f.taskIds) ? f.taskIds : [];
    ids.forEach(function (raw) {
      const id = typeof raw === 'string' ? raw.trim() : '';
      if (id.length === 0) return;
      fileTouchers[p][id] = true;
      if (!seenTask[id]) { seenTask[id] = true; taskIds.push(id); mirrorsById[id] = mirrorsById[id] || []; }
    });
  });

  const numTasks = taskIds.length;

  // Empty plan — nothing to parallelize.
  if (numTasks === 0 && fileOrder.length === 0) {
    return result({ n: 1, reason: 'empty-plan', collapsed: true });
  }

  const uf = makeUF();
  taskIds.forEach(function (id) { uf.add(id); });

  // A synthetic node per file that has NO task (so it still forms a component we
  // can attach files to) — keyed with a reserved prefix that cannot collide with
  // a task id in practice.
  function fileNode(p) { return ' file:' + p; }

  let fileOverlap = false;
  // (1) union all task ids touching the same file. A file touched by 2+ tasks
  // means those tasks CANNOT be split — merge them.
  fileOrder.forEach(function (p) {
    const ids = Object.keys(fileTouchers[p]);
    if (ids.length === 0) {
      uf.add(fileNode(p)); // orphan file → its own component
      return;
    }
    if (ids.length > 1) fileOverlap = true;
    for (let i = 1; i < ids.length; i++) uf.union(ids[0], ids[i]);
    // anchor the file to its (now single) component via the first toucher
    uf.union(fileNode(p), ids[0]);
  });

  // (2) mirror / dependency edges between tasks (F2 b — plan-declared).
  let dependencyMerge = false;
  taskIds.forEach(function (id) {
    (mirrorsById[id] || []).forEach(function (dep) {
      if (dep === id) return;
      const before = uf.find(id);
      uf.union(id, dep);
      if (before !== uf.find(dep)) dependencyMerge = true;
    });
  });
  const edges = Array.isArray(input.dependencyEdges) ? input.dependencyEdges : [];
  edges.forEach(function (e) {
    if (!Array.isArray(e) || e.length < 2) return;
    const a = typeof e[0] === 'string' ? e[0].trim() : '';
    const b = typeof e[1] === 'string' ? e[1].trim() : '';
    if (a.length === 0 || b.length === 0 || a === b) return;
    const ra = uf.find(a);
    uf.union(a, b);
    if (ra !== uf.find(b)) dependencyMerge = true;
  });

  // (3) shared-output serialize (F2 a) — every task/file touching a shared
  // manifest is unioned into ONE component. Pure-source components stay
  // independent; any shared-output toucher is serialized with the rest.
  const sharedAnchors = [];
  fileOrder.forEach(function (p) {
    if (!isSharedOutput(p)) return;
    const ids = Object.keys(fileTouchers[p]);
    if (ids.length > 0) sharedAnchors.push(ids[0]);
    else sharedAnchors.push(fileNode(p));
  });
  let sharedOutputCollapse = false;
  for (let i = 1; i < sharedAnchors.length; i++) {
    const r0 = uf.find(sharedAnchors[0]);
    uf.union(sharedAnchors[0], sharedAnchors[i]);
    if (r0 !== uf.find(sharedAnchors[i])) sharedOutputCollapse = true;
  }

  // Assemble components: root → { taskIds:Set, files:Set }.
  const comps = Object.create(null);
  function compFor(root) {
    if (!comps[root]) comps[root] = { taskIds: Object.create(null), files: Object.create(null) };
    return comps[root];
  }
  taskIds.forEach(function (id) { compFor(uf.find(id)).taskIds[id] = true; });
  fileOrder.forEach(function (p) {
    const ids = Object.keys(fileTouchers[p]);
    const anchor = ids.length > 0 ? ids[0] : fileNode(p);
    compFor(uf.find(anchor)).files[p] = true;
  });

  let partitions = Object.keys(comps).map(function (root) {
    return {
      files: Object.keys(comps[root].files).sort(),
      taskIds: Object.keys(comps[root].taskIds).sort(),
    };
  }).filter(function (part) {
    // Drop empty synthetic components (no files AND no tasks — shouldn't happen).
    return part.files.length > 0 || part.taskIds.length > 0;
  });

  // Deterministic order: by first task id, then first file.
  partitions.sort(function (a, b) {
    const ak = (a.taskIds[0] || '') + '|' + (a.files[0] || '');
    const bk = (b.taskIds[0] || '') + '|' + (b.files[0] || '');
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  });

  let capMerge = false;
  // (4) maxWorkers cap — merge smallest partitions together until count ≤ cap.
  // Combining two already-disjoint partitions keeps every partition's file-set
  // disjoint from the others; it only means one worker does more work.
  if (partitions.length > maxWorkers) {
    capMerge = true;
    // Merge by fewest files first so large independent partitions stay intact.
    partitions.sort(function (a, b) { return a.files.length - b.files.length; });
    while (partitions.length > maxWorkers) {
      const a = partitions.shift();
      const b = partitions.shift();
      partitions.unshift({
        files: a.files.concat(b.files).sort(),
        taskIds: a.taskIds.concat(b.taskIds).sort(),
      });
      partitions.sort(function (x, y) { return x.files.length - y.files.length; });
    }
    partitions.sort(function (a, b) {
      const ak = (a.taskIds[0] || '') + '|' + (a.files[0] || '');
      const bk = (b.taskIds[0] || '') + '|' + (b.files[0] || '');
      return ak < bk ? -1 : ak > bk ? 1 : 0;
    });
  }

  const n = partitions.length === 0 ? 1 : partitions.length;
  // collapsed: fewer partitions than the fully-split-by-task ideal, or a
  // conservative forced merge happened.
  const collapsed = numTasks === 0
    ? true
    : (n < numTasks || sharedOutputCollapse || capMerge || fileOverlap || dependencyMerge);

  let reason;
  if (!collapsed) reason = 'disjoint';
  else if (sharedOutputCollapse) reason = 'shared-output-serialized';
  else if (dependencyMerge) reason = 'dependency-collapse';
  else if (fileOverlap) reason = 'file-overlap';
  else if (capMerge) reason = 'max-workers-cap';
  else reason = 'single-partition';

  return result({
    partitions: partitions.length === 0
      ? [{ files: fileOrder.slice().sort(), taskIds: taskIds.slice().sort() }]
      : partitions,
    n: n,
    reason: reason,
    collapsed: collapsed,
  });
}

// partitionFromPlanText(planText, maxWorkers) → partitionPlan(...) result.
//
// Best-effort derivation of { planFiles, tasks } from a plan markdown, so
// work.md Step 3.prep-parallel can feed the pure oracle without a separate
// parser file. PURE (text in, object out — the fs read stays in the caller).
//
// Parse contract (conservative — any ambiguity collapses toward n=1):
//   - `## Files to Change` table → file paths (first column, backticks stripped).
//   - `### Task N …` headers → task ids `taskN`; the section text is scanned for
//     the Files-to-Change paths it mentions (file→task mapping via mention).
//   - a `**Mirror**` line's `Task M` references → mirror (dependency) edges.
//   - a file mentioned by no task becomes its own singleton file (its own
//     partition unless a shared-output collapse pulls it in).
function partitionFromPlanText(planText, maxWorkers) {
  const text = typeof planText === 'string' ? planText : '';
  const lines = text.split(/\r?\n/);

  // (1) Files to Change section — collect first-column table paths.
  const files = [];
  let inFiles = false;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (/^##\s+Files to Change\s*$/i.test(ln)) { inFiles = true; continue; }
    if (inFiles && /^##\s+/.test(ln)) break;              // next H2 ends the section
    if (!inFiles) continue;
    if (!/^\s*\|/.test(ln)) continue;                     // table rows only
    if (/^\s*\|\s*-{2,}/.test(ln) || /\|\s*-{2,}\s*\|/.test(ln)) continue; // separator
    const cells = ln.split('|').map(function (c) { return c.trim(); }).filter(function (c, idx, arr) {
      return !(idx === 0 && c === '') && !(idx === arr.length - 1 && c === '');
    });
    if (cells.length === 0) continue;
    let first = cells[0].replace(/`/g, '').trim();
    if (first === '' || /^file$/i.test(first)) continue;  // header cell
    if (first.indexOf('/') === -1 && first.indexOf('.') === -1) continue; // not a path
    if (files.indexOf(first) === -1) files.push(first);
  }

  if (files.length === 0) {
    return result({ n: 1, reason: 'no-files-parsed', collapsed: true });
  }

  // (2) Task headers + section bodies.
  const taskHeaderRe = /^###\s+Task\s+(\d+)\b/i;
  const taskMarks = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(taskHeaderRe);
    if (m) taskMarks.push({ id: 'task' + m[1], num: m[1], start: i });
  }
  const tasks = [];
  const planFilesMap = Object.create(null); // path → {taskId:true}
  files.forEach(function (f) { planFilesMap[f] = Object.create(null); });

  if (taskMarks.length === 0) {
    // No task structure — every file is its own singleton, no deps.
    const planFiles = files.map(function (f) { return { path: f, taskIds: [] }; });
    return partitionPlan({ planFiles: planFiles, tasks: [], maxWorkers: maxWorkers });
  }

  taskMarks.forEach(function (tm, idx) {
    const end = idx + 1 < taskMarks.length ? taskMarks[idx + 1].start : lines.length;
    const body = lines.slice(tm.start, end).join('\n');
    const mirrors = [];
    // mirror edges: a Mirror line referencing another Task N.
    body.split(/\r?\n/).forEach(function (bl) {
      if (!/mirror/i.test(bl)) return;
      const refs = bl.match(/Task\s+(\d+)/gi) || [];
      refs.forEach(function (r) {
        const n = r.match(/(\d+)/);
        if (n && ('task' + n[1]) !== tm.id && mirrors.indexOf('task' + n[1]) === -1) {
          mirrors.push('task' + n[1]);
        }
      });
    });
    tasks.push({ id: tm.id, mirrors: mirrors });
    // file→task mapping via mention within this task's body.
    files.forEach(function (f) {
      if (body.indexOf(f) !== -1) planFilesMap[f][tm.id] = true;
    });
  });

  const planFiles = files.map(function (f) {
    return { path: f, taskIds: Object.keys(planFilesMap[f]) };
  });

  return partitionPlan({ planFiles: planFiles, tasks: tasks, maxWorkers: maxWorkers });
}

module.exports = {
  partitionPlan: partitionPlan,
  partitionFromPlanText: partitionFromPlanText,
  isSharedOutput: isSharedOutput,
  SHARED_OUTPUT_PATTERNS: SHARED_OUTPUT_PATTERNS,
  DEFAULT_MAX_WORKERS: DEFAULT_MAX_WORKERS,
};
