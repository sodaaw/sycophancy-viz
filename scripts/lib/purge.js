// 철회 삭제 공용 로직: npm run purge 와 /admin [철회 삭제] 가 같은 코드를 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import { DATA, EXPORT_DIR } from './analysis.js';

// 따옴표 안의 줄바꿈을 고려해 CSV 를 레코드 단위로 나눈다 (원문 유지)
function splitRecords(text) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') q = !q;
    if (!q && (ch === '\n' || (ch === '\r' && text[i + 1] === '\n'))) {
      if (ch === '\r') i++;
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

export function purgeParticipant(id) {
  let folders = 0;
  const dir = path.join(DATA, id);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    folders++;
  }
  const archive = path.join(DATA, '_archive');
  if (fs.existsSync(archive)) {
    for (const d of fs.readdirSync(archive)) {
      if (d.startsWith(`${id}_`)) {
        fs.rmSync(path.join(archive, d), { recursive: true, force: true });
        folders++;
      }
    }
  }

  const csv = [];
  if (fs.existsSync(EXPORT_DIR)) {
    for (const f of fs.readdirSync(EXPORT_DIR).filter((n) => n.endsWith('.csv'))) {
      const file = path.join(EXPORT_DIR, f);
      const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
      const records = splitRecords(raw);
      const kept = records.filter((r, i) => i === 0 || r.split(',')[0].replace(/"/g, '') !== id);
      const removed = records.length - kept.length;
      if (removed > 0) fs.writeFileSync(file, '﻿' + kept.join('\r\n') + '\r\n');
      csv.push({ file: f, removed });
    }
  }

  // 코딩 파일(data/coding/coder*.json)의 해당 사례
  const coding = [];
  const codingDir = path.join(DATA, 'coding');
  if (fs.existsSync(codingDir)) {
    for (const f of fs.readdirSync(codingDir).filter((n) => /^coder\d\.json$/.test(n))) {
      const file = path.join(codingDir, f);
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      let removed = 0;
      for (const k of Object.keys(j.cases || {})) {
        if (k.startsWith(`${id}|`)) {
          delete j.cases[k];
          removed++;
        }
      }
      if (removed > 0) fs.writeFileSync(file, JSON.stringify(j, null, 2));
      coding.push({ file: f, removed });
    }
  }
  return { folders, csv, coding };
}
