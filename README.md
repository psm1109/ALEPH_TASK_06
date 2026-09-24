# PDS Diary

계획(Plan) → 실행(Do) → 돌아보기(See)를 하나의 흐름으로 연결하는 개인 기록 도구입니다. 계획과 실제 행동을 분리해 저장하고, 예상과 실제의 차이를 근거 기록과 함께 확인할 수 있습니다.

> 첫 화면은 누구나 열 수 있는 로그인·가입 화면입니다. 다이어리 자료는 로그인한 계정의 `user_id`와 일치할 때만 Supabase RLS가 반환합니다.

## 계정과 자료 보호

- Supabase Auth 이메일·비밀번호 방식으로 가입, 로그인, 로그아웃합니다.
- 브라우저 라이브러리는 `@supabase/supabase-js` `2.116.0`으로 고정했습니다.
- 로그인·가입 자격 증명은 Web Crypto의 AES-256-GCM으로 암호화하고, 일회용 AES 키는 RSA-OAEP-256으로 다시 암호화해 `auth-gateway` Edge Function에 전달합니다.
- 브라우저 네트워크 요청에는 이메일·비밀번호 필드 대신 `encrypted_key`, `iv`, `ciphertext`만 남습니다.
- 로그인하지 않은 상태에서는 URL의 `#plan`, `#do`, `#see`, `#history`를 직접 열어도 다이어리 대신 로그인 화면이 나옵니다.
- 모든 자료 요청은 세션 access token을 `Authorization` 헤더로 보내며 URL에는 싣지 않습니다.
- 각 자료 행의 `user_id`가 서버의 `auth.uid()`와 같은지는 PostgreSQL RLS가 검사합니다.
- 단건 자료 읽기·수정·삭제는 `diary-data` Edge Function이 같은 JWT로 소유 여부를 먼저 확인하고, 남의 자료와 없는 자료를 모두 `404`로 감춥니다.
- 로그아웃된 JWT가 만료 전까지 재사용되는 것을 막기 위해 JWT의 `session_id`가 서버의 `auth.sessions`에 남아 있는지도 Data API 요청마다 검사합니다.
- 로그인 실패 화면은 존재하지 않는 이메일과 틀린 비밀번호를 구별하지 않고 모두 `이메일 또는 비밀번호를 확인해 주세요.`라고 표시합니다.

### 비밀번호 보관

- 비밀번호 저장과 검증은 직접 구현하지 않고 Supabase Auth에 맡깁니다.
- Supabase Auth는 비밀번호를 계정별 무작위 salt가 포함된 bcrypt 해시로 `auth.users.encrypted_password`에 저장합니다.
- 앱과 `auth-gateway`는 인증 요청이나 응답 본문을 로그에 기록하지 않으며, 인증 시도 뒤 비밀번호 입력칸을 비웁니다.
- Edge Function은 Supabase Auth 오류 본문을 브라우저로 전달하지 않고 일반화된 실패 응답만 반환하며, 성공 시 세션에 필요한 허용 목록 필드만 반환합니다.
- 같은 비밀번호로 만든 두 시험 계정의 해시 확인은 SQL Editor 전용 [`supabase/card2-password-evidence.sql`](supabase/card2-password-evidence.sql)을 사용합니다. 이 파일에는 비밀번호를 적지 않습니다.

## 주요 기능

### Plan · 계획

- 빈 워크스페이스에서는 사용자가 첫 계획을 직접 작성합니다.
- 기간, 우선순위, 성공 기준, 예상 일수를 저장합니다.
- 계획을 수정하면 기존 값을 덮어쓰지 않고 새 버전을 추가합니다.
- 계획에 연결된 할 일을 만들고 수정·삭제할 수 있습니다. 완료 체크는 직접 조작하지 않으며 오늘 실행 기록이 있으면 자동으로 표시됩니다.
- 할 일마다 마감일, 우선순위, 태그, 예상 시간을 저장합니다.
- 검색, 상태·우선순위·태그 필터와 여러 정렬 기준을 지원합니다.
- 이번 주 학습 기록의 완료 표시는 날짜별 실행 기록에서 계산합니다. 같은 할 일의 실행 기록이 여러 건이어도 해당 날짜 완료는 1건이며, 아래 시간은 실행 기록의 실제 소요 시간 합계입니다.

### Do · 실행

- 실행 기록 작성은 Do 탭의 `＋ 실행 기록`에서만 시작합니다.
- 실행할 할 일을 선택하고 시작 시각, 종료 시각, 실제 소요 시간, 막힌 이유를 저장합니다.
- 실제 시간은 시작·종료 시각으로 자동 계산되며 분 단위로 저장됩니다.
- 실행 기록을 수정하거나 삭제할 수 있습니다.
- 기록은 날짜별 펼침 목록으로 표시되고 항상 해당 할 일과 연결됩니다.

### See · 돌아보기

- 할 일 수는 같은 계획의 수정 버전과 관계없이 기존 할 일 전체를 집계합니다. 계획을 수정해 새 버전이 생겨도 기존 할 일은 유지됩니다. 완료 수는 집계 기간에 실행 기록이 있는 할 일의 날짜별 합계이며, 같은 할 일의 실행 기록이 하루에 여러 건이어도 1건만 셉니다. 막힘 수는 집계 기간에 작성된 막힘 이유 기록을 건별로 세며, 같은 할 일에 막힘 기록이 4건이면 4건으로 표시합니다. 근거 기록에서는 날짜별 할 일과 작성된 이유를 함께 표시합니다. 지연 수는 서울 날짜별 미완료 기록의 합계입니다. 같은 할 일이 여러 날 미완료였다면 날짜마다 1건씩 기록합니다.
- 지연 수는 현재 할 일 수를 계획 시작일부터 오늘까지 날짜마다 적용한 전체 할 일 수에서 같은 기간의 완료 수를 뺀 값입니다. 예를 들어 할 일 5개를 나흘간 진행하고 12건을 완료했다면 `5 × 4 − 12 = 8건`으로 집계합니다. 근거 기록은 날짜별로 아직 실행 기록이 없는 할 일을 표시하며, 실행 기록이 추가·수정·삭제되면 다시 계산합니다.
- 예상 시간은 현재 할 일의 일일 예상 시간 합계에 계획 시작일부터 오늘까지 시작일과 오늘을 포함한 경과 일수를 곱해 표시합니다. 근거 기록에는 각 할 일 제목과 일일 예상 시간을 함께 표시합니다. 실제 시간은 집계 기간의 실행 기록을 날짜별로 합산하고, 근거 기록에는 날짜별 실행 완료 내역과 각 실제 소요 시간을 표시합니다. 예상 대비 차이는 전체 실제 시간에서 누적 예상 시간을 뺀 값이며, 근거 기록에는 날짜별 각 할 일의 실제·예상·차이와 일일 총 차이를 표시합니다.
- 집계 숫자를 선택하면 계산에 사용된 할 일 제목을 간단한 목록으로 확인할 수 있습니다. 완료 수의 근거 기록은 날짜별 펼치기 항목으로 표시합니다.
- 완료 내역은 날짜별로 묶고 날짜 합계와 할 일별 실행 시간 합계를 표시합니다.
- Plan의 완료 체크는 직접 클릭할 수 없습니다. 실행 기록을 추가하면 자동으로 체크되고, 해당 날짜의 마지막 실행 기록을 삭제하거나 다른 날짜·할 일로 옮기면 자동으로 해제됩니다.
- 회고를 작성·수정·삭제하고, 다음 계획으로 넘길 고칠 점 한 줄을 정합니다.

## 저장과 복원

- 계획, 할 일, 실행 기록, 완료 기록, 회고는 Supabase에 저장됩니다.
- 페이지를 새로고침하면 동일한 ID, 날짜, 값, 단위로 다시 불러옵니다.
- 날짜별 미완료 기록은 DB에 저장되고 다음 접속 시 비어 있던 지난 날짜를 보충합니다. 할 일을 삭제하면 연결된 미완료 기록도 함께 삭제됩니다.
- 화면 상단의 `전체 자료 내보내기`를 누르면 최신 서버 자료를 JSON 파일 하나로 내려받습니다.
- 내보내기 파일에는 설정 URL, Publishable key, 인증 헤더가 포함되지 않습니다.
- 날짜 표시와 오늘·지연 판정은 `Asia/Seoul`을 기준으로 합니다.

최종 데이터 표, 항목, 관계, 날짜·단위 규칙은 [`contracts/pds-schema-v2.json`](contracts/pds-schema-v2.json)에 정의되어 있습니다.

## Supabase 설정

1. Supabase 프로젝트의 SQL Editor에서 [`supabase/schema.sql`](supabase/schema.sql)을 실행합니다. 이 SQL은 RLS뿐 아니라 로그아웃된 세션을 Data API에서 즉시 거절하는 사전 요청 검사도 설정합니다.
   기존 카드 1 스키마가 이미 적용된 프로젝트에는 [`supabase/card3-session-revocation.sql`](supabase/card3-session-revocation.sql)만 실행해 카드 3 변경을 증분 적용할 수 있습니다.
   기존 PDS Diary 데이터베이스에는 [`supabase/daily-completion.sql`](supabase/daily-completion.sql)과 [`supabase/daily-missed-days.sql`](supabase/daily-missed-days.sql)을 추가로 실행합니다. 이전 버전의 완료 SQL을 이미 실행했다면 새 내용을 다시 실행합니다. 오늘 체크를 풀었던 기존 완료 이벤트는 정리하고, 이전 날짜의 이벤트와 실행 기록은 보존합니다. 과거에 저장되지 못한 완료 날짜는 복구할 수 없습니다.
2. Supabase Authentication의 Email provider를 활성화합니다. 과제 확인 중 가입 직후 로그인해야 한다면 Confirm email을 끕니다.
3. [`public/config.js`](public/config.js)에 Project URL과 `sb_publishable_...` 형식의 Publishable key를 설정합니다.
4. 가입 화면에서 기존 자료를 소유할 본인 계정을 만듭니다.
5. [`supabase/card1-migrate-existing-data.sql`](supabase/card1-migrate-existing-data.sql)의 `OWNER_EMAIL@example.com` 두 곳을 그 계정 이메일로 바꿔 SQL Editor에서 한 번 실행합니다.
6. 아래의 인증 게이트웨이 설정을 완료합니다.
7. `public` 디렉터리를 정적 웹 루트로 실행하거나 배포합니다.

### 인증 게이트웨이 설정

로그인·가입 Request Payload에 비밀번호 원문을 남기지 않으려면 정적 웹 배포와 함께 Edge Function이 반드시 배포되어야 합니다.

```powershell
node scripts/generate-auth-key.mjs
supabase secrets set --env-file supabase/.env.auth.local --project-ref YOUR_PROJECT_REF
supabase secrets set AUTH_ALLOWED_ORIGIN=https://YOUR_DEPLOYED_ORIGIN --project-ref YOUR_PROJECT_REF
supabase functions deploy auth-gateway --project-ref YOUR_PROJECT_REF
```

- `supabase/.env.auth.local`은 Git에서 제외되며 내용을 문서·로그·채팅에 복사하지 않습니다.
- `AUTH_ALLOWED_ORIGIN`은 실제 웹 앱의 정확한 origin으로 지정합니다. 로컬에서 별도 Supabase 프로젝트를 쓸 때만 로컬 origin을 설정합니다.
- 키를 다시 생성했다면 새 secret을 적용한 직후 함수를 다시 배포합니다.
- 함수가 배포되지 않았거나 secret이 없으면 로그인·가입은 안전하게 실패하며 Supabase Auth로 직접 우회하지 않습니다.

```js
window.__PDS_CONFIG__ = {
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabasePublishableKey: "sb_publishable_YOUR_KEY",
};
```

웹페이지에는 Supabase 설정 입력 화면이 없습니다. Publishable key는 공개 식별자이며 자료 접근 권한을 부여하는 비밀키가 아닙니다. `schema.sql`은 `anon` 역할의 다이어리 권한을 제거하고, 로그인한 계정과 행의 `user_id`가 일치할 때만 자료를 허용합니다. `sb_secret_...`, `service_role`, JWT 비밀값은 브라우저 코드나 Git에 넣으면 안 됩니다.

## 로컬 실행

별도의 빌드 과정은 필요하지 않습니다. 저장소 루트에서 다음처럼 `public`을 정적 서버로 제공할 수 있습니다.

```bash
python -m http.server 4173 --directory public
```

브라우저에서 `http://localhost:4173`으로 접속합니다.

배포 서비스에서도 출력 디렉터리를 `dist`가 아닌 `public`으로 지정해야 합니다. 또는 `public` 내부 파일이 배포 루트에 오도록 설정합니다.

## 프로젝트 구조

```text
.
├─ public/
│  ├─ index.html       # 화면 구조와 입력 모달
│  ├─ styles.css       # 레이아웃, 반응형 UI, 커서 규칙
│  ├─ auth-crypto.mjs  # 인증 Payload 하이브리드 암호화
│  ├─ app.js           # 인증 상태, Plan·Do·See 상태와 Supabase REST 처리
│  ├─ missed-days.mjs  # 지난 서울 날짜별 미완료 기록 생성
│  └─ config.js        # Project URL과 Publishable key
├─ scripts/
│  ├─ generate-auth-key.mjs # Git 제외 대상 RSA 비밀키 파일 생성
│  ├─ verify-session-revocation.mjs # 시험 계정 자동 로그인 방식의 세션 비교
│  └─ card3-browser-evidence.js # 로그인된 브라우저의 가린 세션 비교
├─ supabase/
│  ├─ config.toml      # Edge Function 공개 호출 설정
│  ├─ functions/auth-gateway/index.ts # 암호화된 인증 요청 중계
│  ├─ functions/diary-data/index.ts # 단건 소유자 확인 및 Data API 중계
│  ├─ schema.sql       # 사용자 소유권 열, RLS, 날짜별 완료 기록
│  ├─ daily-completion.sql # 기존 DB의 날짜별 완료 기록 전환
│  ├─ daily-missed-days.sql # 기존 DB의 날짜별 미완료 기록 테이블 추가
│  ├─ card3-session-revocation.sql # 기존 운영 DB용 즉시 세션 폐기 증분 SQL
│  └─ card1-migrate-existing-data.sql # 기존 pds-main 자료 소유자 이관
└─ contracts/
   └─ pds-schema-v2.json # 데이터 계약과 내보내기 규칙
```

## 정상 동작 확인

- 새 시크릿 창과 로그아웃 상태에서는 로그인 화면만 표시됩니다.
- 가입한 계정으로 로그인하면 상단 연결 상태에 `Supabase 저장됨`이 표시됩니다.
- 로그아웃하면 즉시 다이어리가 사라지고 로그인 화면으로 돌아갑니다.
- 첫 계획을 저장하면 할 일·실행·회고 기능이 활성화됩니다.
- 실행 기록을 저장하면 해당 할 일과 날짜에 완료 체크와 실제 시간이 함께 표시됩니다.
- 완료 체크는 직접 조작할 수 없으며 실행 기록의 추가·수정·삭제 결과를 따릅니다.
- 새로고침 후에도 저장된 자료와 집계가 유지됩니다.
- Plan에서는 계획과 할 일, Do에서는 연결된 실행 기록, See에서는 집계 근거와 회고가 표시됩니다.
- `전체 자료 내보내기`를 누르면 `pds-diary-<workspace>-YYYY-MM-DD.json` 파일이 생성됩니다.

연결 정보가 없거나 요청에 실패하면 `Supabase 설정 누락` 또는 `Supabase 연결 실패` 상태와 오류 안내가 표시됩니다. 계획이나 기록이 없을 때는 각 영역에 다음 행동을 알려 주는 빈 상태 안내가 나타납니다.

정적 보안 검사는 다음 명령으로 실행합니다.

```bash
node tests/card1-static.test.cjs
node tests/card2-password.test.cjs
node tests/auth-crypto.test.mjs
node tests/card3-session.test.cjs
node --check scripts/card3-browser-evidence.js
```

배포 후 개발자 도구에서 로그인 요청을 확인할 때 `auth-gateway` POST의 Payload에는 `mode`, `encrypted_key`, `iv`, `ciphertext`만 있어야 합니다. `password` 필드나 입력한 비밀번호 원문이 보이면 통과로 판정하지 않습니다. Response·Console·화면과 Supabase Edge Function 로그에도 원문이 없어야 합니다.

로그인한 사람을 식별하는 값, 만료 시각, 같은 요청의 로그아웃 전후 비교 절차는 [`docs/card-3-session-revocation.md`](docs/card-3-session-revocation.md)에 기록합니다. 실제 응답은 운영 SQL과 Edge Function을 배포한 뒤 시험 계정으로 확인하기 전에는 통과로 판정하지 않습니다.
