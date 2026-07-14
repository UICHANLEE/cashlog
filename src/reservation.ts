import './reservation.css'
import { createReservation } from './services/reservationRepository'

const form = document.querySelector<HTMLFormElement>('#reserve')
const emailInput = document.querySelector<HTMLInputElement>('#reservation-email')
const message = document.querySelector<HTMLParagraphElement>('#reservation-message')
const submitButton = form?.querySelector<HTMLButtonElement>('button[type="submit"]')

form?.addEventListener('submit', async (event) => {
  event.preventDefault()
  const email = emailInput?.value.trim()
  if (!email || !message) return

  submitButton?.setAttribute('disabled', '')
  message.classList.remove('is-error')
  message.textContent = '예약을 챙겨두는 중...'
  try {
    const result = await createReservation(email)
    form.classList.add('is-complete')
    message.textContent = result === 'duplicate'
      ? '이미 예약되어 있어요. 출시 소식은 나비가 잘 챙겨둘게요.'
      : '예약 완료! 나비가 출시 소식을 꼭 챙겨둘게요.'
  } catch (error) {
    message.classList.add('is-error')
    message.textContent = error instanceof Error ? error.message : '예약을 저장하지 못했어요.'
    submitButton?.removeAttribute('disabled')
  }
})
