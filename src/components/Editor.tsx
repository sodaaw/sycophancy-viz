import { useEffect, useLayoutEffect, useRef } from 'react';
import { useSession } from '../session';

const MARKS = ['①', '②', '③', '④'];

function Block({ index, value, onChange }: { index: number; value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <div className="editor-block">
      <label className="editor-mark" htmlFor={`sent-${index}`}>
        {MARKS[index]}
      </label>
      <textarea
        id={`sent-${index}`}
        ref={ref}
        rows={2}
        value={value}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// 문장 ①~④. 변경은 5초 단위로 모아 로그, 화면 이탈·제출 시 flush
export function Editor() {
  const { session, update, log, registerExit } = useSession();
  const pending = useRef<Record<number, { before: string; after: string }>>({});
  const timer = useRef<number | undefined>(undefined);

  const flush = () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    for (const [n, c] of Object.entries(pending.current)) {
      if (c.before !== c.after) log('editor_change', String(Number(n) + 1), { before: c.before, after: c.after });
    }
    pending.current = {};
  };

  useEffect(() => {
    const unreg = registerExit(flush);
    return () => {
      unreg();
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 제출 직전에 부를 수 있도록 전역에 노출
  useEffect(() => {
    (window as unknown as { __flushEditor?: () => void }).__flushEditor = flush;
    return () => {
      delete (window as unknown as { __flushEditor?: () => void }).__flushEditor;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const change = (i: number, next: string) => {
    const before = session!.draft[i];
    const p = pending.current[i];
    pending.current[i] = { before: p ? p.before : before, after: next };
    if (timer.current === undefined) timer.current = window.setTimeout(flush, 5000);
    update((s) => ({ ...s, draft: s.draft.map((t, k) => (k === i ? next : t)) }));
  };

  return (
    <div className="editor">
      {session!.draft.map((t, i) => (
        <Block key={i} index={i} value={t} onChange={(v) => change(i, v)} />
      ))}
    </div>
  );
}

export const flushEditor = () => (window as unknown as { __flushEditor?: () => void }).__flushEditor?.();
