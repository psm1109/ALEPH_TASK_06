# PDS Diary 프로젝트 인계 문서

마지막 수정: 2026-09-23 (Asia/Seoul)

## Git 상태

- 저장소: `psm1109/ALEPH_TASK_06`
- 작업 브랜치: `codex/card-1-auth`
- 현재 기준 커밋: `497fcc9`
- 작업 트리에는 카드 3의 access token 식별·즉시 세션 폐기·검증 기록 변경이 아직 커밋되지 않은 상태로 있습니다.
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
- 제출문에는 식별 방식, URL 비포함, 만료 기록, 로그아웃 전후 비교 표를 추가했지만 실제 운영 응답은 아직 비워 두었습니다.

관련 파일:

- `supabase/schema.sql`
- `scripts/verify-session-revocation.mjs`
- `docs/card-3-session-revocation.md`
- `tests/card3-session.test.cjs`
- `tests/git-secret-history.test.ps1`
- `README.md`

## 완료한 확인

저장소 루트에서 다음 명령을 실행합니다.

```powershell
node tests\card1-static.test.cjs
node tests\card2-password.test.cjs
node tests\auth-crypto.test.mjs
node tests\card3-session.test.cjs
powershell -NoProfile -ExecutionPolicy Bypass -File tests\git-secret-history.test.ps1
node --check public\app.js
node --check scripts\generate-auth-key.mjs
node --check scripts\verify-session-revocation.mjs
git diff --check
```

2026-09-23 마지막 실행 결과:

- 카드 1 정적 검사: 20개 통과
- 카드 2 비밀번호 검사: 23개 통과
- 인증 Payload 암호화 실행 검사: 5개 통과
- 카드 3 세션 정적·비밀값 검사: 18개 통과
- Git 전체 patch 기록 비밀값 검사: 통과
- `public/app.js` 문법 검사: 통과
- `scripts/generate-auth-key.mjs` 문법 검사: 통과
- `scripts/verify-session-revocation.mjs` 문법 검사: 통과
- RSA-OAEP-256 + AES-256-GCM 암호화·복호화 로컬 왕복 검사: 통과
- `git diff --check`: 통과(LF→CRLF 안내만 표시)

이전 2026-09-22 브라우저 검사에서는 로그인 화면 보호, 실패 후 입력칸 초기화, 콘솔 0건을 확인했습니다. 2026-09-23 게이트웨이 변경은 아직 운영 Edge Function에 배포하지 않았으므로 실제 브라우저 네트워크 검사는 미실행입니다.

## 아직 필요한 실제 확인

다음 항목을 현재 Supabase 프로젝트에서 실행하기 전에는 카드 1과 카드 2를 완전히 통과했다고 적지 않습니다.

1. Supabase SQL Editor에서 `supabase/schema.sql`을 실행합니다. 클라우드 자료 접근 권한을 바꾸는 작업이므로 사용자의 명시적인 승인을 받습니다.
2. Email provider 설정을 확인합니다. 실제 계정과 시험 계정의 비밀번호는 사용자가 직접 입력해야 하며 요청하거나 기록하지 않습니다.
3. 본인 계정 한 개와 시험 계정 두 개를 만듭니다. 시험 계정 두 개에는 같은 비밀번호를 사용하되, 그 비밀번호를 저장소나 제출물에 적지 않습니다.
4. `supabase/card1-migrate-existing-data.sql`에서 본인 계정 이메일 자리만 바꾼 뒤 실행합니다.
5. `supabase/card2-password-evidence.sql`에서 시험 계정 이메일 두 곳만 바꾼 뒤 실행합니다.
6. 출력된 bcrypt 해시를 `docs/card-2-password.md`에 옮깁니다. 해시는 과제에서 요구한 증거이지만 비밀번호·토큰·키는 계속 가립니다.
7. `node scripts/generate-auth-key.mjs`로 Git 제외 대상 `supabase/.env.auth.local`을 만들고, 내용을 출력하지 않은 채 `AUTH_PRIVATE_JWK_B64` secret을 운영 Supabase에 설정합니다.
8. 운영 웹 origin을 `AUTH_ALLOWED_ORIGIN`으로 설정한 뒤 `auth-gateway` Edge Function을 배포합니다. 현재 PC에는 Supabase CLI가 설치되어 있지 않아 미실행입니다.
9. 배포된 앱에서 로그인 요청 Payload가 `mode`, `encrypted_key`, `iv`, `ciphertext`만 포함하는지 확인합니다. Response·Console·화면·Edge Function 로그에서 시험 비밀번호 원문을 검색해 모두 0건인지 확인합니다.
10. RLS 적용 후 로그인하지 않은 REST 요청을 다시 보내 실제 응답을 기록합니다. 마지막 적용 전 확인에서는 빈 배열과 HTTP 200이 돌아왔으므로, 그 결과는 보호 근거가 아니라 실패 상태의 기준점입니다.
11. `supabase/schema.sql` 적용 뒤 시험 계정 정보를 화면이나 명령 기록에 남기지 않는 방식으로 `node scripts/verify-session-revocation.mjs`를 실행합니다. 로그인 상태의 200과 서버 로그아웃 뒤 같은 access token의 401/403, 실제 `iat`·`exp`·수명을 `docs/card-3-session-revocation.md`에 옮깁니다.
12. 운영 배포 산출물에서도 URL에 token이 없고 `sb_secret_...`, service-role key, JWT 서명키, RSA private key가 없음을 별도로 확인합니다. 현재 검사는 로컬 소스와 Git 기록까지만 완료했습니다.

## 기존 자료 관련 주의사항

2026-09-22 마지막 읽기 전용 건수 확인에서는 Supabase의 다섯 다이어리 테이블(`plan_versions`, `tasks`, `task_execution_logs`, `task_completion_events`, `reflections`)에 `pds-main`과 `ccna-main` 자료가 모두 0건이었고 전체 행 수도 0건이었습니다. 이 정보는 현재 달라졌을 수 있으므로 이관 전에 다시 확인합니다. 여전히 0건이라면 T06 기존 자료를 옮겼다는 증거를 만들 수 없으므로, 자료를 복원하거나 본인 계정에 다시 입력해야 합니다.

## 보안 경계

- `public/config.js`에는 브라우저에서 사용해도 되는 Supabase Publishable key가 있습니다. secret key나 service-role key를 추가하지 않습니다.
- 데이터베이스 대시보드 자격 증명, 비밀번호, JWT, access token, refresh token, 쿠키, 인증 요청 원문을 커밋하지 않습니다.
- 제출 증거에서는 위 값을 `[가림]`으로 바꾸거나, 평가 기준이 허용하는 경우에만 비밀이 아닌 짧은 표시로 바꿉니다.
- `auth.users.encrypted_password`는 권한이 있는 Supabase 관리 화면에서만 확인하고 카드 2의 요구된 해시 증거를 만드는 용도로만 사용합니다.

## 다음 작업

먼저 인증 비밀키를 운영 Supabase secret으로 설정하고 `auth-gateway`를 배포한 뒤 `supabase/schema.sql`을 SQL Editor에서 실행합니다. 이어서 실제 로그인으로 카드 1·2의 네트워크·RLS 증거를 확인하고, `scripts/verify-session-revocation.mjs`로 카드 3의 같은 access token 200→401/403 비교와 실제 만료 시간을 기록합니다. 마지막으로 운영 배포 파일의 비밀값 부재를 별도로 확인합니다.
