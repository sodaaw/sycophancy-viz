// node scripts/merge-content.mjs : content_fill.json 의 최상위 키를 src/content.json 에 병합하고 검증한다.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'src/content.json');
const fill = JSON.parse(fs.readFileSync(path.join(root, 'content_fill.json'), 'utf8'));
const content = JSON.parse(fs.readFileSync(target, 'utf8'));

for (const k of Object.keys(fill)) content[k] = fill[k];
fs.writeFileSync(target, JSON.stringify(content, null, 2) + '\n');

const after = JSON.parse(fs.readFileSync(target, 'utf8'));
for (const k of Object.keys(fill)) assert.deepStrictEqual(after[k], fill[k], `${k} 불일치`);
console.log(`(a) deep-equal 통과: ${Object.keys(fill).length}개 키`);

const todos = [];
const walk = (n, p) => {
  if (typeof n === 'string') {
    if (n.includes('TODO')) todos.push(p);
  } else if (n && typeof n === 'object') for (const [k, v] of Object.entries(n)) walk(v, `${p}.${k}`);
};
walk(after, '');
console.log(`(b) TODO ${todos.length}개`, todos);
process.exit(todos.length ? 1 : 0);
