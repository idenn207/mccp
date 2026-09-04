# 릴리스 채널 — 컷과 롤백

이 문서는 mccp의 릴리스 채널(`release` 브랜치)을 **어떻게 움직이는가**를 소유한다.
채널 구조 자체의 배경은 [README](../README.md)에, 개발 중인 `main` 본문을 시험하는
별도 경로는 [docs/dogfood-install.md](dogfood-install.md)에 있다.

**증거 라벨 규약.** 아래 각 절의 제목은 그 절의 내용이 어디서 왔는지를 셋 중 하나로
밝힌다. 이것은 장식이 아니라 이 문서의 1급 내용이다 — 아직 한 번도 실행되지 않은 절차를
실행된 것처럼 읽히게 두는 것이 이 문서의 유일한 실패 모드다.

| 라벨 | 뜻 |
|---|---|
| 측정됨 | 이 문서를 쓰면서 실제로 실행하고 출력을 본 것 |
| 전사됨 | 다른 사이클이 실행했고 그 원문이 보고서에 남아 있는 것 |
| 미측정 | 아직 한 번도 실행된 적이 없고, 논증으로만 서 있는 것 |

실측 원문의 소유자는 두 보고서다 —
[m1-report](../.claude/PRPs/reports/release-channel-separation-m1-report.md)(쓰기 절반)와
[m3-report](../.claude/PRPs/reports/release-channel-separation-m3-report.md)(읽기 절반).

## 1. 이 채널이 무엇인가 — 측정됨

`.claude-plugin/marketplace.json`의 plugin `source`가 `git-subdir` + `ref: release`다.
따라서 사용자가 설치·업데이트로 여는 plugin 본문은 `main`이 아니라 **`release` 브랜치의
것**이다. `main`은 dogfood trunk이고, 릴리스는 `release`를 `main`의 어느 지점으로 옮기는
별도 행위다. main 머지는 그 자체로 배포가 아니다.

2026-09-04 실측:

```
$ git ls-remote origin refs/heads/release
647dfecba75eecd9287ee538ca5f7056c7ba71da	refs/heads/release

$ node -e "..."   # <HOME>/.claude/plugins/installed_plugins.json 의 mccp@mccp
{
  "scope": "user",
  "version": "1.33.6",
  "installPath": "<PLUGINS>/cache/mccp/mccp/1.33.6",
  "gitCommitSha": "647dfecba75eecd9287ee538ca5f7056c7ba71da",
  "lastUpdated": "2026-09-01T07:39:27.674Z"
}
```

설치된 `gitCommitSha`가 `origin/release`와 같다. **이 쌍이 "채널이 잡고 있다"의 증거다** —
어느 한쪽만 보면 값이 맞는 것과 기구가 죽어 옛 값을 되읽는 것을 구별하지 못한다. 같은
이유로 좌표는 remote-tracking ref가 아니라 `git ls-remote`로 **원격을 직접** 읽는다.

**닫히는 표면은 plugin 본문 하나뿐이다.** `marketplace.json` 자체의 편집은 이 채널이 잡지
않는다 — 그 잔여는 6절이 소유한다.

## 2. 릴리스 컷 — 미측정

**이 절의 절차는 아직 한 번도 실행된 적이 없다.** 각 단계는 M1이 리허설에서 실제로 돌린
기구(force-push · `claude plugin update` · 좌표 확인)를 쓰지만, **컷이라는 전체 순서로
묶여 돈 적은 없다.** 첫 컷이 돌면 그 실측으로 이 라벨이 바뀐다.

### 2.1 선행조건

셋 다 참이어야 한다. 하나라도 아니면 컷하지 않는다.

```bash
git fetch origin

# (a) fast-forward 가능한가 — 반드시 쌍으로 잰다.
#     정방향만 재면 "항상 0을 내는 검사"와 구별되지 않는다.
git merge-base --is-ancestor origin/release origin/main; echo "forward=$?"   # 0
git merge-base --is-ancestor origin/main origin/release; echo "reverse=$?"   # 비영점

# (b) 작업 트리가 청결한가
git status --porcelain

# (c) 쌓인 것이 있는가 — 0이면 컷할 것이 없다
git rev-list --count origin/release..origin/main
```

(a)가 깨졌으면 컷하지 말고 4절로 간다.

### 2.2 번호를 정한다

판정 기준은 [CLAUDE.md](../CLAUDE.md) §3.7의 표(major / minor / patch)를 그대로 쓴다.
**다음 컷의 번호는 `2.0.0`이고, 시점은 운영자가 정한다.**

자식 브랜치는 번호를 선언하지 않는다(우산 결정 1). 따라서 컷 직전의 `plugin.json`은
직전 컷의 번호를 갖고 있고, 번호를 올리는 것은 **이 절차뿐**이다.

### 2.3 다섯 면을 한 커밋으로 바꾼다

번호는 다섯 곳에 나타난다. 흩어져 바뀌면 surface drift이므로 **한 커밋 안에서** 함께
움직인다.

| 면 | 무엇 |
|---|---|
| `plugins/mccp/.claude-plugin/plugin.json` | `version` 필드 |
| `plugins/mccp/scripts/lib/renderer/html.js` | page-foot 버전 문자열 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | derived 줄의 버전 문자열 |
| `CHANGELOG.md` 헤딩 | `## [Unreleased]` → `## [X.Y.Z] — YYYY-MM-DD`, 그 위에 빈 `## [Unreleased]`를 새로 연다 |
| `CHANGELOG.md` 노트 | 머리말의 `currently ...` 번호 |

**CHANGELOG의 소유는 컷에 있다.** 착지한 작업은 번호 없는 `## [Unreleased]` 아래에 쌓이고,
컷이 그 블록에 번호를 부여한다. 이것은 기존 이력의 정합을 고치는 일과 무관하다 — 컷은
그 블록을 **소비**할 뿐 과거 항목을 건드리지 않는다.

렌더러 두 면이 번호를 manifest에서 파생하지 않고 리터럴로 갖는 것은 알려진 부채이고
backlog가 소유한다. 그것이 고쳐지면 이 표는 다섯 면에서 세 면으로 준다.

### 2.4 가드를 통과시킨다

`scripts/version-declaration-guard.js`는 브랜치가 번호를 선언하는 것을 막는다. 컷은 그
규칙의 **유일한 합법 예외**이고, 예외는 `MCCP_RELEASE_CUT`으로만 열린다 — **값이 곧
사유**이며 30자 이상·3단어 이상이어야 한다.

```bash
MCCP_RELEASE_CUT="release cut 2.0.0 — bundles the umbrella children landed since 1.33.6" \
  node scripts/version-declaration-guard.js --base origin/main
```

이 변수는 **컷 커밋을 만드는 그 순간에만** 세운다. 셸에 남겨 두면 이후의 모든 마일스톤
브랜치가 조용히 면제되어 가드가 규칙이 아니라 장식이 된다.

### 2.5 머지 → 태그 → fast-forward

```bash
# 컷 커밋이 main에 머지된 뒤
git fetch origin
MAIN_SHA=$(git ls-remote origin refs/heads/main | cut -f1)

# 태그를 먼저 찍는다 — 태그가 있으면 되돌릴 좌표가 남는다
git tag -a "mccp--v2.0.0" "$MAIN_SHA" -m "mccp v2.0.0"
git push origin "mccp--v2.0.0"

# 채널을 옮긴다. + 없는 refspec이라 fast-forward가 아니면 거절된다 — 그것이 안전장치다
git push origin "$MAIN_SHA:refs/heads/release"
```

**태그가 먼저인 이유**: 태그는 `sha`를 manifest에 박지 않고도 되돌릴 좌표를 남기는
수단이다. 채널을 먼저 옮기고 태그를 나중에 찍으면, 그 사이에 사고가 나면 되돌릴 곳이
없다.

### 2.6 확인

```bash
git ls-remote origin refs/heads/release          # 방금 그 SHA여야 한다
git ls-remote --tags origin 'refs/tags/mccp--v*' | grep -vF '^{}'   # 태그가 origin에 있어야 한다
claude plugin update mccp@mccp -y
```

그리고 `<HOME>/.claude/plugins/installed_plugins.json`의 `mccp@mccp` 항목에서 `version`이
`X.Y.Z`, `gitCommitSha`가 방금 그 SHA인지 본다. **두 값을 함께** 본다(1절과 같은 이유).

**한정 — 명시 실행을 전제한다.** `autoUpdate: true`가 켜져 있지만, 컷으로 `release`가
움직였을 때 사용자가 `claude plugin update`를 **직접 실행하지 않고도** 새 본문을 받는지는
측정된 바 없다. M1의 모든 전이는 그 명령을 직접 실행해 관측했다. 따라서 이 확인 단계는
명시 실행을 포함한다.

## 3. 롤백 — 전사됨

M1이 실제로 실행했다. 아래는 그 원문의 전사이며 근거는
[m1-report](../.claude/PRPs/reports/release-channel-separation-m1-report.md)에 있다.

### 3.1 절차

```bash
# 1. 되돌릴 좌표를 확인한다 — 태그가 그것이다.
#    2.5절이 지시하는 annotated 태그는 peeled ref를 함께 내므로 좌표당 두 줄이 된다.
#    M1이 실행한 형태는 `| grep -i "mccp--v"` 였고 당시 태그는 lightweight라 한 줄이었다.
#    아래는 그 관측을 annotated 태그에도 맞도록 좁힌 것이다 — 전사가 아니라 절차 쪽 정정이다.
git ls-remote --tags origin 'refs/tags/mccp--v*' | grep -vF '^{}'

# 2. 현재 SHA를 관측한다. 이 값이 lease의 인자가 된다
CUR=$(git ls-remote origin refs/heads/release | cut -f1)

# 3. 관측 SHA에 결속한 강제 이동
git push --force-with-lease=refs/heads/release:"$CUR" origin <되돌릴 SHA>:refs/heads/release

# 4. 확인
claude plugin update mccp@mccp -y
```

### 3.2 M1이 실제로 본 것

```
$ git push --force-with-lease=refs/heads/release:8af5e4235665a8a1c9cdfdc2f62818f66bde1e3b \
    origin ab6bcaa:refs/heads/release
 + 8af5e42...ab6bcaa ab6bcaa -> release (forced update)

$ claude plugin update mccp@mccp -y
Plugin "mccp" updated from 1.33.7 to 1.33.4 for scope user. Restart to apply changes.
```

- **버전 하향이 수용된다.** `1.33.7 → 1.33.4`. CLI 문서는 "내용이 바뀌면 받는다"고만 적고
  하향을 언급하지 않으므로 이것은 문서가 아니라 실측이 답한 질문이다.
- **소요 12초** — force-push부터 `claude plugin update` 완료까지.
- **대체 경로는 사용되지 않았다.** uninstall 후 재설치, 캐시 백업 복원 둘 다 필요 없었다.
  둘은 최후 수단으로만 남는다.

### 3.3 n=1 한정

**측정된 하향은 patch 범위 1건뿐이다.** `2.0.0`에서 `1.x`로 되돌리는 major 경계는 측정된
바 없고, 그 경계에서 CLI가 같은 행동을 한다는 근거는 이 문서에 없다. 첫 major 컷 이후의
첫 롤백은 그 자체로 측정 대상이다.

**캐시는 남아 있다고 가정하지 않는다.** M1 시점의 CLI는 옛 캐시 디렉토리를 지우지
않았지만(리허설 종료 시 12개 버전 공존) 그것은 보장이 아니라 관측이다. 롤백은 캐시 잔존이
아니라 `release` 좌표와 `claude plugin update`에 의존한다.

## 4. fast-forward가 불가해졌을 때 — 미측정

**일어난 적이 없다.** 아래는 관측이 아니라 결정이다.

`release`는 **항상 `main`의 조상으로 유지한다.** 컷은 fast-forward 전용이고, 유일하게
허용되는 비-FF 이동은 3절의 롤백이다.

FF가 깨지는 경우는 둘이다 — `main`이 rebase됐거나, hot-fix가 `release`에서 먼저 나갔거나.
**어느 쪽이든 답은 채널을 강제로 전진시키는 것이 아니다.** 먼저 그 변경을 `main`에
착지시키고, 그 지점에서 **새 번호로 다시 컷**한다.

강제 전진을 허용하면 `git rev-list --count origin/release..origin/main`이 의미를 잃는데,
그 명령이 곧 5절의 트리거 관측 수단이다. 즉 강제 전진은 한 번의 편의를 위해 **트리거를
재는 눈 자체를 망가뜨린다.**

### 4.1 금지 형태 셋

모두 push 명령에 붙는 형태이며, 셋 다 이 문서 어디에도 등장하지 않는다.

| 금지 | 왜 |
|---|---|
| lease 없는 강제 플래그 (긴 형태와 한 글자 축약형 둘 다) | 다른 사람이 그 사이에 옮긴 좌표를 아무 경고 없이 덮는다 |
| 앞에 `+`를 붙인 refspec | 위와 같은 일을 하면서 플래그처럼 보이지 않는다 |
| 좌표를 인자로 갖지 않는 lease | 형태만 갖추고 **아무것도 결속하지 않는다.** 올바른 형태처럼 보이는 것이 이 셋 중 가장 위험한 이유다 |

허용되는 유일한 강제 이동은 `--force-with-lease=refs/heads/release:<직전에 관측한 SHA>`
하나다. 인자는 항상 **방금 `git ls-remote`로 읽은 값**이지 기억이나 remote-tracking ref가
아니다.

## 5. 컷 트리거 — 측정됨(관측값) · 미측정(발화)

**기본 트리거: 우산 자식 PRD 하나가 종료되면 컷을 검토한다.** 케이던스 감각은 PRD 단위
2~3주 1회이고 이것은 상한이 아니라 목표다. 트리거가 실제로 발화해 컷이 일어난 적은
아직 없다.

관측 명령과 2026-09-04 실측값:

```
$ git rev-list --count origin/release..origin/main
162

$ git log -1 --format='%ci  %h  %s' origin/release
2026-09-01 10:10:57 +0900  647dfec  chore(state): env-contract-integrity 잔여 state 회전 — stuck escalation 해소 (#167)

$ git log -1 --format='%ci  %h  %s' origin/main
2026-09-04 09:45:24 +0900  2cb173c  feat: ci-full-suite M2 — suite-green (red 16파일 6갈래 귀속) (#177)
```

**노출 3.0일 · 162커밋.** 다음 사이클은 이 값과 대조해 채널이 벌어지고 있는지 볼 수 있다.

**"노출 감소"의 실패 모드는 "노출 0"이다.** 컷을 잊으면 사용자는 몇 달째 옛 번호에
머문다. 채널 분리는 검증되지 않은 변경이 사용자에게 즉시 도달하는 것을 막았지만, 같은
기제가 검증된 변경도 막는다. **이 문서는 그 실패를 닫지 않는다** — 트리거와 관측 명령을
정의할 뿐 알람을 만들지 않는다. 컷이 수동으로 한 번도 돌지 않은 상태에서 자동화하면
자동화가 무엇을 지키는지 아무도 모르기 때문이고, 기계화는 첫 수동 컷 이후의 축으로
backlog가 소유한다.

## 6. 컷 밖에서도 사용자에게 즉시 도달하는 것 — 측정됨

`~/.claude/plugins/known_marketplaces.json`의 mccp 항목에는 `ref`가 **없다.** 따라서
marketplace clone은 계속 `main`을 추종하고, `.claude-plugin/marketplace.json` **자체의
편집**(`source` 타입 변경, `ref` 변경, `sha` 추가 등)은 머지 즉시 설치에 도달한다.
채널이 닫는 것은 plugin 본문이지 좌표 파일이 아니다.

따라서 **그 파일은 릴리스 표면으로 취급한다.** 편집하면 이 문서의 2.6 확인 절차를 함께
돈다.

드리프트 탐지기는 형태 단언이다 — `source.source === 'git-subdir'` ·
`source.ref === 'release'` · `source.path === 'plugins/mccp'` · **`sha` 키 부재**.
마지막 항목이 특히 중요하다: 사고 대응 시 `sha`를 일시적으로 박는 것은 허용되지만, 그
"일시"를 지키는 기계가 없으면 조용한 영구 핀이 되어 `ref` 기반 채널이 죽는다.

**이 탐지기의 약점을 명시한다: 사이클마다 실행돼야만 작동한다.** 상시 도는 CI 검사가
아니라 각 마일스톤의 검증 블록이 부르는 단언이므로, 아무도 부르지 않는 사이클에는
아무것도 재지 않는다. CI화는 backlog 축이다.

## 7. 한계 — 미측정

이 문서가 **주장하지 않는** 것들이다.

- **컷은 한 번도 실행되지 않았다.** 2절 전체가 논증이고, 그 안의 개별 기구만 M1이
  리허설에서 돌렸다. 첫 컷은 그 자체로 측정 대상이다.
- **롤백은 n=1이다.** patch 범위 하향 1건. major 경계는 미측정(3.3절).
- **`autoUpdate: true` 하에서 명시 실행 없이 도달하는지는 미측정이다.** M1의 모든 전이는
  `claude plugin update`를 직접 실행해 관측했다(2.6절 한정).
- **`release` 브랜치 보호는 없다.** 2026-09-04 실측: 보호 API가 404를 돌려준다. 켜지 않는
  이유는 (i) 오늘의 위협 모델이 계정 침해가 아니라 운영자 오조작이고 그것은 4.1절의 lease
  규칙이 다루며 (ii) 보호와 롤백의 강제 이동이 어떻게 상호작용하는지가 측정된 바 없어,
  검증 없이 켜면 사고 대응 경로를 사고 중에 처음 발견하게 되기 때문이다. 측정과 설정은
  backlog 축이다.
- **측정 OS는 하나다.** Windows 11 · Claude Code CLI 2.1.259(M3 관측 시점). M1의 쓰기 절반은
  2.1.252에서 측정됐다. 다른 OS·다른 CLI 버전에서 같은 행동을 한다는 근거는 여기 없다.
- **이 문서에는 강제기가 없다.** 절차를 어겨도 막는 것은 `version-declaration-guard.js`가
  보는 축(브랜치가 번호를 선언하지 않는다) 하나뿐이고, 나머지는 산문이다. 그것이 첫
  수동 컷 이전의 의도된 상태다.
