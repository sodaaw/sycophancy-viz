# Study 2 실험 프로토타입

사전 제작 피드백을 보며 글을 고치는 세션용 로컬 웹앱입니다. 외부 서버, 클라우드, 분석 도구, AI 호출을 쓰지 않습니다.

## 실행
1. `npm install`
2. `npm run build && npm start` 후 브라우저에서 http://localhost:3000 열기 (포트 변경: `PORT=3001 npm start`)
3. 세션 후 `npm run export all`

## 참여자 자료 (이 저장소에 없음)
- 세션 중 생기는 모든 자료(로그, 상태, 수정본, 메모, 내보내기 파일)는 실행한 컴퓨터의 `data/` 폴더에만 저장되며 git에서 제외됩니다.
- 이 저장소에는 참여자 자료, 이름, 연락처, 녹음·녹화, 동의서가 없습니다. 앞으로도 올리지 않습니다.
- 서버는 `127.0.0.1`에만 열리고 외부로 아무것도 전송하지 않습니다.

## 세션 후 체크리스트
- [ ] `npm run export all` 로 CSV 생성 (원본을 지우기 전에)
- [ ] `data/{id}/` (events.jsonl, state.json, `_세션.json`)와 `data/export/*.csv`를 암호화 저장소로 이동
- [ ] 이동을 확인한 뒤 이 노트북의 `data/{id}/`와 `data/export/*.csv` 삭제 (앱의 [다음 세션 준비]는 아무것도 지우지 않고, [초기화하고 시작]은 이전 폴더를 `data/{id}_r1`로 보관만 합니다. 연구 규정 변경으로 자료는 로컬에 남겨 둡니다)
- [ ] 코딩 결과(`data/coding/coder1.json`, `coder2.json`, `consensus.json`, `interview.json`)도 같이 암호화 저장소로 옮기고 삭제
- [ ] 철회 요청 시: `npm run purge S2-P01` (해당 폴더와 export CSV의 해당 참여자 행 삭제)

## 연구자 페이지 (/admin)
- http://localhost:3000/admin (PIN은 `.env` 의 `ADMIN_PIN`, 또는 `npm start -- --admin-pin=숫자`). `.env.example` 참고.
- 세션이 진행 중(저장 전)이면 접근이 막히고 "세션 진행 중"만 보입니다. 참여자 화면에는 이 주소가 나오지 않습니다.
- 내려받은 파일은 암호화 저장소로 옮기고 다운로드 폴더에서 삭제하세요. 클라우드 동기화 폴더에 두지 마세요.

## Vercel 데모 (실제 실험용 아님)
- `VERCEL` 환경변수가 있으면 데모 모드로 동작합니다: 가상 참여자(`demo-data/`)만 보이고, 참여자 화면의 입력(로그·수정본)은 저장하지 않고 버립니다.
- Vercel 프로젝트 환경변수에 `ADMIN_PIN` 을 설정해야 `/admin` 이 열립니다.
- 실제 실험은 항상 연구 노트북에서 `npm start` 로 실행하세요(자료는 로컬 `data/` 에만 저장).
