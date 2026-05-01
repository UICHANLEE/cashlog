import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

describe('Cashlog photo MVP', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:cashlog-photo'),
      revokeObjectURL: vi.fn(),
    })
  })

  it('lets a user add a photo expense and see it in the daily log', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '+ 기록 추가' }))
    await user.click(screen.getByRole('button', { name: '카메라/사진 선택' }))
    await user.upload(
      screen.getByLabelText('사진 파일 선택'),
      new File(['receipt'], 'cafe-receipt.jpg', { type: 'image/jpeg' }),
    )

    await waitFor(() => {
      expect(screen.getByDisplayValue('오늘의 카페 기록')).toBeInTheDocument()
    })

    await user.clear(screen.getByLabelText('금액'))
    await user.type(screen.getByLabelText('금액'), '6800')
    await user.click(screen.getByRole('button', { name: '저장하기' }))

    expect(screen.getByText('오늘의 카페 기록')).toBeInTheDocument()
    expect(screen.getAllByText('6,800원').length).toBeGreaterThan(0)
    expect(screen.getByText(/오늘은 오늘의 카페 기록/)).toBeInTheDocument()
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
})
