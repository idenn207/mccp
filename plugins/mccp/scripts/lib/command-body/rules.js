'use strict';

// 게이트 배선 seam 규칙 S1/S2/S3 (diverse-agent-review M5 Task 2).
//
// 순수 함수다 — I/O 없음(`plan-review/quorum.js` mirror). 각 규칙은 블록 배열을 받아
// `{file, line, rule, text, why}` 배열을 낸다.
//
// 규칙은 발명하지 않고 **실제 결함 이력에서만** 도출했다. 접미사·패턴 집합은 전부
// `plugins/mccp/commands/` 실측에서 나왔고 그 근거는 각 규칙 주석에 있다.

const blocks = require('./blocks');

const BACKSLASH = String.fromCharCode(92);

// ── lexical 스캔 (Implement-Codex R1 F2) ─────────────────────────────────────
// S1 이 "읽혔다"를 판정할 때 주석·홑따옴표·heredoc 본문 안의 `$VAR` 를 세면 죽은 캡처가
// 읽힌 것으로 접혀 규칙이 겨냥한 클래스에서 false negative 가 난다. 그래서 참조 스캔은
// 원시 줄이 아니라 **실행 가능한 부분**만 본다.
//
// 겹따옴표 안은 제외하지 않는다 — `echo "exit=$X"` 는 실제 확장이고 값의 소비다.
//
// ── 놓치는 방향은 규칙마다 다르다 (code-review M1 정정) ──
// 이 자리에는 "놓치는 방향은 코드로 본다 = 위반을 더 많이 보고하는 쪽이라 규칙이 조용히
// 꺼지지 않는다"고 적혀 있었다. **S1 에 대해 거짓이다.** S2/S3 는 코드에서 패턴을 찾으므로
// 데이터를 코드로 보면 위반을 더 보고한다(안전). 그러나 S1 은 코드에서 **read** 를 찾으므로
// 데이터를 코드로 보면 유령 read 를 세어 위반을 **덜** 보고한다 — 그것이 바로 이 스트리퍼가
// 막으려는 실패다. 따라서 S1 축에서 stripping 의 구멍은 안전하지 않고, 발견되면 닫는다.
//
// 완전한 셸 렉서가 아니라 줄 단위 보수적 근사다. 알려진 잔여 한계는
// `docs/diverse-agent-review/gate-wiring-oracle.md` §4 가 열거한다.
function stripLexical(rawLines) {
  const out = [];
  let heredocDelim = null;
  let heredocIndentOk = false;

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];

    if (heredocDelim !== null) {
      const probe = heredocIndentOk ? raw.replace(/^\s+/, '') : raw;
      if (probe.trim() === heredocDelim) heredocDelim = null;
      out.push('');
      continue;
    }

    const trimmed = raw.replace(/^\s+/, '');
    if (trimmed.startsWith('#')) { out.push(''); continue; }

    // ── 구분자가 인용된 heredoc 은 원시 줄에서 먼저 본다 (code-review M1) ──
    // `<<'EOF'` 는 확장이 꺼진 **진짜 heredoc** 이고, `'... <<EOF ...'` 는 홑따옴표 안에
    // 적힌 데이터다. 둘은 다른 것인데 정제된 줄만 보면 구분할 수 없다 — `scrubQuotes` 가
    // 홑따옴표 구간을 지우므로 `cat <<'EOF'` 가 `cat <<     ` 이 되어 식별자가 사라지고,
    // 본문 전체가 코드로 스캔된다. 그러면 본문의 `$VAR` 가 유령 read 가 되어 S1 이 죽은
    // 캡처를 놓친다(위 "놓치는 방향" 참조). 코퍼스에 인용 구분자가 8건 있다.
    //
    // 인용 구분자만 원시 줄에서 받는다. 인용 없는 `<<EOF` 는 홑따옴표 안에 적혀 있을 수
    // 있으므로 정제된 줄 판정을 유지한다. `<<<` 는 here-string 이라 본문을 갖지 않는다.
    const rawHd = raw.match(/<<(-?)(?!<)\s*(['"])([A-Za-z_][A-Za-z0-9_]*)\2/);
    const code = scrubQuotes(raw);
    const hd = rawHd || code.match(/<<(-?)(?!<)\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/);
    if (hd) { heredocDelim = hd[3]; heredocIndentOk = hd[1] === '-'; }

    out.push(code);
  }
  return out;
}

// 홑따옴표 구간을 지우고, 따옴표 밖의 trailing 주석을 자른다.
// 지운 자리는 공백으로 채운다 — 길이를 보존해야 호출부가 열 위치로 되짚을 수 있다.
function scrubQuotes(line) {
  let res = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];

    if (inSingle) {
      if (c === "'") inSingle = false;
      res += ' ';
      continue;
    }

    // 겹따옴표 안의 이스케이프는 다음 문자를 리터럴로 만든다.
    if (c === BACKSLASH && inDouble) {
      res += ' ';
      if (i + 1 < line.length) { res += ' '; i++; }
      continue;
    }

    if (c === "'" && !inDouble) { inSingle = true; res += ' '; continue; }
    if (c === '"') { inDouble = !inDouble; res += c; continue; }

    if (c === '#' && !inDouble) {
      // `$#` 나 단어 내부의 `#` 는 주석이 아니다. 앞이 공백일 때만 주석으로 본다.
      const prev = i === 0 ? ' ' : line[i - 1];
      if (/\s/.test(prev)) break;
    }

    res += c;
  }
  return res;
}

// 블록 안에서 실행 가능한 다음 유효 줄의 인덱스. 빈 줄과 주석은 건너뛴다.
function nextEffectiveIdx(codeLines, from) {
  for (let i = from; i < codeLines.length; i++) {
    if (codeLines[i].trim() !== '') return i;
  }
  return -1;
}

// ── S1 ──────────────────────────────────────────────────────────────────────
// 캡처된 exit 는 **자기 캡처 지점 이후로** 같은 블록에서 읽혀야 한다.
// "이후"가 술어의 일부다 — prp-implement.md 는 한 fence 안에서 읽은 **뒤** 재캡처하므로
// "블록 어디선가 참조되면 통과"라는 넓은 문면으로는 그 재캡처가 위반이 아니게 되고
// 부채 열거와 규칙 출력이 첫날부터 어긋난다.
// 셸 상태는 fence 를 넘지 못하므로, 읽는 코드가 다음 블록에 있으면 그 비교는 빈 값과
// 대조되어 분기가 죽는다.
const CAPTURE_RE = /^\s*([A-Za-z_][A-Za-z0-9_]*)=\$\?/;

function referenceRe(name) {
  // `$NAME` 또는 `${NAME...}`. 뒤에 식별자 문자가 오면 다른 변수다.
  return new RegExp('[$]' + '[{]?' + name + '(?![A-Za-z0-9_])');
}

function s1(fileBlocks, file) {
  const found = [];
  fileBlocks.forEach(function (b) {
    const code = stripLexical(b.lines);
    code.forEach(function (line, idx) {
      const m = line.match(CAPTURE_RE);
      if (!m) return;
      const name = m[1];
      const ref = referenceRe(name);
      const readAfter = code.slice(idx + 1).some(function (l) { return ref.test(l); });
      if (readAfter) return;
      found.push({
        file: file,
        line: blocks.lineNumberOf(b, idx),
        rule: 'S1',
        text: b.lines[idx].trim(),
        why: '$' + name + ' is captured here but never read again inside this fence; '
          + 'shell state does not cross a fence, so any later comparison sees an empty value',
      });
    });
  });
  return found;
}

// ── S2 ──────────────────────────────────────────────────────────────────────
// 비차단 호출은 분기 종결자가 될 수 없다. 접미사 집합은 실측에서 왔다 — 후보 7건이
// 전부 `|| true` 이고 다른 형태는 코퍼스에 없다(UI3: 근거 없이 만들지 않는다).
// 분기의 exit status 가 항상 0 이 되어 실패한 검사가 통과로 읽힌다.
// 헬퍼 본문(`}` 로 닫히는 함수)은 호출부가 exit 를 판정하므로 면제 — 기존 F1 이 쓰는
// escape 를 그대로 계승한다.
const NONBLOCKING_RE = /[|][|]\s*true$/;

// ── 종결자 집합은 의미 클래스이지 실측 열거가 아니다 (code-review H1) ──
// 처음에는 `fi` 와 블록 끝만 인정했다. 그 집합은 **같은 if/else 의 반쪽을 놓쳤다** —
// `prp-implement.md:1410`(else 분기, 뒤가 `fi`)은 부채에 열거됐는데 `:1408`(then 분기,
// 뒤가 `else`)은 구조가 동일한데도 불가시였다. 코퍼스 실측으로 `else` 1건 · `done` 2건이
// 더 있다.
//
// 위의 **접미사** 집합과 근거의 성질이 다르다. 접미사(`|| true`)는 "코퍼스에 다른 형태가
// 없다"는 실측 열거라 넓히려면 새 실측이 필요하다. 반면 종결자는 "분기의 마지막 명령"이라는
// **의미 클래스**이고, `elif`·`esac`·`;;` 는 `fi`·`else`·`done` 과 정확히 같은 이유로
// 분기를 끝낸다. 셋은 현재 코퍼스에 0건이지만 클래스를 반만 구현하면 H1 이 다시 열린다 —
// 규칙이 조용히 과소 보고하는 쪽이라 열려도 보이지 않는다.
const BRANCH_TERMINATOR_RE = /^(fi|else|elif|done|esac|;;)$/;

function s2(fileBlocks, file) {
  const found = [];
  fileBlocks.forEach(function (b) {
    const code = stripLexical(b.lines);
    code.forEach(function (line, idx) {
      if (!NONBLOCKING_RE.test(line.trim())) return;
      const nxt = nextEffectiveIdx(code, idx + 1);
      const atBlockEnd = nxt === -1;
      const nextTrim = atBlockEnd ? '' : code[nxt].trim();
      if (nextTrim === '}') return;                    // 헬퍼 본문 escape
      // 첫 토큰으로 본다 — `done < "$f"` 처럼 종결자가 인자를 끌고 오는 형태가 있다.
      const nextHead = atBlockEnd ? '' : nextTrim.split(/\s+/)[0];
      if (!atBlockEnd && !BRANCH_TERMINATOR_RE.test(nextHead)) return;
      found.push({
        file: file,
        line: blocks.lineNumberOf(b, idx),
        rule: 'S2',
        text: b.lines[idx].trim(),
        why: 'a non-blocking call terminates this branch (' + (atBlockEnd ? 'block end' : nextHead)
          + '), so the branch exit status is always 0 and a failed check reads as a pass',
      });
    });
  });
  return found;
}

// ── S3 ──────────────────────────────────────────────────────────────────────
// loud-fail-open 호출은 stderr 를 버릴 수 없다. exit 0 을 계약으로 갖는 **계측 호출**이
// stderr 를 폐기하면 그 호출의 유일한 신호 채널이 사라진다.
//
// 술어는 세 조건의 곱이고 셋 다 실측에서 왔다:
//   (1) stderr 폐기가 있다
//   (2) fail-open 이다 — 같은 줄에 `||` fallback 이 있거나 command substitution 안이라
//       실패해도 빈 값으로 진행한다
//   (3) **계측 호출이다 — `node` 호출**
//
// (3)이 없으면 규칙이 41건을 보고하고 그중 36건은 `git`·`mktemp`·`kill`·`cat`·`ls` 다.
// 그것들은 loud-fail-open 계약을 갖지 않는다 — `git diff … 2>/dev/null || true` 가
// stderr 를 버리는 것은 결함이 아니라 의도다(그 명령의 실패는 정상 경로다). 반면 mccp
// 자신의 node 계측은 "exit 0 을 내되 문제를 stderr 로 시끄럽게 알린다"를 계약으로 가지며,
// 그 stderr 를 버리면 계약의 절반이 조용히 사라진다. plan 이 실측한 후보 5건이 전부 node
// 호출이라는 것이 이 조건의 근거다(UI3 — 근거 없이 좁히거나 넓히지 않는다).
const STDERR_DISCARD_RE = /2>\s*[/]dev[/]null/;
const INSTRUMENTATION_RE = /(^|[\s(`"'$])node\s/;

function s3(fileBlocks, file) {
  const found = [];
  fileBlocks.forEach(function (b) {
    const code = stripLexical(b.lines);
    code.forEach(function (line, idx) {
      if (!STDERR_DISCARD_RE.test(line)) return;
      const hasFallback = /[|][|]/.test(line);
      const inSubstitution = /[$][(]/.test(line);
      if (!hasFallback && !inSubstitution) return;
      if (!INSTRUMENTATION_RE.test(line)) return;
      found.push({
        file: file,
        line: blocks.lineNumberOf(b, idx),
        rule: 'S3',
        text: b.lines[idx].trim(),
        why: 'this call is fail-open (' + (hasFallback ? 'or-fallback' : 'command substitution')
          + ') yet discards stderr, removing its only diagnostic channel',
      });
    });
  });
  return found;
}

const RULES = Object.freeze(['S1', 'S2', 'S3']);

// 한 파일의 전 규칙. `src` 는 markdown 원문, `file` 은 보고에 쓸 경로.
function runRules(src, file) {
  const bb = blocks.bashBlocks(src);
  return [].concat(s1(bb, file), s2(bb, file), s3(bb, file));
}

module.exports = {
  s1: s1,
  s2: s2,
  s3: s3,
  runRules: runRules,
  stripLexical: stripLexical,
  scrubQuotes: scrubQuotes,
  nextEffectiveIdx: nextEffectiveIdx,
  RULES: RULES,
};
