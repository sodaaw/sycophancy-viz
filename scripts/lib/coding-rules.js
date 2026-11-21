// 코딩 규칙. Node(export, /admin 서버)와 브라우저(/admin 화면)가 같은 파일을 쓴다. 외부 import 없음.

export const STAGES = ['인지', '해석', '작동', '반영'];

export const FIELDS = {
  인지: ['예', '아니오'],
  해석: ['정확', '부분', '오해', '없음'],
  작동: ['예', '아니오'],
  반영: ['반영', '부분', '미반영', '동조 댓글만 반영'],
};

// 단절 지점: 앞 단계부터 보아 '아니오' 또는 '없음'인 첫 단계 (문서 7-2 정의 그대로)
const BREAK = new Set(['아니오', '없음']);
export function breakPoint(c) {
  c = c || {};
  for (const s of STAGES) {
    if (c[s] === undefined) return '미입력';
    if (BREAK.has(c[s])) return s;
  }
  return '끊김 없음';
}

// 반영 미달: 반영이 '미반영' 또는 '동조 댓글만 반영'이면 Y, '부분'이면 표시만(부분), 그 밖에는 N, 미입력이면 빈칸
export function shortfall(c) {
  const v = (c || {}).반영;
  if (v === undefined) return '';
  if (v === '미반영' || v === '동조 댓글만 반영') return 'Y';
  if (v === '부분') return '부분';
  return 'N';
}

// 지각-행동 괴리: 인터뷰 문항 8의 접힌 안내(회색 표시) 점수가 4~5점인데 반영이 '미반영'
export function gap(score, c) {
  const v = (c || {}).반영;
  if (score == null || score === '' || v === undefined) return '';
  return Number(score) >= 4 && v === '미반영' ? 'Y' : 'N';
}
