# Cashlog

사진 한 장으로 지출을 남기고, 하루를 일기처럼 요약하는 **사진 기반 웹 가계부** MVP입니다.  
현재는 실제 Vision API 대신 **mock 분석**으로 UX를 검증합니다.

## 주요 기능

- **월 캘린더**: 날짜별 지출 합계, 사진 로그 여부 표시
- **`+ 기록 추가`**: 카메라/사진 선택 또는 직접 입력
- **사진 흐름**: 파일 선택 후 mock AI가 금액·카테고리·제목·메모를 제안 (수정 후 저장)
- **일별 로그**: 선택한 날짜의 지출 타임라인과 일기형 요약
- **로컬 저장**: 브라우저 `localStorage`에 지출 목록 유지

## 기술 스택

- React 19, TypeScript, Vite
- Vitest, Testing Library (단위·UI 테스트)
- 도메인 로직: [`src/domain/cashlog.ts`](src/domain/cashlog.ts) — 이후 실제 AI 구현 시 `analyzePhoto` 등만 교체하면 됩니다.

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

## 폴더 구조 (요약)

```
src/
  App.tsx          # 화면·상태·저장소 연동
  App.css
  domain/
    cashlog.ts     # 분석, 지출, 캘린더, 일별 로그 도메인
    cashlog.test.ts
  App.test.tsx
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

- `analyzePhoto`를 서버 또는 Vision API 연동으로 교체
- 로그인·동기화 시 `localStorage` 대신 백엔드(Supabase 등)로 이전
