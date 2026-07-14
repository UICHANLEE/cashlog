import './reservation.css'

const form = document.querySelector<HTMLFormElement>('#reserve')
const emailInput = document.querySelector<HTMLInputElement>('#reservation-email')
const message = document.querySelector<HTMLParagraphElement>('#reservation-message')

form?.addEventListener('submit', (event) => {
  event.preventDefault()
  const email = emailInput?.value.trim()
  if (!email || !message) return

  const reservations = JSON.parse(localStorage.getItem('cashlog.reservations') ?? '[]') as string[]
  localStorage.setItem('cashlog.reservations', JSON.stringify([...new Set([...reservations, email])]))
  form.classList.add('is-complete')
  message.textContent = '예약 완료! 나비가 출시 소식을 꼭 챙겨둘게요.'
})
