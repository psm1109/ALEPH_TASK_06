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

아래 표는 운영 배포의 DevTools에서 `scripts/card3-browser-evidence.js`를 실행한 실제 출력이다. 스크립트는 브라우저에 이미 로그인된 access token을 메모리에서만 읽어 아래의 **같은 URL, 같은 GET 방식, 같은 access token**을 정확히 두 번 보낸다. 두 요청 사이에서 바뀌는 것은 `POST /auth/v1/logout?scope=local` 실행 여부뿐이다. URL에는 token, `session_id`, 이메일을 넣지 않는다.

| 항목 | 로그인 상태 | 로그아웃 뒤 |
| --- | --- | --- |
| URL | `https://eidvougocycgramikbwq.supabase.co/rest/v1/plan_versions?select=id&limit=0` | 왼쪽과 같음 |
| 방식 | `GET` | `GET` |
| Authorization | `Bearer [가림]` | 왼쪽과 **동일한 값** 재사용 |
| token 지문 | `[가림] (SHA-256: f60c8a939bed…)` | 왼쪽과 같음 |
| HTTP 응답 | `200`, 본문 `[]` | `403`, 코드 `42501`, `The authentication session is no longer active.` |
| 차이 | 서버 세션 활성 | 서버 로그아웃으로 세션 제거 |

2026-09-23 14:27:10(Asia/Seoul)에 운영 배포 `https://aleph-task-06.vercel.app/`에서 검사했다. 첫 GET 뒤 `POST /auth/v1/logout?scope=local`은 `204`를 반환했고, 바로 이어 같은 access token으로 보낸 두 번째 GET은 `403`을 반환했다. 두 GET에서 URL·방식·헤더 값은 같고 로그아웃 여부만 달랐다.

브라우저용 스크립트는 결과를 출력한 뒤 로컬 세션 사본을 지운다. 출력에는 token 원문 대신 `[가림]`과 SHA-256 지문 앞 12자리만 남겼으며 access token·refresh token·비밀번호·`session_id` 원문은 복사하지 않았다. 별도 시험 계정으로 자동 로그인부터 검사해야 할 때만 `scripts/verify-session-revocation.mjs`를 대안으로 사용한다.

## 만료 기록

- access token 발급 시각(`iat`): `2026-09-23 14:20:56+09:00`
- access token 만료 시각(`exp`): `2026-09-23 15:20:56+09:00`
- 발급 후 만료까지: `3,600초(1시간)`
- 로그아웃하지 않은 경우: 브라우저가 refresh token으로 access token을 갱신하므로 세션은 계속될 수 있음
- 로그아웃한 경우: `exp`를 기다리지 않고 `auth.sessions` 행 제거 직후 다음 Data API 요청부터 `403`으로 거절됨

Supabase는 일반적으로 짧은 access token 수명을 권장한다. 이 기록의 1시간은 기본값을 추정한 것이 아니라 실제 JWT의 `iat`와 `exp` 차이로 계산한 값이다.

## URL·비밀키 점검

- `public/app.js`는 access token을 `Authorization` 헤더로만 보내며 쿼리 문자열에 넣지 않는다.
- 브라우저에 배포되는 `public/config.js`의 `sb_publishable_...` 값은 공개용 Publishable key이며 JWT 서명 비밀키가 아니다.
- JWT 서명키, `sb_secret_...`, service-role JWT, RSA private key는 브라우저 코드와 배포 폴더에 두지 않는다.
- 인증 Payload 복호화용 RSA private key는 Git 제외 파일에서 Supabase secret으로만 설정한다.
- `node tests/card3-session.test.cjs`는 현재 소스에서, `tests/git-secret-history.test.ps1`은 전체 Git patch 기록에서 private-key PEM, 실제 `sb_secret_...`, service-role JWT, secret 환경 변수 값 형태를 검사한다.

### 비밀키 검사 결과

2026-09-23에 아래 세 영역을 같은 기준으로 검사했다.

| 검사 영역 | 실제 검사 대상 | 검사 수 | 비밀값 발견 | 판정 |
| --- | --- | ---: | ---: | --- |
| 브라우저 코드 | `public/index.html`, `styles.css`, `app.js`, `auth-crypto.mjs`, `config.js` | 5개 파일 | 0건 | 통과 |
| 실제 배포 파일 | Vercel의 `/`, `/styles.css`, `/app.js`, `/auth-crypto.mjs`, `/config.js` | 5개 파일 | 0건 | 통과 |
| Git 기록 | `git log --all -p` 전체 patch 기록과 그 안의 JWT 문자열 | 전체 브랜치 기록 | 0건 | 통과 |

검사한 비밀값 형태는 다음과 같다.

- 실제 `sb_secret_...` 형식의 Supabase secret key
- `SUPABASE_SERVICE_ROLE_KEY`에 값이 대입된 형태
- JWT payload를 복호화했을 때 `role`이 `service_role`인 token
- `BEGIN … PRIVATE KEY` 형태의 PEM private-key header
- 실제 값이 대입된 `AUTH_PRIVATE_JWK_B64`

`public/config.js`와 실제 배포 `config.js`에는 공개용 `sb_publishable_...` 키가 있다. 이 값은 브라우저 배포가 전제된 공개 식별자이며 데이터 접근은 사용자 JWT와 RLS가 결정하므로 비밀키 발견 건수에 포함하지 않았다. `AUTH_PRIVATE_JWK_B64`라는 환경 변수 **이름**을 설명하는 문서·서버 코드는 허용하되 실제 값이 들어간 형태는 금지했다.

배포 페이지가 실제로 요청한 REST URL 5개도 브라우저 자산 목록에서 확인했다. 어느 URL에도 access token, refresh token, `session_id` 쿼리 값이 없었으며 access token은 `Authorization` 헤더로만 전달됐다.
