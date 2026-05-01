# Cashlog Photo MVP Spec

## Goal
Cashlog의 첫 웹 MVP는 사진 한 장이 지출 기록과 하루 로그로 바뀌는 경험을 검증한다. 실제 AI 연동은 1차 범위에서 제외하고, 교체 가능한 mock 분석기로 제품 흐름을 먼저 완성한다.

## Scope
- 월 캘린더에서 날짜별 지출 합계와 사진 기록 여부를 확인한다.
- `+ 기록 추가`에서 `카메라/사진 선택` 또는 `직접 입력`을 선택한다.
- 사진 선택 시 mock 분석 결과로 금액, 카테고리, 제목, 메모를 추천한다.
- 사용자는 추천값을 수정한 뒤 저장한다.
- 저장된 지출은 일별 타임라인과 일기형 `DailyLog`에 반영된다.
- 브라우저 `localStorage`에 기록을 저장해 새로고침 후에도 유지한다.

## Out Of Scope
- 실제 OCR, Vision API, 서버 저장소, 로그인, 앱 빌드, 카드/계좌 연동
- 지출 통계 고도화, 예산 알림, 다중 사용자 동기화

## Acceptance Criteria
- 사진 파일 이름에 따라 mock 분석 결과가 생성된다.
- 사진 지출 저장 후 해당 항목이 일별 타임라인에 보인다.
- 직접 입력 지출 저장 후 금액과 카테고리가 보인다.
- 월별 총 지출과 캘린더 날짜별 금액이 저장된 지출을 반영한다.
- 도메인 테스트와 UI 테스트가 통과한다.

## Technical Decisions
- Stack: Vite, React, TypeScript
- State: React state with `localStorage` persistence
- AI boundary: `analyzePhoto(file)` exposes a stable interface for later Vision API replacement
- Storage boundary: expense serialization stays separate from UI state
