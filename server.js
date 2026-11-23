// 정적 서빙 + 저장 API. Node 내장 모듈만 사용. 외부 네트워크 요청 없음.
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleAdmin } from './server-admin.js';
import { DATA_DIR, DEMO } from './demo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, 'dist');
const DATA = DATA_DIR;
const PORT = Number(process.env.PORT || 3000);
const HOST = '127.0.0.1'; // 이 노트북 안에서만 접속 가능
const ID_RE = /^S2-P\d{2,3}$/;
const MAX_BODY = 8 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const dirOf = (id) => path.join(DATA, id);
const sessionFile = (id) => path.join(dirOf(id), `${id}_세션.json`);
const eventsFile = (id) => path.join(dirOf(id), 'events.jsonl');
const stateFile = (id) => path.join(dirOf(id), 'state.json');

const exists = async (p) => {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
};

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  if (req.body !== undefined) return Promise.resolve(typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body));
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function writeAtomic(file, text) {
  const tmp = `${file}.tmp`;
  await fsp.writeFile(tmp, text, 'utf8');
  await fsp.rename(tmp, file);
}

// 로그 append는 한 번에 하나씩 (순서 보장)
let logChain = Promise.resolve();
function appendLog(id, lines) {
  logChain = logChain.then(async () => {
    await fsp.mkdir(dirOf(id), { recursive: true });
    await fsp.appendFile(eventsFile(id), lines, 'utf8');
  });
  return logChain;
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const action = parts[1];
  const id = parts[2];
  const method = req.method;

  if (action === 'health') return send(res, 200, { ok: true, demo: DEMO });

  // 데모 모드: 참여자 입력은 어디에도 저장하지 않는다 (받아서 버린다)
  if (DEMO && ['log', 'state', 'save', 'reset', 'info'].includes(action)) {
    if (method === 'GET' && action === 'state') return send(res, 404, { error: 'demo' });
    if (method === 'GET' && action === 'info') return send(res, 200, { exists: false, hasState: false, hasEvents: false, hasSaved: false, files: [] });
    await readBody(req);
    return send(res, 200, { ok: true, events: 0 });
  }

  if (action === 'log' && method === 'POST') {
    const body = JSON.parse((await readBody(req)) || 'null');
    const rows = Array.isArray(body) ? body : [body];
    const byId = new Map();
    for (const r of rows) {
      if (!r || !ID_RE.test(String(r.participant_id))) continue;
      const list = byId.get(r.participant_id) || [];
      list.push(JSON.stringify(r));
      byId.set(r.participant_id, list);
    }
    for (const [pid, list] of byId) await appendLog(pid, list.join('\n') + '\n');
    return send(res, 200, { ok: true, n: rows.length });
  }

  if (!id || !ID_RE.test(id)) return send(res, 400, { error: 'invalid id' });

  if (action === 'info' && method === 'GET') {
    const hasDir = await exists(dirOf(id));
    let files = [];
    if (hasDir) files = await fsp.readdir(dirOf(id));
    return send(res, 200, {
      exists: hasDir && files.length > 0,
      hasState: files.includes('state.json'),
      hasEvents: files.includes('events.jsonl'),
      hasSaved: files.includes(`${id}_세션.json`),
      files,
    });
  }

  if (action === 'state' && method === 'GET') {
    if (!(await exists(stateFile(id)))) return send(res, 404, { error: 'no state' });
    return send(res, 200, await fsp.readFile(stateFile(id), 'utf8'));
  }

  if (action === 'state' && (method === 'PUT' || method === 'POST')) {
    const text = await readBody(req);
    JSON.parse(text); // 검증
    await fsp.mkdir(dirOf(id), { recursive: true });
    await writeAtomic(stateFile(id), text);
    return send(res, 200, { ok: true });
  }

  if (action === 'save' && method === 'POST') {
    const text = await readBody(req);
    JSON.parse(text);
    await logChain; // 대기 중인 로그 append 완료 보장
    if (!(await exists(eventsFile(id)))) return send(res, 409, { error: 'events.jsonl 없음' });
    const stat = await fsp.stat(eventsFile(id));
    if (stat.size === 0) return send(res, 409, { error: 'events.jsonl 비어 있음' });
    await writeAtomic(sessionFile(id), text);
    const n = (await fsp.readFile(eventsFile(id), 'utf8')).split('\n').filter(Boolean).length;
    return send(res, 200, { ok: true, events: n });
  }

  if (action === 'reset' && method === 'POST') {
    // 암호화 저장소로 옮긴 것을 진행자가 확인한 뒤에만 호출된다
    // 연구 규정 변경: 지우지 않고 S2-P01_r1 처럼 이름만 바꿔 보관한다 (연구자 페이지에서 계속 분석 가능)
    if (await exists(dirOf(id))) {
      let n = 1;
      while (await exists(path.join(DATA_DIR, `${id}_r${n}`))) n++;
      await fsp.rename(dirOf(id), path.join(DATA_DIR, `${id}_r${n}`));
    }
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: 'not found' });
}

async function handleStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  let file = path.normalize(path.join(DIST, rel));
  if (!file.startsWith(DIST)) return send(res, 403, 'forbidden', 'text/plain');
  if (!(await exists(file))) file = path.join(DIST, 'index.html');
  if (!(await exists(file))) {
    return send(res, 500, '먼저 npm run build 를 실행해 주세요.', 'text/plain; charset=utf-8');
  }
  const type = MIME[path.extname(file)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

export async function handler(req, res) {
  try {
    // Vercel: 모든 요청이 /api/server?p=<원래 경로> 로 다시 쓰여서 들어온다 (vercel.json 참고)
    const raw = new URL(req.url, 'http://x');
    if (raw.pathname === '/api/server' && raw.searchParams.has('p')) {
      const original = raw.searchParams.get('p');
      raw.searchParams.delete('p');
      req.url = original + raw.search;
    }
    const url = new URL(req.url, `http://${HOST}`);
    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) return await handleAdmin(req, res, url);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return await handleStatic(req, res, url);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) send(res, 500, { error: String(err.message || err) });
  }
}

const server = http.createServer(handler);

await fsp.mkdir(DATA, { recursive: true });
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) server.listen(PORT, HOST, () => {
  console.log(`실험 앱 실행 중: http://localhost:${PORT}`);
});
