import type { PhotoAnalysis } from '../domain/cashlog'
import { mockAnalyzePhoto } from './mockAnalyzePhoto'
import { remoteAnalyzePhoto } from './remoteAnalyzePhoto'

type AnalysisMode = 'mock' | 'remote'

const mode = (import.meta.env.VITE_PHOTO_ANALYSIS_MODE ?? 'mock') as AnalysisMode
const remoteUrl =
  import.meta.env.VITE_ANALYZE_API_URL?.trim() ||
  (typeof window !== 'undefined' ? `${window.location.origin}/api/analyze` : '')

/**
 * 사진 → 지출 추천.
 * - `mock`: 파일명 휴리스틱 (기본)
 * - `remote`: `/api/analyze` 등 JSON API (OpenAI Vision은 서버에서만 키 사용)
 *
 * TODO(roadmap): 영수증 OCR / 피사체 인식 기반 자동 카테고리.
 *   영상은 포스터 프레임(첫 장면)을 이 함수로 넘겨 재사용 중이며, 추후
 *   프레임 다중 샘플링 + 서버측 OCR/디텍션으로 확장한다.
 *   설계 메모: docs/ocr-vision-roadmap.md
 */
export const analyzePhoto = async (file: File): Promise<PhotoAnalysis> => {
  if (mode === 'remote') {
    if (!remoteUrl) {
      throw new Error('원격 분석 URL이 설정되지 않았어요. VITE_ANALYZE_API_URL을 확인하세요.')
    }
    return remoteAnalyzePhoto(file, remoteUrl)
  }
  return mockAnalyzePhoto(file)
}
