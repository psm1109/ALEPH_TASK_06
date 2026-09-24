# PDS Diary 프로젝트 인계 문서

마지막 수정: 2026-09-24 (Asia/Seoul)

## Git 상태

- 저장소: `psm1109/ALEPH_TASK_06`
- 작업 브랜치: `codex/card-1-auth`
- 현재 기준 커밋: `adc2bd7`
- 현재 브랜치와 원격 추적 브랜치는 같은 커밋을 가리킵니다. 작업 트리에는 아래 완료 수 집계 변경이 아직 커밋되지 않은 상태로 남아 있습니다.
- 원격 추적 브랜치: `origin/codex/card-1-auth`
- 고정된 최종 T06 조상 커밋: `bab809b`
- 현재 브랜치에는 병합 커밋 `59530ab`과 카드 1의 과거 커밋 두 개가 함께 있습니다. 앞으로는 현재 브랜치의 최신 파일과 HEAD를 기준으로 작업합니다.

## 선택한 인증 설계

- 인증 서비스: Supabase Auth
- 브라우저 라이브러리: `@supabase/supabase-js` `2.116.0`
- 로그인 방식: 이메일 + 비밀번호
- 비밀번호 해시: Supabase Auth가 관리하는 bcrypt와 계정별 무작위 salt
- 사용자 식별: `auth.uid()`
- 다이어리 권한 검사: 각 행의 `user_id`와 `auth.uid()`가 같아야 하는 PostgreSQL RLS
- 현재 코드의 워크스페이스 ID: `pds-main`

## 완료한 코드 작업

### 저장소 작업 및 인계 규칙

- 작업 시작 전에 `PROJECT_CONTEXT.md`를 확인하도록 정했습니다.
- 작업 종료 시 완료 범위·검사 결과·남은 문제·다음 단계를 갱신하도록 정했습니다.
- 코드 검사와 실제 Supabase·배포 환경 검증을 구분하도록 정했습니다.
- 커밋 Prefix와 본문 상세 항목 형식을 명문화했습니다.
- AI 완료 보고에 수정 내용·검사 결과·커밋 해시·남은 문제를 포함하도록 정했습니다.

관련 파일:

- `AGENTS.md`
- `PROJECT_CONTEXT.md`

### 카드 1 — 가입·로그인·로그아웃과 소유자 격리

- 가입·로그인 화면, 세션 복원, 로그아웃 처리를 추가했습니다.
- 세션이 없으면 `#plan`, `#do`, `#see`, `#history` 주소를 직접 열어도 다이어리 화면을 숨깁니다.
- 자료 요청의 access token은 URL이 아닌 `Authorization` 헤더로 보냅니다.
- 존재하지 않는 이메일과 틀린 비밀번호의 로그인 실패 문구를 같은 한국어 문장으로 표시합니다.
- `user_id` 소유권 열과 로그인 사용자용 RLS 정책을 추가했습니다.
- 기존 `pds-main` 자료를 본인 계정으로 옮기는 SQL을 추가했습니다.

관련 파일:

- `public/index.html`
- `public/app.js`
- `public/styles.css`
- `supabase/schema.sql`
- `supabase/card1-migrate-existing-data.sql`
- `docs/card-1-auth.md`
- `tests/card1-static.test.cjs`

### 카드 2 — 비밀번호 보관 검증 준비

- 비밀번호 저장과 비교는 직접 구현하지 않고 Supabase Auth에 맡겼습니다.
- 브라우저의 Supabase Auth 직접 로그인·가입 호출을 제거했습니다.
- 브라우저는 자격 증명을 AES-256-GCM으로 암호화하고, 일회용 AES 키를 RSA-OAEP-256으로 암호화해 `auth-gateway` Edge Function에 보냅니다.
- 네트워크 Request Payload에는 `mode`, `encrypted_key`, `iv`, `ciphertext`만 포함하며 이메일·비밀번호 필드를 넣지 않습니다.
- `auth-gateway`는 요청·응답 본문을 로그에 남기지 않고, Auth 오류 상세를 폐기하며 성공 응답도 세션 허용 목록 필드만 반환합니다.
- 가입·로그인 시도가 끝나면 비밀번호 입력칸을 비웁니다.
- 두 시험 계정의 bcrypt 해시를 표시하고 서로 다른지 확인하는 SQL Editor용 쿼리를 추가했습니다.
- 비밀번호·토큰을 가리는 제출문 초안을 추가했습니다.

관련 파일:

- `supabase/card2-password-evidence.sql`
- `docs/card-2-password.md`
- `tests/card2-password.test.cjs`
- `tests/auth-crypto.test.mjs`
- `public/auth-crypto.mjs`
- `supabase/functions/auth-gateway/index.ts`
- `supabase/config.toml`
- `scripts/generate-auth-key.mjs`
- `contracts/pds-schema-v2.json`
- `README.md`

### 카드 3 — access token 식별과 즉시 세션 폐기

- 브라우저는 Supabase access token JWT를 `Authorization` 헤더로 보내고, 서버는 JWT의 `sub`를 `auth.uid()`로 사용합니다.
- 서명상 유효한 JWT라도 `session_id`가 서버 `auth.sessions`에 남아 있지 않으면 Data API 요청을 거절하도록 `private.is_auth_session_active()`와 `private.check_auth_session()`을 추가했습니다.
- PostgREST의 `pgrst.db_pre_request`에서 비활성 세션을 HTTP 오류로 끝내고, 각 RLS 정책에도 활성 세션 조건을 중복 적용했습니다.
- 이 사전 요청 검사는 프로젝트의 모든 인증된 Data API 요청에 적용되므로, `auth.sessions` 행이 없는 외부 발급 JWT도 거절됩니다. 현재 앱은 Supabase Auth만 사용하지만 다른 인증 공급자를 추가할 때는 호환성을 다시 검토해야 합니다.
- 같은 URL·GET·같은 access token을 로그아웃 전후에 재사용하고 token 원문 대신 SHA-256 지문, `iat`, `exp`, 응답 상태만 출력하는 검증 스크립트를 추가했습니다.
- 현재 소스와 Git 전체 patch 기록에서 실제 `sb_secret_...`, private-key PEM, secret 환경 변수 값, service-role JWT를 찾는 검사를 추가했습니다.
- 제출문에 식별 방식, URL 비포함, 실제 만료 기록, 로그아웃 전후 `200 → 403` 비교, 비밀키 검사 결과를 기록했습니다.

관련 파일:

- `supabase/schema.sql`
- `supabase/card3-session-revocation.sql`
- `scripts/verify-session-revocation.mjs`
- `scripts/card3-browser-evidence.js`
- `docs/card-3-session-revocation.md`
- `tests/card3-session.test.cjs`
- `tests/git-secret-history.test.ps1`
- `README.md`

### 카드 4 — 계정 간 자료 소유권 격리

- 시험 계정 두 개를 만들고 각 계정에 `tasks` 자료 2건을 생성했습니다. 비밀번호는 실행 중에만 무작위로 만들고 출력·저장하지 않았습니다.
- RLS만 사용할 때 양방향 단건 읽기·수정·삭제가 실제 변경 없이 `200 []`로 끝나는 것을 재현했습니다.
- `diary-data` Edge Function이 `id=eq...` 단건 요청을 같은 JWT로 먼저 조회하고, 소유하지 않은 행과 없는 행을 모두 `404`로 반환하도록 추가했습니다.
- 브라우저 자료 요청을 직접 Data API 대신 `diary-data`를 통하도록 변경했습니다.
- 주소·임의 헤더·본문의 다른 사용자 ID를 신뢰하지 않고 Supabase JWT의 `auth.uid()`와 RLS만 사용자 식별에 사용합니다.
- 운영 Supabase에 `diary-data`를 배포하고 A→B, B→A 읽기·수정·삭제 6건이 모두 `404`인지 확인했습니다.
- 거절 전후 양쪽 자료 수가 각각 `2 → 2`였고, 최종 목록에서 상대 자료가 0건인지 확인했습니다.
- 비로그인 직접 요청은 `401`, 다른 사용자 ID를 넣은 삽입은 `403`으로 거절되는 것을 확인했습니다.

관련 파일:

- `supabase/functions/diary-data/index.ts`
- `supabase/config.toml`
- `public/app.js`
- `scripts/verify-owner-isolation.mjs`
- `tests/card4-owner-isolation.test.cjs`
- `docs/card-4-owner-isolation.md`
- `README.md`

## 완료한 확인

저장소 루트에서 다음 명령을 실행합니다.

```powershell
node tests\card1-static.test.cjs
node tests\card2-password.test.cjs
node tests\auth-crypto.test.mjs
node tests\card3-session.test.cjs
node tests\card4-owner-isolation.test.cjs
powershell -NoProfile -ExecutionPolicy Bypass -File tests\git-secret-history.test.ps1
node --check public\app.js
node --check scripts\generate-auth-key.mjs
node --check scripts\verify-session-revocation.mjs
node --check scripts\card3-browser-evidence.js
git diff --check
```

2026-09-23 마지막 실행 결과:

- 카드 1 정적 검사: 20개 통과
- 카드 2 비밀번호 검사: 23개 통과
- 인증 Payload 암호화 실행 검사: 5개 통과
- 카드 3 세션 정적·비밀값 검사: 25개 통과
- 카드 4 소유자 격리 검사: 19개 통과
- Git 전체 patch 기록 비밀값 검사: 통과
- `public/app.js` 문법 검사: 통과
- `scripts/generate-auth-key.mjs` 문법 검사: 통과
- `scripts/verify-session-revocation.mjs` 문법 검사: 통과
- `scripts/card3-browser-evidence.js` 문법 검사: 통과
- `scripts/verify-owner-isolation.mjs` 문법 검사: 통과
- RSA-OAEP-256 + AES-256-GCM 암호화·복호화 로컬 왕복 검사: 통과
- `git diff --check`: 통과(LF→CRLF 안내만 표시)

이전 2026-09-22 브라우저 검사에서는 로그인 화면 보호, 실패 후 입력칸 초기화, 콘솔 0건을 확인했습니다. 2026-09-23 운영 Vercel 앱에서 `auth-gateway`를 통한 실제 로그인이 성공했지만, 로그인 Payload와 Edge Function 로그의 비밀번호 원문 0건 검사는 아직 별도로 남아 있습니다.

## 2026-09-23 카드 3 실제 운영 확인

- 운영 웹 주소: `https://aleph-task-06.vercel.app/`
- Supabase 프로젝트: `eidvougocycgramikbwq`
- `supabase/card3-session-revocation.sql`을 운영 SQL Editor에서 실행했고 `Success. No rows returned`를 확인했습니다.
- 적용 뒤 로그인 상태 앱이 `Supabase 저장됨`으로 자료를 정상 조회하는 것을 확인했습니다.
- 검사 시각: `2026-09-23 14:27:10+09:00`
- 식별 값: Supabase access-token JWT의 `sub`와 활성 `auth.sessions.session_id`
- token 기록: 원문은 기록하지 않고 `[가림] (SHA-256: f60c8a939bed…)`만 기록했습니다.
- token 발급: `2026-09-23 14:20:56+09:00`
- token 만료: `2026-09-23 15:20:56+09:00`
- token 수명: `3,600초(1시간)`
- 같은 요청: `GET https://eidvougocycgramikbwq.supabase.co/rest/v1/plan_versions?select=id&limit=0`
- 로그인 상태 응답: HTTP `200`, 본문 `[]`
- 서버 로그아웃 응답: HTTP `204`
- 로그아웃 뒤 동일 token 재사용 응답: HTTP `403`, PostgreSQL 코드 `42501`, `The authentication session is no longer active.`
- 두 GET은 URL·방식·Authorization 값이 같고 그 사이의 서버 로그아웃 여부만 달랐습니다.
- 배포 페이지가 요청한 REST URL 5개를 확인했고 token·refresh token·`session_id`가 URL 쿼리에 포함된 요청은 없었습니다.
- 실제 Vercel 배포 파일 `/`, `/config.js`, `/app.js`, `/auth-crypto.mjs`, `/styles.css`를 검사했고 private secret 패턴 발견 건수는 `0`이었습니다.
- 전체 Git patch 기록의 private secret 패턴 검사도 통과했습니다.
- 브라우저 배포 대상인 `public` 파일 5개를 별도로 다시 검사했고 private secret 패턴 발견 건수는 `0`이었습니다.
- 검사 범위와 금지 패턴, 공개 `sb_publishable_...` 예외를 `docs/card-3-session-revocation.md`의 표에 기록했습니다.

## 2026-09-23 카드 4 실제 운영 확인

- 운영 Supabase 프로젝트에 `diary-data` Edge Function을 배포했습니다.
- 시험 계정 A/B를 만들고 각 계정에 `tasks` 자료 2건을 생성했습니다. 비밀번호·token은 기록하지 않았습니다.
- A→B 읽기·수정·삭제: 모두 HTTP `404`
- B→A 읽기·수정·삭제: 모두 HTTP `404`
- 거절 전후 건수: A `2 → 2`, B `2 → 2`
- 주소의 B 사용자 ID 지정: HTTP `200`, 빈 배열
- 임의 `X-User-Id` 헤더에 B 사용자 ID 지정: HTTP `200`, A 자료 2건만 반환
- 본문 `user_id`에 B 사용자 ID 지정: HTTP `403`, 새 행 없음
- 비로그인 직접 단건 요청: HTTP `401`
- 최종 목록: A 목록에 B 자료 0건, B 목록에 A 자료 0건
- 정확한 요청·응답과 시험 계정·자료 ID는 `docs/card-4-owner-isolation.md`에 기록했습니다.
- 새 `public/app.js`는 아직 Git 커밋·푸시·Vercel 재배포하지 않았습니다.

### 2026-09-24 카드 4 목록 운영 재검증

- 운영 Supabase에서 새 시험 계정 A·B를 만들고 각 계정에 `tasks` 자료 2건씩 생성한 뒤 실제 목록을 다시 호출했습니다.
- 검사 시각은 `2026-09-24 20:07:40+09:00`입니다.
- A 목록은 HTTP `200`으로 A 소유 ID `7`, `8`만 반환했고 B 소유 ID `9`, `10`과 B의 `user_id`는 0건이었습니다.
- B 목록은 HTTP `200`으로 B 소유 ID `9`, `10`만 반환했고 A 소유 ID `7`, `8`과 A의 `user_id`는 0건이었습니다.
- 비로그인 `401`이 아니라 로그인된 A·B 계정의 실제 목록 응답 본문을 대조해 “다른 계정의 자료가 하나도 들어 있지 않다”는 조건을 검증했습니다.
- 비밀번호·access token·refresh token은 출력하거나 문서에 기록하지 않았습니다.

관련 파일:

- `docs/card-4-owner-isolation.md`
- `PROJECT_CONTEXT.md`

실행한 검사:

- `node tests\\card4-owner-isolation.test.cjs` — 카드 4 소유자 격리 검사 19개 통과
- `git diff --check` — 통과(LF→CRLF 안내만 표시)
- `node scripts\\verify-owner-isolation.mjs` — 운영 재검증 성공; A/B 목록 모두 HTTP `200`, 각 목록의 상대 계정 자료 0건

### 2026-09-24 돌아보기 할 일 수와 근거 목록 정리

- 돌아보기의 첫 집계를 `계획 수`에서 `할 일 수`로 바꾸고, 현재 계획 버전의 `plan_version`과 연결된 할 일만 셉니다.
- 첫 집계의 근거 기록도 현재 계획에 연결된 할 일만 사용하도록 숫자와 목록의 기준을 맞췄습니다.
- 모든 근거 기록 항목에서는 상태·마감·예상·실제·차이·막힘 이유를 제거하고 할 일 제목만 표시합니다.
- 날짜별 지연 기록은 날짜 묶음과 건수를 유지하되, 묶음 안의 각 항목은 할 일 제목만 표시합니다.

관련 파일:

- `public/index.html`
- `public/app.js`
- `public/styles.css`
- `tests/see-task-evidence.test.cjs`
- `README.md`
- `PROJECT_CONTEXT.md`

실행한 검사:

- `node tests\\see-task-evidence.test.cjs` — 2개 통과
- `node --test`에 `tests` 디렉터리를 직접 넘긴 첫 시도 — Node가 디렉터리를 모듈로 해석해 `MODULE_NOT_FOUND`로 실패
- `tests`의 `*.test.cjs`, `*.test.mjs` 파일을 명시해 실행한 전체 Node 검사 — 23개 통과, 실패 0개
- `node --check public\\app.js` — 통과
- `git diff --check` — 통과(LF→CRLF 안내만 표시)

브라우저 확인 경계:

- 로컬 서버에서 앱과 로그인 보호 화면이 정상 로드되는 것까지 확인했습니다.
- 로그인 자격 증명을 사용하지 않았으므로 실제 자료가 들어 있는 돌아보기 화면의 시각 결과는 확인하지 않았습니다.

### 2026-09-24 돌아보기 완료 수 집계 변경

- 완료 수는 현재 체크 상태가 아니라 현재 계획의 집계 기간 시작일~종료일에 남은 `task_completion_events` 기록 수를 셉니다.
- 같은 할 일을 여러 날짜에 완료했다면 날짜별 완료 기록을 각각 1건으로 합산합니다.
- 완료 수 근거 기록은 날짜별 펼치기 항목으로 묶고, 각 항목 안에는 완료한 할 일 제목만 표시합니다.
- 할 일 수·지연 수·막힘 수·예상 시간·실제 시간·예상 대비 차이의 계산과 표시는 변경하지 않았습니다.

관련 파일:

- `public/daily-completion.mjs`
- `public/app.js`
- `public/index.html`
- `tests/week-record-separation.test.cjs`
- `tests/see-task-evidence.test.cjs`
- `README.md`
- `PROJECT_CONTEXT.md`

실행한 검사:

- `node tests\\see-task-evidence.test.cjs` — 3개 통과
- `node tests\\week-record-separation.test.cjs` — 8개 통과
- `tests`의 `*.test.cjs`, `*.test.mjs` 전체 Node 검사 — 25개 통과, 실패 0개
- `node --check public\\app.js` — 통과
- `git diff --check` — 통과(LF→CRLF 안내만 표시)

확인하지 않은 항목:

- 요청에 따라 로그인 후 실제 자료가 있는 돌아보기 화면의 시각 확인은 실행하지 않았습니다.

## 아직 필요한 실제 확인

다음 항목은 아직 완료하지 않았습니다.

1. 카드 4의 `public/app.js` 변경을 커밋·푸시한 뒤 Vercel 앱을 재배포하고, 실제 화면의 생성·수정·삭제 회귀를 확인합니다.
2. 기존 `pds-main` 자료를 본인 계정으로 이관해야 한다면 `supabase/card1-migrate-existing-data.sql`의 이메일 자리만 바꾼 뒤 실행합니다.
3. 카드 2 제출을 위해 `supabase/card2-password-evidence.sql`의 시험 계정 이메일 두 곳을 바꿔 실행하고 bcrypt 해시 차이를 기록합니다.
4. 배포된 앱에서 로그인 요청 Payload가 `mode`, `encrypted_key`, `iv`, `ciphertext`만 포함하는지 확인합니다. Response·Console·화면·Edge Function 로그에서 시험 비밀번호 원문을 검색해 모두 0건인지 확인합니다.

## 기존 자료 관련 주의사항

2026-09-22 마지막 읽기 전용 건수 확인에서는 Supabase의 다섯 다이어리 테이블(`plan_versions`, `tasks`, `task_execution_logs`, `task_completion_events`, `reflections`)에 `pds-main`과 `ccna-main` 자료가 모두 0건이었고 전체 행 수도 0건이었습니다. 이 정보는 현재 달라졌을 수 있으므로 이관 전에 다시 확인합니다. 여전히 0건이라면 T06 기존 자료를 옮겼다는 증거를 만들 수 없으므로, 자료를 복원하거나 본인 계정에 다시 입력해야 합니다.

## 보안 경계

- `public/config.js`에는 브라우저에서 사용해도 되는 Supabase Publishable key가 있습니다. secret key나 service-role key를 추가하지 않습니다.
- 데이터베이스 대시보드 자격 증명, 비밀번호, JWT, access token, refresh token, 쿠키, 인증 요청 원문을 커밋하지 않습니다.
- 제출 증거에서는 위 값을 `[가림]`으로 바꾸거나, 평가 기준이 허용하는 경우에만 비밀이 아닌 짧은 표시로 바꿉니다.
- `auth.users.encrypted_password`는 권한이 있는 Supabase 관리 화면에서만 확인하고 카드 2의 요구된 해시 증거를 만드는 용도로만 사용합니다.

## 다음 작업

카드 4 운영 API 검증과 제출문은 완료했습니다. 다음에는 변경을 커밋한 뒤 사용자 승인에 따라 원격에 올리고 Vercel 정적 앱을 재배포하여 실제 화면의 자료 생성·수정·삭제 회귀를 확인합니다. 카드 2의 로그인 Payload·응답·Console·Edge Function 로그 원문 0건 검증도 남아 있습니다.
