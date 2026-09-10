'use strict';

// 측정 레코드 산출 (Task 1, 순수층). 입력은 프로브 로그 + 스냅샷 2건 + 라이브 러너가
// 넘긴 관측 기록이고, 출력은 7축 verdict다. I/O가 없으므로 합성 입력으로 결정적으로 단언한다.
//
// **DD7 — verdict enum은 둘뿐이다.** `measured` / `unmeasured`. "아마 된다"에 해당하는 값이
// **없다**. 반올림 금지를 문서 안의 다짐이 아니라 자료형으로 강제한다. hook을 바인딩할 수
// 없다는 결론은 실패가 아니라 M2의 범위를 정하는 값이다.
//
// **승격 조건은 셋이고 하나라도 없으면 접는다.**
//   1. `value`가 있다.
//   2. `evidence`(로그 줄 인덱스)가 비어 있지 않다.
//   3. 증거 줄의 `run.codex_version`이 존재하고 두 스냅샷과 **일치**한다(UI13).
// 3은 리뷰 R1 invariant-MEDIUM의 흡수다 — 버전이 스냅샷에만 있으면 한 버전의 로그를 다른
// 시점의 스냅샷과 짝지어도 `measured`가 나온다.

const SCHEMA = 'mccp.codex-probe.report/1';

const AXES = [
  'A1_hook_fires',
  'A2_event_enum',
  'A3_auto_discovery',
  'A4_trust_procedure',
  'A5_env_projection',
  'A6_payload_shape',
  // ── M2 B축 ────────────────────────────────────────────────────────────────
  // A축과 승격 규칙이 다르다. A축의 증거는 프로브 **로그 줄 인덱스**인데 B축의 증거는
  // 스윕 레코드의 **run 인덱스**다. 그래서 `promote`(로그 줄 + 스냅샷 버전 결속)를
  // 재사용하지 않고 자기 관문을 갖는다 — 재사용하면 로그가 빈 실행에서 B축이 통째로
  // 접히는데, B축은 로그와 무관하게 성립하는 관측이다.
  'B1_block_protocol',
  'B2_block_negative_control',
  'B3_plugin_root_substitution',
  'B4_harness_discriminator',
  'revert_integrity',
];

function unmeasured(reason) {
  return { verdict: 'unmeasured', value: null, evidence: [], reason: String(reason) };
}

function measured(value, evidence) {
  return { verdict: 'measured', value: value, evidence: evidence.slice(), reason: null };
}

function versionOf(line) {
  return line && line.run && line.run.codex_version ? String(line.run.codex_version) : null;
}

// 증거 줄의 버전이 전부 존재하고 서로 같고 두 스냅샷과도 같은가.
function versionBinding(log, evidence, before, after) {
  const snapB = before && before.codex_version ? String(before.codex_version) : null;
  const snapA = after && after.codex_version ? String(after.codex_version) : null;
  if (!snapB || !snapA) return { ok: false, reason: 'snapshot codex_version absent (UI13)' };
  if (snapB !== snapA) return { ok: false, reason: 'snapshot codex_version mismatch: ' + snapB + ' vs ' + snapA };
  for (let i = 0; i < evidence.length; i++) {
    const v = versionOf(log[evidence[i]]);
    if (!v) return { ok: false, reason: 'evidence line ' + evidence[i] + ' carries no codex_version (UI13)' };
    if (v !== snapB) return { ok: false, reason: 'evidence line ' + evidence[i] + ' version ' + v + ' != snapshot ' + snapB };
  }
  return { ok: true, reason: null, version: snapB };
}

// 승격 관문. 세 조건을 한 곳에서 본다 — 축마다 흩어 두면 하나가 조용히 빠진다.
function promote(value, evidence, ctx) {
  if (value === null || value === undefined) return unmeasured('no value');
  if (!evidence || evidence.length === 0) return unmeasured('no evidence line');
  const vb = versionBinding(ctx.log, evidence, ctx.before, ctx.after);
  if (!vb.ok) return unmeasured(vb.reason);
  return measured(value, evidence);
}

function indicesWhere(log, pred) {
  const out = [];
  log.forEach(function (l, i) { if (pred(l, i)) out.push(i); });
  return out;
}

function eventNameOf(line) {
  const e = line && line.event;
  if (!e || typeof e !== 'object') return null;
  // 이름을 나르는 키가 무엇인지가 A6의 관측 대상이므로 후보를 열거하고 **찾은 것을 적는다**.
  const candidates = ['hook_event_name', 'hookEventName', 'event', 'event_name', 'type', 'name'];
  for (let i = 0; i < candidates.length; i++) {
    const v = e[candidates[i]];
    if (typeof v === 'string' && v) return v;
  }
  return null;
}

function deriveReport(input) {
  const inp = input || {};
  const log = Array.isArray(inp.log) ? inp.log : [];
  const before = inp.before || null;
  const after = inp.after || null;
  const obs = inp.observations || {};
  const ctx = { log: log, before: before, after: after };
  const axes = {};

  // ── A1 발화 ────────────────────────────────────────────────────────────────
  // **`trust_mode==='trusted'` 줄만 승격시킨다** (리뷰 R1 security/invariant HIGH).
  // bypass 플래그로 얻은 발화는 "신뢰 절차를 지나 발화한다"가 아니라 "신뢰 절차를 껐다"이며
  // 다른 사실이다. 그 구분이 레코드에 없으면 게이트는 그대로 있는데 막는 것이 없다.
  const trusted = indicesWhere(log, function (l) { return l && l.run && l.run.trust_mode === 'trusted'; });
  const bypassed = indicesWhere(log, function (l) { return l && l.run && l.run.trust_mode === 'bypassed'; });
  if (trusted.length > 0) {
    axes.A1_hook_fires = promote(true, trusted, ctx);
  } else if (log.length > 0) {
    axes.A1_hook_fires = unmeasured(
      'log has ' + log.length + ' line(s) but none with run.trust_mode="trusted"'
      + (bypassed.length ? ' (' + bypassed.length + ' bypassed — does not promote A1)' : ''));
  } else {
    axes.A1_hook_fires = unmeasured('probe log empty — hook fire not observed');
  }

  // ── A2 이벤트 enum ─────────────────────────────────────────────────────────
  // "설정이 받는 것"과 "엔진이 부르는 것"은 별개 사실이므로 **발화한 것만** 센다.
  const named = indicesWhere(log, function (l) { return eventNameOf(l) !== null; });
  const observedEvents = Array.from(new Set(named.map(function (i) { return eventNameOf(log[i]); }))).sort();
  axes.A2_event_enum = observedEvents.length
    ? promote({ fired: observedEvents }, named, ctx)
    : unmeasured('no log line carries a recognizable event name');

  // ── A3 자동 발견 · A4 trust 절차 ───────────────────────────────────────────
  // 로그만으로 답할 수 없다 — 주어가 "설치 절차"이지 "이벤트"가 아니다(DD5).
  // 라이브 러너가 명시 관측을 넘겼을 때만 승격한다. 없으면 추정하지 않는다.
  ['A3_auto_discovery', 'A4_trust_procedure'].forEach(function (k) {
    const o = obs[k];
    axes[k] = o
      ? promote(o.value, o.evidence || [], ctx)
      : unmeasured('no live observation supplied for this axis');
  });

  // ── A5 env 투영 ────────────────────────────────────────────────────────────
  // 이름이 무엇이든 **관측된 그대로** 적는다 — `CODEX_SESSION_ID`일 것이라 가정하지 않는다.
  const withEnv = indicesWhere(log, function (l) { return l && l.env && typeof l.env === 'object'; });
  if (withEnv.length) {
    const valued = new Set();
    const namesOnly = new Set();
    withEnv.forEach(function (i) {
      Object.keys(log[i].env.values || {}).forEach(function (n) { valued.add(n); });
      (log[i].env.names_only || []).forEach(function (n) { namesOnly.add(n); });
    });
    axes.A5_env_projection = promote({
      value_carrying_names: Array.from(valued).sort(),
      observed_names_only: Array.from(namesOnly).sort(),
      claude_plugin_root_present: valued.has('CLAUDE_PLUGIN_ROOT'),
      // 이 필드가 무엇인지 산출물 안에서 말한다 (코드 리뷰 LOW). `observed_names_only`는
      // 측정 머신의 **전체 env 이름 목록**이다 — 값은 없지만 이름은 전부다. DD10 관문은
      // 절대경로만 보므로 이름은 무필터로 통과한다. A5/OQ5가 "세션 id를 나르는 이름이
      // 무엇인가"를 묻기 때문에 이름 발견은 축의 요구지, 관문의 누락이 아니다.
      names_only_disclosure: 'full env NAME inventory of the measuring host; values excluded (A5/OQ5). '
        + 'the DD10 gate scans for absolute paths only — names are not filtered',
    }, withEnv, ctx);
  } else {
    axes.A5_env_projection = unmeasured('no log line carries an env projection');
  }

  // ── A6 payload shape ───────────────────────────────────────────────────────
  const withEvent = indicesWhere(log, function (l) { return l && l.event && typeof l.event === 'object' && !l.event._unparsed; });
  if (withEvent.length) {
    const keys = new Set();
    withEvent.forEach(function (i) { Object.keys(log[i].event).forEach(function (k) { keys.add(k); }); });
    axes.A6_payload_shape = promote({
      top_level_keys: Array.from(keys).sort(),
      // `receipt-skill.js:152`가 요구하는 키. 이름이 같아도 없으면 M2는 재배선이 아니라 재작성이다.
      has_tool_name: keys.has('tool_name'),
    }, withEvent, ctx);
  } else {
    axes.A6_payload_shape = unmeasured('no log line carries a parsed event object');
  }

  // ── 원복 무결성 ────────────────────────────────────────────────────────────
  // **positive control** (리뷰 R1 test-MEDIUM): 프로브가 한 번도 돌지 않았으면 "격리가
  // 성립했다"가 아니라 "아무 일도 없었다"이고 둘은 다르다. 로그가 비면 이 축은 접힌다.
  const snapshotDiff = inp.diff || null;
  if (log.length === 0) {
    axes.revert_integrity = unmeasured('probe log empty — cannot distinguish "isolation held" from "nothing ran"');
  } else if (!snapshotDiff || snapshotDiff.comparable !== true) {
    axes.revert_integrity = unmeasured('real-home snapshot pair not comparable: ' + ((snapshotDiff && snapshotDiff.reason) || 'absent'));
  } else {
    // 증거는 **로그 전량**이다. 이 축이 묻는 것은 "프로브가 돌았고 실제 홈이 그대로인가"
    // 이므로 trust mode를 가리지 않는다 — bypass 실행도 홈을 오염시킬 수 있으니 그 줄도
    // 증거다. 이 자리에 있던 `trusted.length ? trusted : [0]`은 trusted 줄이 없을 때
    // **0번 줄 하나**만 집어 나머지 줄을 증거에서 지웠다(코드 리뷰 LOW). 축의 의미상
    // 근거가 없는 자의적 축소였고, A1의 엄격함과도 비대칭이었다.
    const allLines = log.map(function (_, i) { return i; });
    axes.revert_integrity = promote({
      clean: snapshotDiff.clean,
      added: snapshotDiff.added,
      removed: snapshotDiff.removed,
      // DD3: whole-file sha256은 판정이 아니라 참고값이다.
      config_sha256_informational: { before: before && before.config_sha256, after: after && after.config_sha256 },
    }, allLines, ctx);
  }

  // ── B축 ────────────────────────────────────────────────────────────────────
  deriveBlockAxes(axes, inp.block || null, inp.truth || null);

  const measuredCount = AXES.filter(function (a) { return axes[a].verdict === 'measured'; }).length;

  // **milestone_closeable** (리뷰 R1 invariant-HIGH 흡수). plan Task 6은 측정 결과와 무관하게
  // milestone 1 행을 `complete`로 뒤집게 돼 있었다. 관측을 하나도 못 얻은 실행이 PRD 표에서
  // 완료로 읽히면 M2~M5는 UI12가 금지한 "값 없이 확정된 범위" 위에 선다. 하한은 A1이다 —
  // 그것이 이 milestone의 이름(harness-truth)이 주장하는 유일한 사실이기 때문이다.
  const closeable = axes.A1_hook_fires.verdict === 'measured';
  return {
    schema: SCHEMA,
    axes: axes,
    axis_order: AXES.slice(),
    measured_count: measuredCount,
    total_axes: AXES.length,
    milestone_closeable: {
      ok: closeable,
      reason: closeable
        ? 'A1_hook_fires measured'
        : 'A1_hook_fires is unmeasured — M1 does not get to claim it saw the hook fire (' + axes.A1_hook_fires.reason + ')',
    },
  };
}

// B축 승격. **버전 없는 값은 인용하지 않는다**(UI13) — 스윕 레코드가 `codex_version`을
// 갖지 않으면 그 축은 접힌다. 그리고 `blocked` 관측이 있어도 **음성 대조가 성립하지
// 않으면 B1은 승격하지 않는다**: 통제 없는 양성은 배선의 실재를 고정하지 못한다(M1 A4).
function deriveBlockAxes(axes, block, truth) {
  const unmeasuredAll = function (reason) {
    ['B1_block_protocol', 'B2_block_negative_control'].forEach(function (k) {
      axes[k] = unmeasured(reason);
    });
  };

  if (!block || !Array.isArray(block.runs) || block.runs.length === 0) {
    unmeasuredAll('no block-probe sweep supplied');
  } else if (!block.codex_version) {
    unmeasuredAll('block sweep carries no codex_version (UI13)');
  } else {
    const runs = block.runs.filter(function (r) { return r && !r.skipped; });
    const controls = runs.filter(function (r) { return r.protocol === 'allow-control'; });
    const okControls = controls.filter(function (r) { return r.verdict === 'not-blocked'; });
    const blockedRuns = runs.filter(function (r) { return r.verdict === 'blocked'; });

    if (okControls.length === 0) {
      axes.B2_block_negative_control = unmeasured(
        'no allow-control run reached the protected operation — the control itself failed');
      axes.B1_block_protocol = unmeasured(
        'without a passing negative control a blocked observation cannot be attributed to the protocol');
    } else {
      axes.B2_block_negative_control = measured({
        events: okControls.map(function (r) { return r.event; }),
        protected_ops: okControls.map(function (r) { return r.protected_op; }),
      }, okControls.map(function (r) { return runs.indexOf(r); }));

      // 통제가 성립한 **그 이벤트**의 차단만 센다.
      const controlledEvents = new Set(okControls.map(function (r) { return r.event; }));
      const attributable = blockedRuns.filter(function (r) { return controlledEvents.has(r.event); });
      if (attributable.length === 0) {
        axes.B1_block_protocol = measured({
          blocking_protocols: [],
          note: 'no candidate format blocked — the receipt gate cannot be enforced on this harness/version',
          codex_version: block.codex_version,
        }, runs.map(function (_, i) { return i; }));
      } else {
        axes.B1_block_protocol = measured({
          blocking_protocols: attributable.map(function (r) { return r.protocol; }),
          events: Array.from(new Set(attributable.map(function (r) { return r.event; }))),
          not_honoured: runs.filter(function (r) { return r.verdict === 'not-blocked' && r.protocol !== 'allow-control'; })
            .map(function (r) { return r.protocol; }),
          codex_version: block.codex_version,
        }, attributable.map(function (r) { return runs.indexOf(r); }));
      }
    }
  }

  // B3 — `${CLAUDE_PLUGIN_ROOT}` 문자열 치환 여부. 아직 재지 않았다.
  axes.B3_plugin_root_substitution = unmeasured(
    'not probed: the sweep registers absolute hook paths, so the substitution axis never fired');

  // B4 — 판별자. **음성 결과가 곧 측정값이다.** M1이 Codex의 env 투영을 쟀고 주입이
  // 하나도 없음을 확인했다. 그것이 DD3를 반증하고 "명시 designation 외에 양성 codex
  // 신호가 없다"를 고정한다.
  const envRun = truth && Array.isArray(truth.runs)
    ? truth.runs.find(function (r) { return r.id === 'env-projection-clean'; }) : null;
  if (envRun && Array.isArray(envRun.result.injected_by_codex)) {
    axes.B4_harness_discriminator = measured({
      codex_injects: envRun.result.injected_by_codex,
      claude_plugin_root_injected_by_codex: envRun.result.CLAUDE_PLUGIN_ROOT_injected,
      consequence: 'no environment variable positively identifies a Codex host; the oracle requires an explicit MCCP_HARNESS designation',
      codex_version: truth.codex_version || null,
    }, [0]);
  } else {
    axes.B4_harness_discriminator = unmeasured('no env-projection run in the truth record');
  }
}

module.exports = { SCHEMA, AXES, deriveReport, eventNameOf, versionBinding, deriveBlockAxes };
