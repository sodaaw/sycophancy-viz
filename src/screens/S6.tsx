import { useState } from 'react';
import { drainLogs, flushState, saveSessionFile } from '../api';
import { Icon } from '../components/Controls';
import { Frame } from '../components/Frame';
import { content } from '../content';
import { useSession } from '../session';
import type { Session } from '../types';

function buildPayload(s: Session) {
  const trust = s.orders.trust.map((id) => ({
    id,
    text: content.survey.trust.items[Number(id.split('-')[1]) - 1],
    value: s.trust[id],
  })); // 화면에 보인 순서대로
  const panels: Record<string, { firstExpandTs: number | null; totalExpandMs: number; expandCount: number }> = {};
  for (const [id, p] of Object.entries(s.panels)) {
    panels[id] = { firstExpandTs: p.firstExpandTs, totalExpandMs: p.totalMs, expandCount: p.count };
  }
  return {
    participant_id: s.pid,
    savedAt: Date.now(),
    startedTs: s.startedTs,
    setKey: s.setKey,
    trust,
    orders: s.orders,
    position: s.position,
    confidence: s.confidence,
    premise: s.premise,
    common: s.common,
    v1: s.v1,
    v2: s.v2,
    memos: { current: s.memos, deleted: s.deletedMemos },
    panels,
    screenTimesMs: s.screenTimes,
  };
}

export function S6() {
  const { session, update, endSession } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [moved, setMoved] = useState(false);
  const saved = session!.savedTs !== null;

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await drainLogs();
      const now = Date.now();
      update((s) => ({ ...s, savedTs: now }));
      await flushState();
      const cur = { ...session!, savedTs: now };
      await saveSessionFile(session!.pid, buildPayload(cur));
    } catch (e) {
      update((s) => ({ ...s, savedTs: null }));
      setError(`저장하지 못했어요: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Frame
      reason={!saved ? '먼저 자료를 저장해 주세요' : moved ? null : '암호화 저장소로 옮겼는지 확인해 주세요'}
      actions={
        <div className="staff-zone">
          <span className="staff-label">진행자용</span>
          <button type="button" className="btn btn-quiet" disabled={busy} onClick={save}>
            자료 저장
          </button>
          <button type="button" className="btn btn-primary" disabled={!saved || !moved} onClick={() => endSession(true)}>
            다음 세션 준비
          </button>
        </div>
      }
    >
      <div className="stage-center">
        <div className="card end-card">
          <h2 className="title">수고하셨습니다!</h2>
          <p className="lead">모든 과정이 끝났어요. 진행자에게 알려 주세요.</p>
          {saved && (
            <p className="saved" role="status">
              <Icon name="check" size={18} /> 저장됨
            </p>
          )}
          {saved && (
            <label className="check">
              <input type="checkbox" checked={moved} onChange={(e) => setMoved(e.target.checked)} />
              <span>암호화 저장소로 옮겼나요? (확인하면 이 PC의 자료 폴더가 삭제돼요)</span>
            </label>
          )}
          {error && <p className="hint-error">{error}</p>}
        </div>
      </div>
    </Frame>
  );
}
