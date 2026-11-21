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
  const { session, update, log } = useSession();
  const [pop, setPop] = useState<Popover | null>(null);
  const [reaction, setReaction] = useState<string | null>(null);
  const [text, setText] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const openPop = useCallback((p: Popover, r: string | null, t: string) => {
    setPop(p);
    setReaction(r);
    setText(t);
    setPos(null);
  }, []);

  const openEdit = useCallback(
    (memo: Memo, el: HTMLElement) => {
      update((s) => ({ ...s, practiceMarkerOpened: true }));
      openPop({ mode: 'edit', memo, anchor: rectToAnchor(el.getBoundingClientRect()) }, memo.reaction, memo.text);
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
    openPop({ mode: 'create', blockId, start, end, quote: full.slice(start, end), anchor: rectToAnchor(rect) }, null, '');
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
  }, [pop, reaction]);

  const close = useCallback(() => setPop(null), []);

  // 바깥 클릭/ESC로 닫기
  useEffect(() => {
    if (!pop) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('.memo-pop') || t.closest('.memo-mark')) return;
      if (rootRef.current?.contains(t)) {
        // 같은 화면 안의 클릭은 새 메모 시도일 수 있으므로 팝오버만 닫는다
      }
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [pop, close]);

  const save = () => {
    if (!pop || !reaction) return;
    const now = Date.now();
    const trimmed = text.trim();
    if (pop.mode === 'create') {
      const memo: Memo = {
        id: `m${now}${Math.random().toString(36).slice(2, 6)}`,
        blockId: pop.blockId,
        start: pop.start,
        end: pop.end,
        quote: pop.quote,
        reaction,
        text: trimmed,
        screen: session!.screen,
        createdTs: now,
        updatedTs: now,
      };
      update((s) => ({ ...s, memos: [...s.memos, memo] }));
      log('memo_create', `${memo.blockId}:${memo.start}-${memo.end}`, { reaction, text: trimmed });
    } else {
      const m = pop.memo;
      update((s) => ({
        ...s,
        memos: s.memos.map((x) => (x.id === m.id ? { ...x, reaction, text: trimmed, updatedTs: now } : x)),
      }));
      log('memo_edit', `${m.blockId}:${m.start}-${m.end}`, { reaction, text: trimmed });
    }
    window.getSelection()?.removeAllRanges();
    close();
  };

  const remove = () => {
    if (!pop || pop.mode !== 'edit') return;
    const m = pop.memo;
    const now = Date.now();
    update((s) => ({
      ...s,
      memos: s.memos.filter((x) => x.id !== m.id),
      deletedMemos: [...s.deletedMemos, { ...m, deletedTs: now }],
    }));
    log('memo_delete', `${m.blockId}:${m.start}-${m.end}`, { reaction: m.reaction, text: m.text });
    close();
  };

  // 코치마크 단계 (S2 전용)
  const practiceMemos = (session?.memos ?? []).filter((m) => m.screen === 'S2');
  let step = -1;
  if (coach) {
    if (!pop) {
      if (practiceMemos.length === 0) step = 0;
      else if (!session?.practiceMarkerOpened) step = 3;
    } else if (pop.mode === 'create') {
      step = reaction ? 2 : 1;
    }
  }

  const ui = useMemo(() => ({ openEdit }), [openEdit]);
  const canSave = !!reaction;
  const unchanged = pop?.mode === 'edit' && pop.memo.reaction === reaction && pop.memo.text === text.trim();

  return (
    <MemoUICtx.Provider value={ui}>
      <div ref={rootRef} className={`memo-layer${step >= 0 ? ` coach-${step}` : ''}`} onMouseUp={onMouseUp}>
        {step >= 0 && (
          <div className="coach-banner" role="status">
            <span className="coach-count">
              {step + 1}/4
            </span>
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
            {(pop.mode === 'create' ? pop.quote : pop.memo.quote).slice(0, 60)}
            {(pop.mode === 'create' ? pop.quote : pop.memo.quote).length > 60 ? '…' : ''}
          </p>
          <div className="reaction-group" role="radiogroup" aria-label="반응">
            {content.memo.reactions.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={reaction === r}
                className={`reaction-btn${reaction === r ? ' is-selected' : ''}`}
                onClick={() => setReaction(r)}
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
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSave && !e.nativeEvent.isComposing) save();
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
            {!canSave && <span className="memo-hint">반응을 하나 골라 주세요</span>}
            <button type="button" className="btn btn-quiet" onClick={close}>
              취소
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={!canSave || unchanged} onClick={save}>
              저장
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
      const covered = memos.some((m) => cut(m.start) <= a && cut(m.end) >= b);
      nodes.push(covered ? <mark key={`t${a}`} className="memo-hl">{piece}</mark> : piece);
    }
  }

  return (
    <p className={className} data-memo-block={blockId}>
      {nodes}
    </p>
  );
}
