// Vercel 데모 전용 진입점: 모든 /admin, /api 요청이 vercel.json 의 rewrite 로 여기에 모인다.
// 로컬 실험(npm start)에서는 쓰이지 않는다.
import { handler } from '../server.js';

export default handler;
