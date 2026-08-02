# Cashlog 계정·프로필 인증

## 구조

- Supabase Auth가 비밀번호 해시, 이메일 중복, Access/Refresh Token을 관리합니다. 비밀번호 원문과 해시는 `public` 테이블에 복제하지 않습니다.
- Vercel Functions가 `/api/auth/*`, `/api/users/*`를 제공하고 토큰을 `HttpOnly`, `SameSite=Lax`, 프로덕션 `Secure` 쿠키에 저장합니다.
- `public.cashlog_profiles`에는 닉네임, 계정 상태와 프로필 이미지의 영구 Storage 경로만 저장합니다.
- 프로필 원본은 서버에서 MIME·파일 시그니처·해상도를 검증한 뒤 512×512 WebP로 재인코딩합니다. EXIF와 원본 파일명은 저장하지 않습니다.
- 이미지는 비공개 `cashlog-profiles/<user-id>/<uuid>.webp`에 저장하며 화면에는 1시간짜리 서명 URL만 전달합니다.

기존 앱은 Supabase RLS 동기화에 Access Token이 필요합니다. OAuth·메일 인증 콜백의 Refresh Token은 `/api/auth/session`에서 즉시 검증·회전한 뒤 HttpOnly 쿠키로 바뀝니다. `/api/auth/me`가 쿠키를 검증해 돌려준 Access Token은 앱 메모리에서만 사용하며 `localStorage`에는 저장하지 않습니다. 이전 버전의 로컬 세션은 최초 실행 시 한 번만 읽어 같은 쿠키 세션으로 이관한 뒤 삭제합니다.

## 환경변수

Vercel의 Production, Preview, Development 환경에 다음 값을 설정합니다.

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-key>
AUTH_RATE_LIMIT_SALT=<32자 이상의 무작위 문자열>
CASHLOG_ALLOWED_ORIGINS=https://cashlog.example.com,https://cashlog.vercel.app
```

`SUPABASE_SERVICE_ROLE_KEY`와 `AUTH_RATE_LIMIT_SALT`에는 `VITE_`를 붙이지 않으며 Git에 커밋하지 않습니다.

## Supabase 적용

1. Supabase SQL Editor에서 `supabase/schema.sql` 전체를 실행합니다. `create if not exists`와 `on conflict`를 사용하므로 기존 Cashlog 기록을 지우지 않습니다.
2. Storage에서 `cashlog-profiles` 버킷이 Private인지 확인합니다.
3. Authentication → URL Configuration의 Site URL에 운영 주소를, Redirect URLs에 운영 주소와 로컬 주소를 등록합니다.
4. 이메일 인증을 사용할 경우 Email Templates의 리디렉션 주소가 허용 목록과 일치하는지 확인합니다.

## 페이지와 API

| 화면 | 경로 |
| --- | --- |
| 회원가입 | `/signup.html` |
| 로그인 | `/login.html` |
| 비밀번호 재설정 요청 | `/forgot-password.html` |
| 새 비밀번호 설정 | `/reset-password.html` |
| 보호된 프로필 | `/profile.html` |

| Method | Endpoint | 설명 |
| --- | --- | --- |
| POST | `/api/auth/signup` | multipart 회원가입과 프로필 사진 저장 |
| POST | `/api/auth/login` | 비밀번호 로그인과 쿠키 발급 |
| POST | `/api/auth/session` | OAuth·메일 콜백 Refresh Token 검증·회전과 쿠키 발급 |
| POST | `/api/auth/logout` | 전체 세션 로그아웃과 쿠키 삭제 |
| POST | `/api/auth/refresh` | Refresh Token 회전 |
| POST | `/api/auth/password-reset-request` | 계정 존재 여부를 노출하지 않고 재설정 메일 요청 |
| PATCH | `/api/auth/password-reset` | Recovery Token 검증 후 비밀번호 변경·전체 세션 무효화 |
| GET | `/api/auth/me` | 현재 사용자·서명 이미지 URL 조회 |
| PATCH | `/api/users/me` | multipart 닉네임·이미지 변경 |
| PATCH | `/api/users/me/password` | 비밀번호 변경 후 전체 세션 무효화 |
| DELETE | `/api/users/me` | Cashlog 데이터 삭제·프로필 익명화·전체 세션 무효화 |

회원가입 예시:

```js
const form = new FormData()
form.append('email', 'user@example.com')
form.append('password', 'Strong!2026')
form.append('passwordConfirm', 'Strong!2026')
form.append('nickname', '캐시로거')
form.append('age14Consent', 'true')
form.append('termsConsent', 'true')
form.append('privacyConsent', 'true')
form.append('profileImage', file)
await fetch('/api/auth/signup', { method: 'POST', credentials: 'include', body: form })
```

브라우저가 multipart boundary를 만들도록 `Content-Type`은 직접 지정하지 않습니다.

## 오류와 정리

오류는 `{ success: false, code, message, field? }` 형식입니다. 이미지 업로드 후 프로필 저장이 실패하면 새 이미지를 삭제하고, 회원가입 중 실패하면 생성된 Auth 사용자도 삭제합니다. 이미지 변경은 새 파일과 DB 경로를 먼저 저장한 후 이전 파일을 삭제합니다.

회원탈퇴는 공유 Supabase 프로젝트의 다른 앱 계정을 지우지 않도록 Cashlog 소유 데이터만 삭제하고 `cashlog_profiles`를 익명화하는 Soft Delete 정책을 사용합니다. 탈퇴 프로필은 다시 로그인할 수 없고 모든 기존 세션은 무효화됩니다.

기존에 이미지가 사라진 원인은 `URL.createObjectURL()`로 만든 `blob:` 미리보기 주소가 현재 브라우저 세션에서만 유효하기 때문입니다. 현재 구현은 `File` 자체를 서버로 전송하고 DB에는 `storage://cashlog-profiles/...` 경로만 저장하므로 새로고침, 재로그인, 다른 기기에서도 다시 서명 URL을 발급받을 수 있습니다.

## 검증

```bash
npm install
npm run test
npm run lint
npm run build
```

실환경에서는 이미지 포함 가입 → 이메일 인증 → 로그인 → `/profile.html` 확인 → 새로고침 → 로그아웃·재로그인 → 다른 브라우저 확인 순서로 점검합니다. API는 Supabase와 외부 Storage가 실제 연결된 환경에서만 영속성 종단 테스트가 가능합니다.
