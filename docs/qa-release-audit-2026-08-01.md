# Cashlog Release QA Audit

검사일: 2026-08-01  
검사 기준: `main` commit `8f2ac3f`  
검사 환경: Chrome, Vite `127.0.0.1:5176`, 1440x900 / 768x1024 / 390x844  
현재 판정: **출시 보류**. 로컬 품질 게이트는 통과했지만 아래 실서비스 인증 검증과 레거시 토큰 저장 해소가 필요하다.

## 출시 차단 항목

### P1 - 실서비스 인증과 이미지 영속성 E2E 미검증

로컬 Vite에는 Vercel Functions와 실제 Supabase 메일함이 없어 회원가입, 인증 메일, 비밀번호 재설정 메일, 재로그인, 다른 브라우저에서의 프로필 이미지 유지까지 한 흐름으로 증명할 수 없었다. API 계약과 실패 상태는 자동 테스트했지만, 출시 전 Preview 배포에서 실계정으로 반드시 확인해야 한다.

필수 확인 순서:

1. 이미지 포함 가입 후 인증 메일 수신
2. 인증 링크가 `https://<preview-domain>/login.html`로 복귀
3. 로그인, 새로고침, 로그아웃, 재로그인 후 같은 이미지 표시
4. 비밀번호 재설정 메일에서 `reset-password.html` 복귀 및 변경
5. 변경 전 세션 무효화와 변경 후 로그인 확인
6. 탈퇴 후 보호 페이지/API 접근 거부 확인

### P1 - 레거시 Supabase OAuth 세션이 localStorage에 남음

메인 화면의 기존 간편 로그인 경로는 `src/services/auth.ts`에서 Supabase access/refresh token을 `localStorage`에 저장한다. 새 이메일 인증 화면은 HttpOnly 쿠키를 사용하지만 두 인증 구조가 공존한다. XSS 발생 시 레거시 토큰 탈취 범위가 커지므로, 출시 전 OAuth callback을 서버에서 쿠키 세션으로 교환하도록 통합하거나 해당 경로를 비활성화해야 한다.

## 수정 완료

### P1

- 비밀번호 재설정 페이지와 API가 없던 문제: 요청, 재설정, 만료 링크 상태, 전역 로그아웃을 구현했다.
- 잘못된 URL에서 실제 가계부가 노출되던 문제: 전용 404를 추가해 기록 데이터를 렌더링하지 않는다.
- 일시적인 프로필 API 장애를 로그아웃으로 오판하던 문제: 401만 로그인으로 보내고 5xx는 재시도 화면을 유지한다.
- 로그인 이메일 형식이 서버까지 전송되던 문제: 클라이언트에서 먼저 차단하고 첫 오류 입력에 초점을 보낸다.
- 기록 추가 모달의 키보드 초점 이탈: 열기 초점, Tab 순환, Escape 닫기, 트리거 초점 복귀를 적용했다.
- CTA 색상 대비 3.31:1 미달: 4.72:1로 수정했다.

### P2

- 가입 오류와 라벨이 합쳐져 접근 가능한 이름이 바뀌던 문제를 `label`과 `aria-describedby` 구조로 분리했다.
- 로그인/가입/프로필 중복 제출과 실패 상태를 보강했다.
- 긴 기록 제목은 80자로 제한하고 카드에서 강제 줄바꿈한다.
- 새 창 개인정보 링크에 `noopener noreferrer`를 적용했다.
- CSP, `frame-ancestors`, `X-Frame-Options`, MIME sniffing 방지 헤더를 강화했다.

## 테스트 근거

- 정적 검사: `npm run lint` 통과
- 자동 테스트: 29개 파일, 111개 테스트 통과
- 프로덕션 빌드: `npm run build` 통과, 404/가입/로그인/프로필/약관/재설정 산출물 확인
- 반응형: 1440, 768, 390 너비에서 가로 오버플로 0px
- 키보드: 홈 링크 -> 로고 -> 이메일 순서 확인, 기록 모달 Escape/초점 복귀 확인
- 대비: 제목 14.99:1, 필드 라벨 15.6:1, CTA 4.72:1, 보조 문구 5.44:1
- 장애: 네트워크 단절, 503, 느린 로그인, 중복 클릭, 프로필 503 재시도 상태 자동 검증
- 데이터 상태: 기록 없음, 이미지 없음, 월/일 스토리, 긴 제목, 새로고침 후 로컬 기록 유지 검증
- 보안: CORS 허용 출처 테스트, 이미지 MIME/시그니처/재인코딩 테스트, 추적 중인 파일의 토큰 패턴 점검

## 시각 증거

- `docs/qa-evidence/main-2026-08-01/01-mobile-404.png`
- `docs/qa-evidence/main-2026-08-01/02-login-validation.png`
- `docs/qa-evidence/main-2026-08-01/03-signup-errors.png`

## 배포 전 설정

- Supabase Auth Redirect URLs에 운영/Preview의 `login.html`, `reset-password.html` 허용
- Vercel `CASHLOG_ALLOWED_ORIGINS`에 실제 운영 도메인과 필요한 Preview 도메인만 등록
- 메일 발송 제한, SMTP, Storage bucket/RLS, 프로필 테이블 migration 확인
- Preview에서 보안 헤더와 잘못된 URL의 실제 HTTP 404 응답 확인
