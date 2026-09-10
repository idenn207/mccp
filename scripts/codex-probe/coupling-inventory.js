'use strict';

// 하네스 결합 지점 **선언 목록** (Task 4, DD8).
//
// **이 목록은 유일한 입력이 아니다.** `scan-coupling.js`의 `RULES`가 `plugins/mccp/` 트리를
// 목록과 무관하게 훑어 후보를 만들고, 이 목록은 그 후보를 **덮는** 역할만 한다. 그래서
// `unlisted:0`은 구조적 항진이 아니라 달성된 사실이고, 새 결합 표면이 생기면 즉시 붉어진다.
//
// **상한 상수는 신원이 아니라 가시화 장치다** (mirror: `env-contract/evidence-debt.js` §3.17 M6).
// 신원은 아래 이름들이 갖는다. `COUPLING_INVENTORY_CEILING`을 두는 이유는 항목을 늘리려면
// **상수를 올리는 별도 편집**이 필요하고 그 사실이 diff에 숫자로 남게 하기 위해서다.
// 숫자는 상한이지 정원이 아니다.
//
// **`owner_milestone`은 후보 귀속이고 구속이 아니다** (리뷰 R1 architect-MEDIUM 흡수).
// UI12가 "M1은 관측이며 이 값 전에 M2~M5의 범위를 확정하지 않는다"라고 못박았으므로,
// 여기 적힌 milestone은 열거의 부산물로 남긴 **제안**이다. 실제 배정은 각 milestone 진입 시
// PRD가 확정한다. 이 필드를 근거로 범위를 확정했다고 주장하지 않는다.
//
// `disposition` enum: `port`(하네스 중립으로 고쳐야 한다) · `additive`(Codex 분기를 더한다)
// · `defer`(이번 축에서 다루지 않는다) · `test-only`(런타임 영향 없음).

const COUPLING_INVENTORY = [
  // ── claude-home-path ───────────────────────────────────────────────────────
  {
    name: 'codex-reviewer-registry-path',
    rule: 'claude-home-path',
    covers: ['plugins/mccp/scripts/lib/codex-invoke.js'],
    axis: 'reviewer invocation',
    disposition: 'additive',
    owner_milestone: 4,
    note: '~/.claude/plugins/installed_plugins.json으로 codex plugin을 해소한다. M4의 리뷰어 반전은 방향이 반대라 재사용이 아니다',
  },
  {
    name: 'plugin-install-detection',
    rule: 'claude-home-path',
    covers: [
      'plugins/mccp/scripts/lib/dep-check.js',
      'plugins/mccp/scripts/lib/impeccable-detect.js',
      'plugins/mccp/scripts/lib/impeccable-cleanup.js',
      'plugins/mccp/scripts/lib/resolve-ecc-root.js',
    ],
    axis: 'dependency detection',
    disposition: 'defer',
    owner_milestone: 5,
    note: 'M2 측정 후 재배정: Codex ingress는 설치 탐지를 **부르지 않는다**(오라클은 env와 payload만 본다). 즉 이 결합은 M2의 발화 경로에 없다. Codex 홈의 레지스트리 대응은 chain 동등성 축(M5)에서 값이 필요해질 때 정한다',
  },
  {
    name: 'settings-surface',
    rule: 'claude-home-path',
    covers: ['plugins/mccp/scripts/lib/settings-signal.js', 'plugins/mccp/scripts/lib/settings-writer.js'],
    axis: 'settings io',
    disposition: 'defer',
    owner_milestone: 5,
    note: 'M2 측정 후 재배정: 게이트 발화에 settings 읽기가 필요하지 않았다. `MCCP_HARNESS`·`MCCP_HARNESS_INGRESS`는 env로 전달되고 env-contract registry에 등재됐다. config.toml 대응은 M5 소유',
  },
  {
    name: 'cost-state-path',
    rule: 'claude-home-path',
    covers: ['plugins/mccp/scripts/lib/cost-state-path.js'],
    axis: 'cost accounting',
    disposition: 'defer',
    owner_milestone: 5,
    note: 'UI11 — 비용·모델 테이블의 Codex 확장은 열거만 하고 이연한다',
  },
  {
    name: 'history-leak-scan-home',
    rule: 'claude-home-path',
    covers: ['plugins/mccp/scripts/lib/history-leak-scan.js'],
    axis: 'privacy scan',
    disposition: 'port',
    owner_milestone: 5,
    note: 'Claude 홈의 history 파일을 훑는다. Codex 호스트에서는 대상이 없어 조용히 0건이 된다',
  },
  {
    name: 'hook-runtime-home',
    rule: 'claude-home-path',
    covers: [
      'plugins/mccp/scripts/hooks/ecc-statusline.js',
      'plugins/mccp/scripts/hooks/mcp-health-check.js',
      'plugins/mccp/scripts/hooks/post-bash-command-log.js',
      'plugins/mccp/scripts/hooks/session-start-bootstrap.js',
      // M2: 선재 결합이다. `resolveRoot()`가 `~/.claude/plugins/cache/…`를 훑는 것은
      // 처음부터 있었는데, 경로를 `path.join(claude,'plugins',…)`로 조립해 스캐너의
      // 리터럴 규칙에 걸리지 않았다. M2가 그 순서를 고치며 주석에 경로를 적었고 그제야
      // 보이게 됐다 — 새 결합이 아니라 **가려져 있던 결합**이므로 열거로 처분한다.
      'plugins/mccp/scripts/hooks/bootstrap.js',
    ],
    axis: 'hook runtime',
    disposition: 'additive',
    owner_milestone: 2,
    note: 'M2에서 분기가 착지했다: `harness-ingress.js#shouldRunClaudeHook`이 **적극적으로 codex로 지목된** 실행에서 이 hook들을 통과시킨다(bootstrap.js + exit-2 가드 4종). 홈을 읽는 코드는 그대로 두고 그 코드에 **도달하지 않게** 하는 형태다 — UI16이 요구한 0→1이지 0→29가 아니다',
  },
  {
    name: 'home-path-tests',
    rule: 'claude-home-path',
    covers: ['plugins/mccp/scripts/**/tests/*.test.js'],
    axis: 'test scaffolding',
    disposition: 'test-only',
    owner_milestone: null,
    note: '런타임 영향 없음. 런타임 항목이 port/additive될 때 함께 따라간다',
  },
  {
    name: 'renderer-version-comment-only',
    rule: 'claude-home-path',
    covers: ['plugins/mccp/scripts/lib/renderer/plugin-version.js'],
    axis: 'render provenance',
    disposition: 'defer',
    owner_milestone: null,
    note: '**결합이 아니다 — 주석 한 줄이 걸렸다.** 매칭은 :21의 산문뿐이고(캐시 레이아웃을 '
      + '설명하며 경로를 적었다), 실제 해소는 `MANIFEST_REL`의 모듈 상대 경로라 하네스 '
      + '중립이다. `bootstrap.js`(위)와 형태만 같고 성질이 반대다 — 그쪽은 가려져 있던 '
      + '진짜 결합이 주석 덕에 보이게 된 것이고, 이쪽은 결합이 없다. 스캐너가 주석을 코드와 '
      + '구별하지 않는 것이 원인이며 그 축은 별개다(규칙을 좁히면 bootstrap.js가 다시 '
      + '가려지므로 좁히지 않는다). 열거로 처분하고 포팅 대상으로 세지 않는다',
  },

  // ── claude-env-name ────────────────────────────────────────────────────────
  {
    name: 'plugin-root-env',
    rule: 'claude-env-name',
    covers: ['CLAUDE_PLUGIN_ROOT'],
    axis: 'plugin root injection',
    disposition: 'port',
    owner_milestone: 2,
    note: 'M2에서 해소됐다. 측정: Codex는 이 이름을 주입하지 않는다(runs[id=env-projection-clean].result.CLAUDE_PLUGIN_ROOT_injected=false, injected_by_codex=[]). 그래서 `bootstrap.js#resolveRoot()`가 `env(+marker 검증) → __dirname 상대 → home 스캔` 순으로 바뀌어 **이 env 이름 없이도 플러그인 루트가 해소된다**. env 분기는 이제 marker를 검증하므로 무검증 리다이렉트도 닫혔다(security H1)',
  },
  {
    name: 'session-identity-env',
    rule: 'claude-env-name',
    covers: ['CLAUDE_CODE_SESSION_ID', 'CLAUDE_SESSION_ID', 'CLAUDE_CODE_SESSION_START'],
    axis: 'session identity',
    disposition: 'additive',
    owner_milestone: 5,
    note: '§3.18의 단일 체인이 소유한다. Codex가 세션 id를 나르는 이름은 A5(OQ5)의 측정 대상이며 가정하지 않는다',
  },
  {
    name: 'process-identity-env',
    rule: 'claude-env-name',
    covers: ['CLAUDE_PID'],
    axis: 'lock ownership',
    disposition: 'additive',
    owner_milestone: 5,
    note: 'evidence-lock의 PID liveness 판정에 쓰인다. 부재 시 lease만 남는다',
  },
  {
    name: 'hook-dispatch-env',
    rule: 'claude-env-name',
    covers: ['CLAUDE_HOOK_EVENT_NAME', 'CLAUDE_TRANSCRIPT_PATH', 'CLAUDE_PROJECT_DIR'],
    axis: 'hook dispatch context',
    disposition: 'additive',
    owner_milestone: 2,
    note: 'M2 측정 후: Codex는 이 세 이름을 env로 주입하지 않고 **payload 필드**로 같은 정보를 준다(A6 — payload shape는 Claude 프로토콜과 isomorphic). M2의 ingress는 payload에서 읽어 게이트 필드로 정규화하며, 유일한 실질 공백이던 `tool_use_id` 부재는 `turn_id`를 그 자리에 매핑해 닫았다(그 매핑이 없으면 G1 fail-open이 hook-trace에 기록되지 않는다). 나머지 소비처의 이전은 M5 소유',
  },
  {
    name: 'install-surface-env',
    rule: 'claude-env-name',
    covers: [
      'CLAUDE_CONFIG_DIR', 'CLAUDE_RULES_DIR', 'CLAUDE_ECC_NAMESPACE',
      'CLAUDE_PACKAGE_MANAGER', 'CLAUDE_BINARY_MISSING', 'CLAUDE_CODE_ENTRYPOINT',
      'CLAUDE_CODE_DISABLE_WORKFLOWS',
    ],
    axis: 'install / harness feature flags',
    disposition: 'defer',
    owner_milestone: 3,
    // M3 처분 확정: **defer 유지.** M3가 이 축을 열지 않는 이유는 미루기 편해서가 아니라
    // 이 항목의 두 반쪽이 서로 다른 곳에 속하기 때문이다. `CLAUDE_CONFIG_DIR`·
    // `CLAUDE_RULES_DIR` 같은 설치 경로 이름은 타 사용자 설치 UX 축이고 UI8이 이번
    // 사이클의 판정 대상에서 명시 제외했다. 반면 명령 **도달**은 M3가 실제로 닫았는데,
    // 그 해소는 이 env 이름들을 이전해서가 아니라 `command-reach.js`가 설치원을 열거해
    // 얻었다 — 즉 이 항목을 건드리지 않고 도달이 성립했다. 남은 것은 순수 설치 UX이고
    // 그것이 UI8의 자리다.
    note: '설치 UX 축. M3는 명령 도달을 command-reach.js의 설치원 열거로 해소했고 이 env 이름들을 이전하지 않았다 — 남은 절반은 UI8이 제외한 타 사용자 설치 UX다',
  },

  // ── claude-model-vocabulary ────────────────────────────────────────────────
  {
    name: 'agent-model-declaration',
    rule: 'claude-model-vocabulary',
    covers: ['plugins/mccp/agents/*.md'],
    axis: 'reviewer model vocabulary',
    disposition: 'additive',
    owner_milestone: 4,
    note: 'frontmatter의 model 티어가 Claude 어휘다. UI3(Codex 호스트에서도 리뷰어는 Claude 계열)이 이 축의 처분을 이미 좁혔다',
  },
  {
    name: 'model-vocabulary-tests',
    rule: 'claude-model-vocabulary',
    covers: ['plugins/mccp/scripts/**/tests/*.test.js'],
    axis: 'test scaffolding',
    disposition: 'test-only',
    owner_milestone: null,
    note: '런타임 영향 없음',
  },

  {
    name: 'skill-bundled-agent-model',
    rule: 'claude-model-vocabulary',
    covers: ['plugins/mccp/skills/**/agents/*.md'],
    axis: 'reviewer model vocabulary',
    disposition: 'additive',
    owner_milestone: 4,
    // 이 항목은 **스캐너가 찾아냈다.** PRD Evidence가 지목한 여섯에도, plan Task 4의 최소
    // 원소에도 없었다 — skill 번들 안에 자기 agent를 든 것이 `plugins/mccp/agents/`만 보던
    // 눈에 안 걸렸기 때문이다. 선언 목록이 유일한 입력이었다면 영원히 안 보였을 행이고,
    // 그 사실이 독립 진실원(scan-coupling.js RULES)이 존재하는 이유다.
    note: 'continuous-learning-v2 skill이 번들한 agent가 Claude 모델 티어를 선언한다',
  },

  // ── agent-tool-vocabulary ──────────────────────────────────────────────────
  {
    name: 'agent-tool-declaration',
    rule: 'agent-tool-vocabulary',
    covers: ['plugins/mccp/agents/*.md'],
    axis: 'tool vocabulary',
    disposition: 'defer',
    // M3 처분 확정: **M4로 재배정.** M3가 이것을 닫지 않는 이유는 DD8이 그은 경계와 같다 —
    // M3는 명령 본문의 **도달**을 주장하고 **실행**을 주장하지 않는다. 도달한 본문이
    // `Task`·`Workflow` 같은 Claude 도구 어휘를 지시하는 것은 사실이고, 그 처분은 리뷰어
    // 반전이 어차피 같은 agent 표면을 다시 여는 M4에서 하는 것이 싸다.
    // `owner_milestone`만 옮기므로 항목 수는 불변이고 ceiling 상수는 건드리지 않는다.
    owner_milestone: 4,
    note: 'Claude 하네스 도구명(Read/Grep/Glob/Bash…)을 선언한다. M3는 도달만 주장하므로(DD8) 이 축을 열지 않고, 리뷰어 반전이 같은 agent 표면을 여는 M4로 재배정한다',
  },
];

// 항목을 늘리려면 이 상수를 함께 올려야 한다. 그 편집이 diff에 숫자로 남는 것이 목적이다.
//
// 16 → 17: main 머지가 `renderer/plugin-version.js`를 들여왔고 그 파일의 주석 한 줄이
// `claude-home-path`에 걸렸다. 새 결합이 아니라 **결합이 아닌 것**이 후보로 올라온
// 경우이며(항목의 note가 그 구분을 적는다), 스캐너는 목록을 읽지 않고 후보를 내므로
// 열거하는 것 말고 다른 처분이 없다.
const COUPLING_INVENTORY_CEILING = 17;

// 로드 시점 강제. test에만 두면 지켜지지 않는다(§3.17 — 이 저장소의 test는 어떤 CI도 돌리지 않는다).
if (COUPLING_INVENTORY.length > COUPLING_INVENTORY_CEILING) {
  throw new Error('coupling-inventory: ' + COUPLING_INVENTORY.length
    + ' entries exceeds COUPLING_INVENTORY_CEILING=' + COUPLING_INVENTORY_CEILING
    + ' — raise the constant deliberately, in its own edit');
}

module.exports = { COUPLING_INVENTORY, COUPLING_INVENTORY_CEILING };
