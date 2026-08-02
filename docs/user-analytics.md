# Cashlog 사용자 활동 로그 운영 가이드

## 무엇을 볼 수 있나

Cashlog는 다음 제품 이벤트를 `/uichan` 관리자 화면에서 조회합니다.

- 페이지·앱 화면 방문
- 로그인·회원가입·비밀번호 재설정의 시작, 성공, 실패
- 카메라 열기, 사진·영상 선택, 분석 시작·성공·실패
- 가계부 기록 저장, 하루·한 달 스토리 열기
- 캐릭터 상호작용과 꾸미기
- 사전예약 제출, 프로필 수정, 회원탈퇴
- 브라우저에서 처리되지 않은 오류

조회 화면에는 최근 24시간 이벤트, 활성 세션, 최근 7일 로그인 사용자, 클라이언트 오류와 이벤트별 상세 로그가 표시됩니다. 기간과 이벤트 종류로 필터링할 수 있습니다.

## 수집하지 않는 정보

제품 사용 로그에는 아래 값을 넣지 않습니다.

- 가계부 금액, 제목, 메모
- 사진·영상 원본, 저장 경로, 공개 URL
- 위도·경도와 장소명
- 이메일, 닉네임, 비밀번호, 인증 토큰
- 사용자가 입력한 자유 형식 텍스트

클라이언트와 서버가 각각 값을 제한합니다. 서버의 허용 목록에 없는 속성은 요청에 포함되어도 DB에 저장되지 않습니다. 세션 ID는 HMAC-SHA256으로 해시한 뒤 저장하며 원본 IP는 제품 로그 테이블에 저장하지 않습니다.

## 배포 설정

1. Supabase SQL Editor에서 `supabase/migrations/202608030001_user_event_logs.sql`을 실행합니다.
2. Vercel 프로젝트의 Settings → Environment Variables에 아래 서버 전용 변수를 Production, Preview에 추가합니다.

```env
CASHLOG_ADMIN_EMAILS=owner@example.com
ANALYTICS_HASH_SALT=<32자 이상의 별도 무작위 문자열>
```

기존 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_RATE_LIMIT_SALT`도 유지해야 합니다. 위 두 값에는 `VITE_`를 붙이지 않습니다.

무작위 값은 로컬 터미널에서 만들 수 있습니다.

```bash
openssl rand -base64 48
```

3. Vercel을 다시 배포합니다. 빌드 시점 이후에 추가한 환경변수는 기존 배포에 자동 적용되지 않습니다.
4. `CASHLOG_ADMIN_EMAILS`에 적은 이메일로 `/login.html`에서 로그인합니다.
5. `/uichan`으로 이동해 연결 상태와 사용자 활동 로그를 확인합니다.

설정이 없으면 관리 API는 `503`, 로그인이 없으면 `401`, 허용 목록 밖의 계정은 `403`으로 닫힙니다. `/uichan` HTML 자체는 열릴 수 있지만 로그 데이터는 인증된 관리자 API에서만 반환됩니다.

## 데이터 위치와 보존

- 원본 이벤트: Supabase Table Editor → `cashlog_event_logs`
- 앱 운영 화면: `/uichan`
- 서버 함수 실행·오류: Vercel Dashboard → Logs

제품 이벤트는 90일 보관을 기본으로 하며 관리자 화면 조회 시 오래된 행을 정리합니다. 보존기간을 정확한 시각에 강제해야 하면 Supabase Cron에서 하루 한 번 아래 RPC를 실행하도록 예약합니다.

```sql
select public.cashlog_prune_event_logs(90);
```

회원탈퇴 시 해당 계정에 연결된 제품 이벤트도 `cashlog_delete_account_data`에서 삭제합니다. 익명 세션 로그는 특정 사용자와 연결할 수 없으므로 90일 보존정책으로 자동 파기합니다.

## 사용자 선택권

계정 메뉴의 `사용성 로그`를 끄거나 브라우저의 Do Not Track을 켜면 제품 이벤트를 보내지 않습니다. 이 설정은 브라우저별로 저장됩니다. 로그인 중 수집된 이벤트는 계정 식별자와 연결될 수 있으며, 화면 문구와 개인정보처리방침에서 이를 안내합니다. Vercel 같은 호스팅 사업자가 보안과 장애 대응을 위해 생성하는 인프라 로그는 제품 이벤트와 별개입니다.
