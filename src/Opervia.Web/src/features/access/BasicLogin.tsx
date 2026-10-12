import { KeyRound, LoaderCircle, LockKeyhole, Mail } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { BasicAccessUser } from './basicAccess';
import { accessRequest } from './accessApi';
import './BasicLogin.css';
export function BasicLogin({ onLogin }: { onLogin: (user: BasicAccessUser) => void }) {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(false), [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError('');
    try { onLogin(await accessRequest<BasicAccessUser>('login', { method: 'POST', body: JSON.stringify({ email, password, rememberMe }) })); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No fue posible iniciar sesión.'); }
    finally { setLoading(false); }
  }
  return <main className="basic-login"><form className="basic-login-card" onSubmit={submit} autoComplete="on">
    <div className="basic-login-mark"><LockKeyhole size={25} /></div><span className="eyebrow">ACCESO OPERATIVO</span><h1>Bienvenido a Opervia</h1>
    <p>Ingresa tu correo y contraseña para continuar.</p>
    <label><span>Correo electrónico</span><div><Mail size={17} /><input type="email" name="username" autoComplete="username" autoFocus required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@correo.com" /></div></label>
    <label><span>Contraseña</span><div><KeyRound size={17} /><input type="password" name="password" autoComplete="current-password" required maxLength={128} value={password} onChange={e => setPassword(e.target.value)} placeholder="Tu contraseña" /></div></label>
    <label className="login-remember"><input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} /><span>Recordarme durante 30 días</span></label>
    {error && <p className="basic-login-error" role="alert">{error}</p>}
    <button type="submit" disabled={loading}>{loading ? <><LoaderCircle size={17} className="spin" /> Entrando…</> : 'Entrar'}</button>
    <small>Si necesitas una cuenta, solicítala a Administración o Gerencia.</small>
  </form></main>;
}
