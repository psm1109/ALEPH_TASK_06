# PDS Diary 프로젝트 인계 문서

마지막 수정: 2026-09-26 (Asia/Seoul)

## Git 상태

- 저장소: `psm1109/ALEPH_TASK_06`
- 작업 브랜치: `codex/card-1-auth`
- 현재 기능 기준 커밋: `e130faf`
- Rate Limit 운영 조정 기록과 Turnstile 연동 코드·테스트·문서를 `e130faf`로 커밋해 `origin/codex/card-1-auth`에 푸시했습니다.
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
- `supabase/migrate-existing-data.sql`
- `docs/card-1-auth.md`
- `tests/card1-static.test.cjs`

### 카드 2 — 비밀번호 보관 검증 준비

- 비밀번호 저장과 비교는 직접 구현하지 않고 Supabase Auth에 맡겼습니다.
- 브라우저의 Supabase Auth 직접 로그인·가입 호출을 제거했습니다.
- 브라우저는 자격 증명을 AES-256-GCM으로 암호화하고, 일회용 AES 키를 RSA-OAEP-256으로 암호화해 `auth-gateway` Edge Function에 보냅니다.
- 네트워크 Request Payload에는 `mode`, 일회용 `captcha_token`, `encrypted_key`, `iv`, `ciphertext`만 포함하며 이메일·비밀번호 필드를 넣지 않습니다.
- `auth-gateway`는 요청·응답 본문을 로그에 남기지 않고, Auth 오류 상세를 폐기하며 성공 응답도 세션 허용 목록 필드만 반환합니다.
- 가입·로그인 시도가 끝나면 비밀번호 입력칸을 비웁니다.
- 두 시험 계정의 bcrypt 해시를 표시하고 서로 다른지 확인하는 SQL Editor용 쿼리를 추가했습니다.
- 비밀번호·토큰을 가리는 제출문 초안을 추가했습니다.

관련 파일:

- `supabase/password-evidence.sql`
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
- `supabase/session-revocation.sql`
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
- `supabase/session-revocation.sql`을 운영 SQL Editor에서 실행했고 `Success. No rows returned`를 확인했습니다.
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

- 돌아보기의 첫 집계를 `계획 수`에서 `할 일 수`로 바꾸고, 계획이 존재할 때 기존 할 일을 셉니다.
- 첫 집계의 근거 기록도 같은 기존 할 일 전체를 사용하도록 숫자와 목록의 기준을 맞췄습니다.
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

### 2026-09-24 완료 체크 해제 시 완료 수 즉시 동기화

- Plan 탭에서 오늘 완료 체크 해제가 저장되면 브라우저 상태에서도 해당 할 일의 오늘 완료 기록을 즉시 제거합니다.
- 돌아보기 완료 수와 오늘 날짜의 완료 근거 목록을 바로 다시 렌더링한 뒤 서버 완료 기록을 재조회해 최종 상태를 맞춥니다.
- 지난 날짜의 완료 기록은 제거하지 않으며 다른 돌아보기 항목의 계산과 표시는 변경하지 않았습니다.

관련 파일:

- `public/daily-completion.mjs`
- `public/app.js`
- `tests/week-record-separation.test.cjs`
- `README.md`
- `PROJECT_CONTEXT.md`

실행한 검사:

- `node tests\\week-record-separation.test.cjs` — 8개 통과
- `node tests\\see-task-evidence.test.cjs` — 3개 통과
- `tests`의 `*.test.cjs`, `*.test.mjs` 전체 Node 검사 — 25개 통과, 실패 0개
- `node --check public\\app.js` — 통과
- `git diff --check` — 통과(LF→CRLF 안내만 표시)

확인하지 않은 항목:

- 요청에 따라 로그인 후 실제 체크 해제 화면 확인은 실행하지 않았습니다.

### 2026-09-24 실행 기록 기반 자동 완료

- Plan 탭의 완료 체크박스를 읽기 전용으로 바꿔 직접 클릭으로 완료 상태를 바꿀 수 없게 했습니다.
- 오늘 해당 할 일에 실행 기록이 하나 이상 있으면 자동 체크하고, 실행 기록이 없으면 체크하지 않습니다.
- 같은 할 일의 같은 날짜 실행 기록이 여러 건이어도 완료 수는 1건으로 계산합니다.
- 마지막 실행 기록을 삭제하거나 실행 기록의 날짜·연결 할 일을 수정하면 Plan 체크, 주간 완료 수, 돌아보기 완료 수와 근거 목록이 함께 다시 계산됩니다.
- 날짜별 미완료 판단도 별도 체크 기록이 아니라 실행 기록에서 만든 할 일·날짜별 완료 자료를 사용합니다.
- 기존 `task_completion_events`는 호환과 내보내기를 위해 보존하지만 현재 화면 완료 계산에는 사용하지 않습니다. 데이터베이스 SQL이나 운영 자료는 변경하지 않았습니다.

관련 파일:

- `public/app.js`
- `public/daily-completion.mjs`
- `public/index.html`
- `public/styles.css`
- `tests/week-record-separation.test.cjs`
- `tests/see-task-evidence.test.cjs`
- `contracts/pds-schema-v2.json`
- `README.md`
- `PROJECT_CONTEXT.md`

실행한 검사:

- `node tests\\week-record-separation.test.cjs` — 9개 통과
- `node tests\\see-task-evidence.test.cjs` — 3개 통과
- `tests`의 `*.test.cjs`, `*.test.mjs` 전체 Node 검사 — 26개 통과, 실패 0개
- `node --check public\\app.js` — 통과
- `contracts/pds-schema-v2.json` JSON 파싱 — 통과
- `git diff --check` — 통과(LF→CRLF 안내만 표시)

확인하지 않은 항목:

- 요청에 따라 로그인 후 실행 기록 추가·수정·삭제에 따른 실제 화면 변화는 확인하지 않았습니다.

### 2026-09-24 날짜별 지연 수 기준 변경

- 현재 계획에 연결된 할 일을 집계 기간의 날짜마다 확인하고, 해당 날짜에 실행 기록이 없었던 할 일을 지연 1건으로 기록합니다.
- 예를 들어 어제 존재한 할 일 5개 중 3개에 실행 기록이 있으면 나머지 2개를 어제 날짜의 지연 기록으로 만듭니다.
- 현재 계획 집계 기간 밖 날짜는 기록하지 않습니다.
- 마감일은 일일 지연 판단을 늦추지 않습니다.
- 기존에 저장된 다른 계획·기간의 미완료 기록은 삭제하지 않고 현재 지연 수와 근거 목록에서 제외합니다.
- 할 일 수·완료 수·막힘 수·시간 집계는 변경하지 않았습니다.

관련 파일:

- `public/missed-days.mjs`
- `public/app.js`
- `tests/missed-days.test.cjs`
- `contracts/pds-schema-v2.json`
- `supabase/daily-missed-days.sql`
- `README.md`
- `PROJECT_CONTEXT.md`

실행한 검사:

- `node tests\\missed-days.test.cjs` — 7개 통과
- `node tests\\week-record-separation.test.cjs` — 9개 통과
- `tests`의 `*.test.cjs`, `*.test.mjs` 전체 Node 검사 — 28개 통과, 실패 0개
- `node --check public\\app.js` — 통과
- `contracts/pds-schema-v2.json` JSON 파싱 — 통과
- `git diff --check` — 통과(LF→CRLF 안내만 표시)

확인하지 않은 항목:

- 요청에 따라 로그인 후 실제 지연 수와 날짜별 근거 목록의 화면 확인은 실행하지 않았습니다.

### 2026-09-24 계획 수정 시 기존 할 일 유지

- 계획 수정으로 새 `plan_versions.version`이 생겨도 기존 할 일을 최신 버전 번호로 필터링하지 않도록 변경했습니다.
- 계획이 존재하는 동안 돌아보기의 할 일 수와 근거 목록에서 기존 할 일 전체를 유지합니다.
- 날짜별 지연 계산도 동일한 할 일 집합을 사용하므로 계획 수정 직후 기존 할 일이 지연 집계에서 빠지지 않습니다.
- 데이터베이스 행과 다른 돌아보기 집계 항목은 변경하지 않았습니다.

관련 파일:

- `public/app.js`
- `tests/see-task-evidence.test.cjs`
- `tests/missed-days.test.cjs`
- `README.md`
- `PROJECT_CONTEXT.md`

실행한 검사:

- `node tests\see-task-evidence.test.cjs` — 3개 통과
- `node tests\missed-days.test.cjs` — 7개 통과
- `tests`의 `*.test.cjs`, `*.test.mjs` 전체 Node 검사 — 28개 통과, 실패 0개
- `node --check public\app.js` — 통과
- `git diff --check` — 통과(LF→CRLF 안내만 표시)

확인하지 않은 항목:

- 요청에 따라 로그인 후 계획 수정 전후의 실제 화면 확인은 실행하지 않았습니다.

### 2026-09-24 지연 수를 일별 총 할 일에서 동적 재계산

- 기존 구현은 오늘을 제외하고 할 일 생성일부터만 계산했으며, 한 번 저장된 `task_missed_days` 행을 완료 기록이 추가된 뒤에도 화면에서 계속 세어 현재 완료 수와 맞지 않았습니다.
- 지연 수는 현재 할 일 목록을 계획 시작일부터 오늘까지 각 날짜에 적용한 전체 건수에서 날짜별 완료 건수를 제외해 매번 다시 계산합니다.
- 할 일 5개, 경과 4일, 완료 12건인 예시를 회귀 검사로 추가했으며 지연 8건을 확인했습니다.
- 실행 기록이 추가·수정·삭제되면 저장된 과거 미완료 행과 관계없이 현재 실행 기록으로 지연 수와 날짜별 근거 목록을 다시 계산합니다.
- 다른 돌아보기 집계 항목과 데이터베이스 구조는 변경하지 않았습니다.

관련 파일:

- `public/missed-days.mjs`
- `public/app.js`
- `tests/missed-days.test.cjs`
- `README.md`
- `PROJECT_CONTEXT.md`

실행한 검사:

- `node tests\missed-days.test.cjs` — 8개 통과
- `node tests\see-task-evidence.test.cjs` — 3개 통과
- `node tests\week-record-separation.test.cjs` — 9개 통과
- `tests`의 `*.test.cjs`, `*.test.mjs` 전체 Node 검사 — 29개 통과, 실패 0개
- `node --check public\app.js` — 통과
- `node --check public\missed-days.mjs` — 통과
- `git diff --check` — 통과(LF→CRLF 안내만 표시)

확인하지 않은 항목:

- 요청에 따라 로그인 후 실제 지연 수와 날짜별 펼치기 화면은 확인하지 않았습니다.

### 2026-09-24 막힘 수 날짜별 근거 표시

- 막힘 수는 현재 계획의 집계 기간 안에서 의미 있는 막힘 이유가 등록된 실행 기록 수를 셉니다.
- 빈 값과 `없음`, `없었음`, `없어요`, `none`, `n/a`, `-`는 막힘 이유에서 제외합니다.
- 막힘 수의 근거 기록은 날짜별 펼치기로 표시하며, 각 날짜 안에서 할 일 제목과 작성된 막힘 이유를 함께 보여 줍니다.
- 같은 날짜·같은 할 일의 실행 기록이 여러 개여도 각각 별도 막힘 기록으로 표시합니다.
- 다른 돌아보기 집계 항목과 데이터베이스 구조는 변경하지 않았습니다.

관련 파일:

- `public/daily-completion.mjs`
- `public/app.js`
- `public/index.html`
- `public/styles.css`
- `tests/week-record-separation.test.cjs`
- `tests/see-task-evidence.test.cjs`
- `README.md`
- `PROJECT_CONTEXT.md`

실행한 검사:

- `node tests\week-record-separation.test.cjs` — 11개 통과
- `node tests\see-task-evidence.test.cjs` — 3개 통과
- `tests`의 `*.test.cjs`, `*.test.mjs` 전체 Node 검사 — 30개 통과, 실패 0개
- `node --check public\app.js` — 통과
- `node --check public\daily-completion.mjs` — 통과
- `git diff --check` — 통과(LF→CRLF 안내만 표시)

확인하지 않은 항목:

- 요청에 따라 로그인 후 실제 막힘 수와 날짜별 이유 표시 화면은 확인하지 않았습니다.

### 2026-09-24 막힘 수를 작성 기록 건수로 수정

- 이전 구현이 막힘 수를 고유 할 일 수로 계산해 `홈 LAB 실습 하기`에 막힘 기록이 4건이어도 1건으로 표시하던 원인을 수정했습니다.
- 막힘 이유가 있는 실행 기록을 하나씩 세므로 같은 할 일에 기록이 4건이면 막힘 수도 4건입니다.
- 날짜별 펼치기에서도 각 실행 기록의 할 일 제목과 막힘 이유를 별도 항목으로 표시합니다.
- 완료 수·지연 수 등 다른 돌아보기 항목은 변경하지 않았습니다.

관련 파일:

- `public/daily-completion.mjs`
- `public/app.js`
- `public/index.html`
- `tests/week-record-separation.test.cjs`
- `tests/see-task-evidence.test.cjs`
- `README.md`
- `PROJECT_CONTEXT.md`

실행한 검사:

- `node tests\week-record-separation.test.cjs` — 11개 통과
- `node tests\see-task-evidence.test.cjs` — 3개 통과
- `tests`의 `*.test.cjs`, `*.test.mjs` 전체 Node 검사 — 31개 통과, 실패 0개
- `node --check public\app.js` — 통과
- `node --check public\daily-completion.mjs` — 통과
- `git diff --check` — 통과(LF→CRLF 안내만 표시)

확인하지 않은 항목:

- 요청에 따라 로그인 후 `홈 LAB 실습 하기`의 실제 막힘 수 4건 표시는 확인하지 않았습니다.

### 2026-09-24 예상 시간을 일일 합계와 오늘까지의 경과 일수로 계산

- 돌아보기 예상 시간은 현재 할 일의 일일 예상 시간 합계에 계획 시작일부터 오늘까지 시작일과 오늘을 포함한 경과 일수를 곱해 표시합니다.
- 예를 들어 일일 예상 시간 합계가 150분이고 계획 시작일부터 오늘까지 4일이면 예상 시간은 600분입니다.
- 예상 시간의 근거 기록에는 각 할 일 제목과 해당 할 일의 일일 예상 시간을 오른쪽에 함께 표시합니다.
- 예상 대비 차이를 포함한 다른 돌아보기 항목의 기존 계산은 변경하지 않았습니다.

관련 파일:

- `public/daily-completion.mjs`
- `public/app.js`
- `public/index.html`
- `public/styles.css`
- `tests/week-record-separation.test.cjs`
- `tests/see-task-evidence.test.cjs`
- `README.md`
- `PROJECT_CONTEXT.md`

실행한 검사:

- `node tests\week-record-separation.test.cjs` — 11개 통과
- `node tests\see-task-evidence.test.cjs` — 4개 통과
- `tests`의 `*.test.cjs`, `*.test.mjs` 전체 Node 검사 — 32개 통과, 실패 0개
- `node --check public\app.js` — 통과
- `node --check public\daily-completion.mjs` — 통과
- `git diff --check` — 통과(LF→CRLF 안내만 표시)

확인하지 않은 항목:

- 요청에 따라 로그인 후 실제 예상 시간과 항목별 근거 표시 화면은 확인하지 않았습니다.

### 2026-09-24 실제 시간을 날짜별 실행 완료 기록으로 집계

- 돌아보기 실제 시간은 현재 계획의 집계 시작일~종료일 안에 있는 실행 기록만 합산합니다.
- 실제 시간 근거 기록은 날짜별 펼치기로 표시하고, 날짜 제목에 해당 날짜의 실행 기록 건수와 실제 시간 합계를 함께 표시합니다.
- 각 날짜 안에는 실행 완료 내역의 할 일 제목과 실제 소요 시간을 표시합니다.
- 예상 대비 차이를 포함한 다른 돌아보기 항목의 기존 계산은 변경하지 않았습니다.

관련 파일:

- `public/daily-completion.mjs`
- `public/app.js`
- `public/index.html`
- `tests/week-record-separation.test.cjs`
- `tests/see-task-evidence.test.cjs`
- `README.md`
- `PROJECT_CONTEXT.md`

실행한 검사:

- `node tests\week-record-separation.test.cjs` — 12개 통과
- `node tests\see-task-evidence.test.cjs` — 5개 통과
- `tests`의 `*.test.cjs`, `*.test.mjs` 전체 Node 검사 — 34개 통과, 실패 0개
- `node --check public\app.js` — 통과
- `node --check public\daily-completion.mjs` — 통과
- `git diff --check` — 통과(LF→CRLF 안내만 표시)

확인하지 않은 항목:

- 요청에 따라 로그인 후 실제 시간의 날짜별 합계와 실행 완료 내역 화면은 확인하지 않았습니다.

### 2026-09-24 예상 대비 차이의 날짜별 상세 표시

- 예상 대비 차이는 돌아보기에 표시되는 실제 시간에서 계획 시작일부터 오늘까지의 누적 예상 시간을 뺀 값으로 계산합니다.
- 근거 기록은 계획 시작일부터 오늘까지 날짜별 펼치기로 표시합니다.
- 각 날짜 안의 모든 할 일에 실제 시간, 일일 예상 시간, `실제 − 예상` 차이를 표시합니다.
- 날짜 제목에는 그날의 전체 실제 시간에서 일일 예상 시간 합계를 뺀 일일 총 시간 차이를 표시합니다.
- `일일 총 시간 차이` 문구와 차이 시간은 같은 줄에 나란히 표시합니다.
- 완료 수·지연 수·막힘 수·예상 시간·실제 시간의 기존 계산은 변경하지 않았습니다.

관련 파일:

- `public/daily-completion.mjs`
- `public/app.js`
- `public/index.html`
- `tests/week-record-separation.test.cjs`
- `tests/see-task-evidence.test.cjs`
- `README.md`
- `PROJECT_CONTEXT.md`

실행한 검사:

- `node tests\week-record-separation.test.cjs` — 12개 통과
- `node tests\see-task-evidence.test.cjs` — 6개 통과
- `tests`의 `*.test.cjs`, `*.test.mjs` 전체 Node 검사 — 35개 통과, 실패 0개
- `node --check public\app.js` — 통과
- `node --check public\daily-completion.mjs` — 통과
- `git diff --check` — 통과(LF→CRLF 안내만 표시)

확인하지 않은 항목:

- 요청에 따라 로그인 후 예상 대비 차이와 날짜별 상세 화면은 확인하지 않았습니다.

### 2026-09-24 근거 기록 높이·날짜 정렬·스크롤 개선

- 할 일 수와 예상 시간 근거 항목에 같은 최소 높이를 적용해 카드 높이를 맞췄습니다.
- 완료 수·지연 수·막힘 수·실제 시간·예상 대비 차이의 날짜 그룹을 최신 날짜부터 내림차순으로 정렬했습니다.
- 날짜 그룹은 기본 접힘 상태로 표시하고, 오늘 날짜는 강조 스타일을 적용했습니다.
- 날짜 그룹이 쌓여도 근거 목록 전체가 커지지 않도록 목록 컨테이너에 최대 높이와 세로 스크롤을 적용했습니다.

관련 파일:

- `public/app.js`
- `public/styles.css`
- `tests/see-task-evidence.test.cjs`
- `README.md`
- `PROJECT_CONTEXT.md`

실행한 검사:

- `node tests\see-task-evidence.test.cjs` — 6개 통과
- `tests`의 `*.test.cjs`, `*.test.mjs` 전체 Node 검사 — 35개 통과, 실패 0개
- `node --check public\app.js` — 통과
- `git diff --check` — 통과(LF→CRLF 안내만 표시)

확인하지 않은 항목:

- 요청에 따라 로그인 후 실제 모바일·데스크톱 근거 기록 스크롤 화면은 확인하지 않았습니다.

## 아직 필요한 실제 확인

다음 항목은 아직 완료하지 않았습니다.

1. 카드 4의 `public/app.js` 변경을 커밋·푸시한 뒤 Vercel 앱을 재배포하고, 실제 화면의 생성·수정·삭제 회귀를 확인합니다.
2. 기존 `pds-main` 자료를 본인 계정으로 이관해야 한다면 `supabase/migrate-existing-data.sql`의 이메일 자리만 바꾼 뒤 실행합니다.
3. 카드 2 제출을 위해 `supabase/password-evidence.sql`의 시험 계정 이메일 두 곳을 바꿔 실행하고 bcrypt 해시 차이를 기록합니다.
4. 배포된 앱에서 로그인 요청 Payload가 `mode`, `captcha_token`, `encrypted_key`, `iv`, `ciphertext`만 포함하는지 확인합니다. Response·Console·화면·Edge Function 로그에서 시험 비밀번호 원문을 검색해 모두 0건인지 확인합니다. CAPTCHA 토큰도 제출 자료나 로그에 복사하지 않습니다.

## 기존 자료 관련 주의사항

2026-09-22 마지막 읽기 전용 건수 확인에서는 Supabase의 다섯 다이어리 테이블(`plan_versions`, `tasks`, `task_execution_logs`, `task_completion_events`, `reflections`)에 `pds-main`과 `ccna-main` 자료가 모두 0건이었고 전체 행 수도 0건이었습니다. 이 정보는 현재 달라졌을 수 있으므로 이관 전에 다시 확인합니다. 여전히 0건이라면 T06 기존 자료를 옮겼다는 증거를 만들 수 없으므로, 자료를 복원하거나 본인 계정에 다시 입력해야 합니다.

## 보안 경계

- `public/config.js`에는 브라우저에서 사용해도 되는 Supabase Publishable key가 있습니다. secret key나 service-role key를 추가하지 않습니다.
- 데이터베이스 대시보드 자격 증명, 비밀번호, JWT, access token, refresh token, 쿠키, 인증 요청 원문을 커밋하지 않습니다.
- 제출 증거에서는 위 값을 `[가림]`으로 바꾸거나, 평가 기준이 허용하는 경우에만 비밀이 아닌 짧은 표시로 바꿉니다.
- `auth.users.encrypted_password`는 권한이 있는 Supabase 관리 화면에서만 확인하고 카드 2의 요구된 해시 증거를 만드는 용도로만 사용합니다.

## 2026-09-24 카드 5 설명서·계정 수명주기 1차 작업

- 완료: `docs/card-5-auth-guide-and-five-day-use.md`에 인증 구현 설명서 여섯 항목, 네 흐름의 소스 위치, 성공·거절 요청 표, 무차별 대입 미방어 위험, 질문·지표·단위·계산 규칙, 5일 기록표와 T06 연결을 작성했습니다.
- 완료: 전체 JSON 내보내기 경로를 카드 5 문서와 계약서에 연결했습니다.
- 완료: `account-delete` Edge Function, 로그인 후 `계정 삭제` 버튼, 계정 삭제 확인 문구를 추가했습니다. Auth 사용자 삭제 후 `on delete cascade`로 연결 자료가 삭제되도록 기존 스키마 경계를 사용합니다.
- 현재 브랜치/커밋: `codex/card-1-auth` / `a593eed` 기준이며 이번 변경은 아직 커밋하지 않았습니다.
- 고정 T06 조상: `bab809b`; `git merge-base --is-ancestor bab809b HEAD` 통과.

관련 파일:

- `docs/card-5-auth-guide-and-five-day-use.md`
- `public/index.html`, `public/app.js`, `public/styles.css`
- `supabase/functions/account-delete/index.ts`, `supabase/config.toml`
- `contracts/pds-schema-v2.json`, `README.md`
- `tests/card5-account-lifecycle.test.cjs`

실행한 검사:

- `node --check public/app.js` — 통과
- `node tests/card5-account-lifecycle.test.cjs` — 8개 통과
- 카드 1~4·암호화·응답·집계 관련 기존 Node 검사 — 통과
- `node --check scripts/card3-browser-evidence.js` — 통과
- 계약 JSON 파싱 — 통과
- `git diff --check` — 통과(LF→CRLF 안내만 표시)

아직 확인하지 못한 항목:

- 아래 2026-09-26 후속 기록에서 `account-delete` 운영 배포와 브라우저의 계정 삭제 진행은 확인했습니다. 삭제 전후 데이터베이스 행 수 대조는 아직 별도 확인하지 않았습니다.
- 2026-09-24 당시에는 서로 다른 Asia/Seoul 실제 날짜 5일의 사용자 기록, 규칙 변경 시각·이유, 화면 합계와 손계산 대조가 아직 없었습니다. 5일 기록과 합계 대조는 아래 2026-09-26 항목에서 확인했습니다.
- 카드 2의 운영 bcrypt 결과와 인증 Payload·응답·Console·Edge Function 로그 원문 0건 확인은 여전히 운영 검증 전입니다.

다음 단계:

1. 새 정적 앱을 재배포합니다.
2. 별도 시험 계정에서 내보내기 후 삭제 전후 자료 행 수와 재로그인 거절을 가린 응답으로 기록합니다.
3. 2일차 기록 뒤·3일차 기록 앞에 실제로 규칙을 바꿨는지와 정확한 시각·이유를 확인합니다. 확인할 수 없다면 현재 5일을 변경 전·후 증거로 사용하지 않습니다.
4. 규칙 변경 사실이 확인되면 변경 전 2일 평균과 변경 후 3일 평균을 같은 분/일 규칙으로 계산합니다.

## 2026-09-26 카드 5 실제 5일 기록 합계 확인

- 운영 배포 앱에 로그인한 상태에서 `See > 실제 시간`의 날짜별 근거 기록을 읽기 전용으로 확인했습니다.
- 서로 다른 날짜는 2026.09.21~2026.09.25의 5일이며 실행 기록은 총 14건입니다.
- 날짜별 손계산은 9/21 `12+42+38=92분`, 9/22 `18+55+48=121분`, 9/23 `17+62+45=124분`, 9/24 `16+53+42=111분`, 9/25 `26+49=75분`입니다.
- 총합 `523분=8시간 43분`이 화면의 실제 시간 `8시간 43분`과 일치했고, 5일 전체 평균은 `104.6분/일`입니다.
- `docs/card-5-auth-guide-and-five-day-use.md`에 위 검증값과 일평균 반올림 규칙을 반영했습니다.

확인하지 못한 항목:

- 사용자는 2일차 기록 뒤·3일차 기록 앞에 규칙을 실제로 바꿨지만 당시 변경 기록을 남기지 못했다고 2026.09.26에 바로잡았습니다. 사후 기록에는 실제 변경 시각과 사후 작성 시각을 구분하고, 기억나지 않는 시각을 임의로 만들지 않습니다.
- 변경 전 규칙은 `그날 가능한 할 일을 별도 최우선 항목 없이 진행한다`, 변경 후 규칙은 `하루 시작 전에 가장 중요한 할 일 하나를 정하고 그 일을 가장 먼저 진행한다`로 정했습니다. 기록 방식은 유지하고 우선순위 선택 규칙 하나만 변경합니다.
- 이유는 제한된 학습 시간을 CCNA 핵심 학습에 먼저 사용하고 집중 분산을 줄이기 위해서입니다.
- 변경 전 평균은 `106.5분/일`, 변경 후 평균은 `103.3분/일`로 같은 단위와 계산 규칙을 적용했으며, 변경 후 `3.2분/일` 감소한 결과를 그대로 기록했습니다.
- 제출문에는 3일차 적용 시작 기준인 `2026.09.23 00:00 (Asia/Seoul)`을 규칙 변경 적용 시각으로 표시했습니다.
- 제출문에서 과정 설명을 줄이고 AI에게 맡긴 일·직접 판단한 일·따르지 않은 제안, 네 항목의 짧은 확인 방법, 5일 수치와 전후 비교를 통과 기준에 맞춰 분리했습니다.
- 앱의 계획 변경 이력에는 2026.09.24의 계획 수정만 표시되므로, 이것만으로 2026.09.22 기록 뒤·2026.09.23 기록 앞의 규칙 변경을 증명할 수 없습니다.
- 내보내기 JSON 생성과 운영 계정 삭제 확인은 실행하지 않았습니다.

다음 단계:

1. 사용자가 기억하는 실제 규칙 변경 시각과 변경 이유를 확인합니다.
2. `실제 변경 시각`, `사후 작성 시각`, 변경 전 규칙, 변경 후 규칙, 이유를 카드 5 문서에 구분해 기록합니다.
3. 원래 실행 기록 값에 실제 입력 오류가 있다면 사용자가 알려 준 사실값만 수정하고, 제출 기준에 맞추기 위한 임의 변경은 하지 않습니다.
4. 9/21~9/22 평균과 9/23~9/25 평균을 같은 `분/일` 규칙으로 계산합니다.

## 2026-09-26 카드 5 계정과 연결 자료 삭제 구현

- 로그인한 사용자의 access token을 `account-delete` Edge Function이 다시 검증하고, token에서 확인한 현재 Auth 사용자만 삭제하도록 구현했습니다. 주소·헤더·본문으로 전달되는 임의 사용자 ID는 사용하지 않습니다.
- Auth 사용자 삭제 시 `plan_versions`, `tasks`, `task_execution_logs`, `task_completion_events`, `task_missed_days`, `reflections`의 해당 사용자 자료가 `on delete cascade`로 함께 삭제됩니다.
- 신규 DB용 `supabase/schema.sql`의 연쇄 삭제 외래키를 확인했고, 기존 운영 DB의 여섯 외래키를 보강하는 `supabase/account-delete-cascade.sql`을 추가했습니다.
- 계정 영역에서 내보내기·로그아웃과 계정 삭제를 분리했습니다. 위험 구역에는 계정을 삭제하면 데이터베이스의 계획·할 일·실행·완료·지연·회고 자료도 함께 삭제되고 복구할 수 없다는 안내를 항상 표시합니다.
- 삭제 전 브라우저 재확인, 처리 중 버튼 비활성화, 성공 후 로그인 화면 전환, 실패 시 자료가 변경되지 않았다는 안내를 유지했습니다.

관련 파일:

- `public/index.html`
- `public/styles.css`
- `public/app.js`
- `supabase/functions/account-delete/index.ts`
- `supabase/account-delete-cascade.sql`
- `supabase/config.toml`
- `tests/card5-account-lifecycle.test.cjs`
- `contracts/pds-schema-v2.json`
- `README.md`

실행한 검사:

- `node tests\card5-account-lifecycle.test.cjs` — 20개 통과
- `tests`의 `*.test.cjs`, `*.test.mjs` 전체 Node 검사 — 10개 파일 통과, 실패 0개
- `node --check public\app.js` — 통과
- 현재 작업 트리 private secret 패턴 검사 — 발견 0건
- `git diff --check` — 통과(LF→CRLF 안내만 표시)

아직 확인하지 않은 항목:

- 사용자는 `supabase/account-delete-cascade.sql`을 운영 Supabase SQL Editor에서 실행했다고 밝혔습니다. 이번 작업에서는 실제 제약 조건 상태를 별도로 조회하지 않았습니다.
- 사용자는 `account-delete` Edge Function을 운영 Supabase에 배포했고 브라우저에서 계정 삭제가 진행되는 것까지 확인했다고 밝혔습니다.
- 새 계정 관리 메뉴와 삭제 모달을 포함한 정적 화면의 운영 배포 여부는 이번 작업에서 확인하지 않았습니다.
- 실제 삭제 검증은 주 사용 계정이 아닌 별도 시험 계정으로 내보내기 후 수행해야 합니다.

## 2026-09-26 계정 관리 메뉴와 삭제 이중 확인 UI

- `Supabase 저장됨` 상태 옆에 `계정 관리` 버튼을 추가하고, 로그인 계정·로그아웃·계정 삭제를 펼침 패널 안으로 옮겼습니다.
- 계정 삭제 위험 안내는 줄바꿈이 어색하지 않도록 단어 단위 줄바꿈을 적용하고, 삭제 버튼에는 테두리·아이콘·그림자를 추가했습니다.
- 계정 삭제 버튼을 누르면 자료 삭제 범위와 내보내기 권장을 설명하는 모달이 먼저 열립니다.
- 모달의 `삭제 계속하기`를 누른 뒤 브라우저 마지막 확인에 동의해야만 `account-delete` Edge Function을 호출합니다.
- 계정 관리 패널은 바깥 클릭과 Esc로 닫히며, 로그아웃·삭제 모달 진입 시에도 닫힙니다.
- 계정 관리 버튼 왼쪽의 장식 아이콘은 제거하고, 오른쪽 펼침 화살표를 16px SVG로 바꿔 버튼 높이의 중앙에 정렬했습니다.
- 390px 모바일에서는 제목을 전체 폭으로 먼저 표시하고, 그 아래 `Supabase 저장됨`과 `계정 관리`를 한 줄에 배치해 제목이 글자 중간에서 끊기지 않게 했습니다.
- 현재 기준 커밋은 `ec63620`이며 이번 UI 변경은 아직 커밋하지 않았습니다.

관련 파일:

- `public/index.html`
- `public/styles.css`
- `public/app.js`
- `tests/card5-account-lifecycle.test.cjs`
- `README.md`
- `PROJECT_CONTEXT.md`

실행한 검사:

- `node tests\card5-account-lifecycle.test.cjs` — 계정 메뉴·삭제 이중 확인·연쇄 삭제 검사 34개 통과
- `tests`의 `*.test.cjs`, `*.test.mjs` 전체 Node 검사 — 10개 파일 통과, 실패 0개
- `node --check public\app.js` — 통과
- `tests\git-secret-history.test.ps1` — Git 전체 patch 기록 비밀값 검사 통과
- 현재 작업 트리 private secret 패턴 검사 — 발견 0건
- `git diff --check` — 통과(LF→CRLF 안내만 표시)
- 전체 검사 첫 실행에서는 HEAD에서 이름이 바뀐 SQL 파일을 카드 1~3 테스트가 예전 경로로 읽어 3개가 실패했습니다. 테스트·README·카드 문서·스키마 주석의 참조를 현재 `migrate-existing-data.sql`, `password-evidence.sql`, `session-revocation.sql` 경로로 고친 뒤 재실행해 모두 통과했습니다.

아직 확인하지 않은 항목:

- 이번 UI 변경은 아직 Vercel에 배포하지 않았으므로 운영 로그인 화면에서 데스크톱·모바일 시각 결과를 확인하지 않았습니다.
- 배포된 이전 화면은 브라우저에서 확인했으며, 로그아웃·계정 삭제가 상시 노출되고 삭제 안내가 길게 표시되는 기존 문제를 재현했습니다.
- 실제 변경 CSS를 사용하는 로컬 미리보기에서 데스크톱과 390px 모바일의 기본 화면·펼침 메뉴·삭제 모달을 확인했습니다. 모바일 제목 폭, 상태·계정 관리 한 줄 배치, 화살표 중앙 정렬을 시각 확인했습니다.
- 이전 직접 요청에서는 `404`였지만, 이후 사용자가 운영 `account-delete` Edge Function 배포와 계정 삭제 진행을 확인했습니다.

### 2026-09-26 account-delete 운영 배포 후속 확인

- 사용자가 `account-delete` Edge Function을 운영 Supabase에 배포했습니다.
- 사용자가 배포 앱에서 계정 삭제 요청이 실제로 진행되는 것까지 확인했습니다.
- 이 기록은 사용자 확인에 근거하며, 이번 작업에서는 브라우저 요청 상태·Auth 사용자 삭제 여부·연결 자료의 삭제 전후 행 수를 다시 조회하지 않았습니다.
- T07-C134의 최종 운영 증거로 사용할 때는 별도 시험 계정에서 삭제 전 자료 건수, 삭제 뒤 재로그인 거절, 여섯 자료 표의 본인 행 0건을 함께 확인하는 것이 남아 있습니다.

## 2026-09-26 로그인 공격 방어 1단계 — 운영 Rate Limit 조정

- 운영 Supabase 프로젝트 `ALEPH_TASK_06`이 Free 플랜임을 대시보드에서 확인했습니다.
- Authentication > Rate Limits에서 로그인·가입 요청 제한의 기존값이 IP당 `30 requests/5 min`임을 확인했습니다.
- 로그인·가입 요청 제한만 IP당 `10 requests/5 min`으로 낮추고 저장했습니다.
- 페이지를 새로고침한 뒤 `10 requests/5 min`이 유지되는 것을 확인했습니다.
- token refresh `150 requests/5 min`, token verification `30 requests/5 min` 등 다른 제한값은 변경하지 않았습니다.
- IP Address Forwarding은 꺼진 상태이며 변경하지 않았습니다.
- Authentication > Attack Protection에서 CAPTCHA가 꺼져 있음을 확인했습니다.
- CAPTCHA 공급자로 Cloudflare Turnstile을 선택할 수 있고 Supabase 저장에는 provider의 Captcha secret이 필요함을 확인했습니다. 아직 Secret이 없어 변경을 취소했으며 CAPTCHA는 꺼진 상태입니다.

코드·문서 확인:

- 기능 코드는 수정하지 않았습니다.
- 운영 설정 확인 결과만 `PROJECT_CONTEXT.md`에 기록했습니다.
- 이번 단계에서는 테스트를 실행하지 않았습니다.

다음 단계:

1. 사용자가 Cloudflare Dashboard에 직접 로그인하거나 계정을 생성합니다.
2. Turnstile 위젯에 운영 호스트 `aleph-task-06.vercel.app`을 등록합니다.
3. 발급된 Site key는 공개 설정으로 앱에 연결하고, Secret key는 코드·문서·채팅에 남기지 않은 채 Supabase CAPTCHA 설정에 직접 입력합니다.
4. CAPTCHA를 저장하기 전에 로그인·가입 화면이 토큰을 생성해 `auth-gateway`로 전달하도록 코드와 정적 검사를 먼저 준비합니다. 준비 없이 Supabase CAPTCHA만 켜면 현재 로그인·가입이 실패할 수 있습니다.

## 2026-09-26 로그인 공격 방어 2단계 — Turnstile 코드 준비

- Cloudflare 계정에서 `ALEPH_TASK_06` Turnstile 위젯을 만들고 운영 호스트 `aleph-task-06.vercel.app`과 관리형 모드를 지정했습니다.
- 공개 Site key를 `public/config.js`에 추가했습니다.
- 로그인·가입 폼에 각각 Turnstile 위젯 영역을 추가하고, 토큰이 없으면 인증 요청을 보내지 않도록 했습니다.
- 인증 시도 뒤 성공·실패와 관계없이 사용한 Turnstile 토큰을 초기화합니다.
- `auth-gateway`가 `captcha_token`을 받아 Supabase Auth의 `gotrue_meta_security.captcha_token`으로 전달하도록 했습니다.
- Turnstile Secret key는 코드·문서에 기록하지 않았습니다. 발급 화면 확인 과정에서 작업 출력에 노출된 첫 Secret은 사용하지 않고 Cloudflare에서 회전한 뒤 Supabase에 새 값만 입력해야 합니다.
- 운영 로그인·가입 중단을 막기 위해 Supabase CAPTCHA는 아직 켜지 않았습니다.

관련 파일:

- `public/config.js`
- `public/index.html`
- `public/styles.css`
- `public/app.js`
- `supabase/functions/auth-gateway/index.ts`
- `tests/auth-captcha.test.cjs`
- `tests/card2-password.test.cjs`
- `contracts/pds-schema-v2.json`
- `README.md`
- `docs/card-2-password.md`
- `docs/card-5-auth-guide-and-five-day-use.md`
- `PROJECT_CONTEXT.md`

현재 확인 결과:

- `node --check public/app.js` — 통과
- `node tests/auth-captcha.test.cjs` — 13개 통과
- `node tests/card1-static.test.cjs` — 20개 통과
- `node tests/auth-crypto.test.mjs` — 5개 통과
- `node tests/card2-password.test.cjs` 첫 실행 — 기존 요청 필드 단언이 CAPTCHA 이전 값이라 실패했고, 새 필드 목록에 맞게 수정함
- `tests`의 `*.test.cjs`, `*.test.mjs` 전체 Node 검사 — 11개 파일, 총 169개 통과, 실패 0개
- `node --check public/app.js` — 통과
- 계약 JSON 파싱 — 통과
- `tests/git-secret-history.test.ps1` — Git 전체 patch 기록 비밀값 검사 통과
- `git diff --check` — 통과(LF→CRLF 안내만 표시)
- 새 Turnstile 위젯의 실제 렌더링과 운영 로그인·가입 검증은 아직 실행 전입니다.

안전한 다음 순서:

1. 전체 정적 검사를 다시 실행합니다.
2. 커밋 `e130faf`가 반영된 Vercel 정적 앱을 먼저 배포하고 실제 Turnstile 위젯이 표시되는지 확인합니다.
3. 최신 `auth-gateway`를 운영 Supabase에 배포합니다.
4. Cloudflare에서 첫 Secret을 회전합니다.
5. 새 Secret을 값이 보이지 않게 Supabase CAPTCHA 설정으로 옮기고 Turnstile을 활성화합니다.
6. 운영 로그인·가입 성공, 토큰 없는 직접 Auth 요청 거절, Payload·Response·Console·Edge Function 로그의 비밀번호 원문 0건을 확인합니다.

커밋·푸시 결과:

- 기능 커밋: `e130faf` (`feat: 로그인과 가입에 Turnstile CAPTCHA 보호 추가`)
- 원격 반영: `origin/codex/card-1-auth`에 푸시 완료
- 커밋 직전 전체 Node 검사: 11개 파일, 총 169개 통과, 실패 0개
