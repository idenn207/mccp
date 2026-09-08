# branch protection 런북 — `test-suite` 체크를 필수로 만들기

M3이 만든 강제 workflow는 **PR에서 돌기만 할 뿐 머지를 막지 않는다.** 막는 것은
저장소 설정이고, 그 설정은 파일이 아니라 GitHub의 branch protection이다. 이 문서는
그 **1회 수동 절차**와 이후의 **drift 진단**만 다룬다 — 어떤 정책이 옳은지는 다루지
않는다(UI6).

전제: 관리 권한. `gh auth status`로 확인한다.

---

## 1. 등록할 체크 이름을 workflow에서 읽는다

required status check는 **job 이름 문자열**로 걸린다. 손으로 옮겨 적지 말고 파서에
물어본다:

```bash
node scripts/ci-required-checks.js --json
```

`declared` 배열이 등록 대상이다. 현재 값은 하나다:

```
full test suite gate
```

`unresolved`에 무언가 있으면 그 job 이름은 `${{ ... }}` 템플릿이라 **실행 시점마다
달라지므로 required check로 등록할 수 없다.** 등록하면 어떤 실제 체크와도 영원히
일치하지 않아 모든 PR이 영구 대기한다. 측정 workflow(`test-suite-baseline.yml`)의 job
이름이 정확히 그 형태이며, 그것은 의도다 — 측정은 머지를 막지 않는다.

## 2. 설정한다 (둘 중 하나)

### 2a. 웹 UI

Settings → Branches → Add branch protection rule

- Branch name pattern: `main`
- Require status checks to pass before merging: **on**
- Require branches to be up to date before merging: **on**
- 검색창에 `full test suite gate`를 넣어 선택

> 체크 이름은 **한 번이라도 실행된 뒤에야** 검색창에 나타난다. 목록이 비어 있으면
> 아직 그 workflow가 도는 PR이 없다는 뜻이므로, PR을 하나 열어 체크를 한 번
> 발화시킨 뒤 돌아온다.

### 2b. `gh api`

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
gh api -X PUT "repos/$REPO/branches/main/protection" \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["full test suite gate"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null
}
JSON
```

`required_status_checks` 이외의 키를 `null`로 보내면 그 축의 보호가 **꺼진다.**
이미 다른 보호가 걸린 저장소라면 먼저 현재 값을 읽어 병합하라:

```bash
gh api "repos/$REPO/branches/main/protection" > /tmp/protection-before.json
```

## 3. 검증한다

```bash
node scripts/ci-required-checks.js
echo "exit=$?"
```

**exit 0이 설정 완료의 증거다.** 그 밖의 출력은 전부 미완이며 사유가 `reasons`에 있다:

| reason | 뜻 | 조치 |
|---|---|---|
| `protection_absent` | 보호 목록을 읽지 못했다 (미설정이거나 권한 부족) | 2번을 수행. 권한이면 `gh auth status` |
| `declared_not_required` | workflow가 선언한 job 이름이 필수 목록에 없다 | 그 이름을 필수 목록에 추가 |
| `required_not_declared` | 필수 목록에 있는데 workflow가 그 이름을 내지 않는다 | 아래 4번 |

`--branch <name>`으로 다른 브랜치를 조사할 수 있다(기본 `main`).

## 4. drift — job 이름을 바꾸면 보호가 조용히 풀린다

이 진단이 존재하는 유일한 이유다. required check는 **문자열**로 걸리므로
`.github/workflows/test-suite.yml`의 job `name:`을 바꾸면 저장소는 예전 이름을 계속
기다리고, 그 이름을 내는 체크는 이제 없다. 결과는 **에러가 아니라 침묵**이다 — 새
이름의 체크가 붉어도 머지는 막히지 않는다.

그래서 그 이름은 **안정 리터럴**로 고정돼 있고(`full test suite gate`),
`ci-required-checks.test.js`가 실재 workflow에 대해 그 리터럴을 단언한다. 이름을
바꿔야 한다면 순서가 있다:

1. workflow의 job `name:` 변경 + 짝 test의 리터럴 갱신
2. 머지
3. **새 이름으로 체크가 한 번 실행되기를 기다린다**
4. 필수 목록에서 옛 이름 제거 + 새 이름 추가 (2번 절차)
5. `node scripts/ci-required-checks.js` → exit 0

3번을 건너뛰면 4번의 검색창에 새 이름이 없다.

## 5. 이 진단은 CI에서 돌지 않는다

`gh api`가 관리 권한 토큰을 요구하고, 그 토큰을 workflow에 두는 것은 이 milestone의
범위 밖이다(UI5). 운영자가 손으로 돌린다. 따라서 **설정이 나중에 풀려도 자동으로
알려 주는 것은 없다** — 그것이 축 C가 절반이라는 뜻이고, 그 절반은
[`m3-enforcement.md`](m3-enforcement.md) §7에 미충족으로 적혀 있다.
