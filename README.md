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
- **로그인·계정 동기화**: Supabase Auth 기반 이메일/비밀번호 가입·로그인, 메일 링크 로그인, 기록·펫 프로필 동기화
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
| `POST` | `/analyze-image` | 서버리스 fallback에서는 `{ imageBase64, mimeType }` JSON 전송 |

## 로그인·DB 동기화 설정

1. Supabase 프로젝트를 만들고 Auth의 Email provider를 켭니다.
2. SQL Editor에서 [`supabase/schema.sql`](supabase/schema.sql)을 실행해 `cashlog_entries`, `cashlog_media`, `cashlog_pet_profiles` 테이블과 RLS 정책을 만듭니다.
3. 루트 `.env` 또는 Vercel 환경 변수에 아래 값을 넣습니다.

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

앱에서는 이메일/비밀번호 회원가입·로그인, 비밀번호 없는 메일 링크 로그인을 모두 지원합니다. 로그인하면 로컬 기록과 원격 기록을 병합하고, 선택한 고양이/강아지 프로필도 계정에 저장합니다.

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
