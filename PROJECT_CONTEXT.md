# PDS Diary 프로젝트 인계 문서

마지막 수정: 2026-09-22 (Asia/Seoul)

## Git 상태

- 저장소: `psm1109/ALEPH_TASK_06`
- 작업 브랜치: `codex/card-1-auth`
- 이 문서가 다루는 최신 기능 커밋: `109955d`
- 이 인계 문서의 커밋은 파일 커밋 후 브랜치의 최신 HEAD입니다. 다른 PC에서 받은 뒤 `git rev-parse --short HEAD`로 확인합니다.
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
- 가입·로그인 시도가 끝나면 비밀번호 입력칸을 비웁니다.
- 앱에는 인증 요청이나 응답을 남기는 콘솔 기록 코드가 없습니다.
- 두 시험 계정의 bcrypt 해시를 표시하고 서로 다른지 확인하는 SQL Editor용 쿼리를 추가했습니다.
- 비밀번호·토큰을 가리는 제출문 초안을 추가했습니다.

관련 파일:

- `supabase/card2-password-evidence.sql`
- `docs/card-2-password.md`
- `tests/card2-password.test.cjs`
- `contracts/pds-schema-v2.json`
- `README.md`

## 완료한 확인

저장소 루트에서 다음 명령을 실행합니다.

```powershell
node tests\card1-static.test.cjs
node tests\card2-password.test.cjs
node --check public\app.js
git diff --check
```

2026-09-22 마지막 실행 결과:

- 카드 1 정적 검사: 20개 통과
- 카드 2 비밀번호 검사: 13개 통과
- `public/app.js` 문법 검사: 통과
- 로컬 브라우저에서 `http://127.0.0.1:4173/#plan` 직접 접근: 자료 대신 로그인 화면 표시
- 로컬 로그인 실패 검사: 요청 후 비밀번호 입력칸이 비워짐
- 같은 검사 중 브라우저 콘솔 기록: 0건

## 아직 필요한 실제 확인

다음 항목을 현재 Supabase 프로젝트에서 실행하기 전에는 카드 1과 카드 2를 완전히 통과했다고 적지 않습니다.

1. Supabase SQL Editor에서 `supabase/schema.sql`을 실행합니다. 클라우드 자료 접근 권한을 바꾸는 작업이므로 사용자의 명시적인 승인을 받습니다.
2. Email provider 설정을 확인합니다. 실제 계정과 시험 계정의 비밀번호는 사용자가 직접 입력해야 하며 요청하거나 기록하지 않습니다.
3. 본인 계정 한 개와 시험 계정 두 개를 만듭니다. 시험 계정 두 개에는 같은 비밀번호를 사용하되, 그 비밀번호를 저장소나 제출물에 적지 않습니다.
4. `supabase/card1-migrate-existing-data.sql`에서 본인 계정 이메일 자리만 바꾼 뒤 실행합니다.
5. `supabase/card2-password-evidence.sql`에서 시험 계정 이메일 두 곳만 바꾼 뒤 실행합니다.
6. 출력된 bcrypt 해시를 `docs/card-2-password.md`에 옮깁니다. 해시는 과제에서 요구한 증거이지만 비밀번호·토큰·키는 계속 가립니다.
7. 로그인 요청·응답 기록을 가린 상태로 남기고, 응답·화면·콘솔에 비밀번호 원문이 없는지 확인합니다.
8. RLS 적용 후 로그인하지 않은 REST 요청을 다시 보내 실제 응답을 기록합니다. 마지막 적용 전 확인에서는 빈 배열과 HTTP 200이 돌아왔으므로, 그 결과는 보호 근거가 아니라 실패 상태의 기준점입니다.

## 기존 자료 관련 주의사항

2026-09-22 마지막 읽기 전용 건수 확인에서는 Supabase의 다섯 다이어리 테이블(`plan_versions`, `tasks`, `task_execution_logs`, `task_completion_events`, `reflections`)에 `pds-main`과 `ccna-main` 자료가 모두 0건이었고 전체 행 수도 0건이었습니다. 이 정보는 현재 달라졌을 수 있으므로 이관 전에 다시 확인합니다. 여전히 0건이라면 T06 기존 자료를 옮겼다는 증거를 만들 수 없으므로, 자료를 복원하거나 본인 계정에 다시 입력해야 합니다.

## 보안 경계

- `public/config.js`에는 브라우저에서 사용해도 되는 Supabase Publishable key가 있습니다. secret key나 service-role key를 추가하지 않습니다.
- 데이터베이스 대시보드 자격 증명, 비밀번호, JWT, access token, refresh token, 쿠키, 인증 요청 원문을 커밋하지 않습니다.
- 제출 증거에서는 위 값을 `[가림]`으로 바꾸거나, 평가 기준이 허용하는 경우에만 비밀이 아닌 짧은 표시로 바꿉니다.
- `auth.users.encrypted_password`는 권한이 있는 Supabase 관리 화면에서만 확인하고 카드 2의 요구된 해시 증거를 만드는 용도로만 사용합니다.

## 다음 작업

카드 3의 세션 폐기 작업을 시작하기 전에 위의 카드 1·2 실제 검증을 마칩니다. 작업 단위가 끝날 때마다 `AGENTS.md` 규칙에 따라 이 문서를 다시 갱신합니다.
