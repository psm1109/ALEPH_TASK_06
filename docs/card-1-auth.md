# 카드 1 — 가입·로그인·로그아웃과 자료 잠금

## 선택

- 방식: 인증 서비스
- 서비스: Supabase Auth
- 클라이언트: `@supabase/supabase-js` `2.116.0`
- 로그인 방식: 이메일 + 비밀번호
- 사용자 식별: Supabase 세션의 `auth.uid()`
- 자료 보호: PostgreSQL RLS의 `user_id = auth.uid()` 조건

기존 T06 다이어리가 Supabase PostgreSQL과 REST API를 사용하므로 같은 프로젝트에서 계정과 RLS를 함께 관리할 수 있고, 비밀번호 저장과 세션 발급을 직접 구현하지 않아도 되어 선택했다.

함께 검토한 방법은 직접 만든 Node.js 인증 서버이다. 비밀번호 해싱·세션 만료·중복 계정 방지·서버 배포를 모두 직접 책임져야 하고 기존 T06 구조에 별도 서버가 추가되므로 선택하지 않았다.

## 소스 위치

- 가입·로그인 화면: `public/index.html`의 `auth-screen`, `login-form`, `signup-form`
- 가입·로그인·로그아웃 처리: `public/app.js`의 `handleSignupSubmit`, `handleLoginSubmit`, `handleLogout`
- 인증된 자료 요청: `public/app.js`의 `supabaseRequest`
- 사용자별 자료 정책: `supabase/schema.sql`의 `owner ...` RLS 정책
- 기존 자료 이관: `supabase/card1-migrate-existing-data.sql`

## 확인 기록

비밀번호·access token·refresh token·비밀키는 이 문서에 기록하지 않는다.

### 2026-09-22 로컬 화면 확인

- 주소: `http://127.0.0.1:4173/#plan`
- 로그인 상태: 없음
- 결과: 자료 화면 대신 로그인 화면이 표시됨
- 가입 탭 결과: 이메일, 비밀번호, 비밀번호 확인 입력칸과 `계정 만들기` 버튼이 표시됨
- 존재하지 않는 시험 이메일 로그인 결과: `이메일 또는 비밀번호를 확인해 주세요.` 표시
- 브라우저 콘솔 오류: 없음

### 2026-09-22 적용 전 서버 확인

- 요청: `GET /rest/v1/plan_versions?select=id&limit=1`, 로그인 헤더 없음
- 응답: `200`, 본문은 빈 배열
- 판정: 배포 Supabase에는 아직 새 RLS가 적용되지 않았으므로 통과 전 상태

### 기존 자료 확인

2026-09-22에 응답 본문을 열지 않고 `count=exact`로 확인했다.

| 표 | 전체 행 수 |
| --- | ---: |
| `plan_versions` | 0 |
| `tasks` | 0 |
| `task_execution_logs` | 0 |
| `task_completion_events` | 0 |
| `reflections` | 0 |

현재 Supabase에는 이관할 T06 자료 행이 없다. 카드 1의 "기존 자료 이관" 증거를 만들려면, 새 정책 적용 전에 복원할 T06 자료가 따로 있는지 확인하거나 로그인 계정 안에 T06 자료를 다시 입력해야 한다.

## 아직 필요한 실제 확인

1. Supabase SQL Editor에서 `supabase/schema.sql` 실행
2. 가입 화면에서 본인 계정 생성 — 비밀번호는 사용자가 직접 입력하며 제출물에 남기지 않음
3. `supabase/card1-migrate-existing-data.sql`의 이메일 두 곳만 바꾸어 실행
4. 가입, 로그인, 로그아웃 화면 확인
5. 존재하지 않는 이메일과 올바른 이메일 + 틀린 비밀번호가 모두 `이메일 또는 비밀번호를 확인해 주세요.`인지 확인
6. 로그인하지 않은 REST 요청이 거절되는 상태 코드와 가린 응답 기록
