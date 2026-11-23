import type { LogRow, Session } from './types';

const PENDING_KEY = 'study2_pending_logs';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// keepalive 옵션은 쓰지 않는다: 브라우저가 일정량의 keepalive 요청이 쌓이면 이후 모든 요청을 즉시 거부해 전송이 영구 중단된 적이 있다.
// 응답이 없는 요청이 전송 루프 전체를 멈추지 않도록 시간 제한을 둔다
function fetchT(url: string, init: RequestInit, ms = 8000): Promise<Response> {
  const ctl = new AbortController();
  const t = window.setTimeout(() => ctl.abort(), ms);
  return fetch(url, { ...init, signal: ctl.signal }).finally(() => window.clearTimeout(t));
}

// 서버에 아직 못 보낸 기록이 있는지 화면에 알리기 위한 상태
let failing = false;
function setFailing(v: boolean) {
  if (failing === v) return;
  failing = v;
  window.dispatchEvent(new CustomEvent('study2-sync', { detail: v }));
}
export const isSyncFailing = () => failing;

// ---------- 로그 큐 (순서 보장, 실패 시 재시도) ----------
let queue: LogRow[] = [];
let sending = false;
let waiters: Array<() => void> = [];

try {
  const saved = localStorage.getItem(PENDING_KEY);
  if (saved) queue = JSON.parse(saved);
} catch {
  /* ignore */
}

function persistQueue() {
  try {
    if (queue.length) localStorage.setItem(PENDING_KEY, JSON.stringify(queue));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

async function pump() {
  if (sending) return;
  sending = true;
  while (queue.length) {
    const batch = queue.slice(0, 100);
    try {
      const res = await fetchT('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
      });
      if (!res.ok) throw new Error(String(res.status));
      queue.splice(0, batch.length);
      persistQueue();
      setFailing(false);
    } catch {
      persistQueue();
      setFailing(true);
      await sleep(1000);
    }
  }
  sending = false;
  waiters.forEach((w) => w());
  waiters = [];
}

export function enqueueLog(row: LogRow) {
  queue.push(row);
  persistQueue();
  void pump();
}

export function drainLogs(timeoutMs = 0): Promise<void> {
  if (!queue.length && !sending) return Promise.resolve();
  void pump();
  const done = new Promise<void>((resolve) => waiters.push(resolve));
  if (!timeoutMs) return done;
  return Promise.race([
    done,
    new Promise<void>((_, rej) => window.setTimeout(() => rej(new Error('서버에 연결되지 않아 기록을 다 보내지 못했어요. 잠시 뒤 다시 눌러 주세요')), timeoutMs)),
  ]);
}

export function resumePendingLogs() {
  if (queue.length) void pump();
}

// ---------- 상태 저장 ----------
let stateTimer: number | undefined;
let latest: Session | null = null;
let stateSaving = false;
let stateDirty = false;

async function putState() {
  if (stateSaving) {
    stateDirty = true;
    return;
  }
  stateSaving = true;
  while (latest) {
    const snapshot = latest;
    stateDirty = false;
    try {
      const res = await fetchT(`/api/state/${snapshot.pid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      });
      if (!res.ok) throw new Error(String(res.status));
      setFailing(false);
      if (!stateDirty) break;
    } catch {
      setFailing(true);
      await sleep(1000);
    }
  }
  stateSaving = false;
}

export function scheduleStateSave(s: Session, immediate = false) {
  latest = s;
  window.clearTimeout(stateTimer);
  if (immediate) void putState();
  else stateTimer = window.setTimeout(() => void putState(), 200);
}

export async function flushState(timeoutMs = 0): Promise<void> {
  window.clearTimeout(stateTimer);
  const t0 = Date.now();
  void putState();
  while (stateSaving) {
    if (timeoutMs && Date.now() - t0 > timeoutMs) throw new Error('서버에 연결되지 않아 진행 상태를 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요');
    await sleep(30);
  }
}

export function clearLatestState() {
  latest = null;
  window.clearTimeout(stateTimer);
}

// ---------- 기타 API ----------
export async function getInfo(id: string) {
  const res = await fetch(`/api/info/${id}`);
  return (await res.json()) as {
    exists: boolean;
    hasState: boolean;
    hasEvents: boolean;
    hasSaved: boolean;
    files: string[];
  };
}

export async function getState(id: string): Promise<Session | null> {
  const res = await fetch(`/api/state/${id}`);
  if (!res.ok) return null;
  return (await res.json()) as Session;
}

export async function resetParticipant(id: string) {
  await fetch(`/api/reset/${id}`, { method: 'POST' });
}

export async function saveSessionFile(id: string, payload: unknown) {
  const res = await fetchT(`/api/save/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || String(res.status));
  }
  return (await res.json()) as { ok: boolean; events: number };
}
