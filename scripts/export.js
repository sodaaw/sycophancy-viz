// npm run export [id|all]  →  data/export/*.csv (UTF-8 BOM, 엑셀 호환)
// Node 내장 모듈만 사용. 외부로 전송하지 않는다.
import { ID_RE, listIds, writeExport } from './lib/analysis.js';

const arg = process.argv[2] || 'all';
const ids = arg === 'all' ? listIds() : [arg];
if (arg !== 'all' && !ID_RE.test(arg)) {
  console.error('사용법: npm run export [S2-P01|all]');
  process.exit(1);
}
if (!ids.length) {
  console.error('내보낼 참여자 폴더가 없어요 (data/S2-Pxx).');
  process.exit(1);
}
console.log(writeExport(ids).lines.join('\n'));
