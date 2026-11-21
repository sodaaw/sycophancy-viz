import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { shuffled } from './components/Controls';
import { content } from './content';
import type { ScreenId, Session } from './types';
import { clearLatestState, drainLogs, enqueueLog, flushState, resetParticipant, getState, resumePendingLogs, scheduleStateSave } from './api';

type Hook = () => void;

interface Ctx {
  session: Session | null;
  update: (fn: (s: Session) => Session) => void;
  log: (event: string, target: string, detail?: unknown) => void;
  go: (next: ScreenId) => void;
  registerExit: (fn: Hook) => () => void;
  start: (pid: string) => void;
  restore: (pid: string) => Promise<boolean>;
  endSession: (deleteData?: boolean) => void;
}

const SessionCtx = createContext<Ctx>(null as unknown as Ctx);
export const useSession = () => useContext(SessionCtx);

export const SCREEN_ORDER: ScreenId[] = ['S1-intro', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6'];

const newSession = (pid: string): Session => ({
  pid,
  screen: 'S1-intro',
  introIdx: 0,
  startedTs: Date.now(),
  trust: {},
  orders: { trust: shuffled(content.survey.trust.items.map((_, i) => `trust-${i + 1}`)), agree: [], agreeSet: null },
  practiceMarkerOpened: false,
  position: null,
  confidence: null,
  premise: {},
  common: {},
  setKey: null,
  draft: [],
  v1: null,
  v2: null,
  feedbackRequested: false,
  feedbackShownTs: null,
  memos: [],
  deletedMemos: [],
  panels: {},
  screenTimes: {},
  screenEnterTs: null,
  savedTs: null,
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const ref = useRef<Session | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const exitHooks = useRef(new Set<Hook>());

  const commit = useCallback((s: Session, immediate = false) => {
    ref.current = s;
    setSession(s);
    scheduleStateSave(s, immediate);
  }, []);

  const update = useCallback(
    (fn: (s: Session) => Session) => {
      if (ref.current) commit(fn(ref.current));
    },
    [commit],
  );

  const log = useCallback((event: string, target: string, detail: unknown = null) => {
    const s = ref.current;
    if (!s) return;
    enqueueLog({
      participant_id: s.pid,
      timestamp_ms: Date.now(),
      screen: s.screen,
      event,
      target,
      detail,
    });
  }, []);

  const registerExit = useCallback((fn: Hook) => {
    exitHooks.current.add(fn);
    return () => {
      exitHooks.current.delete(fn);
    };
  }, []);

  // 현재 화면을 떠날 때: 미처리 로그 flush → screen_exit → 소요 시간 누적
  const leave = useCallback(
    (reason: string): Session | null => {
      const s = ref.current;
      if (!s) return null;
      exitHooks.current.forEach((fn) => fn());
      const ms = s.screenEnterTs ? Date.now() - s.screenEnterTs : 0;
      log('screen_exit', s.screen, { ms, reason });
      return {
        ...s,
        screenEnterTs: null,
        screenTimes: { ...s.screenTimes, [s.screen]: (s.screenTimes[s.screen] || 0) + ms },
      };
    },
    [log],
  );

  const go = useCallback(
    (next: ScreenId) => {
      const left = leave('next');
      if (!left) return;
      const entered: Session = { ...left, screen: next, screenEnterTs: Date.now() };
      commit(entered, true);
      log('screen_enter', next, null);
    },
    [commit, leave, log],
  );

  const start = useCallback(
    (pid: string) => {
      const s = { ...newSession(pid), screenEnterTs: Date.now() };
      commit(s, true);
      history.replaceState(null, '', `?id=${pid}`);
      log('screen_enter', s.screen, null);
    },
    [commit, log],
  );

  const restore = useCallback(
    async (pid: string) => {
      const saved = await getState(pid);
      if (!saved) return false;
      const s: Session = { ...saved, screenEnterTs: Date.now() };
      commit(s, true);
      history.replaceState(null, '', `?id=${pid}`);
      log('screen_enter', s.screen, { restored: true });
      for (const [id, p] of Object.entries(s.panels)) {
        if (p.open) log('panel_expand', id, { restored: true });
      }
      return true;
    },
    [commit, log],
  );

  const endSession = useCallback((deleteData = false) => {
    if (deleteData) {
      const pid = ref.current?.pid;
      void (async () => {
        await flushState();
        clearLatestState();
        await drainLogs();
        if (pid) await resetParticipant(pid);
        ref.current = null;
        setSession(null);
        history.replaceState(null, '', location.pathname);
      })();
      return;
    }
    const left = leave('end');
    if (left) scheduleStateSave(left, true);
    void flushState().then(() => {
      clearLatestState();
      ref.current = null;
      setSession(null);
      history.replaceState(null, '', location.pathname);
    });
  }, [leave]);

  // 새로고침/창 닫힘: 로그와 상태를 남긴다
  useEffect(() => {
    resumePendingLogs();
    const onHide = () => {
      const left = leave('unload');
      if (left) {
        ref.current = left;
        scheduleStateSave(left, true);
      }
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [leave]);

  // 뒤로가기 차단
  useEffect(() => {
    history.pushState(null, '', location.href);
    const onPop = () => history.pushState(null, '', location.href);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const value = useMemo(
    () => ({ session, update, log, go, registerExit, start, restore, endSession }),
    [session, update, log, go, registerExit, start, restore, endSession],
  );
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}
