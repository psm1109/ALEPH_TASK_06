# 카드 4 — 계정 간 자료 소유권 격리

검사 시각: 2026-09-23 15:56:30 (Asia/Seoul)

비밀번호, access token, refresh token은 이 문서와 저장소에 기록하지 않았다. 아래 `Authorization` 값은 모두 `[가림]`으로 표시한다.

## 시험 계정과 자료

운영 Supabase 프로젝트 `eidvougocycgramikbwq`에 서로 다른 시험 계정 두 개를 만들고, 각 계정으로 로그인한 상태에서 `tasks` 자료를 2건씩 만들었다.

| 계정 | 이메일 | 사용자 ID | 생성한 자료 ID |
| --- | --- | --- | --- |
| A | `t07-a-1790146585388-6b4f32feb5@example.com` | `fe3d941b-fd81-4c03-adb6-42b24841463f` | `19`, `20` |
| B | `t07-b-1790146585895-7ebed9ff32@example.com` | `6d14c972-3e26-41ab-9b82-b8de095d136e` | `21`, `22` |

비밀번호는 실행 중 메모리에서 무작위로 생성하고 인증 시도 직후 비웠으며, 출력하거나 파일에 저장하지 않았다.

공통 요청 헤더:

```http
apikey: [공개 Publishable key 생략]
Authorization: Bearer [가림]
Content-Type: application/json
```

## A 계정에서 B 계정 자료 접근

### 읽기

```http
GET https://eidvougocycgramikbwq.supabase.co/functions/v1/diary-data/tasks?id=eq.21&select=id,title,user_id
```

```http
HTTP/1.1 404 Not Found
Content-Type: application/json; charset=utf-8

{"code":"PGRST116","message":"The requested diary record was not found."}
```

### 수정

```http
PATCH https://eidvougocycgramikbwq.supabase.co/functions/v1/diary-data/tasks?id=eq.21
Prefer: return=representation

{"title":"T07 unauthorized update by a"}
```

```http
HTTP/1.1 404 Not Found
Content-Type: application/json; charset=utf-8

{"code":"PGRST116","message":"The requested diary record was not found."}
```

### 삭제

```http
DELETE https://eidvougocycgramikbwq.supabase.co/functions/v1/diary-data/tasks?id=eq.21
Prefer: return=representation
```

```http
HTTP/1.1 404 Not Found
Content-Type: application/json; charset=utf-8

{"code":"PGRST116","message":"The requested diary record was not found."}
```

## B 계정에서 A 계정 자료 접근

다음 세 요청은 B 계정의 access token을 사용했다.

```http
GET https://eidvougocycgramikbwq.supabase.co/functions/v1/diary-data/tasks?id=eq.19&select=id,title,user_id

PATCH https://eidvougocycgramikbwq.supabase.co/functions/v1/diary-data/tasks?id=eq.19
Prefer: return=representation

{"title":"T07 unauthorized update by b"}

DELETE https://eidvougocycgramikbwq.supabase.co/functions/v1/diary-data/tasks?id=eq.19
Prefer: return=representation
```

세 응답은 모두 다음과 같았다.

```http
HTTP/1.1 404 Not Found
Content-Type: application/json; charset=utf-8

{"code":"PGRST116","message":"The requested diary record was not found."}
```

상대 자료와 존재하지 않는 자료에 같은 응답을 보내므로 자료의 존재 자체도 노출하지 않는다.

## 주소·헤더·본문 소유자 위조

### 주소에 B 사용자 ID 지정

A 계정으로 다음 요청을 보냈다.

```http
GET /functions/v1/diary-data/tasks?user_id=eq.6d14c972-3e26-41ab-9b82-b8de095d136e&select=id,title,user_id
```

```http
HTTP/1.1 200 OK

[]
```

B 자료는 한 건도 반환되지 않았다.

### 헤더에 B 사용자 ID 지정

A 계정 요청에 서버가 신뢰하지 않는 임의 헤더를 추가했다.

```http
GET /functions/v1/diary-data/tasks?workspace_id=eq.pds-main&select=id,title,user_id
X-User-Id: 6d14c972-3e26-41ab-9b82-b8de095d136e
```

```http
HTTP/1.1 200 OK

[
  {"id":19,"title":"T07 a-1790146586177 자료 1","user_id":"fe3d941b-fd81-4c03-adb6-42b24841463f"},
  {"id":20,"title":"T07 a-1790146586177 자료 2","user_id":"fe3d941b-fd81-4c03-adb6-42b24841463f"}
]
```

헤더 값은 무시되었고 A 자료만 반환되었다.

### 본문에 B 사용자 ID 지정

A 계정으로 B 사용자 ID를 소유자로 넣어 새 자료 생성을 시도했다.

```http
POST /functions/v1/diary-data/tasks?select=id,title,user_id
Prefer: return=representation

{
  "user_id":"6d14c972-3e26-41ab-9b82-b8de095d136e",
  "workspace_id":"pds-main",
  "plan_version":1,
  "title":"T07 spoofed owner body",
  "due_date":"2026-09-24",
  "priority":"low",
  "tags":["t07-owner-isolation"],
  "estimated_minutes":10
}
```

```http
HTTP/1.1 403 Forbidden

{"code":"42501","details":null,"hint":null,"message":"new row violates row-level security policy for table \"tasks\""}
```

본문의 `user_id`는 로그인 사용자 식별을 바꾸지 못했고 B 계정에 새 자료도 생기지 않았다.

## 비로그인 직접 요청

`Authorization` 헤더 없이 다음 요청을 보냈다.

```http
GET /functions/v1/diary-data/tasks?id=eq.19&select=id,title,user_id
```

```http
HTTP/1.1 401 Unauthorized

{"error":"Authentication required"}
```

## 거절 전후 건수와 최종 목록

| 시점 | A 계정 자료 수 | B 계정 자료 수 |
| --- | ---: | ---: |
| 양방향 거절 전 | 2 | 2 |
| 양방향 거절·스푸핑 뒤 | 2 | 2 |

A의 최종 목록은 ID `19`, `20`만 포함했고 B의 ID `21`, `22`는 0건이었다. B의 최종 목록은 ID `21`, `22`만 포함했고 A의 ID `19`, `20`은 0건이었다. 양쪽 모두 상대 자료의 제목이 바뀌지 않았고, 삭제되지 않았으며, 본문 위조로 새 자료가 생기지 않았다.

## 거절을 만드는 소스 위치

- `supabase/functions/diary-data/index.ts`
  - `Authorization` 없는 요청을 `401`로 거절한다.
  - 허용된 다섯 다이어리 표만 전달한다.
  - `id=eq...` 단건 요청은 실제 읽기·수정·삭제보다 먼저 같은 JWT로 소유 여부를 조회한다.
  - RLS 때문에 행이 보이지 않으면 수정·삭제를 실행하지 않고 동일한 `404`를 반환한다.
  - 임의의 `X-User-Id` 같은 헤더는 전달하지 않는다.
- `supabase/schema.sql`의 `owner ...` RLS 정책
  - 각 행의 `user_id = auth.uid()`와 활성 서버 세션을 함께 확인한다.
  - 삽입·수정에는 같은 조건을 `with check`로 다시 확인한다.
- `public/app.js`의 `supabaseRequest`
  - 브라우저 자료 요청을 `/functions/v1/diary-data/{table}`로 보내고 access token은 `Authorization` 헤더에만 넣는다.
- `scripts/verify-owner-isolation.mjs`
  - 두 계정 생성, 각 2건 삽입, 양방향 6개 요청, 세 가지 위조, 비로그인 요청, 전후 건수와 최종 목록을 한 번에 재현한다.

`diary-data` Edge Function은 2026-09-23 운영 Supabase 프로젝트에 배포했다. 정적 Vercel 앱의 새 `public/app.js`는 아직 Git 커밋·푸시·재배포하지 않았다.
