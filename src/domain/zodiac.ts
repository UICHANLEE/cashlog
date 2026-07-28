export type ZodiacAnimalId =
  | 'rat'
  | 'ox'
  | 'tiger'
  | 'rabbit'
  | 'dragon'
  | 'snake'
  | 'horse'
  | 'goat'
  | 'monkey'
  | 'rooster'
  | 'dog'
  | 'pig'

export type ZodiacCharacter = {
  id: ZodiacAnimalId
  animalName: string
  characterName: string
  emoji: string
  message: string
  assetPath?: string
}

export const zodiacCharacters: ZodiacCharacter[] = [
  { id: 'rat', animalName: '쥐', characterName: '콩이', emoji: '🐭', message: '작은 기록도 야무지게 모아요' },
  { id: 'ox', animalName: '소', characterName: '두부', emoji: '🐮', message: '오늘도 묵묵히 차곡차곡' },
  { id: 'tiger', animalName: '호랑이', characterName: '호야', emoji: '🐯', message: '용기 있게 소비를 돌아봐요' },
  { id: 'rabbit', animalName: '토끼', characterName: '토리', emoji: '🐰', message: '가볍게 폴짝, 기록은 빠르게' },
  { id: 'dragon', animalName: '용', characterName: '여울', emoji: '🐲', message: '멋진 목표를 향해 올라가요' },
  { id: 'snake', animalName: '뱀', characterName: '보리', emoji: '🐍', message: '꼭 필요한 순간을 놓치지 않아요' },
  {
    id: 'horse',
    animalName: '말',
    characterName: '달리',
    emoji: '🐴',
    message: '새 기록을 향해 가볍게 달려요',
    assetPath: '/pets/zodiac/horse-3d.webp',
  },
  { id: 'goat', animalName: '양', characterName: '구름', emoji: '🐑', message: '포근한 속도로 꾸준히 가요' },
  { id: 'monkey', animalName: '원숭이', characterName: '모모', emoji: '🐵', message: '재미있는 소비 단서를 찾아요' },
  { id: 'rooster', animalName: '닭', characterName: '꼬꼬', emoji: '🐔', message: '하루의 시작을 또렷하게 알려요' },
  {
    id: 'dog',
    animalName: '개',
    characterName: '초코',
    emoji: '🐶',
    message: '곁에서 든든하게 기록을 지켜요',
    assetPath: '/pets/breeds/dog/shiba.webp',
  },
  {
    id: 'pig',
    animalName: '돼지',
    characterName: '몽이',
    emoji: '🐷',
    message: '복이 되는 기록을 말랑하게 모아요',
    assetPath: '/pets/breeds/pig/pink_pig.webp',
  },
]

const RAT_BASE_YEAR = 2020

export function getZodiacCharacter(year: number): ZodiacCharacter {
  const normalizedIndex =
    ((Math.trunc(year) - RAT_BASE_YEAR) % zodiacCharacters.length + zodiacCharacters.length)
    % zodiacCharacters.length
  return zodiacCharacters[normalizedIndex]
}
