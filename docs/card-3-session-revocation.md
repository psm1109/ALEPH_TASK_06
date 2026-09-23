# 카드 3 — 로그인 식별과 세션 폐기

## 사람을 알아보는 값

이 앱은 서버 세션 쿠키가 아니라 **Supabase Auth access token(JWT)** 으로 로그인한 사람을 알아본다.

- 브라우저는 access token을 자료 요청의 `Authorization: Bearer [가림]` 헤더로 보낸다.
- Supabase는 JWT 서명을 검증하고 `sub`를 `auth.uid()`로 제공한다.
- RLS는 각 행의 `user_id = auth.uid()`를 확인한다.
- JWT가 로그아웃 뒤에도 `exp`까지 서명상 유효할 수 있으므로, 서버는 JWT의 `session_id`가 `auth.sessions`에 남아 있는지도 매 요청 확인한다.
- 로그아웃이나 비밀번호 변경으로 해당 서버 세션이 없어지면 같은 access token을 다시 보내도 Data API가 거절한다.

Supabase 공식 문서에 따르면 access token에는 만료 시각 `exp`와 세션을 가리키는 `session_id`가 있고, 로그아웃된 access token은 원래 `exp`까지 유효할 수 있다. 즉시 폐기가 필요하면 `session_id`에 대응하는 `auth.sessions` 행의 존재 여부를 확인해야 한다.

- <https://supabase.com/docs/guides/auth/sessions>
- <https://supabase.com/docs/guides/auth/signout>

구현 위치는 `supabase/schema.sql`의 `private.is_auth_session_active()`, `private.check_auth_session()`과 `pgrst.db_pre_request` 설정이다. RLS에도 같은 활성 세션 조건을 넣어 사전 요청 설정과 행 정책이 함께 보호한다.

`pgrst.db_pre_request`는 이 Supabase 프로젝트의 모든 인증된 Data API 요청에 적용된다. 정상 Supabase Auth 세션은 통과하지만 `auth.sessions` 행이 없는 외부 발급 JWT나 이미 폐기된 JWT는 다이어리 외 REST 요청에서도 거절된다. 현재 앱은 Supabase Auth만 사용하므로 의도한 범위이지만, 같은 프로젝트에 다른 인증 공급자를 연결한다면 적용 전에 호환성을 다시 검토해야 한다.

## 같은 요청의 로그아웃 전후 비교

아래 표는 `scripts/verify-session-revocation.mjs` 출력으로 채운다. 스크립트는 시험 계정으로 로그인한 뒤 아래의 **같은 URL, 같은 GET 방식, 같은 access token**을 정확히 두 번 보낸다. 두 요청 사이에서 바뀌는 것은 `POST /auth/v1/logout?scope=local` 실행 여부뿐이다. URL에는 token, `session_id`, 이메일을 넣지 않는다.

| 항목 | 로그인 상태 | 로그아웃 뒤 |
| --- | --- | --- |
| URL | `https://eidvougocycgramikbwq.supabase.co/rest/v1/plan_versions?select=id&limit=0` | 왼쪽과 같음 |
| 방식 | `GET` | `GET` |
| Authorization | `Bearer [가림]` | 왼쪽과 **동일한 값** 재사용 |
| token 지문 | `[실행 전]` | `[실행 전 — 왼쪽과 같아야 함]` |
| HTTP 응답 | `[실행 전 — 기대 200, 본문 []]` | `[실행 전 — 기대 401 또는 403]` |
| 차이 | 서버 세션 활성 | 서버 로그아웃으로 세션 제거 |

현재 저장소에서는 서버 SQL과 검증 스크립트만 준비했다. 운영 Supabase에 `supabase/schema.sql`을 실행하고 실제 시험 계정으로 아래 검사를 마치기 전에는 이 표를 통과 증거로 판정하지 않는다.

```powershell
$env:PDS_TEST_EMAIL = Read-Host '시험 계정 이메일'
$securePassword = Read-Host '시험 계정 비밀번호' -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $env:PDS_TEST_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  node scripts/verify-session-revocation.mjs
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  Remove-Item Env:PDS_TEST_EMAIL, Env:PDS_TEST_PASSWORD -ErrorAction SilentlyContinue
}
```

출력에는 token 원문 대신 `[가림]`과 SHA-256 지문 앞 12자리만 남는다. 출력의 `before_logout`, `after_logout`, `expires_at`, `lifetime_seconds`를 위 표와 아래 만료 기록에 옮기되 access token·refresh token·비밀번호는 복사하지 않는다.

## 만료 기록

- access token 발급 시각(`iat`): `[실행 전]`
- access token 만료 시각(`exp`): `[실행 전]`
- 발급 후 만료까지: `[실행 전]초`
- 로그아웃하지 않은 경우: 브라우저가 refresh token으로 access token을 갱신하므로 세션은 계속될 수 있음
- 로그아웃한 경우: `exp`를 기다리지 않고 `auth.sessions` 행 제거 직후 다음 Data API 요청부터 거절되어야 함

Supabase는 일반적으로 짧은 access token 수명을 권장하지만 실제 프로젝트 설정값은 검증 스크립트가 받은 JWT의 `iat`와 `exp`로 기록한다. 실행 전에는 기본값을 실제 결과처럼 적지 않는다.

## URL·비밀키 점검

- `public/app.js`는 access token을 `Authorization` 헤더로만 보내며 쿼리 문자열에 넣지 않는다.
- 브라우저에 배포되는 `public/config.js`의 `sb_publishable_...` 값은 공개용 Publishable key이며 JWT 서명 비밀키가 아니다.
- JWT 서명키, `sb_secret_...`, service-role JWT, RSA private key는 브라우저 코드와 배포 폴더에 두지 않는다.
- 인증 Payload 복호화용 RSA private key는 Git 제외 파일에서 Supabase secret으로만 설정한다.
- `node tests/card3-session.test.cjs`는 현재 추적 파일과 전체 Git patch 기록에서 private-key PEM, 실제 `sb_secret_...`, service-role JWT, secret 환경 변수 값 형태를 검사한다.

2026-09-23 로컬 정적 검사 결과는 `PROJECT_CONTEXT.md`에 기록한다. 실제 배포 파일은 배포 뒤 별도로 확인해야 하며, 로컬 소스 검사만으로 배포 파일까지 확인했다고 적지 않는다.
