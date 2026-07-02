# OCR · 비전 자동 카테고리 로드맵 (추후 기능)

사진/영상에서 **영수증 OCR** 과 **피사체 인식(object detection)** 을 통해 금액·품목·카테고리를 자동으로 채우는 기능의 설계 메모입니다. 지금은 미구현이며, 현재 파이프라인 위에 얹는 것을 전제로 합니다.

## 현재 구조 (재사용 지점)

- 클라이언트 진입점: [`src/ai/analyzePhoto.ts`](../src/ai/analyzePhoto.ts) — `analyzePhoto(file) → PhotoAnalysis`
  - `mock`: 파일명 휴리스틱([`mockAnalyzePhoto.ts`](../src/ai/mockAnalyzePhoto.ts))
  - `remote`: JSON API 호출([`remoteAnalyzePhoto.ts`](../src/ai/remoteAnalyzePhoto.ts))
- 서버: [`api/analyze.ts`](../api/analyze.ts) — OpenAI Vision 호출, 카테고리 소분류 id 화이트리스트 검증
- 결과 타입: `PhotoAnalysis` (금액·카테고리·제목·메모·신뢰도·rawText)
- **영상**: 녹화/업로드 시 첫 장면(포스터 프레임)을 뽑아 `analyzePhoto`로 그대로 넘김 → OCR/디텍션 확장 시 프레임만 늘리면 됨

## 목표

1. **영수증 OCR**: 사진/영상 프레임에서 텍스트를 읽어 총액·상호·일자·품목을 구조화.
2. **피사체 인식**: 영수증이 아닌 제품 사진/영상에서 물체를 인식해 카테고리 자동 지정 (예: 커피컵 → `meal_cafe`, 옷 → `fashion_clothes`).
3. 두 결과를 합쳐 `PhotoAnalysis`(+확장 필드)로 반환, 사용자는 저장 전 수정.

## 제안 단계

### 1단계 — 서버측 OCR 강화 (영수증)
- `api/analyze.ts` 프롬프트에 "영수증이면 총액/상호/일자/대표 품목을 추출" 지시 추가.
- 반환 스키마 확장: `merchant`, `purchasedAt`, `lineItems[]`, `total`.
- 정확도가 필요하면 전용 OCR(예: 클라우드 OCR API)로 텍스트를 먼저 뽑고 LLM으로 정규화.

### 2단계 — 피사체 인식 → 카테고리
- 이미지 임베딩 또는 멀티모달 모델로 "무엇의 사진인지" 분류.
- 라벨 → `CategoryId` 매핑 테이블 정의(카테고리 트리와 동기화, `allLeafCategoryIds` 검증 재사용).
- 낮은 신뢰도는 추천만 하고 강제 지정하지 않음.

### 3단계 — 영상 다중 프레임
- 포스터 한 장 대신 N개 프레임 샘플링(장면 전환·선명도 기준) 후 프레임별 분석을 투표/병합.
- 클라이언트 `captureFrameFromVideo`를 여러 시점에 호출하거나, 서버로 짧은 클립을 올려 처리.

### 4단계 — 온디바이스 옵션 (선택)
- 개인정보·오프라인을 위해 브라우저 내 OCR(tesseract.js)·경량 디텍션(TF.js/transformers.js) 실험.

## 인터페이스 확장 (초안)

```ts
type MediaAnalysis = PhotoAnalysis & {
  merchant?: string
  purchasedAt?: string        // ISO
  lineItems?: { name: string; amount: number }[]
  detectedObjects?: { label: string; category: CategoryId; score: number }[]
  source: 'ocr' | 'detection' | 'mixed' | 'mock'
}

// 사진/영상 공통 진입점 (analyzePhoto를 감싸 확장)
declare function analyzeMedia(input: File | File[]): Promise<MediaAnalysis>
```

## 고려사항
- 비용/지연: 영상 전체 대신 프레임 샘플링. 요청당 프레임 수 상한.
- 프라이버시: 영수증엔 카드번호 등 민감정보가 있을 수 있어 서버 로깅 최소화·마스킹.
- 카테고리 id 동기화: 라벨 매핑과 `categoryTree`/`api/analyze.ts` 화이트리스트를 한 곳에서 관리.
- 저장 지속성: 현재 이미지/영상은 blob URL이라 새로고침 시 사라짐 → 자동 태깅 도입 전에 IndexedDB/서버 저장으로 이전 필요.
