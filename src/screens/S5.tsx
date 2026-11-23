import { useEffect, useRef, useState } from 'react';
import { Editor, flushEditor } from '../components/Editor';
import { CommentCard, PanelAccordion } from '../components/Feedback';
import { Confirm, Frame } from '../components/Frame';
import { MemoLayer } from '../components/Memo';
import { content } from '../content';
import { useSession } from '../session';
import { draftText } from './S4';

export function S5() {
  const { session, update, log, go } = useSession();
  const [ask, setAsk] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const s = session!;
  const set = s.setKey!;
  const comments = {
    s2: { id: `${set}-2`, text: content.comments[set].s2 },
    req: { id: `${set}-R`, text: content.comments[set].req },
  };
  const panels = {
    s2: { id: `${set}-2-P`, items: content.panels[set].s2 },
    req: { id: `${set}-R-P`, items: content.panels[set].req },
  };
  const showRequest = content.flags.showRequest;

  const request = () => {
    if (loading) return;
    setLoading(true);
    timer.current = window.setTimeout(() => {
      setLoading(false);
      show();
    }, 1500);
  };

  const show = () => {
    const now = Date.now();
    update((cur) => ({ ...cur, feedbackRequested: true, feedbackShownTs: now }));
    log('feedback_shown', comments.s2.id);
    log('feedback_shown', comments.req.id);
  };

  const finalSubmit = () => {
    setAsk(false);
    flushEditor();
    const now = Date.now();
    const draft = s.draft;
    // 펼쳐 둔 항목의 누적 시간을 마감한다
    update((cur) => {
      const panelsNext = { ...cur.panels };
      for (const [id, p] of Object.entries(panelsNext)) {
        if (p.open) panelsNext[id] = { ...p, open: false, totalMs: p.totalMs + (p.lastOpenTs ? now - p.lastOpenTs : 0), lastOpenTs: null };
      }
      return { ...cur, panels: panelsNext, v2: [...draft] };
    });
    log('submit_v2', 'draft', draftText(draft));
    go('S6');
  };

  return (
    <Frame
      guide={content.guide.S5}
      reason={s.feedbackRequested ? null : content.ui.reasons.feedback}
      actions={
        <button type="button" className="btn btn-primary" disabled={!s.feedbackRequested} onClick={() => setAsk(true)}>
          {content.ui.finalSubmit}
        </button>
      }
    >
      <div className="split">
        <section className="pane">
          <h2 className="pane-title">내 글</h2>
          <div className="pane-scroll">
            <Editor />
          </div>
        </section>
        <section className="pane">
          <h2 className="pane-title">AI 도우미 피드백</h2>
          <div className="pane-scroll">
            <MemoLayer>
              <div className="feedback-stack">
                {showRequest ? (
                  <div className="request-bubble">
                    <h3 className="comment-author">나</h3>
                    <p>{content.request}</p>
                  </div>
                ) : (
                  !s.feedbackRequested && <p className="muted">{content.ui.requestAreaNoRequest}</p>
                )}
                {!s.feedbackRequested && !loading && (
                  <div className="request-row">
                    <button type="button" className="btn btn-primary" onClick={request}>
                      {content.ui.requestFeedback}
                    </button>
                  </div>
                )}
                {loading && (
                  <p className="typing" role="status">
                    {content.ui.requestLoading}
                    <span className="dots" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  </p>
                )}
                {s.feedbackRequested && (
                  <>
                    <CommentCard id={comments.s2.id} text={comments.s2.text} />
                    <PanelAccordion id={panels.s2.id} items={panels.s2.items} />
                    <CommentCard id={comments.req.id} text={comments.req.text} />
                    <PanelAccordion id={panels.req.id} items={panels.req.items} />
                  </>
                )}
              </div>
            </MemoLayer>
          </div>
        </section>
      </div>
      <Confirm open={ask} onCancel={() => setAsk(false)} onOk={finalSubmit} okLabel={content.ui.finalSubmit} />
    </Frame>
  );
}
