import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { content } from '../content';
import { useSession } from '../session';
import type { Memo } from '../types';
import { Icon } from './Controls';

interface Anchor {
  left: number;
  top: number;
  bottom: number;
}

type Popover =
  | { mode: 'create'; blockId: string; start: number; end: number; quote: string; anchor: Anchor }
  | { mode: 'edit'; memo: Memo; anchor: Anchor };

interface MemoUI {
  openEdit: (memo: Memo, el: HTMLElement) => void;
}

const MemoUICtx = createContext<MemoUI>({ openEdit: () => {} });
export const useMemoUI = () => useContext(MemoUICtx);

// 반응(이상함/좋음/무슨 뜻인지 모르겠음) 순서에 맞는 아이콘
const MARK_ICON = ['alert', 'thumb', 'help'] as const;

const blockOf = (node: Node | null): HTMLElement | null => {
  const el = node instanceof Element ? node : node?.parentElement ?? null;
  return (el?.closest('[data-memo-block]') as HTMLElement | null) ?? null;
};

const lastTextNode = (root: Node): Text | null => {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let last: Text | null = null;
  while (w.nextNode()) last = w.currentNode as Text;
  return last;
};

const offsetIn = (root: HTMLElement, node: Node, off: number) => {
  const r = document.createRange();
  r.selectNodeContents(root);
  r.setEnd(node, off);
  return r.toString().length;
};

const rectToAnchor = (r: DOMRect): Anchor => ({ left: r.left, top: r.top, bottom: r.bottom });

export function MemoLayer({ children, coach = false }: { children: ReactNode; coach?: boolean }) {
  const { session, update, log, registerExit } = useSession();
  const [pop, setPop] = useState<Popover | null>(null);
  const [text, setText] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const openPop = useCallback((p: Popover, t: string) => {
    setPop(p);
    setText(t);
    setPos(null);
  }, []);

  const openEdit = useCallback(
    (memo: Memo, el: HTMLElement) => {
      update((s) => ({ ...s, practiceMarkerOpened: true }));
      openPop({ mode: 'edit', memo, anchor: rectToAnchor(el.getBoundingClientRect()) }, memo.text);
    },
    [openPop, update],
  );

  const onMouseUp = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('.memo-pop, .memo-mark, button')) return;
    const sel = window.getSelection();
    let blockEl: HTMLElement | null = null;
    let start = 0;
    let end = 0;
    let rect: DOMRect;

    if (sel && !sel.isCollapsed && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      blockEl = blockOf(range.startContainer);
      if (!blockEl) return;
      start = offsetIn(blockEl, range.startContainer, range.startOffset);
      if (blockEl.contains(range.endContainer)) {
        end = offsetIn(blockEl, range.endContainer, range.endOffset);
      } else {
        end = (blockEl.textContent ?? '').length;
      }
      rect = range.getBoundingClientRect();
      if (!blockEl.contains(range.endContainer)) {
        const last = lastTextNode(blockEl);
        if (last) end = offsetIn(blockEl, last, last.length);
        rect = blockEl.getBoundingClientRect();
      }
    } else {
      blockEl = blockOf(t);
      if (!blockEl) return;
      start = 0;
      end = (blockEl.textContent ?? '').length;
      rect = blockEl.getBoundingClientRect();
    }

    const full = blockEl.textContent ?? '';
    while (start < end && /\s/.test(full[start])) start++;
    while (end > start && /\s/.test(full[end - 1])) end--;
    if (end <= start) return;
    const blockId = blockEl.dataset.memoBlock!;
    openPop({ mode: 'create', blockId, start, end, quote: full.slice(start, end), anchor: rectToAnchor(rect) }, '');
  };

  // 팝오버 위치 보정 (화면 밖으로 나가지 않게)
  useLayoutEffect(() => {
    if (!pop || !popRef.current) return;
    const h = popRef.current.offsetHeight;
    const w = popRef.current.offsetWidth;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = pop.anchor.bottom + 8;
    if (top + h > vh - 8) top = Math.max(8, pop.anchor.top - h - 8);
    const left = Math.min(Math.max(8, pop.anchor.left), vw - w - 8);
    setPos({ left, top });
  }, [pop]);

  const mkey = (m: Memo) => `${m.blockId}:${m.start}-${m.end}`;
  const curMemo = pop?.mode === 'edit' ? session?.memos.find((m) => m.id === pop.memo.id) : undefined;

  // 한 줄 메모가 바뀌었으면 memo_edit 로 기록 (바뀐 게 없으면 아무것도 하지 않는다)
  const commitText = () => {
    if (!pop || pop.mode !== 'edit') return;
    const trimmed = text.trim();
    const id = pop.memo.id;
    let logged: Memo | null = null;
    update((s) => {
      const m = s.memos.find((x) => x.id === id);
      if (!m || m.text === trimmed) return s;
      logged = { ...m, text: trimmed, updatedTs: Date.now() };
      return { ...s, memos: s.memos.map((x) => (x.id === id ? logged! : x)) };
    });
    if (logged) log('memo_edit', mkey(logged), { reaction: (logged as Memo).reaction, text: trimmed });
  };

  const close = () => {
    commitText();
    setPop(null);
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  // 바깥 클릭/ESC로 닫기, 화면을 떠날 때 입력 중인 메모 저장
  useEffect(() => {
    if (!pop) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('.memo-pop') || t.closest('.memo-mark')) return;
      closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    const unreg = registerExit(() => closeRef.current());
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      unreg();
    };
  }, [pop?.mode, registerExit]);

  // 반응 버튼: 누르는 즉시 저장 (새 메모면 memo_create, 이미 있으면 반응이 바뀔 때 memo_edit)
  const pick = (r: string) => {
    if (!pop) return;
    const now = Date.now();
    const trimmed = text.trim();
    if (pop.mode === 'create') {
      const memo: Memo = {
        id: `m${now}${Math.random().toString(36).slice(2, 6)}`,
        blockId: pop.blockId,
        start: pop.start,
        end: pop.end,
        quote: pop.quote,
        reaction: r,
        text: trimmed,
        screen: session!.screen,
        createdTs: now,
        updatedTs: now,
      };
      update((s) => ({ ...s, memos: [...s.memos, memo] }));
      log('memo_create', mkey(memo), { reaction: r, text: trimmed });
      window.getSelection()?.removeAllRanges();
      setPop({ mode: 'edit', memo, anchor: pop.anchor });
    } else if (curMemo && curMemo.reaction !== r) {
      const next = { ...curMemo, reaction: r, text: trimmed, updatedTs: now };
      update((s) => ({ ...s, memos: s.memos.map((x) => (x.id === next.id ? next : x)) }));
      log('memo_edit', mkey(next), { reaction: r, text: trimmed });
    }
  };

  const remove = () => {
    if (!pop || pop.mode !== 'edit' || !curMemo) return;
    const m = curMemo;
    const now = Date.now();
    update((s) => ({
      ...s,
      memos: s.memos.filter((x) => x.id !== m.id),
      deletedMemos: [...s.deletedMemos, { ...m, deletedTs: now }],
    }));
    log('memo_delete', mkey(m), { reaction: m.reaction, text: m.text });
    setPop(null);
  };

  // 코치마크 단계 (S2 전용)
  const practiceMemos = (session?.memos ?? []).filter((m) => m.screen === 'S2');
  let step = -1;
  if (coach) {
    if (!pop) {
      if (practiceMemos.length === 0) step = 0;
      else if (!session?.practiceMarkerOpened) step = 3;
    } else if (pop.mode === 'create') step = 1;
    else if (!session?.practiceMarkerOpened) step = 2;
  }

  const ui = useMemo(() => ({ openEdit }), [openEdit]);
  const selected = curMemo?.reaction ?? null;
  const quote = pop ? (pop.mode === 'create' ? pop.quote : pop.memo.quote) : '';

  return (
    <MemoUICtx.Provider value={ui}>
      <div ref={rootRef} className={`memo-layer${step >= 0 ? ` coach-${step}` : ''}`} onMouseUp={onMouseUp}>
        {step >= 0 && (
          <div className="coach-banner" role="status">
            <span className="coach-count">{step + 1}/4</span>
            <span>{content.coach[step]}</span>
          </div>
        )}
        {children}
      </div>
      {pop && (
        <div
          ref={popRef}
          className={`memo-pop${step >= 0 ? ` coach-${step}` : ''}`}
          style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
          role="dialog"
          aria-label="메모"
        >
          <p className="memo-quote">
            {quote.slice(0, 60)}
            {quote.length > 60 ? '…' : ''}
          </p>
          <div className="reaction-group" role="radiogroup" aria-label="반응">
            {content.memo.reactions.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={selected === r}
                className={`reaction-btn${selected === r ? ' is-selected' : ''}`}
                onClick={() => pick(r)}
              >
                {r}
              </button>
            ))}
          </div>
          <input
            className="memo-input"
            type="text"
            value={text}
            maxLength={120}
            placeholder={content.memo.inputPlaceholder}
            onChange={(e) => setText(e.target.value)}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                if (pop.mode === 'edit') close();
              }
            }}
          />
          <div className="memo-actions">
            {pop.mode === 'edit' && (
              <button type="button" className="btn btn-quiet btn-danger" onClick={remove}>
                <Icon name="trash" size={16} />
                삭제
              </button>
            )}
            <span className="spacer" />
            <span className="memo-hint">{pop.mode === 'create' ? '반응을 누르면 바로 저장돼요' : '자동으로 저장돼요'}</span>
            <button type="button" className="btn btn-quiet" onClick={close}>
              닫기
            </button>
          </div>
        </div>
      )}
    </MemoUICtx.Provider>
  );
}

// 블록 텍스트 + 메모 표시. 표시 안에는 글자가 없어서 문자 위치 계산에 영향을 주지 않는다.
export function MemoText({ blockId, text, className }: { blockId: string; text: string; className?: string }) {
  const { session } = useSession();
  const { openEdit } = useMemoUI();
  const memos = (session?.memos ?? []).filter((m) => m.blockId === blockId).sort((a, b) => a.end - b.end);

  const len = text.length;
  const cut = (n: number) => Math.min(Math.max(n, 0), len);
  const points = [...new Set([0, len, ...memos.flatMap((m) => [cut(m.start), cut(m.end)])])].sort((x, y) => x - y);
  const nodes: ReactNode[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    // 표시는 글자가 없어서 문자 위치 계산에 영향을 주지 않는다
    for (const m of memos) {
      if (cut(m.end) === a && a > 0) {
        nodes.push(
          <button
            key={m.id}
            type="button"
            className="memo-mark"
            aria-label="남긴 메모 보기"
            onClick={(e) => {
              e.stopPropagation();
              openEdit(m, e.currentTarget);
            }}
          >
            <Icon name={MARK_ICON[Math.max(0, content.memo.reactions.indexOf(m.reaction))]} size={13} />
          </button>,
        );
      }
    }
    if (b !== undefined && b > a) {
      const piece = text.slice(a, b);
      const covered = memos.some((m) => cut(m.start) <= a && b <= cut(m.end));
      nodes.push(covered ? <span key={`hl-${a}`} className="memo-hl">{piece}</span> : piece);
    }
  }

  return (
    <p className={className} data-memo-block={blockId}>
      {nodes}
    </p>
  );
}
