# 카드 2 — 비밀번호 보관 확인

## 1. 선택한 방법

비밀번호를 되돌릴 수 없게 만드는 방법으로 **bcrypt**를 사용한다. 구현은 직접 만든 해시 코드가 아니라 **Supabase Auth**에 맡겼고, 브라우저에서는 `@supabase/supabase-js` `2.116.0`을 사용한다.

## 2. 선택 이유

bcrypt는 비밀번호 저장을 위해 널리 사용되는 느린 해시 함수이며, Supabase Auth가 계정마다 무작위 salt를 생성하고 비밀번호 검증까지 관리한다. 직접 salt 생성·비용 계수·비교 코드를 만들 때 생길 수 있는 실수를 피할 수 있어 선택했다.

근거: Supabase 공식 Password security 문서는 Supabase Auth가 bcrypt를 사용하고, 각 해시에 무작위 salt가 함께 저장되며, 결과가 `auth.users.encrypted_password` 열에 저장된다고 설명한다.

- <https://supabase.com/docs/guides/auth/password-security#how-are-passwords-stored>

## 3. 저장 위치와 코드 경계

- 비밀번호 원문 입력: `public/index.html`의 `type="password"` 입력칸
- 가입·로그인 전달: `public/app.js`에서 자격 증명을 AES-256-GCM으로 암호화하고 AES 키를 RSA-OAEP-256으로 감싼 뒤 `auth-gateway`에 전달
- 서버 중계: `supabase/functions/auth-gateway/index.ts`가 메모리에서만 복호화해 Supabase Auth에 전달하고 요청·응답 본문을 기록하지 않음
- 저장과 검증: Supabase Auth 서비스
- 저장된 해시 위치: Supabase 내부 `auth.users.encrypted_password`
- 해시 증거 쿼리: `supabase/password-evidence.sql`

다이어리의 `public` 스키마 테이블에는 비밀번호 열이 없다. 브라우저는 Supabase Auth의 비밀번호 엔드포인트를 직접 호출하지 않는다. 앱과 게이트웨이는 인증 요청·응답 본문이나 비밀번호를 `console` 및 다이어리 자료에 기록하지 않고, 인증 시도가 끝나면 비밀번호 입력칸을 비운다. 게이트웨이는 Auth 실패 상세를 폐기하고 일반화된 오류만 반환한다.

## 4. 실제 확인 기록

비밀번호 원문은 아래 기록과 스크린샷 어디에도 적지 않는다. 실제 값 대신 항상 `[가림]`을 사용한다.

### 2026-09-23 로컬 코드 확인

- 로그인 실패 뒤 비밀번호 입력칸이 비워짐: `true`
- 브라우저에서 수집된 콘솔 항목 수: `0`
- 소스의 `console.log`·`console.error` 등 콘솔 기록 호출: `0`
- 다이어리 `public` 스키마의 비밀번호·비밀번호 해시 열: `0`
- 카드 1 정적 검사: 20개 통과
- 카드 2 비밀번호 검사: 23개 통과
- 인증 Payload 암호화·복호화 실행 검사: 5개 통과
- 브라우저의 Supabase Auth 직접 로그인·가입 호출: `0`
- 인증 게이트웨이와 브라우저 소스의 콘솔 기록 호출: `0`

### 시험 계정 준비

- 계정 A: `[시험 이메일 A]`
- 계정 B: `[시험 이메일 B]`
- 두 계정에 입력한 비밀번호: `[가림 — 두 계정에 같은 값 사용]`

### 데이터베이스 저장 모습

`supabase/password-evidence.sql`의 첫 번째 결과를 붙인다.

```text
계정 A bcrypt_hash: [SQL 실행 뒤 실제 해시를 붙일 자리]
계정 B bcrypt_hash: [SQL 실행 뒤 실제 해시를 붙일 자리]
bcrypt 형식 확인: [실행 전]
```

판정은 다음 세 가지를 모두 만족해야 한다.

1. 두 값이 입력한 비밀번호 원문과 다르다.
2. 두 값이 bcrypt 형식이다.
3. 같은 비밀번호를 사용했지만 두 해시가 서로 다르다.

두 번째 SQL 결과의 기대값:

```text
account_count: 2
distinct_hash_count: 2
same_password_has_different_hashes: true
```

### 로그인 요청과 응답 기록

Edge Function 배포 후 개발자 도구에서 원문을 복사하지 않고 다음처럼 기록한다. 암호문도 전체를 제출 문서에 복사하지 않는다.

```text
요청: POST /functions/v1/auth-gateway
요청 본문 필드: mode, encrypted_key, iv, ciphertext
요청 본문의 password 필드: 없음
요청 본문의 비밀번호 원문 검색: 0건
응답: [실제 상태 코드]
응답 본문 검사: password 필드와 비밀번호 원문 없음 [실행 전]
화면 검사: 비밀번호 원문 표시 없음 [실행 전]
브라우저 콘솔 검사: 비밀번호 원문과 인증 요청·응답 본문 없음 [실행 전]
Supabase Edge Function 로그 검사: 비밀번호 원문과 인증 요청·응답 본문 없음 [실행 전]
```

## 5. 현재 판정

코드와 증거 쿼리는 준비됐지만 `auth-gateway`의 실제 배포·로그인 네트워크 검사, 시험 계정 두 개, 데이터베이스 해시 결과가 아직 없으므로 카드 2는 **검증 전**이다. 운영 환경에서 위 네 위치를 확인하고 SQL 결과를 채운 뒤에만 통과로 판정한다.
