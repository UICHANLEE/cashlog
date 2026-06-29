import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { createExpenseFromAnalysis, createManualExpense } from './domain/cashlog'

const STORAGE_KEY = 'cashlog.expenses'

describe('Cashlog photo MVP', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:cashlog-photo'),
      revokeObjectURL: vi.fn(),
    })
  })

  it('shows disabled story playback until any entries exist', () => {
    render(<App />)

    expect(screen.getByRole('button', { name: /한 달 스토리/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /하루 스토리/i })).toBeDisabled()
  })

  it('opens the day photo story reel when 스토리 is enabled', async () => {
    const user = userEvent.setup()
    const todaySlice = new Date().toISOString().slice(0, 10)
    const expense = createExpenseFromAnalysis({
      analysis: {
        suggestedAmount: 6200,
        suggestedCategory: 'meal_cafe',
        suggestedTitle: '오늘의 카페',
        suggestedMemo: '',
        confidence: 0.9,
        rawText: '',
      },
      imageUrl: 'blob:cashlog-photo',
      dateTime: `${todaySlice}T12:00:00.000Z`,
    })
    localStorage.setItem(STORAGE_KEY, JSON.stringify([expense]))

    render(<App />)

    await user.click(screen.getByRole('button', { name: /하루 스토리/i }))
    const dialog = screen.getByRole('dialog', { name: `${todaySlice} 기록` })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getAllByText(`${todaySlice} 기록`).length).toBeGreaterThan(0)
    await user.click(within(dialog).getByRole('button', { name: '다음 장' }))
    expect(within(dialog).getByText('오늘의 카페')).toBeInTheDocument()
  })

  it('renders a saved short video entry inside the story reel', async () => {
    const user = userEvent.setup()
    const todaySlice = new Date().toISOString().slice(0, 10)
    const video = createManualExpense({
      title: '편의점 영상',
      amount: 4200,
      category: 'life_goods',
      memo: '짧은 영상 기록',
      dateTime: `${todaySlice}T12:00:00.000Z`,
      kind: 'expense',
      source: 'photo',
      imageUrl: 'blob:cashlog-video',
      mediaType: 'video',
    })
    localStorage.setItem(STORAGE_KEY, JSON.stringify([video]))

    render(<App />)

    await user.click(screen.getByRole('button', { name: /하루 스토리/i }))
    const dialog = screen.getByRole('dialog', { name: `${todaySlice} 기록` })
    await user.click(within(dialog).getByRole('button', { name: '다음 장' }))
    expect(within(dialog).getByText('편의점 영상')).toBeInTheDocument()
    expect(dialog.querySelector('video.story-reel-video')).toBeInTheDocument()
  })

  it('offers silent short-video duration presets in the capture flow', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '+ 기록 추가' }))
    await user.click(screen.getByRole('button', { name: '카메라로 촬영' }))
    await user.click(screen.getByRole('button', { name: '영상' }))

    expect(screen.getByRole('group', { name: '영상 길이' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2초' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '5초' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '10초' })).toBeInTheDocument()
    expect(screen.getByText(/무음 촬영/)).toBeInTheDocument()
  })

  it('lets a user add a manual expense without a photo', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '+ 기록 추가' }))
    await user.click(screen.getByRole('button', { name: '직접 입력' }))
    await user.type(screen.getByLabelText('제목'), '지하철 충전')
    await user.type(screen.getByLabelText('금액'), '10000')
    await user.click(screen.getByRole('button', { name: '대분류: 교통' }))
    await user.click(screen.getByRole('button', { name: '소분류: 대중교통' }))
    await user.click(screen.getByRole('button', { name: '저장하기' }))

    expect(screen.getByText('지하철 충전')).toBeInTheDocument()
    expect(screen.getAllByText('10,000원').length).toBeGreaterThan(0)
    expect(screen.getByText(/교통 · 대중교통/)).toBeInTheDocument()
  })

  it('enables 하루 스토리 after a manual expense (no photo)', async () => {
    const user = userEvent.setup()
    const todaySlice = new Date().toISOString().slice(0, 10)
    const manual = createManualExpense({
      title: '메모만',
      amount: 3000,
      category: 'meal_cafe',
      memo: '',
      dateTime: `${todaySlice}T12:00:00.000Z`,
      kind: 'expense',
    })
    localStorage.setItem(STORAGE_KEY, JSON.stringify([manual]))

    render(<App />)

    expect(screen.getByRole('button', { name: /하루 스토리/i })).not.toBeDisabled()
    await user.click(screen.getByRole('button', { name: /하루 스토리/i }))
    const dialog = screen.getByRole('dialog', { name: `${todaySlice} 기록` })
    await user.click(within(dialog).getByRole('button', { name: '다음 장' }))
    expect(within(dialog).getByText('메모만')).toBeInTheDocument()
  })

  it('moves the visible calendar month', async () => {
    const user = userEvent.setup()
    const now = new Date()
    const currentLabel = `${now.getFullYear()}년 ${now.getMonth() + 1}월`
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const nextLabel = `${next.getFullYear()}년 ${next.getMonth() + 1}월`
    render(<App />)

    expect(screen.getByRole('heading', { name: currentLabel })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '다음 달' }))
    expect(screen.getByRole('heading', { name: nextLabel })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '이전 달' }))
    expect(screen.getByRole('heading', { name: currentLabel })).toBeInTheDocument()
  })

  it('lets a user add manual income via 수입 toggle', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '+ 기록 추가' }))
    await user.click(screen.getByRole('button', { name: '직접 입력' }))
    await user.click(screen.getByRole('button', { name: '수입' }))
    await user.type(screen.getByLabelText('제목'), '환급')
    await user.type(screen.getByLabelText('금액'), '12000')
    await user.click(screen.getByRole('button', { name: '저장하기' }))

    expect(screen.getByText('환급')).toBeInTheDocument()
    expect(screen.getAllByText('+12,000원').length).toBeGreaterThan(0)
    expect(screen.getByText(/급여·근로 · 월급/)).toBeInTheDocument()
  })
})
