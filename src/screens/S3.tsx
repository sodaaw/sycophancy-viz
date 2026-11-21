import { Field, Likert, LikertGrid, shuffled } from '../components/Controls';
import { Frame } from '../components/Frame';
import { content } from '../content';
import { useSession } from '../session';
import type { SetKey } from '../types';

const POSITIONS = [
  { key: 'A', id: 'relative' as const, set: 'A1' as SetKey },
  { key: 'B', id: 'absolute' as const, set: 'B1' as SetKey },
];

export function S3() {
  const { session, update, go } = useSession();
  const s = session!;
  const pos = POSITIONS.find((p) => p.id === s.position);
  const setKey = pos?.set;
  const premise = setKey ? content.premiseItems[setKey].map((text, i) => ({ id: `${setKey}-pre-${i + 1}`, text })) : [];
  const common = content.commonItems.map((text, i) => ({ id: `common-${i + 1}`, text }));
  const byId = Object.fromEntries([...premise, ...common].map((x) => [x.id, x]));
  const agreeItems = s.orders.agreeSet === setKey ? s.orders.agree.map((id) => byId[id]).filter(Boolean) : [];
  const agreeValues = { ...s.premise, ...s.common };

  const choose = (p: (typeof POSITIONS)[number]) =>
    update((cur) => {
      if (cur.orders.agreeSet === p.set) return { ...cur, position: p.id };
      const ids = [...content.premiseItems[p.set].map((_, i) => `${p.set}-pre-${i + 1}`), ...common.map((c) => c.id)];
      // 입장을 바꾸면 이전 입장의 전제 응답은 버린다
      return { ...cur, position: p.id, premise: {}, orders: { ...cur.orders, agree: shuffled(ids), agreeSet: p.set } };
    });

  const missing = agreeItems.filter((it) => agreeValues[it.id] === undefined).length;
  let reason: string | null = null;
  if (!s.position) reason = content.ui.reasons.position;
  else if (s.confidence === null) reason = content.ui.reasons.confidence;
  else if (missing > 0 || agreeItems.length === 0) reason = `${content.ui.reasons.attitude} (${missing}개)`;

  const next = () => {
    update((cur) => ({ ...cur, setKey: setKey!, draft: [...content.drafts[setKey!]] }));
    go('S4');
  };

  return (
    <Frame
      guide={content.guide.S3}
      reason={reason}
      actions={
        <button type="button" className="btn btn-primary" disabled={!!reason} onClick={next}>
          {content.ui.next}
        </button>
      }
    >
      <div className="form-scroll">
        <div className="form-col form-wide">
          <section className="card topic-card">
            <p className="lead">{content.topic.intro}</p>
            <h2 className="title">{content.topic.question}</h2>
            <dl className="defs">
              {Object.entries(content.topic.definitions).map(([k, v]) => (
                <div key={k} className="def">
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <Field label={content.positions.question}>
            <div className="choice-row choice-large" role="radiogroup">
              {POSITIONS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={s.position === p.id}
                  className={`choice-btn${s.position === p.id ? ' is-selected' : ''}`}
                  onClick={() => choose(p)}
                >
                  {content.positions[p.key as 'A' | 'B']}
                </button>
              ))}
            </div>
          </Field>

          {s.position && (
            <>
              <Field label={content.confidence.question}>
                <Likert
                  name={content.confidence.question}
                  value={s.confidence}
                  max={content.confidence.scale}
                  labels={content.confidence.labels}
                  onChange={(v) => update((cur) => ({ ...cur, confidence: v }))}
                />
              </Field>
              <Field label={content.agree.stem}>
                <LikertGrid
                  items={agreeItems}
                  scale={content.agree.scale}
                  labels={content.agree.labels}
                  values={agreeValues}
                  onChange={(id, v) =>
                    update((cur) =>
                      id.startsWith('common-')
                        ? { ...cur, common: { ...cur.common, [id]: v } }
                        : { ...cur, premise: { ...cur.premise, [id]: v } },
                    )
                  }
                />
              </Field>
            </>
          )}
        </div>
      </div>
    </Frame>
  );
}
