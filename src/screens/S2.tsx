import { useEffect } from 'react';
import { CommentCard } from '../components/Feedback';
import { Frame } from '../components/Frame';
import { MemoLayer } from '../components/Memo';
import { content } from '../content';
import { useSession } from '../session';

export function S2() {
  const { session, go, log } = useSession();
  const comments = content.practice.feedback.map((text, i) => ({ id: `P-${i + 1}`, text }));

  useEffect(() => {
    comments.forEach((c) => log('feedback_shown', c.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const created = session!.memos.some((m) => m.screen === 'S2') || session!.deletedMemos.some((m) => m.screen === 'S2');

  return (
    <Frame
      guide={content.guide.S2}
      reason={created ? null : content.ui.reasons.practice}
      actions={
        <button type="button" className="btn btn-primary" disabled={!created} onClick={() => go('S3')}>
          {content.ui.next}
        </button>
      }
    >
      <div className="split">
        <section className="pane">
          <h2 className="pane-title">내 글</h2>
          <div className="pane-scroll">
            <div className="editor">
              {content.practice.sentences.map((t, i) => (
                <div className="editor-block is-static" key={i}>
                  <span className="editor-mark">{['①', '②', '③', '④'][i]}</span>
                  <p className="static-text">{t}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="pane">
          <h2 className="pane-title">AI 도우미 피드백</h2>
          <div className="pane-scroll">
            <MemoLayer coach>
              <div className="feedback-stack">
                {comments.map((c) => (
                  <CommentCard key={c.id} id={c.id} text={c.text} />
                ))}
              </div>
            </MemoLayer>
          </div>
        </section>
      </div>
    </Frame>
  );
}
