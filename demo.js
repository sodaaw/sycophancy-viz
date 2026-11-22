// 데모 모드(Vercel 등): 가상 데이터만 보여 주고, 참여자 입력은 저장하지 않는다.
// 로컬 실험에서는 켜지지 않는다 (VERCEL 환경변수가 있거나 DEMO_MODE=1 일 때만).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

export const DEMO = !!process.env.VERCEL || process.env.DEMO_MODE === '1';

// 데모는 읽기 전용 파일 시스템 때문에 임시 폴더에 가상 데이터를 복사해서 쓴다 (인스턴스가 바뀌면 초기화됨).
export const DATA_DIR = process.env.DATA_DIR || (DEMO ? path.join(os.tmpdir(), 'study2-demo') : path.join(ROOT, 'data'));

if (DEMO) {
  const src = path.join(ROOT, 'demo-data');
  const hasData = fs.existsSync(DATA_DIR) && fs.readdirSync(DATA_DIR).some((d) => /^S2-P\d{2,3}$/.test(d));
  if (!hasData && fs.existsSync(src)) fs.cpSync(src, DATA_DIR, { recursive: true });
}
