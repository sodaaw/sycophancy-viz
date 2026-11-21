export type ScreenId = 'S0' | 'S1-intro' | 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6';
export type SetKey = 'A1' | 'B1';

export interface Memo {
  id: string;
  blockId: string; // 댓글/패널 항목 id
  start: number; // 블록 텍스트 내 문자 위치
  end: number;
  quote: string;
  reaction: string;
  text: string;
  screen: ScreenId;
  createdTs: number;
  updatedTs: number;
  deletedTs?: number;
}

export interface PanelStat {
  open: boolean;
  count: number;
  firstExpandTs: number | null;
  totalMs: number;
  lastOpenTs: number | null;
}

export interface Session {
  pid: string;
  screen: ScreenId;
  introIdx: number;
  startedTs: number;
  trust: Record<string, number>;
  orders: { trust: string[]; agree: string[]; agreeSet: SetKey | null };
  practiceMarkerOpened: boolean;
  position: 'relative' | 'absolute' | null;
  confidence: number | null;
  premise: Record<string, number>;
  common: Record<string, number>;
  setKey: SetKey | null;
  draft: string[];
  v1: string[] | null;
  v2: string[] | null;
  feedbackRequested: boolean;
  feedbackShownTs: number | null;
  memos: Memo[];
  deletedMemos: Memo[];
  panels: Record<string, PanelStat>;
  screenTimes: Record<string, number>;
  screenEnterTs: number | null;
  savedTs: number | null;
}

export interface LogRow {
  participant_id: string;
  timestamp_ms: number;
  screen: ScreenId;
  event: string;
  target: string;
  detail: unknown;
}
