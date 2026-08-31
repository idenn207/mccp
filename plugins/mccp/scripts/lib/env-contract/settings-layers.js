'use strict';

// env-contract/settings-layers.js — 3계층 settings의 `env` 블록을 read-only로 읽는다 (M1).
//
// `doctor`가 답하려는 질문은 «내가 선언한 값이 프로세스에 도달했는가»이고, 그 «선언»은
// 한 파일이 아니라 세 계층의 합이다. 이 모듈이 그 합을 만들되 **왜 그렇게 합쳐지는지는
// 단정하지 않는다**(DD7) — 우선순위는 관측된 동작이고, 병합 규칙이 바뀌면 여기서 나오는
// *설명*이 낡을 뿐 `doctor`의 *탐지*(선언값 ≠ 프로세스값)는 그대로 유효하다.
//
// **읽기 전용이다.** `settings-writer`의 쓰기 API는 부르지 않으며 이 모듈에는 쓰기
// 경로가 없다. 사용자 홈 계층을 읽는 것은 의도된 범위다 — 실사용 사례가 «사용자
// 계층에 적은 값이 도달하지 않았다»이므로, 그 계층을 보지 않는 진단은 자기 질문에
// 답할 수 없다. 대신 노출면은 좁힌다: 이 모듈은 값을 **판단하지 않고 넘기기만** 하고,
// 레지스트리 밖 이름의 값을 어떻게 다룰지는 `doctor`가 정한다.
//
// **한 계층의 오타가 진단 전체를 잠재우지 않는다.** parse 실패는 그 계층만
// `unreadable`로 표시하고 나머지는 계속 읽는다 — 진단이 가장 필요한 순간은 설정이
// 망가졌을 때인데, 그때 침묵하면 도구가 없는 것과 같다.
//
// mirror: settings-writer.js:21 `readSettings({path})` — 부재는 `{}`, parse 실패는
//         `EBADSETTINGS` throw.

const os = require('os');
const path = require('path');

const settingsWriter = require('../settings-writer');

// 낮은 우선순위 → 높은 우선순위. 뒤가 앞을 덮는다.
const LAYER_ORDER = Object.freeze(['user', 'project', 'local']);

function layerPaths(opts) {
  const o = opts || {};
  const home = o.homeDir || os.homedir();
  const repo = o.repoRoot || process.cwd();
  return [
    { layer: 'user', path: path.join(home, '.claude', 'settings.json') },
    { layer: 'project', path: path.join(repo, '.claude', 'settings.json') },
    { layer: 'local', path: path.join(repo, '.claude', 'settings.local.json') },
  ];
}

/**
 * 세 계층을 읽어 «선언된 유효값»과 그 출처를 만든다.
 *
 * @param {{repoRoot?:string, homeDir?:string, readSettings?:Function}} options
 * @returns {{
 *   layers: Array<{layer:string, path:string, state:string, count:number, error?:string}>,
 *   declared: Object<string, {value:string, layer:string, shadowed:Array<{layer:string,value:string}>}>
 * }}
 */
function readLayers(options) {
  const o = options || {};
  const read = o.readSettings || settingsWriter.readSettings;
  const layers = [];
  const declared = Object.create(null);

  layerPaths(o).forEach(function (spec) {
    let settings = null;
    let state = 'present';
    let error;
    try {
      settings = read({ path: spec.path });
    } catch (e) {
      // parse 실패. 이 계층만 잃고 나머지는 계속 읽는다.
      state = 'unreadable';
      error = e && e.message ? e.message : String(e);
      settings = null;
    }
    const env = settings && settings.env && typeof settings.env === 'object' ? settings.env : null;
    if (state === 'present' && (!settings || Object.keys(settings).length === 0)) state = 'absent';
    if (state === 'present' && !env) state = 'no-env-block';

    const count = env ? Object.keys(env).length : 0;
    const row = { layer: spec.layer, path: spec.path, state: state, count: count };
    if (error) row.error = error;
    layers.push(row);
    if (!env) return;

    Object.keys(env).forEach(function (key) {
      const value = env[key] === null || env[key] === undefined ? '' : String(env[key]);
      const prior = declared[key];
      if (prior) {
        // LAYER_ORDER가 낮은→높은 순이므로 나중에 오는 계층이 이긴다. 가려진 값은
        // 버리지 않고 기록한다 — «왜 내 값이 안 먹지»의 답이 대개 여기 있다.
        prior.shadowed.push({ layer: prior.layer, value: prior.value });
        prior.layer = spec.layer;
        prior.value = value;
        return;
      }
      declared[key] = { value: value, layer: spec.layer, shadowed: [] };
    });
  });

  return { layers: layers, declared: declared };
}

module.exports = {
  readLayers: readLayers,
  layerPaths: layerPaths,
  LAYER_ORDER: LAYER_ORDER,
};
