import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  ArrowLeft,
  Camera,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LogOut,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react'
import {
  AccountApiError,
  changePassword,
  deleteAccount,
  getMe,
  login,
  logout,
  requestPasswordReset,
  resetPassword,
  signup,
  updateProfile,
  type AccountUser,
} from './accountApi'
import {
  passwordChecks,
  validateLogin,
  validateNicknameInput,
  validateProfileImage,
  validateSignup,
  type FieldErrors,
} from './validation'

type Page = 'signup' | 'login' | 'profile' | 'forgot' | 'reset'

const pageFromPath = (): Page => {
  if (location.pathname.includes('forgot-password')) return 'forgot'
  if (location.pathname.includes('reset-password')) return 'reset'
  if (location.pathname.includes('signup')) return 'signup'
  if (location.pathname.includes('profile')) return 'profile'
  return 'login'
}

const FieldError = ({ id, message }: { id: string; message?: string }) =>
  message ? <small id={id} className="field-error">{message}</small> : null

const focusFirstInvalid = (form: HTMLFormElement | null) => {
  window.setTimeout(() => form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0)
}

const useRedirectAuthenticated = () => {
  useEffect(() => {
    let active = true
    void getMe().then(() => {
      if (active) location.replace('/')
    }).catch(() => undefined)
    return () => { active = false }
  }, [])
}

const AvatarPicker = ({ preview, onFile, onRemove, error }: {
  preview: string
  onFile: (file: File) => void
  onRemove: () => void
  error?: string
}) => {
  const input = useRef<HTMLInputElement>(null)
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) onFile(file)
    event.target.value = ''
  }
  return <div className="avatar-picker">
    <button
      type="button"
      className="avatar-preview"
      onClick={() => input.current?.click()}
      aria-label="프로필 이미지 선택"
      aria-describedby={error ? 'profile-image-error' : undefined}
    >
      {preview ? <img src={preview} alt="선택한 프로필 이미지 미리보기" /> : <UserRound size={42} aria-hidden />}
      <span><Camera size={17} aria-hidden /></span>
    </button>
    <input ref={input} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={handleChange} aria-label="프로필 이미지 파일" />
    <div className="avatar-actions">
      <button type="button" onClick={() => input.current?.click()}>사진 선택</button>
      {preview && <button type="button" onClick={onRemove}>삭제</button>}
    </div>
    <p>JPG, PNG, WebP · 최대 5MB</p>
    <FieldError id="profile-image-error" message={error} />
  </div>
}

const PasswordInput = ({ id, label, value, onChange, autoComplete, error }: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: string
  error?: string
}) => {
  const [visible, setVisible] = useState(false)
  const errorId = `${id}-error`
  return <div className="form-field">
    <label htmlFor={id}>{label}</label>
    <div className="password-field">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        required
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
      />
      <button type="button" onClick={() => setVisible((current) => !current)} aria-label={visible ? '비밀번호 숨기기' : '비밀번호 표시'}>
        {visible ? <EyeOff size={19} aria-hidden /> : <Eye size={19} aria-hidden />}
      </button>
    </div>
    <FieldError id={errorId} message={error} />
  </div>
}

const AccountShell = ({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) => <main className="account-page">
  <header className="account-topbar"><a href="/" aria-label="Cashlog 홈으로"><ArrowLeft size={21} aria-hidden /></a><a className="account-logo" href="/">Cashlog <Pencil size={17} aria-hidden /></a><span /></header>
  <section className="account-stage">
    <div className="account-intro"><p>{eyebrow}</p><h1>{title}</h1><div className="scribble" aria-hidden /></div>
    <div className="account-panel">{children}</div>
  </section>
</main>

const SignupPage = () => {
  useRedirectAuthenticated()
  const formRef = useRef<HTMLFormElement>(null)
  const [values, setValues] = useState({
    nickname: '', email: '', password: '', passwordConfirm: '', age14: false,
    terms: false, privacy: false, photoAndTime: false, location: false,
  })
  const [image, setImage] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const checks = passwordChecks(values.password, values.email)

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  const chooseImage = async (file: File) => {
    try {
      await validateProfileImage(file)
      if (preview) URL.revokeObjectURL(preview)
      setImage(file)
      setPreview(URL.createObjectURL(file))
      setErrors((current) => ({ ...current, profileImage: '' }))
    } catch (error) {
      setErrors((current) => ({ ...current, profileImage: error instanceof Error ? error.message : '이미지를 확인해 주세요.' }))
    }
  }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (loading) return
    const nextErrors = validateSignup(values)
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      focusFirstInvalid(formRef.current)
      return
    }
    setLoading(true)
    setErrors({})
    setMessage('')
    const form = new FormData()
    Object.entries({
      email: values.email.trim().toLowerCase(), password: values.password,
      passwordConfirm: values.passwordConfirm, nickname: values.nickname.trim(),
      age14Consent: String(values.age14), termsConsent: String(values.terms),
      privacyConsent: String(values.privacy), photoTimeConsent: String(values.photoAndTime),
      locationConsent: String(values.location),
    }).forEach(([key, value]) => form.append(key, value))
    if (image) form.append('profileImage', image)
    try {
      const result = await signup(form)
      location.assign(result.requiresEmailVerification ? `/login.html?message=${encodeURIComponent(result.message || '')}` : '/')
    } catch (error) {
      if (error instanceof AccountApiError && error.field) {
        setErrors({ [error.field]: error.message })
        focusFirstInvalid(formRef.current)
      } else {
        setMessage(error instanceof Error ? error.message : '회원가입에 실패했어요.')
      }
    } finally {
      setLoading(false)
    }
  }
  return <AccountShell eyebrow="NEW CASHLOGGER" title="내 기록을 오래 간직해요">
    <form ref={formRef} className="account-form-page" onSubmit={submit} noValidate>
      <AvatarPicker preview={preview} onFile={chooseImage} onRemove={() => { setImage(null); setPreview('') }} error={errors.profileImage} />
      <div className="form-field"><label htmlFor="signup-nickname">닉네임</label><input id="signup-nickname" required value={values.nickname} maxLength={30} autoComplete="nickname" onChange={(event) => setValues({ ...values, nickname: event.target.value })} aria-invalid={Boolean(errors.nickname)} aria-describedby={errors.nickname ? 'signup-nickname-error' : undefined} /><FieldError id="signup-nickname-error" message={errors.nickname} /></div>
      <div className="form-field"><label htmlFor="signup-email">이메일</label><input id="signup-email" required type="email" value={values.email} autoComplete="email" onChange={(event) => setValues({ ...values, email: event.target.value })} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'signup-email-error' : undefined} /><FieldError id="signup-email-error" message={errors.email} /></div>
      <PasswordInput id="signup-password" label="비밀번호" value={values.password} onChange={(password) => setValues({ ...values, password })} autoComplete="new-password" error={errors.password} />
      <div className="password-rules" aria-live="polite">
        <span className={checks.length ? 'pass' : ''}><Check size={13} aria-hidden />8자 이상</span><span className={checks.groups ? 'pass' : ''}><Check size={13} aria-hidden />문자 종류 2개</span><span className={checks.personal ? 'pass' : ''}><Check size={13} aria-hidden />이메일과 다르게</span>
      </div>
      <PasswordInput id="signup-password-confirm" label="비밀번호 확인" value={values.passwordConfirm} onChange={(passwordConfirm) => setValues({ ...values, passwordConfirm })} autoComplete="new-password" error={errors.passwordConfirm} />
      <div className="consent-list">
        <label><input required type="checkbox" checked={values.age14} onChange={(event) => setValues({ ...values, age14: event.target.checked })} aria-invalid={Boolean(errors.age14Consent)} aria-describedby={errors.age14Consent ? 'age14-error' : undefined} /><span><strong>[필수]</strong> 만 14세 이상입니다.</span></label><FieldError id="age14-error" message={errors.age14Consent} />
        <label><input required type="checkbox" checked={values.terms} onChange={(event) => setValues({ ...values, terms: event.target.checked })} aria-invalid={Boolean(errors.termsConsent)} aria-describedby={errors.termsConsent ? 'terms-error' : undefined} /><span><strong>[필수]</strong> <a href="/terms.html" target="_blank" rel="noopener noreferrer">이용약관</a>에 동의합니다.</span></label><FieldError id="terms-error" message={errors.termsConsent} />
        <label><input required type="checkbox" checked={values.privacy} onChange={(event) => setValues({ ...values, privacy: event.target.checked })} aria-invalid={Boolean(errors.privacyConsent)} aria-describedby={errors.privacyConsent ? 'privacy-error' : undefined} /><span><strong>[필수]</strong> <a href="/privacy.html" target="_blank" rel="noopener noreferrer">개인정보 처리방침</a>에 동의합니다. 내 정보는 서비스 제공에 필요한 범위에서만 처리됩니다.</span></label><FieldError id="privacy-error" message={errors.privacyConsent} />
        <label><input required type="checkbox" checked={values.photoAndTime} onChange={(event) => setValues({ ...values, photoAndTime: event.target.checked })} aria-invalid={Boolean(errors.photoTimeConsent)} aria-describedby={errors.photoTimeConsent ? 'photo-time-error' : undefined} /><span><strong>[필수]</strong> 선택한 사진과 사진 파일·기록 시각을 비공개 저장하고 카테고리 추천에 사용하는 데 동의합니다.</span></label><FieldError id="photo-time-error" message={errors.photoTimeConsent} />
        <label><input type="checkbox" checked={values.location} onChange={(event) => setValues({ ...values, location: event.target.checked })} /><span><strong>[선택]</strong> 사진 기록을 추가할 때 기기의 현재 위치를 자동으로 확인해 해당 기록에 저장하는 데 동의합니다.</span></label>
        <p className="consent-protection">선택 동의를 하지 않으면 위치 권한을 요청하거나 위치를 수집하지 않습니다. 사진과 위치는 다른 사용자에게 공개하거나 판매하지 않으며, 위치 동의는 계정 메뉴에서 언제든 철회할 수 있습니다.</p>
      </div>
      {message && <p className="form-message error" role="alert">{message}</p>}
      <button className="primary-submit" disabled={loading}>{loading ? <><LoaderCircle className="spin" size={19} aria-hidden /> 계정 만드는 중</> : '가입하고 기록 시작'}</button>
      <p className="form-switch">이미 계정이 있나요? <a href="/login.html">로그인</a></p>
    </form>
  </AccountShell>
}

const LoginPage = () => {
  useRedirectAuthenticated()
  const formRef = useRef<HTMLFormElement>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [loading, setLoading] = useState(false)
  const message = new URLSearchParams(location.search).get('message')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (loading) return
    const next = validateLogin(email, password)
    if (Object.keys(next).length) {
      setErrors(next)
      focusFirstInvalid(formRef.current)
      return
    }
    setLoading(true)
    setErrors({})
    try {
      await login(email.trim().toLowerCase(), password, remember)
      location.assign('/')
    } catch (error) {
      setErrors({ form: error instanceof Error ? error.message : '로그인에 실패했어요.' })
    } finally {
      setLoading(false)
    }
  }
  return <AccountShell eyebrow="WELCOME BACK" title="오늘의 소비도 같이 적어요">
    <form ref={formRef} className="account-form-page login-form" onSubmit={submit} noValidate>
      {message && <p className="form-message success" role="status"><ShieldCheck size={18} aria-hidden />{message}</p>}
      <div className="form-field"><label htmlFor="login-email">이메일</label><input id="login-email" required type="email" value={email} autoComplete="email" onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'login-email-error' : undefined} /><FieldError id="login-email-error" message={errors.email} /></div>
      <PasswordInput id="login-password" label="비밀번호" value={password} onChange={setPassword} autoComplete="current-password" error={errors.password} />
      <div className="login-options"><label className="remember-row"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span>로그인 상태 유지</span></label><a href="/forgot-password.html">비밀번호 재설정</a></div>
      {errors.form && <p className="form-message error" role="alert">{errors.form}</p>}
      <button className="primary-submit" disabled={loading}>{loading ? <><LoaderCircle className="spin" size={19} aria-hidden /> 로그인 중</> : '로그인'}</button>
      <p className="form-switch">처음 오셨나요? <a href="/signup.html">회원가입</a></p>
    </form>
  </AccountShell>
}

const ForgotPasswordPage = () => {
  const formRef = useRef<HTMLFormElement>(null)
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (loading) return
    const next = validateLogin(email, 'temporary')
    if (next.email) {
      setError(next.email)
      focusFirstInvalid(formRef.current)
      return
    }
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const result = await requestPasswordReset(email.trim().toLowerCase())
      setMessage(result.message)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '재설정 메일을 보내지 못했어요.')
    } finally {
      setLoading(false)
    }
  }
  return <AccountShell eyebrow="ACCOUNT RECOVERY" title="비밀번호를 다시 만들어요">
    <form ref={formRef} className="account-form-page login-form" onSubmit={submit} noValidate>
      <p className="account-helper">가입한 이메일을 입력하면 재설정 링크를 보내드려요. 가입 여부는 보안을 위해 같은 문구로 안내합니다.</p>
      <div className="form-field"><label htmlFor="forgot-email">이메일</label><input id="forgot-email" required type="email" value={email} autoComplete="email" onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? 'forgot-email-error' : undefined} /><FieldError id="forgot-email-error" message={error} /></div>
      {message && <p className="form-message success" role="status"><ShieldCheck size={18} aria-hidden />{message}</p>}
      <button className="primary-submit" disabled={loading}>{loading ? <><LoaderCircle className="spin" size={19} aria-hidden /> 메일 보내는 중</> : '재설정 링크 받기'}</button>
      <p className="form-switch"><a href="/login.html">로그인으로 돌아가기</a></p>
    </form>
  </AccountShell>
}

const ResetPasswordPage = () => {
  const formRef = useRef<HTMLFormElement>(null)
  const [accessToken] = useState(() => new URLSearchParams(location.hash.replace(/^#/, '')).get('access_token') || '')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const checks = passwordChecks(password)
  useEffect(() => {
    if (location.hash) history.replaceState(null, '', `${location.pathname}${location.search}`)
  }, [])
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (loading || !accessToken) return
    const next: FieldErrors = {}
    if (!checks.length || !checks.groups) next.password = '8자 이상이며 문자 종류 2개를 포함해 주세요.'
    if (password !== passwordConfirm) next.passwordConfirm = '비밀번호가 일치하지 않아요.'
    if (Object.keys(next).length) {
      setErrors(next)
      focusFirstInvalid(formRef.current)
      return
    }
    setLoading(true)
    setErrors({})
    try {
      const result = await resetPassword(accessToken, password, passwordConfirm)
      setMessage(result.message)
      setPassword('')
      setPasswordConfirm('')
    } catch (reason) {
      setErrors({ form: reason instanceof Error ? reason.message : '비밀번호를 변경하지 못했어요.' })
    } finally {
      setLoading(false)
    }
  }
  return <AccountShell eyebrow="ACCOUNT RECOVERY" title="새 비밀번호를 정해요">
    {!accessToken ? <div className="account-state" role="alert"><KeyRound size={34} aria-hidden /><h2>재설정 링크를 확인해 주세요</h2><p>링크가 만료됐거나 올바르지 않아요. 새 링크를 요청해 주세요.</p><a className="primary-link" href="/forgot-password.html">재설정 링크 다시 받기</a></div> :
      <form ref={formRef} className="account-form-page login-form" onSubmit={submit} noValidate>
        <PasswordInput id="reset-password" label="새 비밀번호" value={password} onChange={setPassword} autoComplete="new-password" error={errors.password} />
        <div className="password-rules" aria-live="polite"><span className={checks.length ? 'pass' : ''}><Check size={13} aria-hidden />8자 이상</span><span className={checks.groups ? 'pass' : ''}><Check size={13} aria-hidden />문자 종류 2개</span></div>
        <PasswordInput id="reset-password-confirm" label="새 비밀번호 확인" value={passwordConfirm} onChange={setPasswordConfirm} autoComplete="new-password" error={errors.passwordConfirm} />
        {errors.form && <p className="form-message error" role="alert">{errors.form}</p>}
        {message && <p className="form-message success" role="status"><ShieldCheck size={18} aria-hidden />{message}</p>}
        {message ? <a className="primary-link" href="/login.html">새 비밀번호로 로그인</a> : <button className="primary-submit" disabled={loading}>{loading ? '변경하는 중' : '비밀번호 변경'}</button>}
      </form>}
  </AccountShell>
}

const ProfilePage = () => {
  const [user, setUser] = useState<AccountUser | null>(null)
  const [nickname, setNickname] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [removeImage, setRemoveImage] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [accountAction, setAccountAction] = useState<'logout' | 'delete' | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [passwordErrors, setPasswordErrors] = useState<FieldErrors>({})
  useEffect(() => {
    let active = true
    void getMe().then(({ user: loaded }) => {
      if (!active) return
      setUser(loaded)
      setNickname(loaded.nickname)
    }).catch((reason) => {
      if (!active) return
      if (reason instanceof AccountApiError && reason.status === 401) location.replace('/login.html')
      else setLoadError(reason instanceof Error ? reason.message : '프로필을 불러오지 못했어요.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [loadAttempt])
  useEffect(() => () => { if (preview.startsWith('blob:')) URL.revokeObjectURL(preview) }, [preview])
  const imageUrl = imageFailed ? '' : preview || (removeImage ? '' : user?.profileImageUrl || '')
  const chooseImage = async (next: File) => {
    try {
      await validateProfileImage(next)
      if (preview.startsWith('blob:')) URL.revokeObjectURL(preview)
      setFile(next)
      setPreview(URL.createObjectURL(next))
      setRemoveImage(false)
      setImageFailed(false)
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '이미지를 확인해 주세요.')
    }
  }
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving) return
    const nicknameError = validateNicknameInput(nickname)
    if (nicknameError) { setError(nicknameError); return }
    setSaving(true)
    setError('')
    setMessage('')
    const form = new FormData()
    form.append('nickname', nickname.trim())
    form.append('removeProfileImage', String(removeImage))
    if (file) form.append('profileImage', file)
    try {
      const result = await updateProfile(form)
      setUser(result.user)
      setFile(null)
      setPreview('')
      setRemoveImage(false)
      setImageFailed(false)
      setMessage('프로필을 저장했어요.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '프로필 저장에 실패했어요.')
    } finally {
      setSaving(false)
    }
  }
  const passwordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (passwordSaving) return
    const checks = passwordChecks(password, user?.email)
    const next: FieldErrors = {}
    if (!checks.length || !checks.groups || !checks.personal) next.password = '안전한 비밀번호 조건을 확인해 주세요.'
    if (password !== passwordConfirm) next.passwordConfirm = '비밀번호가 일치하지 않아요.'
    if (Object.keys(next).length) { setPasswordErrors(next); return }
    setPasswordSaving(true)
    setPasswordErrors({})
    try {
      const result = await changePassword(password, passwordConfirm)
      setMessage(result.message)
      window.setTimeout(() => location.assign('/login.html'), 900)
    } catch (reason) {
      setPasswordErrors({ form: reason instanceof Error ? reason.message : '비밀번호 변경에 실패했어요.' })
    } finally {
      setPasswordSaving(false)
    }
  }
  const handleLogout = async () => {
    if (accountAction) return
    setAccountAction('logout')
    setError('')
    try { await logout(); location.assign('/login.html') }
    catch (reason) { setError(reason instanceof Error ? reason.message : '로그아웃하지 못했어요. 다시 시도해 주세요.'); setAccountAction(null) }
  }
  const handleDelete = async () => {
    if (accountAction || !confirm('가계부 기록과 계정을 모두 삭제할까요? 이 작업은 되돌릴 수 없어요.')) return
    setAccountAction('delete')
    setError('')
    try { await deleteAccount(); location.assign('/signup.html') }
    catch (reason) { setError(reason instanceof Error ? reason.message : '회원탈퇴를 완료하지 못했어요.'); setAccountAction(null) }
  }
  if (loading) return <AccountShell eyebrow="MY CASHLOG" title="프로필을 불러오는 중"><div className="page-loader" role="status"><LoaderCircle className="spin" aria-hidden /><span className="sr-only">프로필 로딩 중</span></div></AccountShell>
  if (loadError || !user) return <AccountShell eyebrow="MY CASHLOG" title="프로필을 불러오지 못했어요"><div className="account-state" role="alert"><RefreshCw size={34} aria-hidden /><p>{loadError || '프로필 정보가 비어 있어요.'}</p><button className="secondary-submit" onClick={() => { setLoading(true); setLoadError(''); setLoadAttempt((current) => current + 1) }}>다시 시도</button><a href="/login.html">로그인으로 이동</a></div></AccountShell>
  return <AccountShell eyebrow="MY CASHLOG" title={`${user.nickname}님의 기록 보관함`}>
    <div className="profile-summary"><div className="profile-avatar">{imageUrl ? <img src={imageUrl} alt={`${user.nickname} 프로필`} onError={() => setImageFailed(true)} /> : <UserRound size={42} aria-hidden />}</div><div><strong>{user.nickname}</strong><span>{user.email}</span><small>{new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long' }).format(new Date(user.createdAt))} 가입 · {user.status === 'ACTIVE' ? '정상' : user.status}</small></div></div>
    <form className="account-form-page profile-form" onSubmit={save} noValidate>
      <AvatarPicker preview={imageUrl} onFile={chooseImage} onRemove={() => { setFile(null); setPreview(''); setRemoveImage(true); setImageFailed(false) }} />
      <div className="form-field"><label htmlFor="profile-nickname">닉네임</label><input id="profile-nickname" required value={nickname} maxLength={30} onChange={(event) => setNickname(event.target.value)} aria-invalid={Boolean(error && validateNicknameInput(nickname))} /></div>
      {message && <p className="form-message success" role="status">{message}</p>}{error && <p className="form-message error" role="alert">{error}</p>}
      <button className="primary-submit" disabled={saving}>{saving ? '저장하는 중' : '프로필 저장'}</button>
    </form>
    <form className="password-change" onSubmit={passwordSubmit} noValidate><h2>비밀번호 바꾸기</h2><PasswordInput id="new-password" label="새 비밀번호" value={password} onChange={setPassword} autoComplete="new-password" error={passwordErrors.password} /><PasswordInput id="new-password-confirm" label="새 비밀번호 확인" value={passwordConfirm} onChange={setPasswordConfirm} autoComplete="new-password" error={passwordErrors.passwordConfirm} />{passwordErrors.form && <p className="form-message error" role="alert">{passwordErrors.form}</p>}<button className="secondary-submit" disabled={passwordSaving}>{passwordSaving ? '변경하는 중' : '비밀번호 변경'}</button></form>
    <div className="danger-actions"><button disabled={Boolean(accountAction)} onClick={() => void handleLogout()}><LogOut size={17} aria-hidden />{accountAction === 'logout' ? '로그아웃 중' : '로그아웃'}</button><button disabled={Boolean(accountAction)} onClick={() => void handleDelete()}><Trash2 size={17} aria-hidden />{accountAction === 'delete' ? '탈퇴 처리 중' : '회원탈퇴'}</button></div>
  </AccountShell>
}

export const AccountApp = () => {
  const page = pageFromPath()
  if (page === 'signup') return <SignupPage />
  if (page === 'profile') return <ProfilePage />
  if (page === 'forgot') return <ForgotPasswordPage />
  if (page === 'reset') return <ResetPasswordPage />
  return <LoginPage />
}
