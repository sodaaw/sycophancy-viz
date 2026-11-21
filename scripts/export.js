// npm run export [id|all]  →  data/export/*.csv (UTF-8 BOM, 엑셀 호환)
// Node 내장 모듈만 사용. 외부로 전송하지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const OUT = path.join(DATA, 'export');
const ID_RE = /^S2-P\d{2,3}$/;
const MARKS = ['①', '②', '③', '④'];

const EXPECTED_EVENTS = [
  'screen_enter', 'screen_exit', 'feedback_shown', 'comment_in_view', 'comment_out_of_view',
  'panel_expand', 'panel_collapse', 'hover', 'memo_create', 'memo_edit', 'memo_delete',
  'editor_change', 'submit_v1', 'submit_v2',
];

const arg = process.argv[2] || 'all';
const ids =
  arg === 'all'
    ? fs.existsSync(DATA) ? fs.readdirSync(DATA).filter((d) => ID_RE.test(d)).sort() : []
    : [arg];

if (!ids.length) {
  console.error('내보낼 참여자 폴더가 없어요 (data/S2-Pxx).');
  process.exit(1);
}

// ---------- CSV ----------
const cell = (v) => {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (header, rows) => '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
const iso = (ts) => (ts ? new Date(ts).toISOString() : '');
const text = (arr) => (arr ? arr.map((t, i) => `${MARKS[i]} ${t}`).join('\n') : '');
const readJson = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);

function readEvents(id) {
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
function readParticipant(id) {
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

function buildCases(id, p, events) {
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
      '', '', '', '', '', '', '', '',
    ];
  });
}

// ---------- 실행 ----------
fs.mkdirSync(OUT, { recursive: true });

const evHeader = ['participant_id', 'timestamp_ms', 'time_iso', 'screen', 'event', 'target', 'detail'];
const memoHeader = ['participant_id', 'status', 'screen', 'comment_id', 'from_panel', 'block_id', 'start', 'end', 'quote', 'reaction', 'text', 'created_iso', 'created_ts', 'updated_ts', 'deleted_ts'];
const caseHeader = [
  'participant_id', 'comment_type', 'comment_id', 'panel_id', '입장', '세트', '확신도', '전제동의',
  '패널_화면노출_ms', '댓글_hover_횟수', '패널_hover_횟수', '첫_펼침_시각', '첫_펼침_ts', '피드백후_첫펼침까지_ms',
  '펼침_횟수', '누적_펼침_ms', '3초이상_펼침', 'v1→v2_변경_문장번호', '변경전_텍스트', '변경후_텍스트', '자발적_탐지_후보(펼침전_메모)', '펼침전_메모_반응', '펼침전_해당문장_편집',
  '인지_코더1', '인지_코더2', '해석_코더1', '해석_코더2', '작동_코더1', '작동_코더2', '반영_코더1', '반영_코더2',
];
const verHeader = ['participant_id', 'v1', 'v2'];

const evRows = [];
const memoRows = [];
const caseRows = [];
const verRows = [];
const totalCounts = {};

for (const id of ids) {
  if (!fs.existsSync(path.join(DATA, id))) {
    console.error(`${id}: 폴더가 없어요`);
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

  const memoRow = (m, status) => [
    id, status, m.screen, String(m.blockId).replace(/-P(\.\d+)?$/, ''), /-P(\.\d+)?$/.test(m.blockId) ? 'Y' : 'N',
    m.blockId, m.start, m.end, m.quote, m.reaction, m.text, iso(m.createdTs), m.createdTs, m.updatedTs, m.deletedTs ?? '',
  ];
  p.memos.forEach((m) => memoRows.push(memoRow(m, '현재')));
  p.deleted.forEach((m) => memoRows.push(memoRow(m, '삭제')));
  caseRows.push(...buildCases(id, p, events));
  verRows.push([id, text(p.v1), text(p.v2)]);

  console.log(`\n[${id}] 이벤트 ${events.length}개${p.hasSaved ? '' : '  (세션 파일 없음: state.json 사용)'}`);
  for (const k of Object.keys(counts).sort()) console.log(`  ${k.padEnd(22)} ${counts[k]}`);
  const missing = EXPECTED_EVENTS.filter((k) => !counts[k]);
  if (missing.length) console.log(`  ※ 기록 없음: ${missing.join(', ')}`);
}

fs.writeFileSync(path.join(OUT, 'events.csv'), toCsv(evHeader, evRows));
fs.writeFileSync(path.join(OUT, 'memos.csv'), toCsv(memoHeader, memoRows));
fs.writeFileSync(path.join(OUT, 'cases.csv'), toCsv(caseHeader, caseRows));
fs.writeFileSync(path.join(OUT, 'versions.csv'), toCsv(verHeader, verRows));

console.log('\n[전체 이벤트 종류별 건수]');
for (const k of Object.keys(totalCounts).sort()) console.log(`  ${k.padEnd(22)} ${totalCounts[k]}`);
const missingAll = EXPECTED_EVENTS.filter((k) => !totalCounts[k]);
if (missingAll.length) console.log(`\n※ 전체에서 기록이 없는 이벤트: ${missingAll.join(', ')}`);
console.log(`\n저장 위치: ${OUT}`);
