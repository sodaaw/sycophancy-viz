import { useState } from 'react';
import { getInfo, resetParticipant } from '../api';
import { TODO_PATHS } from '../content';
import { useSession } from '../session';

const ID_RE = /^S2-P\d{2,3}$/;

interface Existing {
  hasState: boolean;
  hasSaved: boolean;
  files: string[];
}

export function S0() {
  const { start, restore } = useSession();
  const [id, setId] = useState('');
  const [existing, setExisting] = useState<Existing | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const valid = ID_RE.test(id);

  const onStart = async () => {
    setBusy(true);
    setError('');
    try {
      const info = await getInfo(id);
      if (info.exists) {
        setExisting(info);
        setConfirmed(false);
      } else {
        start(id);
      }
    } catch {
      setError('서버에 연결할 수 없어요. npm start 로 서버를 실행했는지 확인해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const onResume = async () => {
    setBusy(true);
    const ok = await restore(id);
    if (!ok) setError('이어갈 진행 상태를 찾지 못했어요.');
    setBusy(false);
  };

  const onReset = async () => {
    setBusy(true);
    await resetParticipant(id);
    start(id);
    setBusy(false);
  };

  return (
    <div className="frame">
      <header className="topbar">
        <h1 className="brand">글쓰기 세션</h1>
        <span className="pid">진행자 화면</span>
      </header>
      <main className="stage stage-center">
        <div className="card start-card">
          <h2 className="title">세션 시작</h2>
          <p className="muted">참여자 ID를 입력하고 세션을 시작해 주세요.</p>

          {TODO_PATHS.length > 0 && (
            <details className="todo-badge">
              <summary>content.json에 확정되지 않은 값(TODO)이 {TODO_PATHS.length}곳 남아 있어요</summary>
              <ul>
                {TODO_PATHS.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </details>
          )}

          <label className="field-label" htmlFor="pid">
            참여자 ID
          </label>
          <input
            id="pid"
            className="text-input"
            value={id}
            placeholder="S2-P01"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setId(e.target.value.trim().toUpperCase());
              setExisting(null);
              setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && valid && !busy && !existing) void onStart();
            }}
          />
          {id && !valid && <p className="hint-error">S2-P01 형식으로 입력해 주세요</p>}
          {error && <p className="hint-error">{error}</p>}

          {existing && (
            <div className="warn-card" role="alert">
              <h3 className="warn-title">이전 세션 자료가 있어요</h3>
              <p>
                {id} 폴더에 파일이 {existing.files.length}개 있어요.{' '}
                {existing.hasSaved ? '저장된 세션 파일이 있어요.' : '저장된 세션 파일(_세션.json)이 아직 없어요.'}
              </p>
              <p className="muted">초기화하면 이 ID의 자료 폴더가 완전히 삭제돼요.</p>
              <label className="check">
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                <span>암호화 저장소로 옮겼나요? (확인하면 삭제해요)</span>
              </label>
              <div className="row">
                {existing.hasState && (
                  <button type="button" className="btn btn-quiet" disabled={busy} onClick={onResume}>
                    이어서 진행
                  </button>
                )}
                <button type="button" className="btn btn-primary" disabled={!confirmed || busy} onClick={onReset}>
                  초기화하고 시작
                </button>
              </div>
            </div>
          )}

          {!existing && (
            <div className="row">
              <button type="button" className="btn btn-primary" disabled={!valid || busy} onClick={onStart}>
                세션 시작
              </button>
              {!valid && <span className="reason">{id ? 'ID 형식을 확인해 주세요' : 'ID를 입력해 주세요'}</span>}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
