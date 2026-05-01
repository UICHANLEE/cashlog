import type { PhotoAnalysis } from '../domain/cashlog'

/** 파일 이름 휴리스틱 MVP — 원격 분석 불가 시·로컬 개발 기본값 */
export const mockAnalyzePhoto = async (file: File): Promise<PhotoAnalysis> => {
  const fileName = file.name.toLowerCase()

  if (fileName.includes('subway')) {
    return {
      suggestedAmount: 14200,
      suggestedCategory: 'transit_public',
      suggestedTitle: '이동 기록',
      suggestedMemo: '사진 속 이동 내역을 대중교통으로 분류했어요.',
      confidence: 0.82,
      rawText: '교통 영수증 14,200원',
      engine: 'mock',
    }
  }

  if (fileName.includes('taxi')) {
    return {
      suggestedAmount: 14200,
      suggestedCategory: 'transit_car',
      suggestedTitle: '이동 기록',
      suggestedMemo: '사진 속 이동 내역을 택시·주차·유류로 분류했어요.',
      confidence: 0.82,
      rawText: '교통 영수증 14,200원',
      engine: 'mock',
    }
  }

  if (fileName.includes('movie') || fileName.includes('gallery')) {
    return {
      suggestedAmount: 18000,
      suggestedCategory: 'leisure_show',
      suggestedTitle: '문화 생활 기록',
      suggestedMemo: '사진 속 장소를 문화·여가 지출로 추천했어요.',
      confidence: 0.84,
      rawText: '전시/영화 18,000원',
      engine: 'mock',
    }
  }

  return {
    suggestedAmount: 5200,
    suggestedCategory: 'meal_cafe',
    suggestedTitle: '오늘의 카페 기록',
    suggestedMemo: '사진에서 카페 영수증처럼 보이는 기록을 발견했어요.',
    confidence: 0.88,
    rawText: '카페 영수증 5,200원',
    engine: 'mock',
  }
}
