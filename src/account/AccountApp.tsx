import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { ArrowLeft, Camera, Check, Eye, EyeOff, LoaderCircle, LogOut, Pencil, ShieldCheck, Trash2, UserRound } from 'lucide-react'
import { AccountApiError, changePassword, deleteAccount, getMe, login, logout, signup, updateProfile, type AccountUser } from './accountApi'
import { passwordChecks, validateProfileImage, validateSignup, type FieldErrors } from './validation'

type Page = 'signup' | 'login' | 'profile'
const pageFromPath = (): Page => location.pathname.includes('signup') ? 'signup' : location.pathname.includes('profile') ? 'profile' : 'login'

const FieldError = ({ message }: { message?: string }) => message ? <small className="field-error">{message}</small> : null

const AvatarPicker = ({ preview, onFile, onRemove, error }: {
  preview: string; onFile: (file: File) => void; onRemove: () => void; error?: string
}) => {
  const input = useRef<HTMLInputElement>(null)
  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) onFile(file)
    event.target.value = ''
  }
  return <div className="avatar-picker">
    <button type="button" className="avatar-preview" onClick={() => input.current?.click()} aria-label="프로필 이미지 선택">
      {preview ? <img src={preview} alt="선택한 프로필 이미지 미리보기" /> : <UserRound size={42} aria-hidden />}
      <span><Camera size={17} aria-hidden /></span>
    </button>
    <input ref={input} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={handleChange} />
    <div className="avatar-actions">
      <button type="button" onClick={() => input.current?.click()}>사진 선택</button>
      {preview && <button type="button" onClick={onRemove}>삭제</button>}
    </div>
    <p>JPG, PNG, WebP · 최대 5MB</p>
    <FieldError message={error} />
  </div>
}

const PasswordInput = ({ id, label, value, onChange, autoComplete, error }: {
  id: string; label: string; value: string; onChange: (value: string) => void; autoComplete: string; error?: string
}) => {
  const [visible, setVisible] = useState(false)
  return <label className="form-field" htmlFor={id}>
    <span>{label}</span>
    <div className="password-field">
      <input id={id} type={visible ? 'text' : 'password'} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} aria-invalid={Boolean(error)} />
      <button type="button" onClick={() => setVisible((current) => !current)} aria-label={visible ? '비밀번호 숨기기' : '비밀번호 표시'}>
        {visible ? <EyeOff size={19} /> : <Eye size={19} />}
      </button>
    </div>
    <FieldError message={error} />
  </label>
}

const AccountShell = ({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) => <main className="account-page">
  <header className="account-topbar"><a href="/" aria-label="Cashlog 홈으로"><ArrowLeft size={21} /></a><a className="account-logo" href="/">Cashlog <Pencil size={17} /></a><span /></header>
  <section className="account-stage">
    <div className="account-intro"><p>{eyebrow}</p><h1>{title}</h1><div className="scribble" aria-hidden /></div>
    <div className="account-panel">{children}</div>
  </section>
</main>

const SignupPage = () => {
  const [values, setValues] = useState({ nickname: '', email: '', password: '', passwordConfirm: '', age14: false, terms: false, privacy: false })
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
      setImage(file); setPreview(URL.createObjectURL(file)); setErrors((current) => ({ ...current, profileImage: '' }))
    } catch (error) { setErrors((current) => ({ ...current, profileImage: error instanceof Error ? error.message : '이미지를 확인해 주세요.' })) }
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (loading) return
    const nextErrors = validateSignup(values)
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return }
    setLoading(true); setErrors({}); setMessage('')
    const form = new FormData()
    Object.entries({ email: values.email.trim().toLowerCase(), password: values.password, passwordConfirm: values.passwordConfirm, nickname: values.nickname.trim(), age14Consent: String(values.age14), termsConsent: String(values.terms), privacyConsent: String(values.privacy) }).forEach(([key, value]) => form.append(key, value))
    if (image) form.append('profileImage', image)
    try {
      const result = await signup(form)
      location.assign(result.requiresEmailVerification ? `/login.html?message=${encodeURIComponent(result.message || '')}` : '/')
    } catch (error) {
      if (error instanceof AccountApiError && error.field) setErrors({ [error.field]: error.message })
      else setMessage(error instanceof Error ? error.message : '회원가입에 실패했어요.')
    } finally { setLoading(false) }
  }
  return <AccountShell eyebrow="NEW CASHLOGGER" title="내 기록을 오래 간직해요">
    <form className="account-form-page" onSubmit={submit} noValidate>
      <AvatarPicker preview={preview} onFile={chooseImage} onRemove={() => { setImage(null); setPreview('') }} error={errors.profileImage} />
      <label className="form-field"><span>닉네임</span><input value={values.nickname} maxLength={30} autoComplete="nickname" onChange={(event) => setValues({ ...values, nickname: event.target.value })} aria-invalid={Boolean(errors.nickname)} /><FieldError message={errors.nickname} /></label>
      <label className="form-field"><span>이메일</span><input type="email" value={values.email} autoComplete="email" onChange={(event) => setValues({ ...values, email: event.target.value })} aria-invalid={Boolean(errors.email)} /><FieldError message={errors.email} /></label>
      <PasswordInput id="signup-password" label="비밀번호" value={values.password} onChange={(password) => setValues({ ...values, password })} autoComplete="new-password" error={errors.password} />
      <div className="password-rules" aria-live="polite">
        <span className={checks.length ? 'pass' : ''}><Check size={13} />8자 이상</span><span className={checks.groups ? 'pass' : ''}><Check size={13} />문자 종류 2개</span><span className={checks.personal ? 'pass' : ''}><Check size={13} />이메일과 다르게</span>
      </div>
      <PasswordInput id="signup-password-confirm" label="비밀번호 확인" value={values.passwordConfirm} onChange={(passwordConfirm) => setValues({ ...values, passwordConfirm })} autoComplete="new-password" error={errors.passwordConfirm} />
      <div className="consent-list">
        <label><input type="checkbox" checked={values.age14} onChange={(event) => setValues({ ...values, age14: event.target.checked })} /><span><strong>[필수]</strong> 만 14세 이상입니다.</span></label><FieldError message={errors.age14Consent} />
        <label><input type="checkbox" checked={values.terms} onChange={(event) => setValues({ ...values, terms: event.target.checked })} /><span><strong>[필수]</strong> 이용약관에 동의합니다.</span></label><FieldError message={errors.termsConsent} />
        <label><input type="checkbox" checked={values.privacy} onChange={(event) => setValues({ ...values, privacy: event.target.checked })} /><span><strong>[필수]</strong> <a href="/privacy.html" target="_blank">개인정보 처리방침</a>에 동의합니다. 사진·기록 시간 처리 내용을 포함합니다.</span></label><FieldError message={errors.privacyConsent} />
      </div>
      {message && <p className="form-message error" role="alert">{message}</p>}
      <button className="primary-submit" disabled={loading}>{loading ? <><LoaderCircle className="spin" size={19} /> 계정 만드는 중</> : '가입하고 기록 시작'}</button>
      <p className="form-switch">이미 계정이 있나요? <a href="/login.html">로그인</a></p>
    </form>
  </AccountShell>
}

const LoginPage = () => {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [remember, setRemember] = useState(true)
  const [errors, setErrors] = useState<FieldErrors>({}); const [loading, setLoading] = useState(false)
  const message = new URLSearchParams(location.search).get('message')
  useEffect(() => { void getMe().then(() => location.replace('/')).catch(() => undefined) }, [])
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (loading) return
    const next: FieldErrors = {}; if (!email.trim()) next.email = '이메일을 입력해 주세요.'; if (!password) next.password = '비밀번호를 입력해 주세요.'
    if (Object.keys(next).length) { setErrors(next); return }
    setLoading(true); setErrors({})
    try { await login(email.trim().toLowerCase(), password, remember); location.assign('/') }
    catch (error) { setErrors({ form: error instanceof Error ? error.message : '로그인에 실패했어요.' }) }
    finally { setLoading(false) }
  }
  return <AccountShell eyebrow="WELCOME BACK" title="오늘의 소비도 같이 적어요">
    <form className="account-form-page login-form" onSubmit={submit} noValidate>
      {message && <p className="form-message success"><ShieldCheck size={18} />{message}</p>}
      <label className="form-field"><span>이메일</span><input type="email" value={email} autoComplete="email" onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(errors.email)} /><FieldError message={errors.email} /></label>
      <PasswordInput id="login-password" label="비밀번호" value={password} onChange={setPassword} autoComplete="current-password" error={errors.password} />
      <label className="remember-row"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span>로그인 상태 유지</span></label>
      {errors.form && <p className="form-message error" role="alert">{errors.form}</p>}
      <button className="primary-submit" disabled={loading}>{loading ? <><LoaderCircle className="spin" size={19} /> 로그인 중</> : '로그인'}</button>
      <p className="form-switch">처음 오셨나요? <a href="/signup.html">회원가입</a></p>
    </form>
  </AccountShell>
}

const ProfilePage = () => {
  const [user, setUser] = useState<AccountUser | null>(null); const [nickname, setNickname] = useState('')
  const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState(''); const [removeImage, setRemoveImage] = useState(false)
  const [password, setPassword] = useState(''); const [passwordConfirm, setPasswordConfirm] = useState('')
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('')
  useEffect(() => { void getMe().then(({ user: loaded }) => { setUser(loaded); setNickname(loaded.nickname) }).catch(() => location.replace('/login.html')).finally(() => setLoading(false)) }, [])
  useEffect(() => () => { if (preview.startsWith('blob:')) URL.revokeObjectURL(preview) }, [preview])
  const imageUrl = preview || (removeImage ? '' : user?.profileImageUrl || '')
  const chooseImage = async (next: File) => { try { await validateProfileImage(next); if (preview.startsWith('blob:')) URL.revokeObjectURL(preview); setFile(next); setPreview(URL.createObjectURL(next)); setRemoveImage(false); setError('') } catch (reason) { setError(reason instanceof Error ? reason.message : '이미지를 확인해 주세요.') } }
  const save = async (event: FormEvent) => { event.preventDefault(); if (saving) return; setSaving(true); setError(''); setMessage(''); const form = new FormData(); form.append('nickname', nickname); form.append('removeProfileImage', String(removeImage)); if (file) form.append('profileImage', file); try { const result = await updateProfile(form); setUser(result.user); setFile(null); setPreview(''); setRemoveImage(false); setMessage('프로필을 저장했어요.') } catch (reason) { setError(reason instanceof Error ? reason.message : '프로필 저장에 실패했어요.') } finally { setSaving(false) } }
  const passwordSubmit = async (event: FormEvent) => { event.preventDefault(); setError(''); try { const result = await changePassword(password, passwordConfirm); alert(result.message); location.assign('/login.html') } catch (reason) { setError(reason instanceof Error ? reason.message : '비밀번호 변경에 실패했어요.') } }
  if (loading) return <AccountShell eyebrow="MY CASHLOG" title="프로필을 불러오는 중"><div className="page-loader"><LoaderCircle className="spin" /></div></AccountShell>
  if (!user) return null
  return <AccountShell eyebrow="MY CASHLOG" title={`${user.nickname}님의 기록 보관함`}>
    <div className="profile-summary"><div className="profile-avatar">{imageUrl ? <img src={imageUrl} alt={`${user.nickname} 프로필`} /> : <UserRound size={42} />}</div><div><strong>{user.nickname}</strong><span>{user.email}</span><small>{new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long' }).format(new Date(user.createdAt))} 가입 · {user.status === 'ACTIVE' ? '정상' : user.status}</small></div></div>
    <form className="account-form-page profile-form" onSubmit={save}>
      <AvatarPicker preview={imageUrl} onFile={chooseImage} onRemove={() => { setFile(null); setPreview(''); setRemoveImage(true) }} />
      <label className="form-field"><span>닉네임</span><input value={nickname} maxLength={30} onChange={(event) => setNickname(event.target.value)} /></label>
      {message && <p className="form-message success">{message}</p>}{error && <p className="form-message error" role="alert">{error}</p>}
      <button className="primary-submit" disabled={saving}>{saving ? '저장하는 중' : '프로필 저장'}</button>
    </form>
    <form className="password-change" onSubmit={passwordSubmit}><h2>비밀번호 바꾸기</h2><PasswordInput id="new-password" label="새 비밀번호" value={password} onChange={setPassword} autoComplete="new-password" /><PasswordInput id="new-password-confirm" label="새 비밀번호 확인" value={passwordConfirm} onChange={setPasswordConfirm} autoComplete="new-password" /><button className="secondary-submit">비밀번호 변경</button></form>
    <div className="danger-actions"><button onClick={() => void logout().finally(() => location.assign('/login.html'))}><LogOut size={17} />로그아웃</button><button onClick={() => { if (confirm('가계부 기록과 계정을 모두 삭제할까요? 이 작업은 되돌릴 수 없어요.')) void deleteAccount().then(() => location.assign('/signup.html')) }}><Trash2 size={17} />회원탈퇴</button></div>
  </AccountShell>
}

export const AccountApp = () => {
  const page = pageFromPath()
  return page === 'signup' ? <SignupPage /> : page === 'profile' ? <ProfilePage /> : <LoginPage />
}
