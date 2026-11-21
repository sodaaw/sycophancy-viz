import type { ReactNode } from 'react';
import { content } from '../content';
import { useSession } from '../session';
import type { ScreenId } from '../types';

const STEP_OF: Partial<Record<ScreenId, number>> = { 'S1-intro': 1, S1: 1, S2: 2, S3: 3, S4: 4, S5: 5 };

export function StepIndicator({ screen }: { screen: ScreenId }) {
  const step = STEP_OF[screen];
  if (!step) return null;
  const total = content.stepNames.length;
  return (
    <div className="step" aria-label={`단계 ${step}/${total}`}>
      <span className="step-text">
        단계 {step}/{total}
        <span className="step-name"> {content.stepNames[step - 1]}</span>
      </span>
      <span className="step-bar" aria-hidden="true">
        {content.stepNames.map((_, i) => (
          <span key={i} className={i < step ? 'is-done' : ''} />
        ))}
      </span>
    </div>
  );
}

interface FrameProps {
  guide?: string;
  children: ReactNode;
  actions?: ReactNode;
  reason?: string | null;
  className?: string;
}

export function Frame({ guide, children, actions, reason, className = '' }: FrameProps) {
  const { session } = useSession();
  const screen = session!.screen;
  return (
    <div className="frame">
      <header className="topbar">
        <h1 className="brand">글쓰기 세션</h1>
        <StepIndicator screen={screen} />
        <span className="pid">{session!.pid}</span>
      </header>
      {guide && <p className="guide">{guide}</p>}
      <main className={`stage ${className}`}>{children}</main>
      {actions && (
        <footer className="actionbar">
          {reason && <span className="reason">{reason}</span>}
          {actions}
        </footer>
      )}
    </div>
  );
}

export function Confirm({ open, onCancel, onOk, okLabel }: { open: boolean; onCancel: () => void; onOk: () => void; okLabel: string }) {
  if (!open) return null;
  return (
    <div className="modal-back" role="presentation">
      <div className="modal" role="alertdialog" aria-modal="true">
        <p className="modal-text">{content.ui.confirm}</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-quiet" onClick={onCancel}>
            {content.ui.cancel}
          </button>
          <button type="button" className="btn btn-primary" onClick={onOk} autoFocus>
            {okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
