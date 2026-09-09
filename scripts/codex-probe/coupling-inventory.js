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
    disposition: 'additive',
    owner_milestone: 2,
    note: 'Claude 홈의 설치 상태를 읽어 게이트 분기를 정한다. Codex 홈은 레지스트리 형태가 다르다',
  },
  {
    name: 'settings-surface',
    rule: 'claude-home-path',
    covers: ['plugins/mccp/scripts/lib/settings-signal.js', 'plugins/mccp/scripts/lib/settings-writer.js'],
    axis: 'settings io',
    disposition: 'additive',
    owner_milestone: 2,
    note: 'settings.json 위치·스키마가 Claude 전용이다. Codex는 config.toml이라 형식까지 다르다',
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
    ],
    axis: 'hook runtime',
    disposition: 'additive',
    owner_milestone: 2,
    note: 'hook 실행 중 Claude 홈을 읽는다. A5가 Codex의 대응 경로를 측정하기 전에는 분기 형태를 정할 수 없다',
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

  // ── claude-env-name ────────────────────────────────────────────────────────
  {
    name: 'plugin-root-env',
    rule: 'claude-env-name',
    covers: ['CLAUDE_PLUGIN_ROOT'],
    axis: 'plugin root injection',
    disposition: 'additive',
    owner_milestone: 2,
    note: 'A5(OQ4)가 Codex도 이 이름을 주입하는지를 묻는 바로 그 축이다. 측정 전에는 처분을 정하지 않는다',
  },
  {
    name: 'session-identity-env',
    rule: 'claude-env-name',
    covers: ['CLAUDE_CODE_SESSION_ID', 'CLAUDE_SESSION_ID', 'CLAUDE_CODE_SESSION_START_'],
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
    note: 'A6의 payload shape 측정 결과에 직접 걸린다. 이름이 같아도 필드가 다르면 재배선이 아니라 재작성이다',
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
    note: '설치 UX와 명령 도달 축. UI8이 타 사용자 설치 UX를 이번 사이클의 판정 대상에서 제외했다',
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
    owner_milestone: 3,
    note: 'Claude 하네스 도구명(Read/Grep/Glob/Bash…)을 선언한다. Codex의 도구 어휘 대응은 비공개 변환 규칙에 걸려 있고 그것이 OQ1이다',
  },
];

// 항목을 늘리려면 이 상수를 함께 올려야 한다. 그 편집이 diff에 숫자로 남는 것이 목적이다.
const COUPLING_INVENTORY_CEILING = 16;

// 로드 시점 강제. test에만 두면 지켜지지 않는다(§3.17 — 이 저장소의 test는 어떤 CI도 돌리지 않는다).
if (COUPLING_INVENTORY.length > COUPLING_INVENTORY_CEILING) {
  throw new Error('coupling-inventory: ' + COUPLING_INVENTORY.length
    + ' entries exceeds COUPLING_INVENTORY_CEILING=' + COUPLING_INVENTORY_CEILING
    + ' — raise the constant deliberately, in its own edit');
}

module.exports = { COUPLING_INVENTORY, COUPLING_INVENTORY_CEILING };
