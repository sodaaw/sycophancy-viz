// 연구자용 페이지(/admin) 서버 쪽. 참여자 앱 코드와 분리되어 있고, 기존 data/ 폴더만 읽고 쓴다.
// Node 내장 모듈만 사용. 외부로 아무것도 전송하지 않는다.
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DATA, ID_RE, buildCases, buildExport, caseHeader, listIds, readEvents, readJson, readParticipant, writeExport,
  EXPECTED_EVENTS, loadCoding,
} from './scripts/lib/analysis.js';
import { FIELDS as CODING_FIELDS } from './scripts/lib/coding-rules.js';
import { purgeParticipant } from './scripts/lib/purge.js';
import { DEMO } from './demo.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_DIR = path.join(ROOT, 'admin');
const ACTIVE_MINUTES = Number(process.env.ADMIN_ACTIVE_MINUTES || 30);

// ---------- PIN: 실행 인자 > 환경변수 > .env (코드에 하드코딩하지 않는다) ----------
function loadPin() {
  const arg = process.argv.find((a) => a.startsWith('--admin-pin='));
  if (arg) return arg.slice('--admin-pin='.length);
  if (process.env.ADMIN_PIN) return process.env.ADMIN_PIN;
  const envFile = path.join(ROOT, '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*ADMIN_PIN\s*=\s*(.*?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, '');
    }
  }
  return '';
}
const PIN = loadPin();
const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();
if (!PIN) console.warn('[admin] PIN 이 설정되지 않아 /admin 이 비활성화되어 있어요 (.env 의 ADMIN_PIN 또는 --admin-pin=).');

let fails = []; // 최근 로그인 실패 시각

const SESSION_MS = 60 * 60 * 1000;

// 서버리스(인스턴스가 바뀌는 환경)에서도 로그인이 유지되도록, 서버에 세션을 저장하지 않고 서명된 토큰을 쓴다.
const SECRET = crypto.createHash('sha256').update(`admin-session:${PIN}`).digest();
const sign = (exp) => crypto.createHmac('sha256', SECRET).update(String(exp)).digest('hex');
const makeToken = () => {
  const exp = Date.now() + SESSION_MS;
  return `${exp}.${sign(exp)}`;
};
function getToken(req) {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)admin_sid=(\d+\.[a-f0-9]+)/);
  return m ? m[1] : null;
}
function isAuthed(req) {
  const t = getToken(req);
  if (!t) return false;
  const [exp, sig] = t.split('.');
  const good = sign(exp);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return false;
  return Number(exp) > Date.now();
}
const cookie = (req, value, maxAge) =>
  `admin_sid=${value}; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=${maxAge}${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`;

// ---------- 진행 중인 세션 ----------
// 저장 전(savedTs 없음) 상태이고 최근 ACTIVE_MINUTES 분 안에 갱신된 세션이 있으면 진행 중으로 본다.
function isBusy() {
  if (DEMO) return false; // 데모에는 실제 세션이 없다
  const limit = Date.now() - ACTIVE_MINUTES * 60 * 1000;
  for (const id of listIds()) {
    const f = path.join(DATA, id, 'state.json');
    if (!fs.existsSync(f)) continue;
    let saved = false;
    try {
      saved = !!JSON.parse(fs.readFileSync(f, 'utf8')).savedTs;
    } catch {
      /* 읽지 못하면 수정 시각만 본다 */
    }
    if (!saved && fs.statSync(f).mtimeMs > limit) return true;
  }
  return false;
}

// ---------- 공통 ----------
const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};
const html = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
};
const readBody = (req) =>
  new Promise((resolve, reject) => {
    // Vercel 은 본문을 미리 읽어 req.body 에 둔다
    if (req.body !== undefined) return resolve(typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body));
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 1024 * 1024) {
        reject(new Error('body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

const BUSY_HTML = '<!doctype html><meta charset="utf-8"><title>세션 진행 중</title><body style="font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0"><p style="font-size:20px">세션 진행 중</p></body>';

const readContent = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'content.json'), 'utf8'));

// ---------- 데이터 조립 ----------
function sourceOf(id) {
  const saved = readJson(path.join(DATA, id, `${id}_세션.json`));
  const state = readJson(path.join(DATA, id, 'state.json')) || {};
  return { saved, state, src: saved || state };
}

function summarize(id) {
  const events = readEvents(id);
  const { saved, state, src } = sourceOf(id);
  const counts = {};
  for (const e of events) counts[e.event] = (counts[e.event] || 0) + 1;
  const first = events.length ? events[0].timestamp_ms : state.startedTs ?? null;
  const s6 = events.find((e) => e.event === 'screen_enter' && e.screen === 'S6');
  const last = events.length ? events[events.length - 1].timestamp_ms : null;
  const end = s6 ? s6.timestamp_ms : last;
  return {
    id,
    position: src.position ?? null,
    setKey: src.setKey ?? null,
    start: first,
    end,
    completed: !!s6,
    durationMs: first && end ? end - first : null,
    saved: !!saved,
    eventCount: events.length,
    kinds: Object.fromEntries(EXPECTED_EVENTS.map((k) => [k, !!counts[k]])),
  };
}

function detail(id) {
  const content = readContent();
  const events = readEvents(id);
  const p = readParticipant(id);
  const { saved, state, src } = sourceOf(id);
  const set = src.setKey;

  const answers = (record, texts, prefix) =>
    texts.map((text, i) => ({ id: `${prefix}${i + 1}`, text, value: (record || {})[`${prefix}${i + 1}`] ?? null }));
  const premise = set ? answers(src.premise, content.premiseItems[set], `${set}-pre-`) : [];
  const common = answers(src.common, content.commonItems, 'common-');
  let trust;
  if (Array.isArray(saved?.trust)) trust = saved.trust.map((t) => ({ id: t.id, text: t.text, value: t.value ?? null }));
  else {
    const order = state.orders?.trust || content.survey.trust.items.map((_, i) => `trust-${i + 1}`);
    trust = order.map((tid) => ({
      id: tid,
      text: content.survey.trust.items[Number(tid.split('-')[1]) - 1],
      value: (state.trust || {})[tid] ?? null,
    }));
  }
  const s5 = events.find((e) => e.event === 'screen_enter' && e.screen === 'S5');
  return {
    summary: summarize(id),
    overview: {
      position: src.position ?? null,
      setKey: set ?? null,
      confidence: src.confidence ?? null,
      premise,
      common,
      trust,
      screenTimesMs: saved?.screenTimesMs || state.screenTimes || {},
    },
    versions: { v1: p.v1, v2: p.v2 },
    memos: { current: p.memos, deleted: p.deleted },
    cases: { header: caseHeader, rows: buildCases(id, p, events, loadCoding()) },
    events: events.map((e) => ({ ts: e.timestamp_ms, screen: e.screen, event: e.event, target: e.target, detail: e.detail })),
    s5Start: s5 ? s5.timestamp_ms : null,
  };
}

// ---------- 코딩 ----------
const CODING_DIR = path.join(DATA, 'coding');
const codingFile = (n) => path.join(CODING_DIR, n === 'consensus' ? 'consensus.json' : `coder${n}.json`);
const readCoding = (n) => readJson(codingFile(n)) || { coder: n === 'consensus' ? 'consensus' : Number(n), cases: {} };
const interviewFile = path.join(CODING_DIR, 'interview.json');
const readInterview = () => readJson(interviewFile) || { participants: {} };
const writeJson = async (file, obj) => {
  await fsp.mkdir(CODING_DIR, { recursive: true });
  await fsp.writeFile(`${file}.tmp`, JSON.stringify(obj, null, 2));
  await fsp.rename(`${file}.tmp`, file);
};

// ---------- 라우터 ----------
export async function handleAdmin(req, res, url) {
  // DNS 리바인딩 방지: localhost 로 접속한 요청만 받는다
  if (!DEMO && !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')) return json(res, 403, { error: 'forbidden' });
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  if (!PIN) return html(res, 404, 'not found');

  // 페이지와 정적 파일
  if (!pathname.startsWith('/admin/api')) {
    if (isBusy()) return html(res, 423, BUSY_HTML);
    const file = pathname === '/admin' ? 'index.html' : pathname.slice('/admin/'.length);
    if (!['index.html', 'admin.js', 'admin.css', 'coding-rules.js'].includes(file)) return html(res, 404, 'not found');
    const type = file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    return res.end(await fsp.readFile(file === 'coding-rules.js' ? path.join(ROOT, 'scripts', 'lib', file) : path.join(ADMIN_DIR, file)));
  }

  const route = pathname.slice('/admin/api/'.length);
  const method = req.method;

  if (route === 'status' && method === 'GET') {
    const busy = isBusy();
    return json(res, busy ? 423 : 200, busy ? { busy: true } : { busy: false, authed: isAuthed(req), demo: DEMO });
  }
  if (isBusy()) return json(res, 423, { busy: true });

  if (route === 'login' && method === 'POST') {
    fails = fails.filter((t) => t > Date.now() - 60000);
    if (fails.length >= 5) return json(res, 429, { error: '잠시 후 다시 시도해 주세요' });
    const body = JSON.parse((await readBody(req)) || '{}');
    if (!crypto.timingSafeEqual(digest(body.pin ?? ''), digest(PIN))) {
      fails.push(Date.now());
      return json(res, 401, { error: 'PIN 이 맞지 않아요' });
    }
    res.setHeader('Set-Cookie', cookie(req, makeToken(), SESSION_MS / 1000));
    return json(res, 200, { ok: true });
  }
  if (route === 'logout' && method === 'POST') {
    res.setHeader('Set-Cookie', cookie(req, '', 0));
    return json(res, 200, { ok: true });
  }

  if (!isAuthed(req)) return json(res, 401, { error: 'PIN 이 필요해요' });

  try {
    if (route === 'list' && method === 'GET') {
      const rows = listIds().map(summarize);
      const positions = { relative: 0, absolute: 0 };
      for (const r of rows) if (r.position in positions) positions[r.position]++;
      return json(res, 200, { rows, positions, expected: EXPECTED_EVENTS });
    }

    if (route.startsWith('participant/') && method === 'GET') {
      const id = route.split('/')[1];
      if (!ID_RE.test(id) || !fs.existsSync(path.join(DATA, id))) return json(res, 404, { error: '없는 참여자예요' });
      return json(res, 200, detail(id));
    }

    if (route === 'cases' && method === 'GET') {
      const r = buildExport(listIds());
      return json(res, 200, { header: caseHeader, rows: r.caseRows });
    }

    if (route === 'download' && method === 'GET') {
      const file = url.searchParams.get('file');
      const id = url.searchParams.get('id') || 'all';
      if (id !== 'all' && !ID_RE.test(id)) return json(res, 400, { error: 'invalid id' });
      let body;
      let name;
      if (file === 'session.json') {
        const f = path.join(DATA, id, `${id}_세션.json`);
        if (id === 'all' || !fs.existsSync(f)) return json(res, 404, { error: '저장된 세션 파일이 없어요' });
        body = fs.readFileSync(f);
        name = `${id}_세션.json`;
      } else {
        const r = buildExport(id === 'all' ? listIds() : [id]);
        if (!r.csv[file]) return json(res, 400, { error: 'invalid file' });
        body = r.csv[file];
        name = id === 'all' ? file : `${id}_${file}`;
      }
      res.writeHead(200, {
        'Content-Type': file === 'session.json' ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
        'Cache-Control': 'no-store',
      });
      return res.end(body);
    }

    if (route === 'export' && method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const id = body.id || 'all';
      if (id !== 'all' && !ID_RE.test(id)) return json(res, 400, { error: 'invalid id' });
      const ids = id === 'all' ? listIds() : [id];
      if (!ids.length) return json(res, 400, { error: '내보낼 참여자가 없어요' });
      return json(res, 200, { lines: writeExport(ids).lines });
    }

    if (route === 'coding' && method === 'GET') {
      const coder = url.searchParams.get('coder');
      const interview = readInterview().participants;
      if (coder === 'compare') {
        return json(res, 200, { 1: readCoding(1), 2: readCoding(2), consensus: readCoding('consensus'), fields: CODING_FIELDS, interview });
      }
      if (!['1', '2'].includes(coder)) return json(res, 400, { error: 'invalid coder' });
      return json(res, 200, { ...readCoding(coder), fields: CODING_FIELDS, interview });
    }

    if (route === 'coding' && method === 'POST') {
      const b = JSON.parse((await readBody(req)) || '{}');
      const key = String(b.key || '');
      const coder = String(b.coder);
      if (!['1', '2', 'consensus'].includes(coder) || !/^S2-P\d{2,3}\|[AB]1-(2|R)$/.test(key)) return json(res, 400, { error: 'invalid' });
      if (!CODING_FIELDS[b.field] || (b.value !== '' && !CODING_FIELDS[b.field].includes(b.value))) return json(res, 400, { error: 'invalid value' });
      const id = key.split('|')[0];
      if (!fs.existsSync(path.join(DATA, id))) return json(res, 404, { error: '없는 참여자예요' });
      const j = readCoding(coder);
      const c = (j.cases[key] = j.cases[key] || {});
      if (b.value === '') delete c[b.field];
      else c[b.field] = b.value;
      j.updatedAt = Date.now();
      await writeJson(codingFile(coder), j);
      return json(res, 200, { ok: true });
    }

    // 인터뷰 문항 8 점수 (참여자별): panel = 접힌 안내(회색 표시), memo = 메모 기능, 1~5
    if (route === 'interview' && method === 'POST') {
      const b = JSON.parse((await readBody(req)) || '{}');
      const v = b.value === '' ? '' : Number(b.value);
      if (!ID_RE.test(String(b.id)) || !['panel', 'memo'].includes(b.field) || (v !== '' && !(Number.isInteger(v) && v >= 1 && v <= 5))) {
        return json(res, 400, { error: 'invalid' });
      }
      if (!fs.existsSync(path.join(DATA, b.id))) return json(res, 404, { error: '없는 참여자예요' });
      const j = readInterview();
      const p = (j.participants[b.id] = j.participants[b.id] || {});
      if (v === '') delete p[b.field];
      else p[b.field] = v;
      await writeJson(interviewFile, j);
      return json(res, 200, { ok: true });
    }

    if (route === 'purge' && method === 'POST') {
      const b = JSON.parse((await readBody(req)) || '{}');
      if (!ID_RE.test(String(b.id)) || b.confirm !== b.id) return json(res, 400, { error: '참여자 번호를 정확히 입력해야 해요' });
      return json(res, 200, { ok: true, ...purgeParticipant(b.id) });
    }
  } catch (err) {
    console.error(err);
    return json(res, 500, { error: String(err.message || err) });
  }
  return json(res, 404, { error: 'not found' });
}
