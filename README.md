# PHD PLAY 2026 — 송년회 레크리에이션 웹서비스

PHD Golf Club Year-End Party (2026.11.27)용 실시간 모바일 게임쇼입니다.
참석자는 휴대폰으로 URL에 접속해 이름을 고르고 입장 코드만 누르면 됩니다. 앱 설치나 회원가입은 필요 없습니다.

| 주소 | 용도 |
|---|---|
| `/` | 참석자 (실제 행사) |
| `/demo` | 참석자 (데모·리허설, 실제 데이터와 분리) |
| `/admin` | 사회자·관리자 (실제/데모 전환 버튼 있음) |
| `/qr` | 입장 QR코드 크게 보기 (`/qr?e=demo` 데모용) |

## 구성
- Next.js 14 (App Router) + TypeScript + Tailwind CSS + Framer Motion + Lucide
- Supabase PostgreSQL (모든 읽기/쓰기는 서버 API에서만 처리, RLS 적용)
- Supabase Realtime: `sync` 테이블 변경 신호 → 모든 휴대폰 즉시 갱신 (끊기면 2초 간격 자동 확인으로 대체)
- 서버 기준 시간·채점·추첨, 정답은 결과 공개 전까지 브라우저로 전송하지 않음

## 배포 (약 20분)

### 1) Supabase
1. https://supabase.com → New project (Region: **Northeast Asia (Seoul)**), DB 비밀번호를 기록해 둡니다.
2. 왼쪽 **SQL Editor**에서 아래 두 파일 내용을 차례로 붙여 넣고 Run:
   - `supabase/migrations/001_schema.sql`
   - `supabase/migrations/002_seed_questions.sql`
3. 상단 **Connect** 버튼 → **Transaction pooler** 연결 문자열(포트 6543)을 복사하고 `[YOUR-PASSWORD]`를 DB 비밀번호로 바꿉니다. → `DATABASE_URL`
4. **Project Settings → API**에서 Project URL과 `anon public` 키를 복사합니다.
   → `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (service_role 키는 사용하지 않습니다.)
5. **Database → Publications → supabase_realtime**에 `sync` 테이블이 켜져 있는지 확인합니다(001 SQL이 자동 등록).

### 2) Vercel
1. 이 폴더를 GitHub 새 저장소에 올립니다 (`.env.local`은 올리지 마세요).
2. https://vercel.com → Add New → Project → 저장소 Import.
3. Environment Variables에 `.env.example`의 5개 값을 입력:
   `DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy. 완료되면 `https://프로젝트.vercel.app/admin` 으로 접속해 로그인합니다.
   (`vercel.json`이 서버 위치를 서울(icn1)로 지정합니다.)

### 3) 배포 후 점검 (필수)
```bash
npm install
BASE=https://프로젝트.vercel.app ADMIN_PASSWORD=관리자비번 node scripts/simulate.mjs
```
데모 행사에서 가상 18명이 동시에 9개 게임을 모두 진행하며 점수·중복방지·보안을 자동 검증합니다. 마지막 줄에 `모든 검증 통과`가 나오면 정상입니다. (실제 행사 데이터는 건드리지 않습니다.)

## 로컬 실행
```bash
npm install
cp .env.example .env.local   # 값 입력 (로컬 Postgres면 DB_SSL=false 추가)
npm run dev                   # http://localhost:3000
npm test                      # 점수 계산 단위 테스트
```

## 폴더
- `lib/scoring.ts` 점수 계산(순수 함수) · `lib/engine.ts` 참석자 상태/응답 · `lib/admin.ts` 관리자 기능
- `components/Participant.tsx`, `components/games.tsx` 참석자 화면 · `components/Admin.tsx` 관리자 화면
- `supabase/migrations` DB 스키마·RLS·서버 함수·문제은행 · `scripts/questions_data.py` 문제은행 원본
- `scripts/simulate.mjs` 18명 동시 접속 시뮬레이션 · `tests/` 단위 테스트
- `GUIDE.md` 사회자 운영 가이드 · `TEST_RESULTS.md` 테스트 결과·알려진 제약
