// 내보내기 공용 로직: npm run export 와 /admin 이 같은 코드를 쓴다 (결과가 항상 같도록).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { breakPoint, gap, shortfall } from './coding-rules.js';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATA = path.join(ROOT, 'data');
export const EXPORT_DIR = path.join(DATA, 'export');
export const CODING_DIR = path.join(DATA, 'coding');
export const ID_RE = /^S2-P\d{2,3}$/;
export const MARKS = ['①', '②', '③', '④'];

export const EXPECTED_EVENTS = [
  'screen_enter', 'screen_exit', 'feedback_shown', 'comment_in_view', 'comment_out_of_view',
  'panel_expand', 'panel_collapse', 'hover', 'memo_create', 'memo_edit', 'memo_delete',
  'editor_change', 'submit_v1', 'submit_v2',
];

export const listIds = () =>
  fs.existsSync(DATA) ? fs.readdirSync(DATA).filter((d) => ID_RE.test(d)).sort() : [];

// ---------- CSV ----------
export const cell = (v) => {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (header, rows) => '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
export const iso = (ts) => (ts ? new Date(ts).toISOString() : '');
export const text = (arr) => (arr ? arr.map((t, i) => `${MARKS[i]} ${t}`).join('\n') : '');
export const readJson = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);

// data/coding 의 코더 1·2, 합의, 인터뷰 문항 8 점수
export function loadCoding() {
  const get = (f) => readJson(path.join(CODING_DIR, f)) || {};
  return {
    1: get('coder1.json').cases || {},
    2: get('coder2.json').cases || {},
    consensus: get('consensus.json').cases || {},
    interview: get('interview.json').participants || {},
  };
}
const NO_CODING = { 1: {}, 2: {}, consensus: {}, interview: {} };

export function readEvents(id) {
  const f = path.join(DATA, id, 'events.jsonl');
  if (!fs.existsSync(f)) return [];
  const rows = [];
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    try {
      rows.push({ ...JSON.parse(line), _i: i });
    } catch {
      console.warn(`${id}: events.jsonl ${i + 1}번째 줄을 읽지 못했어요`);
    }
  });
  return rows.sort((a, b) => a.timestamp_ms - b.timestamp_ms || a._i - b._i);
}

// state.json 과 _세션.json 을 같은 모양으로
export function readParticipant(id) {
  const saved = readJson(path.join(DATA, id, `${id}_세션.json`));
  const state = readJson(path.join(DATA, id, 'state.json')) || {};
  const src = saved || state;
  return {
    setKey: src.setKey ?? null,
    position: src.position ?? null,
    confidence: src.confidence ?? null,
    premise: src.premise || {},
    v1: src.v1 || null,
    v2: src.v2 || null,
    memos: saved ? saved.memos.current : state.memos || [],
    deleted: saved ? saved.memos.deleted : state.deletedMemos || [],
    hasSaved: !!saved,
  };
}

// ---------- 지표 ----------
// target 의 on/off 이벤트 쌍을 구간으로 만든다. S5 screen_exit(새로고침 포함)에서 열린 구간은 닫는다.
function intervals(events, target, onEvt, offEvt, closeAt) {
  const list = [];
  let start = null;
  for (const e of events) {
    if (e.event === 'screen_exit') {
      if (start !== null) {
        list.push([start, e.timestamp_ms]);
        start = null;
      }
      continue;
    }
    if (e.target !== target) continue;
    if (e.event === onEvt && start === null) start = e.timestamp_ms;
    else if (e.event === offEvt && start !== null) {
      list.push([start, e.timestamp_ms]);
      start = null;
    }
  }
  if (start !== null) list.push([start, closeAt]);
  return list;
}
const sum = (iv) => iv.reduce((a, [s, e]) => a + (e - s), 0);

// 코더 1·2 값, 합의 값, 반영 미달, 인터뷰 점수, 지각-행동 괴리 (코딩 전이면 빈칸)
function codingCells(id, cid, coding) {
  const key = `${id}|${cid}`;
  const c1 = coding[1][key] || {};
  const c2 = coding[2][key] || {};
  const cc = coding.consensus[key] || {};
  const iv = coding.interview[id] || {};
  const brk = (c) => (Object.keys(c).length ? breakPoint(c) : '');
  return [
    c1.인지 ?? '', c2.인지 ?? '', c1.해석 ?? '', c2.해석 ?? '', c1.작동 ?? '', c2.작동 ?? '', c1.반영 ?? '', c2.반영 ?? '',
    brk(c1), brk(c2),
    cc.인지 ?? '', cc.해석 ?? '', cc.작동 ?? '', cc.반영 ?? '', brk(cc),
    shortfall(cc), iv.panel ?? '', iv.memo ?? '', gap(iv.panel, cc),
  ];
}

export function buildCases(id, p, events, coding = NO_CODING) {
  if (!p.setKey) return [];
  const s5 = events.filter((e) => e.screen === 'S5');
  const last = s5.length ? s5[s5.length - 1].timestamp_ms : 0;

  const changed = [];
  if (p.v1 && p.v2) for (let i = 0; i < 4; i++) if (p.v1[i] !== p.v2[i]) changed.push(i);
  const nums = changed.map((i) => i + 1).join(';');
  const changedBefore = changed.map((i) => `${MARKS[i]} ${p.v1[i]}`).join('\n');
  const changedAfter = changed.map((i) => `${MARKS[i]} ${p.v2[i]}`).join('\n');
  const premise = Object.entries(p.premise).map(([k, v]) => `${k}=${v}`).join(';');

  return [['s2', `${p.setKey}-2`], ['req', `${p.setKey}-R`]].map(([kind, cid]) => {
    const pid = `${cid}-P`;
    const shown = s5.find((e) => e.event === 'feedback_shown' && e.target === cid);
    const view = intervals(s5, pid, 'comment_in_view', 'comment_out_of_view', last);
    const expand = intervals(s5, pid, 'panel_expand', 'panel_collapse', last);
    const expands = s5.filter((e) => e.event === 'panel_expand' && e.target === pid && !(e.detail && e.detail.restored));
    const first = expands.length ? expands[0].timestamp_ms : null;
    const hoversPanel = s5.filter((e) => e.event === 'hover' && e.target === pid);
    const hoversComment = s5.filter((e) => e.event === 'hover' && e.target === cid);
    // 이 댓글 본문에 남긴 메모가 해당 패널의 첫 펼침보다 앞서면(펼친 적 없으면 무조건) 자발적 탐지 후보
    const early = s5.some(
      (e) => e.event === 'memo_create' && String(e.target).startsWith(`${cid}:`) && (first === null || e.timestamp_ms < first),
    );
    const before = first === null ? Infinity : first;
    const reactions = [
      ...new Set(
        s5
          .filter((e) => e.event === 'memo_create' && String(e.target).startsWith(`${cid}:`) && e.timestamp_ms < before)
          .map((e) => e.detail && e.detail.reaction)
          .filter(Boolean),
      ),
    ].join(';');
    // s2 댓글은 ② 문장, req 댓글은 어느 문장이든 첫 펼침 전 편집 여부 (editor_change 는 5초 단위로 모아 기록됨)
    const editedBefore = s5.some(
      (e) => e.event === 'editor_change' && e.timestamp_ms < before && (kind === 'req' || e.target === '2'),
    );
    return [
      id, kind, cid, pid, p.position, p.setKey, p.confidence, premise,
      sum(view), hoversComment.length, hoversPanel.length,
      iso(first), first, shown && first ? first - shown.timestamp_ms : '',
      expands.length, sum(expand), expand.some(([a, b]) => b - a >= 3000) ? 'Y' : 'N',
      nums, changedBefore, changedAfter, early ? 'Y' : 'N', reactions, editedBefore ? 'Y' : 'N',
      ...codingCells(id, cid, coding),
    ];
  });
}

export const evHeader = ['participant_id', 'timestamp_ms', 'time_iso', 'screen', 'event', 'target', 'detail'];
export const memoHeader = ['participant_id', 'status', 'screen', 'comment_id', 'from_panel', 'block_id', 'start', 'end', 'quote', 'reaction', 'text', 'created_iso', 'created_ts', 'updated_ts', 'deleted_ts'];
export const caseHeader = [
  'participant_id', 'comment_type', 'comment_id', 'panel_id', '입장', '세트', '확신도', '전제동의',
  '패널_화면노출_ms', '댓글_hover_횟수', '패널_hover_횟수', '첫_펼침_시각', '첫_펼침_ts', '피드백후_첫펼침까지_ms',
  '펼침_횟수', '누적_펼침_ms', '3초이상_펼침', 'v1→v2_변경_문장번호', '변경전_텍스트', '변경후_텍스트', '자발적_탐지_후보(펼침전_메모)', '펼침전_메모_반응', '펼침전_해당문장_편집',
  '인지_코더1', '인지_코더2', '해석_코더1', '해석_코더2', '작동_코더1', '작동_코더2', '반영_코더1', '반영_코더2',
  '단절지점_코더1', '단절지점_코더2',
  '인지_합의', '해석_합의', '작동_합의', '반영_합의', '단절지점_합의',
  '반영_미달', '인터뷰8_표시점수', '인터뷰8_메모점수', '지각행동_괴리',
];
export const verHeader = ['participant_id', 'v1', 'v2'];

export const memoRow = (id, m, status) => [
  id, status, m.screen, String(m.blockId).replace(/-P(\.\d+)?$/, ''), /-P(\.\d+)?$/.test(m.blockId) ? 'Y' : 'N',
  m.blockId, m.start, m.end, m.quote, m.reaction, m.text, iso(m.createdTs), m.createdTs, m.updatedTs, m.deletedTs ?? '',
];

// ids 의 CSV 4종과 콘솔용 요약 줄을 만든다 (파일은 쓰지 않는다)
export function buildExport(ids) {
  const evRows = [];
  const memoRows = [];
  const caseRows = [];
  const verRows = [];
  const totalCounts = {};
  const positions = { relative: 0, absolute: 0 };
  const lines = [];
  const coding = loadCoding();

  for (const id of ids) {
    if (!fs.existsSync(path.join(DATA, id))) {
      lines.push(`${id}: 폴더가 없어요`);
      continue;
    }
    const events = readEvents(id);
    const p = readParticipant(id);
    const counts = {};
    for (const e of events) {
      counts[e.event] = (counts[e.event] || 0) + 1;
      totalCounts[e.event] = (totalCounts[e.event] || 0) + 1;
      evRows.push([e.participant_id, e.timestamp_ms, iso(e.timestamp_ms), e.screen, e.event, e.target, e.detail]);
    }
    p.memos.forEach((m) => memoRows.push(memoRow(id, m, '현재')));
    p.deleted.forEach((m) => memoRows.push(memoRow(id, m, '삭제')));
    if (p.position in positions) positions[p.position]++;
    caseRows.push(...buildCases(id, p, events, coding));
    verRows.push([id, text(p.v1), text(p.v2)]);

    lines.push('', `[${id}] 이벤트 ${events.length}개${p.hasSaved ? '' : '  (세션 파일 없음: state.json 사용)'}`);
    for (const k of Object.keys(counts).sort()) lines.push(`  ${k.padEnd(22)} ${counts[k]}`);
    const missing = EXPECTED_EVENTS.filter((k) => !counts[k]);
    if (missing.length) lines.push(`  ※ 기록 없음: ${missing.join(', ')}`);
  }

  lines.push('', '[전체 이벤트 종류별 건수]');
  for (const k of Object.keys(totalCounts).sort()) lines.push(`  ${k.padEnd(22)} ${totalCounts[k]}`);
  const missingAll = EXPECTED_EVENTS.filter((k) => !totalCounts[k]);
  if (missingAll.length) lines.push('', `※ 전체에서 기록이 없는 이벤트: ${missingAll.join(', ')}`);
  lines.push('', '[입장별 인원]', `  상대평가(A1): ${positions.relative}명`, `  절대평가(B1): ${positions.absolute}명`);
  for (const [k, label] of [['relative', '상대평가(A1)'], ['absolute', '절대평가(B1)']]) {
    if (positions[k] < 3) lines.push(`※ 경고: ${label} 입장이 ${positions[k]}명이에요 (3명 미만이면 논문에 적어야 해요)`);
  }

  return {
    csv: {
      'events.csv': toCsv(evHeader, evRows),
      'memos.csv': toCsv(memoHeader, memoRows),
      'cases.csv': toCsv(caseHeader, caseRows),
      'versions.csv': toCsv(verHeader, verRows),
    },
    lines,
    positions,
    caseRows,
  };
}

// data/export 에 파일을 쓴다 (npm run export 와 /admin [export 실행] 공용)
export function writeExport(ids) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  const r = buildExport(ids);
  for (const [name, content] of Object.entries(r.csv)) fs.writeFileSync(path.join(EXPORT_DIR, name), content);
  r.lines.push('', `저장 위치: ${EXPORT_DIR}`);
  return r;
}
