import { useState } from 'react';
import { Editor, flushEditor } from '../components/Editor';
import { Confirm, Frame } from '../components/Frame';
import { content } from '../content';
import { useSession } from '../session';

const MARKS = ['①', '②', '③', '④'];
export const draftText = (d: string[]) => d.map((t, i) => `${MARKS[i]} ${t}`).join('\n');

export function S4() {
  const { session, update, log, go } = useSession();
  const [ask, setAsk] = useState(false);

  const submit = () => {
    setAsk(false);
    flushEditor();
    const draft = session!.draft;
    update((s) => ({ ...s, v1: [...draft] }));
    log('submit_v1', 'draft', draftText(draft));
    go('S5');
  };

  return (
    <Frame
      guide={content.guide.S4}
      actions={
        <button type="button" className="btn btn-primary" onClick={() => setAsk(true)}>
          {content.ui.submit}
        </button>
      }
    >
      <div className="stage-center">
        <section className="pane pane-single">
          <h2 className="pane-title">내 글</h2>
          <div className="pane-scroll">
            <Editor />
          </div>
        </section>
      </div>
      <Confirm open={ask} onCancel={() => setAsk(false)} onOk={submit} okLabel={content.ui.submit} />
    </Frame>
  );
}
