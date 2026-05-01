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
