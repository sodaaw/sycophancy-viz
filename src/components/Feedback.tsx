import { content } from '../content';
import { useSession } from '../session';
import type { PanelStat } from '../types';
import { MemoText } from './Memo';
import { useTrack } from './useTrack';

export function CommentCard({ id, text }: { id: string; text: string }) {
  const ref = useTrack<HTMLElement>(id);
  return (
    <article ref={ref} className="comment-card" data-track={id}>
      <h3 className="comment-author">AI 도우미</h3>
      <MemoText blockId={id} text={text} className="comment-text" />
    </article>
  );
}

const EMPTY: PanelStat = { open: false, count: 0, firstExpandTs: null, totalMs: 0, lastOpenTs: null };

export function PanelAccordion({ id, items }: { id: string; items: string[] }) {
  const { session, update, log } = useSession();
  const ref = useTrack<HTMLDivElement>(id);
  const stat = session?.panels[id] ?? EMPTY;

  const toggle = () => {
    const now = Date.now();
    if (!stat.open) {
      update((s) => {
        const p = s.panels[id] ?? EMPTY;
        return {
          ...s,
          panels: { ...s.panels, [id]: { ...p, open: true, count: p.count + 1, firstExpandTs: p.firstExpandTs ?? now, lastOpenTs: now } },
        };
      });
      log('panel_expand', id);
    } else {
      const ms = stat.lastOpenTs ? now - stat.lastOpenTs : 0;
      update((s) => {
        const p = s.panels[id] ?? EMPTY;
        return { ...s, panels: { ...s.panels, [id]: { ...p, open: false, totalMs: p.totalMs + ms, lastOpenTs: null } } };
      });
      log('panel_collapse', id, { ms });
    }
  };

  const bodyId = `${id}-body`;
  return (
    <div ref={ref} className={`fold${stat.open ? ' is-open' : ''}`} data-track={id}>
      <button type="button" className="fold-head" aria-expanded={stat.open} aria-controls={bodyId} onClick={toggle}>
        <span>{content.panelLabel}</span>
        <span className="fold-arrow" aria-hidden="true">
          ▸
        </span>
      </button>
      {stat.open && (
        <ul id={bodyId} className="fold-list">
          {items.map((t, i) => (
            <li key={i}>
              <MemoText blockId={`${id}.${i}`} text={t} className="fold-item" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
