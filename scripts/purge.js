// npm run purge <id> [--yes]
// data/<id> 폴더와 data/export/*.csv, data/coding/*.json 안의 해당 참여자 자료를 삭제한다. (철회 요청 시)
import readline from 'node:readline/promises';
import { ID_RE } from './lib/analysis.js';
import { purgeParticipant } from './lib/purge.js';

const id = process.argv[2];
const yes = process.argv.includes('--yes');
if (!id || !ID_RE.test(id)) {
  console.error('사용법: npm run purge S2-P01');
  process.exit(1);
}

if (!yes) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ans = await rl.question(`${id} 자료를 완전히 삭제합니다. 계속하려면 ID를 다시 입력하세요: `);
  rl.close();
  if (ans.trim() !== id) {
    console.log('취소했어요. 아무것도 삭제하지 않았어요.');
    process.exit(0);
  }
}

const r = purgeParticipant(id);
console.log(`${id} 삭제 완료 (폴더 ${r.folders}개)`);
if (r.csv.length) console.log(r.csv.map((c) => `  ${c.file}: ${c.removed}행 삭제`).join('\n'));
else console.log('  data/export 에 CSV 가 없어요.');
if (r.coding.length) console.log(r.coding.map((c) => `  coding/${c.file}: ${c.removed}사례 삭제`).join('\n'));
console.log('※ 녹음·녹화, 전사본, 동의서, 이메일 통지는 이 명령으로 지워지지 않아요. 직접 확인해 주세요.');
