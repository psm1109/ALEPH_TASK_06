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
- 기존 자료 이관: `supabase/migrate-existing-data.sql`

