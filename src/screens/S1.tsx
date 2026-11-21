import { Field, LikertGrid } from '../components/Controls';
import { Frame } from '../components/Frame';
import { content } from '../content';
import { useSession } from '../session';

export function S1Intro() {
  const { session, update, go } = useSession();
  const idx = session!.introIdx;
  const cards = content.intro.cards;
  const card = cards[idx] as { title: string; lead: string; items?: string[]; left?: string; right?: string; note?: string };
  const last = idx === cards.length - 1;

  return (
    <Frame
      guide={content.guide['S1-intro']}
      actions={
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => (last ? go('S1') : update((s) => ({ ...s, introIdx: s.introIdx + 1 })))}
        >
          {content.ui.next}
        </button>
      }
    >
      <div className="stage-center">
        <article className="card intro-card">
          <p className="muted intro-count">
            {idx + 1} / {cards.length}
          </p>
          <h2 className="title">{card.title}</h2>
          <p className="lead">{card.lead}</p>
          {card.items && (
            <ul className="plain-list">
              {card.items.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
          {card.left && (
            <>
              <div className="schematic" aria-hidden="true">
                <div className="schematic-pane">{card.left}</div>
                <div className="schematic-pane is-right">{card.right}</div>
              </div>
              <p className="muted">{card.note}</p>
            </>
          )}
        </article>
      </div>
    </Frame>
  );
}

export function S1() {
  const { session, update, go } = useSession();
  const t = content.survey.trust;
  const answers = session!.trust;
  const items = session!.orders.trust.map((id) => ({ id, text: t.items[Number(id.split('-')[1]) - 1] }));
  const left = items.filter((it) => answers[it.id] === undefined).length;
  const done = left === 0;

  return (
    <Frame
      guide={content.guide.S1}
      reason={done ? null : `${content.ui.reasons.survey} (${left}개)`}
      actions={
        <button type="button" className="btn btn-primary" disabled={!done} onClick={() => go('S2')}>
          {content.ui.next}
        </button>
      }
    >
      <div className="form-scroll">
        <div className="form-col form-wide">
          <Field label={t.stem}>
            <LikertGrid
              items={items}
              scale={t.scale}
              labels={t.labels}
              values={answers}
              onChange={(id, v) => update((s) => ({ ...s, trust: { ...s.trust, [id]: v } }))}
            />
          </Field>
        </div>
      </div>
    </Frame>
  );
}
