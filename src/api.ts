import type { LogRow, Session } from './types';

const PENDING_KEY = 'study2_pending_logs';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
      const res = await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
        keepalive: true,
      });
      if (!res.ok) throw new Error(String(res.status));
      queue.splice(0, batch.length);
      persistQueue();
    } catch {
      persistQueue();
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

export function drainLogs(): Promise<void> {
  if (!queue.length && !sending) return Promise.resolve();
  void pump();
  return new Promise((resolve) => waiters.push(resolve));
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
      const res = await fetch(`/api/state/${snapshot.pid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
        keepalive: true,
      });
      if (!res.ok) throw new Error(String(res.status));
      if (!stateDirty) break;
    } catch {
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

export async function flushState(): Promise<void> {
  window.clearTimeout(stateTimer);
  await putState();
  while (stateSaving) await sleep(30);
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
  const res = await fetch(`/api/save/${id}`, {
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
