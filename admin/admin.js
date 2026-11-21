'use strict';
// 연구자 페이지. 외부 라이브러리·CDN 없이 바닐라 JS만 쓴다.

const app = document.getElementById('app');
const warnBar = document.querySelector('.warn');

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pad = (n) => String(n).padStart(2, '0');
const fmtTime = (ts) => {
  if (!ts) return '-';
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const fmtDur = (ms) => (ms == null ? '-' : `${Math.floor(ms / 60000)}분 ${pad(Math.floor((ms % 60000) / 1000))}초`);
const mmss = (ms) => {
  const a = Math.abs(Math.floor(ms / 1000));
  return `${ms < 0 ? '-' : ''}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
};
const POS = { relative: '상대평가', absolute: '절대평가' };
const posLabel = (p) => POS[p] || '-';
const SCREEN_NAME = { 'S1-intro': 'S1-intro 안내', S1: 'S1 설문', S2: 'S2 연습', S3: 'S3 입장', S4: 'S4 1차 다듬기', S5: 'S5 피드백', S6: 'S6 종료' };

// ---------- 통신 ----------
class Stop extends Error {}
async function api(path, opts = {}) {
  const res = await fetch('/admin/api/' + path, { credentials: 'same-origin', ...opts });
  if (res.status === 423) {
    showBusy();
    throw new Stop('busy');
  }
  if (res.status === 401 && path !== 'login') {
    showLogin();
    throw new Stop('auth');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || String(res.status));
  return body;
}
const post = (path, data) =>
  api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

// ---------- 공통 화면 ----------
function showBusy() {
  warnBar.hidden = true;
  app.innerHTML = '<main><p style="font-size:20px;margin-top:80px;text-align:center">세션 진행 중</p></main>';
}

function showLogin(msg = '') {
  warnBar.hidden = false;
  app.innerHTML = `
    <form class="login" id="loginForm">
      <h1>연구자 페이지</h1>
      <label>PIN<input id="pin" type="password" inputmode="numeric" autocomplete="off" autofocus /></label>
      ${msg ? `<div class="alert">${esc(msg)}</div>` : ''}
      <button class="btn primary" type="submit">들어가기</button>
    </form>`;
  document.getElementById('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await post('login', { pin: document.getElementById('pin').value });
      route();
    } catch (err) {
      if (!(err instanceof Stop)) showLogin(err.message);
    }
  };
}

function shell(active, inner) {
  const link = (href, label, key) => `<a href="${href}" class="${active === key ? 'on' : ''}">${label}</a>`;
  app.innerHTML = `
    <nav>
      ${link('#/list', '세션 목록', 'list')}
      ${link('#/matrix', '사례 매트릭스', 'matrix')}
      ${link('#/coding', '코딩', 'coding')}
      ${link('#/export', '내보내기', 'export')}
      <span class="sp"></span>
      <button id="logout">로그아웃</button>
    </nav>
    <main>${inner}</main>`;
  document.getElementById('logout').onclick = async () => {
    await post('logout', {}).catch(() => {});
    showLogin();
  };
}

const table = (header, rows, cls = '') =>
  `<div class="scroll"><table class="${cls}"><thead><tr>${header.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div>`;

// ---------- 1. 세션 목록 ----------
async function viewList() {
  const d = await api('list');
  const warn = [];
  for (const [k, label] of [['relative', '상대평가'], ['absolute', '절대평가']]) {
    if (d.positions[k] < 3) warn.push(`${label} 입장이 ${d.positions[k]}명이에요 (3명 미만이면 논문에 적어야 해요)`);
  }
  const header = ['참여자 번호', '입장', '시작', '종료', '총 소요', '저장', '이벤트 수'];
  const rows = d.rows.map((r) => [
    `<a href="#/p/${esc(r.id)}/overview">${esc(r.id)}</a>`,
    posLabel(r.position),
    fmtTime(r.start),
    r.completed ? fmtTime(r.end) : `<span class="no">미완료</span> ${fmtTime(r.end)}`,
    fmtDur(r.durationMs),
    r.saved ? '<span class="ok">저장됨</span>' : '<span class="no">저장 전</span>',
    `<span class="num">${r.eventCount}</span>`,
  ]);
  const kindCols = d.expected.map((k) => `<th class="vert" title="${esc(k)}">${esc(k)}</th>`).join('');
  const body = d.rows
    .map(
      (r, i) =>
        `<tr>${rows[i].map((c) => `<td>${c}</td>`).join('')}${d.expected
          .map((k) => `<td class="${r.kinds[k] ? 'ok' : 'no'}" title="${esc(k)}">${r.kinds[k] ? '✓' : '✗'}</td>`)
          .join('')}</tr>`,
    )
    .join('');
  shell(
    'list',
    `<h1>세션 목록</h1>
    <p>입장별 인원: 상대평가(A1) <b>${d.positions.relative}</b>명 · 절대평가(B1) <b>${d.positions.absolute}</b>명</p>
    ${warn.map((w) => `<div class="alert">경고: ${esc(w)}</div>`).join('')}
    ${d.rows.length ? `<div class="scroll"><table><thead><tr>${header.map((h) => `<th>${h}</th>`).join('')}${kindCols}</tr></thead><tbody>${body}</tbody></table></div>
    <p class="note">✓/✗ 는 14개 이벤트 종류가 로그에 한 번이라도 있는지(✓) 없는지(✗)를 뜻해요.</p>` : '<p>참여자 자료가 없어요.</p>'}`,
  );
}

// ---------- 2. 참여자 상세 ----------
const CIRCLED = ['①', '②', '③', '④'];

function blockLabel(id) {
  let m = /^([AB]1)-2(-P)?(?:\.(\d+))?$/.exec(id);
  if (m) return m[2] ? `② 댓글의 접힌 항목${m[3] != null ? ` ${Number(m[3]) + 1}번` : ''} (${id})` : `② 댓글 (${id})`;
  m = /^([AB]1)-R(-P)?(?:\.(\d+))?$/.exec(id);
  if (m) return m[2] ? `요청 답변 댓글의 접힌 항목${m[3] != null ? ` ${Number(m[3]) + 1}번` : ''} (${id})` : `요청 답변 댓글 (${id})`;
  if (/^P-\d+$/.test(id)) return `연습 댓글 (${id})`;
  return id;
}

function diffHtml(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  const pre = esc(a.slice(0, i));
  const post = esc(a.slice(a.length - j));
  const del = esc(a.slice(i, a.length - j));
  const ins = esc(b.slice(i, b.length - j));
  return { left: `${pre}${del ? `<del>${del}</del>` : ''}${post}`, right: `${pre}${ins ? `<ins>${ins}</ins>` : ''}${post}` };
}

function tabOverview(d) {
  const o = d.overview;
  const ans = (list) => table(['문항', '응답'], list.map((x) => [esc(x.text), x.value ?? '<span class="no">없음</span>']));
  const times = Object.entries(o.screenTimesMs);
  return `
    <table><tbody>
      <tr><th>입장</th><td>${posLabel(o.position)}${o.setKey ? ` (초안 ${esc(o.setKey)})` : ''}</td></tr>
      <tr><th>확신도 (1~7)</th><td>${o.confidence ?? '-'}</td></tr>
      <tr><th>시작 / 종료</th><td>${fmtTime(d.summary.start)} / ${fmtTime(d.summary.end)} (${fmtDur(d.summary.durationMs)})</td></tr>
      <tr><th>세션 파일</th><td>${d.summary.saved ? '저장됨' : '저장 전 (state.json 기준)'}</td></tr>
    </tbody></table>
    <h2>전제 동의 (7점)</h2>${ans(o.premise)}
    <h2>공통 문항 (7점)</h2>${ans(o.common)}
    <h2>AI 챗봇 신뢰 (5점, 화면에 보인 순서)</h2>${ans(o.trust)}
    <h2>화면별 소요 시간</h2>
    ${table(['화면', '시간'], times.map(([k, ms]) => [esc(SCREEN_NAME[k] || k), fmtDur(ms)]))}`;
}

function tabVersions(d) {
  const { v1, v2 } = d.versions;
  if (!v1 || !v2) return `<p>${!v1 ? 'v1' : 'v2'} 가 아직 저장되지 않았어요.</p>`;
  let html = '<div class="diff"><div class="h">문장</div><div class="h">v1 (1차 제출)</div><div class="h">v2 (최종 제출)</div>';
  const changed = [];
  for (let i = 0; i < 4; i++) {
    const same = v1[i] === v2[i];
    if (!same) changed.push(i + 1);
    const df = same ? { left: esc(v1[i]), right: esc(v2[i]) } : diffHtml(v1[i], v2[i]);
    html += `<div class="${same ? '' : 'chg'}">${CIRCLED[i]}${same ? '' : ' 변경'}</div><div class="${same ? '' : 'chg'}" style="font-weight:400">${df.left}</div><div class="${same ? '' : 'chg'}" style="font-weight:400">${df.right}</div>`;
  }
  return `<p>변경된 문장: <b>${changed.length ? changed.map((n) => CIRCLED[n - 1]).join(' ') : '없음'}</b></p>${html}</div>`;
}

function tabMemos(d) {
  const rows = [];
  const add = (m, status) =>
    rows.push([
      status,
      esc(m.screen),
      esc(blockLabel(m.blockId)),
      `${m.start}–${m.end}`,
      `<div class="pre">${esc(m.quote)}</div>`,
      esc(m.reaction),
      `<div class="pre">${esc(m.text)}</div>`,
      fmtTime(m.createdTs),
      m.updatedTs !== m.createdTs ? fmtTime(m.updatedTs) : '-',
      m.deletedTs ? fmtTime(m.deletedTs) : '-',
    ]);
  d.memos.current.forEach((m) => add(m, '현재'));
  d.memos.deleted.forEach((m) => add(m, '<span class="no">삭제</span>'));
  if (!rows.length) return '<p>남긴 메모가 없어요.</p>';
  return table(['상태', '화면', '대상', '구간(문자)', '선택한 글', '반응', '메모', '생성', '수정', '삭제'], rows);
}

function tabPanel(d) {
  const h = d.cases.header;
  const get = (r, name) => r[h.indexOf(name)];
  if (!d.cases.rows.length) return '<p>사례 자료가 없어요 (입장 미선택).</p>';
  const fields = [
    ['패널_화면노출_ms', '패널 화면 노출 (ms)'],
    ['패널_hover_횟수', '패널 hover 횟수'],
    ['댓글_hover_횟수', '댓글 hover 횟수'],
    ['첫_펼침_시각', '첫 펼침 시각'],
    ['피드백후_첫펼침까지_ms', '피드백 후 첫 펼침까지 (ms)'],
    ['펼침_횟수', '펼침 횟수'],
    ['누적_펼침_ms', '누적 펼침 (ms)'],
    ['3초이상_펼침', '3초 이상 펼침'],
    ['자발적_탐지_후보(펼침전_메모)', '자발적 탐지 후보 (펼침 전 메모)'],
    ['펼침전_메모_반응', '펼침 전 메모 반응'],
    ['펼침전_해당문장_편집', '펼침 전 해당 문장 편집'],
  ];
  const cols = d.cases.rows.map((r) => `${esc(get(r, 'comment_type') === 's2' ? '② 댓글' : '요청 답변 댓글')} (${esc(get(r, 'comment_id'))})`);
  return `${table(['항목', ...cols], fields.map(([k, label]) => [label, ...d.cases.rows.map((r) => esc(get(r, k) === '' ? '-' : get(r, k)))]))}
  <p class="note">펼침 전 해당 문장 편집: ② 댓글은 ② 문장, 요청 답변 댓글은 어느 문장이든 첫 펼침 전에 고쳤는지예요. 편집 로그는 5초 단위로 모아 기록돼요.</p>`;
}

function tabTimeline(d, container) {
  const base = d.s5Start ?? (d.events[0] && d.events[0].ts) ?? 0;
  const kinds = [...new Set(d.events.map((e) => e.event))];
  const checked = new Set(kinds);
  container.innerHTML = `
    <p class="note">${d.s5Start ? 'S5 시작(screen_enter)을 00:00 으로 한 상대 시각이에요. S5 이전은 -mm:ss.' : 'S5 가 아직 시작되지 않아 첫 이벤트를 00:00 으로 했어요.'}</p>
    <div class="chips" id="chips">${kinds
      .map((k) => `<label><input type="checkbox" value="${esc(k)}" checked /> ${esc(k)}</label>`)
      .join('')}</div>
    <div id="tl"></div>`;
  const draw = () => {
    const rows = d.events
      .filter((e) => checked.has(e.event))
      .map((e) => {
        const det = e.detail == null ? '' : typeof e.detail === 'object' ? JSON.stringify(e.detail) : String(e.detail);
        return [`<span class="mono">${mmss(e.ts - base)}</span>`, esc(e.screen), esc(e.event), esc(e.target), `<div class="pre mono">${esc(det.length > 240 ? det.slice(0, 240) + '…' : det)}</div>`];
      });
    container.querySelector('#tl').innerHTML = `<p>${rows.length}개 이벤트</p>` + table(['상대 시각', '화면', '이벤트', '대상', '상세'], rows);
  };
  container.querySelector('#chips').onchange = (e) => {
    if (e.target.checked) checked.add(e.target.value);
    else checked.delete(e.target.value);
    draw();
  };
  draw();
}

function openPurgeDialog(id) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="dialog"></div>`;
  document.body.appendChild(ov);
  const box = ov.querySelector('.dialog');
  const close = () => ov.remove();
  const step1 = () => {
    box.innerHTML = `
      <h2 style="margin-top:0">철회 삭제 (1/2)</h2>
      <p><b>${esc(id)}</b> 참여자의 자료를 삭제합니다. 되돌릴 수 없어요.</p>
      <ul><li>data/${esc(id)} 폴더 전체</li><li>data/export 의 CSV 에서 해당 참여자 행</li><li>코딩 파일(coder1·2)의 해당 사례</li></ul>
      <div class="row"><button class="btn" id="c">취소</button><button class="btn danger" id="n">계속</button></div>`;
    box.querySelector('#c').onclick = close;
    box.querySelector('#n').onclick = step2;
  };
  const step2 = () => {
    box.innerHTML = `
      <h2 style="margin-top:0">철회 삭제 (2/2)</h2>
      <p>삭제하려면 참여자 번호 <b>${esc(id)}</b> 를 직접 입력하세요.</p>
      <input id="t" autocomplete="off" style="width:100%;padding:8px" />
      <div id="err"></div>
      <div class="row"><button class="btn" id="c">취소</button><button class="btn danger" id="go" disabled>철회 삭제</button></div>`;
    const input = box.querySelector('#t');
    const go = box.querySelector('#go');
    input.oninput = () => (go.disabled = input.value.trim() !== id);
    box.querySelector('#c').onclick = close;
    go.onclick = async () => {
      go.disabled = true;
      try {
        const r = await post('purge', { id, confirm: input.value.trim() });
        const csvLine = r.csv.map((c) => `${esc(c.file)} ${c.removed}행`).join(', ') || 'CSV 없음';
        const codingLine = r.coding.map((c) => `${esc(c.file)} ${c.removed}사례`).join(', ') || '코딩 파일 없음';
        box.innerHTML = `
          <h2 style="margin-top:0">삭제 완료</h2>
          <p>${esc(id)} 의 자료를 삭제했어요.</p>
          <p class="mono">폴더 ${r.folders}개 · ${csvLine} · ${codingLine}</p>
          <div class="alert"><b>해야 할 일:</b> 참여자에게 <b>이메일로 삭제 통지</b>를 보내 주세요. 녹음·녹화(사본 포함), 전사본, 동의서·확인서 등 이 앱 밖의 자료는 따로 삭제해야 해요.</div>
          <div class="row"><button class="btn primary" id="ok">세션 목록으로</button></div>`;
        box.querySelector('#ok').onclick = () => {
          close();
          location.hash = '#/list';
        };
      } catch (err) {
        if (err instanceof Stop) return close();
        box.querySelector('#err').innerHTML = `<div class="alert">${esc(err.message)}</div>`;
      }
    };
    input.focus();
  };
  step1();
}

async function viewDetail(id, tab) {
  const d = await api('participant/' + encodeURIComponent(id));
  const tabs = [['overview', '개요'], ['versions', '수정본'], ['memos', '메모'], ['panel', '패널 행동'], ['timeline', '타임라인']];
  const dl = (file, label) => `<a class="btn" href="/admin/api/download?file=${file}&id=${encodeURIComponent(id)}">${label}</a>`;
  shell(
    'list',
    `<p><a href="#/list">← 세션 목록</a></p>
    <h1>${esc(id)} <small style="font-weight:400">· ${posLabel(d.overview.position)} · 이벤트 ${d.summary.eventCount}개</small></h1>
    <div class="row">
      ${dl('events.csv', 'events.csv')}${dl('memos.csv', 'memos.csv')}${dl('cases.csv', 'cases.csv')}${dl('versions.csv', 'versions.csv')}${dl('session.json', `${esc(id)}_세션.json`)}
      <span style="flex:1"></span>
      <button class="btn danger" id="purge">철회 삭제</button>
    </div>
    ${d.summary.saved ? '' : '<div class="note">세션 파일(_세션.json)이 아직 없어요. 개요는 state.json 기준이에요.</div>'}
    <div class="tabs">${tabs.map(([k, l]) => `<a href="#/p/${esc(id)}/${k}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('')}</div>
    <div id="tab"></div>`,
  );
  document.getElementById('purge').onclick = () => openPurgeDialog(id);
  const box = document.getElementById('tab');
  if (tab === 'versions') box.innerHTML = tabVersions(d);
  else if (tab === 'memos') box.innerHTML = tabMemos(d);
  else if (tab === 'panel') box.innerHTML = tabPanel(d);
  else if (tab === 'timeline') tabTimeline(d, box);
  else box.innerHTML = tabOverview(d);
}

// ---------- 3. 사례 매트릭스 ----------
async function viewMatrix() {
  const d = await api('cases');
  const rows = d.rows.map((r) => r.map((c, i) => (i === 0 ? `<a href="#/p/${esc(c)}/panel">${esc(c)}</a>` : `<div class="pre">${esc(c)}</div>`)));
  shell('matrix', `<h1>사례 매트릭스 (참여자 × 댓글)</h1><p>cases.csv 와 같은 열이에요. 코더 열은 비어 있고, 코딩 결과는 ‘코딩’ 화면에서 입력해요.</p>${d.rows.length ? table(d.header, rows) : '<p>사례가 없어요.</p>'}`);
}

// ---------- 4. 코딩 ----------
const STAGES = ['인지', '해석', '작동', '반영'];
const BREAK = new Set(['아니오', '없음']);
function breakPoint(c) {
  c = c || {};
  for (const s of STAGES) {
    if (c[s] === undefined) return '미입력';
    if (BREAK.has(c[s])) return s;
  }
  return '끊김 없음';
}

async function viewCoding(mode) {
  const coder = sessionStorage.getItem('coder') || '1';
  const cases = await api('cases');
  const h = cases.header;
  const col = (r, n) => r[h.indexOf(n)];
  const keyOf = (r) => `${col(r, 'participant_id')}|${col(r, 'comment_id')}`;
  const tabsHtml = `<div class="tabs"><a href="#/coding" class="${mode !== 'compare' ? 'on' : ''}">입력</a><a href="#/coding/compare" class="${mode === 'compare' ? 'on' : ''}">비교</a></div>`;

  if (mode === 'compare') {
    const c = await api('coding?coder=compare');
    const rows = [];
    const mism = { 인지: 0, 해석: 0, 작동: 0, 반영: 0, 단절: 0 };
    for (const r of cases.rows) {
      const a = c['1'].cases[keyOf(r)] || {};
      const b = c['2'].cases[keyOf(r)] || {};
      const cells = [];
      for (const s of STAGES) {
        const diff = (a[s] ?? '') !== (b[s] ?? '');
        if (diff) mism[s]++;
        cells.push(`<span class="${diff ? 'mismatch' : ''}">${esc(a[s] ?? '-')}</span>`, `<span class="${diff ? 'mismatch' : ''}">${esc(b[s] ?? '-')}</span>`);
      }
      const ba = breakPoint(a);
      const bb = breakPoint(b);
      if (ba !== bb) mism.단절++;
      rows.push([esc(col(r, 'participant_id')), esc(col(r, 'comment_type') === 's2' ? '② 댓글' : '요청 답변'), ...cells, `<span class="${ba !== bb ? 'mismatch' : ''}">${esc(ba)}</span>`, `<span class="${ba !== bb ? 'mismatch' : ''}">${esc(bb)}</span>`]);
    }
    const head = ['참여자', '댓글'];
    STAGES.forEach((s) => head.push(`${s} 코더1`, `${s} 코더2`));
    head.push('단절 지점 코더1', '단절 지점 코더2');
    shell('coding', `<h1>코딩</h1>${tabsHtml}<div class="note">두 코더가 서로 다른 칸은 빨간 배경으로 표시돼요. 각자 입력을 끝낸 뒤 합의 단계에서 여세요.</div>
      <p>불일치: ${Object.entries(mism).map(([k, v]) => `${k} ${v}건`).join(' · ')}</p>${cases.rows.length ? table(head, rows) : '<p>사례가 없어요.</p>'}`);
    return;
  }

  const mine = await api('coding?coder=' + coder);
  const store = mine.cases;
  const rows = cases.rows.map((r) => {
    const k = keyOf(r);
    const cur = store[k] || {};
    const selects = STAGES.map(
      (s) =>
        `<select data-key="${esc(k)}" data-field="${s}"><option value="">-</option>${mine.fields[s].map((v) => `<option ${cur[s] === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>`,
    );
    return [
      `<a href="#/p/${esc(col(r, 'participant_id'))}/panel" target="_blank">${esc(col(r, 'participant_id'))}</a>`,
      esc(col(r, 'comment_type') === 's2' ? '② 댓글' : '요청 답변'),
      esc(col(r, '패널_화면노출_ms')),
      esc(col(r, '패널_hover_횟수')),
      esc(col(r, '펼침_횟수')),
      esc(col(r, '누적_펼침_ms')),
      esc(col(r, '3초이상_펼침')),
      esc(col(r, '자발적_탐지_후보(펼침전_메모)')),
      `<div class="pre">${esc(col(r, 'v1→v2_변경_문장번호') || '-')}</div>`,
      ...selects,
      `<b data-break="${esc(k)}">${esc(breakPoint(cur))}</b>`,
    ];
  });
  shell(
    'coding',
    `<h1>코딩</h1>${tabsHtml}
    <div class="row">코더: <select id="coder"><option value="1" ${coder === '1' ? 'selected' : ''}>코더 1</option><option value="2" ${coder === '2' ? 'selected' : ''}>코더 2</option></select>
    <span>선택하면 바로 data/coding/coder${coder}.json 에 저장돼요. 이 화면에는 다른 코더의 입력이 보이지 않아요.</span></div>
    ${cases.rows.length ? table(['참여자', '댓글', '패널 노출 ms', '패널 hover', '펼침 횟수', '누적 펼침 ms', '3초 이상', '자발적 후보', '변경 문장', ...STAGES, '단절 지점'], rows) : '<p>사례가 없어요.</p>'}
    <p class="note">단절 지점: 앞 단계부터 보아 ‘아니오’ 또는 ‘없음’인 첫 단계예요. 모두 입력되기 전에는 ‘미입력’, 끊긴 곳이 없으면 ‘끊김 없음’이에요.</p>`,
  );
  document.getElementById('coder').onchange = (e) => {
    sessionStorage.setItem('coder', e.target.value);
    route();
  };
  app.querySelectorAll('select[data-key]').forEach((sel) => {
    sel.onchange = async () => {
      const k = sel.dataset.key;
      try {
        await post('coding', { coder, key: k, field: sel.dataset.field, value: sel.value });
        store[k] = store[k] || {};
        if (sel.value === '') delete store[k][sel.dataset.field];
        else store[k][sel.dataset.field] = sel.value;
        app.querySelector(`[data-break="${CSS.escape(k)}"]`).textContent = breakPoint(store[k]);
      } catch (err) {
        if (!(err instanceof Stop)) alert('저장하지 못했어요: ' + err.message);
      }
    };
  });
}

// ---------- 5. 내보내기 ----------
async function viewExport() {
  const list = await api('list');
  const dl = (file) => `<a class="btn" href="/admin/api/download?file=${file}&id=all">${file}</a>`;
  shell(
    'export',
    `<h1>내보내기</h1>
    <h2>전체 참여자 다운로드</h2>
    <div class="row">${['events.csv', 'memos.csv', 'cases.csv', 'versions.csv'].map(dl).join('')}</div>
    <p>참여자별 파일은 세션 목록에서 참여자를 눌러 내려받아요.</p>
    <h2>export 실행 (npm run export 와 같음)</h2>
    <p>data/export/ 에 CSV 4종을 만들어요.</p>
    <div class="row">
      <select id="who"><option value="all">전체 (${list.rows.length}명)</option>${list.rows.map((r) => `<option>${esc(r.id)}</option>`).join('')}</select>
      <button class="btn primary" id="run">export 실행</button>
    </div>
    <pre class="mono" id="out" style="background:#fff;border:1px solid #ddd;padding:10px;white-space:pre-wrap"></pre>`,
  );
  document.getElementById('run').onclick = async () => {
    const out = document.getElementById('out');
    out.textContent = '실행 중…';
    try {
      const r = await post('export', { id: document.getElementById('who').value });
      out.textContent = r.lines.join('\n');
    } catch (err) {
      if (!(err instanceof Stop)) out.textContent = err.message;
    }
  };
}

// ---------- 라우터 ----------
async function route() {
  try {
    const st = await api('status');
    if (!st.authed) return showLogin();
    warnBar.hidden = false;
    const parts = (location.hash || '#/list').split('/');
    const page = parts[1] || 'list';
    if (page === 'p' && parts[2]) return await viewDetail(decodeURIComponent(parts[2]), parts[3] || 'overview');
    if (page === 'matrix') return await viewMatrix();
    if (page === 'coding') return await viewCoding(parts[2]);
    if (page === 'export') return await viewExport();
    return await viewList();
  } catch (err) {
    if (err instanceof Stop) return;
    shell('', `<div class="alert">${esc(err.message)}</div>`);
  }
}
window.addEventListener('hashchange', route);
route();
