# Cashlog

사진 한 장으로 지출을 남기고, 하루를 일기처럼 요약하는 **사진 기반 웹 가계부** MVP입니다.  
기본은 **mock 분석**(파일명 휴리스틱)이고, 선택 시 **서버 연동 Vision(OpenAI)** 으로 실제 영수증 분석이 가능합니다.

## 주요 기능

- **월 캘린더**: 날짜별 지출 합계, 사진 로그 여부 표시
- **`+ 기록 추가`**: 카메라 촬영 / 갤러리 선택 / 직접 입력
- **사진·영상 흐름**: 사진 또는 영상으로 기록. 영상은 첫 장면(포스터)을 잡아 **mock 또는 Vision API** 가 금액·카테고리·제목·메모를 제안 (수정 후 저장)
- **상품 사진 카테고리 추천 구조**: B안 문서 기준 `/api/analyze-image` → 상품 item 탐지 결과 → 카테고리 추천 → 사용자 수정 피드백 저장
- **펫 놀이터**: 기록을 남길수록 고양이·강아지가 함께 레벨업, 레벨에 따라 코디(옷) 해금·갈아입히기
- **일별 로그 & 스토리**: 선택한 날짜의 타임라인·일기형 요약, 하루/한 달을 인스타 스토리처럼 재생
- **로그인·계정 동기화**: Supabase Auth 기반 Google·카카오 간편 로그인, 이메일 가입·로그인, 기록·펫 프로필 동기화
- **계정 관리**: 전용 회원가입·로그인·프로필 화면, HttpOnly 쿠키 세션, 닉네임·프로필 사진·비밀번호 변경, 로그아웃·회원탈퇴
- **비공개 사진 보관**: 촬영 원본의 구도를 유지한 최대 2560px JPEG 보관본을 개인 Storage 폴더에 저장하고, 만료되는 서명 URL로만 표시
- **손그림 다이어리 UI**: 손글씨 폰트·종이 질감·삐뚤 손그림 테두리의 1020 취향 디자인
- **로컬 우선 저장**: 브라우저 `localStorage`에 먼저 저장하고, 로그인 시 계정 데이터와 병합

## 기술 스택

- React 19, TypeScript, Vite
- Vitest, Testing Library (단위·UI 테스트)
- Supabase Auth / PostgREST 연동
- 도메인·UI 코드: 대부분 [`src/domain/cashlog.ts`](src/domain/cashlog.ts)
- 사진 분석 라우팅: [`src/ai/analyzePhoto.ts`](src/ai/analyzePhoto.ts) (`mock` / `remote`)

## Vision API 설정 (선택)

1. [.env.example](.env.example) 을 참고해 루트에 `.env` 를 만듭니다.
2. **프론트**: `VITE_PHOTO_ANALYSIS_MODE=remote` — 기본 호출 주소는 `현재 도메인/api/analyze` 입니다.
   - 상품 사진 B안 파이프라인은 `VITE_IMAGE_ANALYSIS_PIPELINE=product` 와 `/api/analyze-image` 를 사용합니다.
3. **로컬 상품 사진 분석**: FastAPI 모델 서버(8010)와 `npm run dev`(Vite)를 함께 실행합니다. Vite 설정이 `/api/analyze-image`를 FastAPI로 프록시합니다.
   - 기존 receipt 분석은 `vercel dev`(API, 보통 포트 3000)와 `npm run dev`를 함께 실행합니다. Vite 설정이 나머지 `/api`를 3000으로 프록시합니다.
4. **Vercel**: 프로젝트 환경 변수에 **`OPENAI_API_KEY`** 추가. `OPENAI_VISION_MODEL` 은 생략 시 `gpt-4o-mini` .

서버 처리 코드: [`api/analyze.ts`](api/analyze.ts) — 카테고리 소분류 id 는 `cashlog.ts` 와 목록 동기화가 필요합니다.

상품 사진 추천 구조는 상세 I/O 계획서의 v1 계약을 따릅니다. 온디바이스 결과는
`status: provisional`, `revision: 0`으로 즉시 표시하고 서버 검증 결과는
`analysis_revision` 이벤트의 `status: final`로 반영합니다. 사용자가 먼저 카테고리를
고쳤다면 서버 보정은 비교 근거로만 저장하고 사용자 선택을 덮어쓰지 않습니다.

상품 사진 추천 구조:

- [`api/analyze-image.ts`](api/analyze-image.ts): 문서 B안의 분석 API. `multipart/form-data` 이미지 업로드를 받고 상품 item, 추천 카테고리, 신뢰도, fallback 코드를 반환합니다.
- [`src/domain/productImage.ts`](src/domain/productImage.ts): 상품군→Cashlog 카테고리 매핑, 분석 응답 정규화, 피드백 타입.
- [`src/ai/remoteAnalyzeProductImage.ts`](src/ai/remoteAnalyzeProductImage.ts): 프론트에서 `/api/analyze-image`를 호출하고 기존 기록 폼이 쓰는 `PhotoAnalysis`로 변환합니다.
- Supabase: `cashlog_detected_items`, `cashlog_category_feedback`, `cashlog_user_category_rules` 테이블로 탐지 결과와 사용자 수정 이력을 저장합니다.

로컬 학습 모델을 상품 사진 분석에 연결하려면 FastAPI 서버가 아래 계약을
지원해야 합니다.

- `GET /health`: 서버 상태 JSON 반환
- `POST /analyze-image`: `multipart/form-data`의 `image` 파일을 받아 상품 분석 JSON 반환

pip 설치형 Catai 패키지로 서빙할 때의 실행 형태:

```bash
python -m pip install git+https://github.com/UICHANLEE/catai.git
CATAI_DEVICE=mps catai-serve-cashlog --host 127.0.0.1 --port 8010
```

로컬 체크아웃에서 개발 중이면 아래처럼 editable 설치로 실행할 수 있습니다.

```bash
cd /Users/uichan/workspace/catai
.venv/bin/python -m pip install -e .
CATAI_DEVICE=mps .venv/bin/catai-serve-cashlog --host 127.0.0.1 --port 8010
```

그리고 Cashlog 서버 환경 변수에 아래 값을 둡니다.

```env
VITE_PHOTO_ANALYSIS_MODE=remote
VITE_IMAGE_ANALYSIS_PIPELINE=product
PRODUCT_ANALYZER_PROXY_TARGET=http://127.0.0.1:8010
PRODUCT_ANALYZER_API_URL=http://127.0.0.1:8010/analyze-image
```

로컬 Vite 개발 서버에서는 `/api/analyze-image`가 FastAPI 서버로 직접
프록시됩니다. Vercel/API 서버에서는 `PRODUCT_ANALYZER_API_URL` 값이 있으면
OpenAI/VLM fallback 전에 FastAPI 모델 서버를 먼저 호출합니다. 기존
`CATAI_DEV_PROXY_TARGET`, `CATAI_PRODUCT_API_URL`도 legacy alias로 지원합니다.

배포 환경의 상품 분석 서버는 서버 간 인증 정보가 없으면 fail-closed로 호출을
거부합니다. `PRODUCT_ANALYZER_API_KEY`는 Vercel 또는 Home Backend에만 두고,
Cloudflare Access를 거치는 과도기 구성에서는
`CLOUDFLARE_ACCESS_CLIENT_ID`, `CLOUDFLARE_ACCESS_CLIENT_SECRET`도 서버
환경변수로 함께 설정합니다. 전체 네트워크 경계와 단계별 배포 순서는
[`docs/secure-ai-gateway-250716.md`](docs/secure-ai-gateway-250716.md)를 따릅니다.

서버 연결 확인:

```bash
npm run check:product-analyzer
npm run check:product-analyzer -- /path/to/sample.jpg
```

현재 로컬 checkpoint는 UECFood256에서 확보된 `식비`, `카페/간식` 범위만
supervised 분류합니다.

Catai FastAPI 서버의 실제 엔드포인트 계약:

| Method | Path | Cashlog 사용 |
| --- | --- | --- |
| `GET` | `/health` | `npm run check:product-analyzer`에서 서버/checkpoint 확인 |
| `POST` | `/analyze-image` | 앱의 상품 사진 파일을 `multipart/form-data`의 `image`로 전송 |

배포된 Catai 서버에서는 Cashlog 프로덕션 주소만 CORS 허용 목록에 넣습니다.

```env
CATAI_CORS_ALLOWED_ORIGINS=https://your-cashlog-domain.example
```

## 로그인·DB 동기화 설정

1. Supabase 프로젝트를 만들고 Auth의 Email, Google, Kakao provider를 켭니다.
2. SQL Editor에서 [`supabase/schema.sql`](supabase/schema.sql)을 실행해 앱 전용 테이블, 비공개 `cashlog-media` 버킷, RLS 정책을 만듭니다.
3. 루트 `.env` 또는 Vercel 환경 변수에 아래 값을 넣습니다.

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
SUPABASE_SERVICE_ROLE_KEY=server-only-service-role-key
AUTH_RATE_LIMIT_SALT=long-random-secret
```

기존 프로젝트의 legacy `anon` 키를 사용한다면 `VITE_SUPABASE_ANON_KEY`도 계속 지원합니다. Vercel 환경 변수는 빌드 시 주입되므로 값을 추가하거나 수정한 뒤 반드시 새로 배포해야 합니다.

서버 전용 `SUPABASE_SERVICE_ROLE_KEY`와 `AUTH_RATE_LIMIT_SALT`에는 `VITE_`를 붙이지 말고 브라우저 코드나 Git에 넣지 않습니다. 계정 API, 이미지 영속화, 실행·테스트 방법은 [`docs/account-auth.md`](docs/account-auth.md)에 정리되어 있습니다.

### 사용자 활동 로그

`/uichan`은 로그인한 관리자만 볼 수 있는 운영 화면입니다. 페이지 방문, 인증, 사진 선택·분석, 기록 저장, 스토리, 캐릭터 상호작용과 클라이언트 오류를 확인할 수 있습니다. 금액, 메모, 사진·영상, 위치, 이메일, 토큰은 제품 로그에 저장하지 않습니다.

Supabase에서 [`supabase/migrations/202608030001_user_event_logs.sql`](supabase/migrations/202608030001_user_event_logs.sql)을 실행하고 Vercel에 아래 서버 전용 값을 추가한 뒤 재배포합니다.

```env
CASHLOG_ADMIN_EMAILS=owner@example.com
ANALYTICS_HASH_SALT=<32자 이상의 별도 무작위 문자열>
```

전체 이벤트 목록, 보존기간, 관리자 접속 방법은 [`docs/user-analytics.md`](docs/user-analytics.md)에 있습니다.

Supabase Dashboard의 **Authentication → URL Configuration**도 설정해야 이메일 인증 링크가 Cashlog로 돌아옵니다.

- Site URL: 실제 Cashlog 프로덕션 주소(예: `https://cashlog.example.com`)
- Redirect URLs: 프로덕션 주소와 로컬 개발 주소(예: `http://localhost:5175/`)

### Google·카카오 간편 로그인

프론트에 Google/Kakao 비밀키를 넣지 않습니다. 공급자 키는 모두 **Supabase Dashboard → Authentication → Providers**에만 저장합니다.

1. Google Cloud Console에서 OAuth 웹 클라이언트를 만들고, 승인된 리디렉션 URI에 Supabase가 Provider 화면에서 안내하는 콜백 주소를 등록합니다. 보통 `https://<project-ref>.supabase.co/auth/v1/callback` 형식입니다.
2. 발급된 Google Client ID와 Client Secret을 Supabase의 Google Provider에 입력하고 활성화합니다.
3. Kakao Developers에서 앱을 만든 뒤 카카오 로그인과 동의 항목을 설정하고, 같은 Supabase 콜백 주소를 Redirect URI에 등록합니다.
4. Kakao REST API 키와 Client Secret을 Supabase의 Kakao Provider에 입력하고 활성화합니다. Cashlog에서 이메일을 표시하려면 카카오 동의 항목에서 계정 이메일 제공도 설정합니다.
5. 변경된 [`supabase/schema.sql`](supabase/schema.sql)을 SQL Editor에서 다시 실행합니다. 기존 데이터를 삭제하지 않고 OAuth 사용자가 자신의 가입 동의 내역을 저장할 RLS 정책을 추가합니다.

Google·카카오 로그인에는 공급자별 Vercel 비밀키가 필요하지 않습니다. 다만 callback 세션을 HttpOnly 쿠키로 교환하므로 기존 `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`와 서버용 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`를 함께 유지해야 합니다.

OAuth·메일 인증의 Refresh Token은 callback 직후 `/api/auth/session`에서 검증·회전되어 HttpOnly 쿠키에 저장됩니다. 앱의 Supabase Access Token은 RLS 동기화 중 메모리에서만 사용하며 `localStorage`에 저장하지 않습니다.

### 보안 설정

Vercel API는 와일드카드 CORS를 사용하지 않습니다. 커스텀 도메인을 사용하면 Vercel 환경 변수에 실제 Cashlog 주소를 쉼표로 구분해 등록합니다. `VERCEL_URL`과 `VERCEL_PROJECT_PRODUCTION_URL`은 자동으로 허용됩니다.

```env
CASHLOG_ALLOWED_ORIGINS=https://your-cashlog-domain.example
```

전 페이지에는 iframe 삽입 차단, MIME 스니핑 차단, 리퍼러·권한 정책 보안 헤더가 적용됩니다. 사진 분석 API는 확장자, 선언 MIME 타입, 파일 시그니처가 일치하는 JPEG, PNG, WebP, HEIC/HEIF만 처리합니다. 계정 저장본은 EXIF를 제거한 JPEG로 재인코딩한 뒤 사용자별 비공개 Supabase Storage 경로에 저장합니다.

### 사전예약 이메일 확인

`/reservation.html`에서 제출한 이메일은 브라우저가 아니라 Supabase의 `public.cashlog_reservations` 테이블에 저장됩니다. 최신 [`supabase/schema.sql`](supabase/schema.sql)을 SQL Editor에서 실행한 뒤 **Table Editor → cashlog_reservations**에서 확인할 수 있습니다. 방문자는 RLS 정책상 예약 추가만 가능하며 이메일 목록을 조회할 수 없습니다.

가입·메일링크 요청은 현재 접속 중인 Cashlog 주소를 `redirect_to`로 전달합니다. 기본 세션 fragment와 커스텀 이메일 템플릿의 `token_hash` 콜백을 모두 처리합니다.

앱에서는 이메일/비밀번호 회원가입·로그인, 비밀번호 없는 메일 링크 로그인을 모두 지원합니다. 회원가입 시 만 14세 이상, 개인정보, 사진·시간 처리 필수 동의와 위치정보 선택 동의를 구분해 받고 동의 버전을 저장합니다. 로그인하면 로컬 기록과 원격 기록을 병합하고, 선택한 고양이/강아지 프로필과 사진 보관본도 계정에 저장합니다.

사진 보관본은 브라우저에서 다시 인코딩해 EXIF 메타데이터를 제거합니다. 위치 선택 동의만으로 위치 권한을 요청하지 않으며, 실제 위치 기능을 추가할 때 OS 권한 요청과 별도 안내를 함께 제공해야 합니다.

### 하나의 Supabase 프로젝트를 두 앱이 공유할 때

Supabase 프로젝트는 GitHub 저장소에 종속되지 않으므로 서로 다른 두 저장소가 같은 URL과 anon key를 사용해도 됩니다. 다만 Auth 사용자, DB, Storage, 사용량 한도와 장애 범위를 공유합니다.

- Cashlog 데이터는 `cashlog_*` 테이블과 `cashlog-media` 버킷으로 분리합니다.
- 사용자 메타데이터의 `app_id: cashlog`와 RLS를 함께 사용합니다. 스키마의 가입 트리거도 이 값이 있는 사용자에게만 동작합니다.
- 두 배포 도메인을 Supabase Auth의 Redirect URLs에 각각 등록합니다.
- `service_role` 키는 어느 프론트 저장소에도 넣지 않습니다. 브라우저에는 anon/publishable key만 사용합니다.
- 완전히 무관한 운영 서비스라면 프로젝트 분리가 더 안전하지만, 무료 한도 때문에 공유하는 경우 위 격리를 반드시 유지합니다.

공개용 개인정보처리방침은 [`privacy.html`](privacy.html)에 있습니다. 실제 운영 리전, AI 제공자, 보존 기간이나 담당 연락처가 바뀌면 배포 전에 방침도 함께 갱신하고 법률 검토를 거쳐야 합니다.

## 저장소

- GitHub: [https://github.com/UICHANLEE/cashlog](https://github.com/UICHANLEE/cashlog)

## 시작하기

```bash
npm install
npm run dev
```

브라우저에서 표시되는 주소(보통 `http://localhost:5173`)로 접속합니다.

## Vercel 배포

1. [Vercel](https://vercel.com)에 가입·로그인한 뒤 **Add New Project**로 GitHub의 `UICHANLEE/cashlog` 저장소를 연결합니다.
2. **Framework Preset**은 **Vite**로 감지되면 그대로 두면 됩니다.
3. **Build Command**: `npm run build`, **Output Directory**: `dist`(기본값) — 저장소 루트에 [`vercel.json`](vercel.json)이 있어 동일하게 맞춰 둡니다.
4. **Deploy**를 누르면 프로덕션 URL이 발급됩니다. 이후 `main` 브랜치에 푸시할 때마다 자동 배포됩니다.

CLI로 배포하려면: `npm i -g vercel` 후 프로젝트 루트에서 `vercel` / `vercel --prod`.

## 스크립트

| 명령 | 설명 |
|------|------|
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm run test` | Vitest 실행 |
| `npm run lint` | ESLint |

## 문서

- [사진 MVP 스펙](docs/photo-mvp-spec.md)
- [UI 흐름](docs/ui-flow.md)
- [구현 계획](docs/implementation-plan.md)
- [OCR·비전 자동 카테고리 로드맵 (추후)](docs/ocr-vision-roadmap.md)

## 폴더 구조 (요약)

```
src/
  App.tsx          # 화면·상태·저장소 연동
  App.css
  ai/
    analyzePhoto.ts  # mock ↔ remote 분기
    mockAnalyzePhoto.ts
    remoteAnalyzePhoto.ts
  domain/
    cashlog.ts     # 지출, 캘린더, 일별 로그 도메인
    cashlog.test.ts
  App.test.tsx
api/
  analyze.ts       # Vercel 서버리스 — OpenAI Vision
docs/              # 제품·UI·구현 메모
```

## 참고: 국내 대표 가계부·소비 관리 앱

Cashlog 방향(사진·일기형 로그)을 잡을 때 비교해 보기 좋은 서비스 목록입니다.  
기능·요금은 업데이트될 수 있으니, 실제 사용 전 각 앱 스토어·공식 사이트에서 확인하는 것이 좋습니다.

| 서비스 | 성격(한 줄) | 비고 |
|--------|-------------|------|
| [편한가계부](https://ko.realbyteapps.com/) | 수동 입력·통계·달력 중심의 대표 가계부 앱 | (주)리얼바이트 |
| [위플 가계부 (Weple Money)](https://apps.apple.com/kr/app/%EC%9C%84%ED%94%8C-%EA%B0%80%EA%B3%84%EB%B6%80-weple-money/id467936485) | iOS에서 오래 쓰이는 수동/통계형 가계부로, 편한가계부와 자주 비교됨 | Android는 스토어에서 **위플 가계부**로 검색 |
| [뱅크샐러드](https://www.banksalad.com/) | 계좌·카드 연동, 자산·소비 분석 중심 | 자동 연동 선호 시 참고 |
| [토스](https://toss.im/) | 금융 앱 전반 + 소비·리포트 등 | 결제·금융 허브에 가까움 |
| [꼬박가계부](https://apps.apple.com/kr/app/%EA%BC%AC%EB%B0%95%EA%B0%80%EA%B3%84%EB%B6%80-%EC%9E%AC%EC%A0%95%EA%B4%80%EB%A6%AC%EB%8F%84-%EA%BC%AC%EB%B0%95%EA%B0%80%EA%B3%84%EB%B6%80/id6460690098) | 반복 지출·습관 기록 등으로 알려진 가계부 앱 | Android는 스토어에서 **꼬박가계부**로 검색 |
| [유플래너](https://u-planner.co.kr/) | 마이데이터 연동·커플 가계부 등으로 알려진 자동·통계형 앱 | |
| 카카오페이 | 간편결제 내역·앱 내 소비 관리 기능 | [카카오페이](https://www.kakaopay.com/) — “가계부”보다 **결제 데이터** 흐름에 가깝습니다 |

**편한가계부** 단일 앱에 대한 공식 소개는 [편한가계부 공식 사이트](https://ko.realbyteapps.com/)를 보면 됩니다.

## 다음 단계 (참고)

- Vision 프롬프트·모델 미세 조정; 카테고리 id 목록과 `api/analyze.ts` 동기화 자동화
- 이미지·영상 파일 자체를 Blob Storage 또는 IndexedDB로 영구 저장
