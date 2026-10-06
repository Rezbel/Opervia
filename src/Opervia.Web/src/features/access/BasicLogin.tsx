import { KeyRound, LockKeyhole, UserRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { basicAccessUsers, type BasicAccessUser } from './basicAccess';
import './BasicLogin.css';

interface BasicLoginProps {
  onLogin: (user: BasicAccessUser) => void;
}

export function BasicLogin({ onLogin }: BasicLoginProps) {
  const [userNumber, setUserNumber] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const user = basicAccessUsers.find((candidate) =>
      candidate.number === userNumber.trim() && candidate.password === password);
    if (user) {
      onLogin(user);
      return;
    }
    setError('Número o clave incorrectos.');
  }

  return <main className="basic-login">
    <form className="basic-login-card" onSubmit={submit}>
      <div className="basic-login-mark"><LockKeyhole size={25} /></div>
      <span className="eyebrow">ACCESO OPERATIVO</span>
      <h1>Bienvenido a Opervia</h1>
      <p>Ingresa tu número y clave para continuar.</p>
      <label><span>Número de usuario</span><div><UserRound size={17} /><input inputMode="numeric" autoFocus value={userNumber} onChange={event => setUserNumber(event.target.value.replace(/\D/g, ''))} placeholder="Ej. 1" /></div></label>
      <label><span>Clave</span><div><KeyRound size={17} /><input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Tu clave" /></div></label>
      {error && <p className="basic-login-error">{error}</p>}
      <button type="submit">Entrar</button>
    </form>
  </main>;
}
