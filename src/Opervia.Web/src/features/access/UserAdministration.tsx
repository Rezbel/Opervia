import { LoaderCircle, Pencil, Plus, ShieldCheck, UsersRound, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { accessRequest } from './accessApi';
import { useAccess } from './AccessContext';
import { SellerDescription } from '../sellers/SellerCatalogProvider';
import type { AccessRole, BasicAccessUser } from './basicAccess';
import './UserAdministration.css';
interface Seller { value: string; label: string; }
const empty = { name: '', email: '', role: 'Ejecutivo' as AccessRole, sellerCodes: [] as string[], active: true, password: '' };
export function UserAdministration({ onClose }: { onClose?: () => void }) {
  const current = useAccess()!;
  const [users, setUsers] = useState<BasicAccessUser[]>([]), [sellers, setSellers] = useState<Seller[]>([]);
  const [catalogError, setCatalogError] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null), [form, setForm] = useState(empty);
  const [search, setSearch] = useState(''), [sellerSearch, setSellerSearch] = useState('');
  useEffect(() => {
    let alive = true;
    void accessRequest<BasicAccessUser[]>('users').then(next => { if (alive) setUsers(next); }).catch(e => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoading(false); });
    void accessRequest<Seller[]>('sellers').then(next => { if (alive) setSellers(next); }).catch(e => { if (alive) setCatalogError(e.message); });
    return () => { alive = false; };
  }, []);
  function open(user?: BasicAccessUser) {
    setEditing(user?.id ?? null); setForm(user ? { ...user, password: '' } : { ...empty, sellerCodes: [] });
    setSellerSearch(''); setError(''); setMessage(''); setFormOpen(true);
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    try {
      const user = await accessRequest<BasicAccessUser>(editing ? `users/${editing}` : 'users', { method: editing ? 'PUT' : 'POST', body: JSON.stringify({ ...form, password: form.password || null }) });
      setUsers(previous => editing ? previous.map(u => u.id === user.id ? user : u) : [...previous, user]); setFormOpen(false);
      setMessage(editing ? 'Usuario actualizado. Sus sesiones anteriores se cerrarán.' : 'Usuario creado. Ya puede iniciar sesión.');
    } catch (e) { setError(e instanceof Error ? e.message : 'No fue posible guardar el usuario.'); } finally { setSaving(false); }
  }
  const visible = users.filter(u => `${u.name} ${u.email}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')));
  return <section className="user-admin"><header><div><h2><UsersRound size={21} /> Usuarios</h2><p>Administra cuentas, roles y claves de vendedor desde Centro de control.</p></div><div className="user-admin-actions"><button className="user-primary" onClick={() => open()}><Plus size={17} /> Crear usuario</button>{onClose && <button type="button" aria-label="Cerrar panel de usuarios" title="Cerrar administración" onClick={onClose}><X size={18} /></button>}</div></header>
    {error && <p role="alert" className="user-error">{error}</p>}{message && <p role="status" className="user-success">{message}</p>}
    {formOpen && <form className="user-editor" onSubmit={save}>
      <div className="user-editor-heading"><h3>{editing ? 'Editar usuario' : 'Nueva cuenta'}</h3><button type="button" aria-label="Cerrar formulario de usuario" onClick={() => setFormOpen(false)}><X size={18} /></button></div>
      <div className="user-fields">
        <label>Nombre<input required maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
        <label>Correo electrónico<input type="email" required maxLength={254} autoComplete="off" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
        <label>Rol<select value={form.role} onChange={e => setForm({ ...form, role: e.target.value as AccessRole })}><option>Ejecutivo</option><option>Gerencia</option>{current.role === 'Administrador' && <option>Administrador</option>}</select></label>
        <label>{editing ? 'Nueva contraseña (opcional)' : 'Contraseña'}<input type="password" autoComplete="new-password" required={!editing} minLength={8} maxLength={128} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder={editing ? 'Deja vacío para conservarla' : 'Mínimo 8 caracteres'} /></label>
      </div>
      {form.role === 'Ejecutivo' && <fieldset className="user-seller-picker"><legend>Claves de vendedor asignadas · {form.sellerCodes.length} seleccionadas</legend><p>Una clave queda fija; con varias podrá elegir una o todas sus claves.</p>
        {catalogError && <p className="user-error">{catalogError}</p>}<input aria-label="Buscar vendedor para asignar" placeholder="Buscar clave o nombre de vendedor" value={sellerSearch} onChange={e => setSellerSearch(e.target.value)} />
        <div>{sellers.filter(s => `${s.value} ${s.label}`.toLowerCase().includes(sellerSearch.toLowerCase())).map(s => <label key={s.value}><input type="checkbox" checked={form.sellerCodes.includes(s.value)} onChange={e => setForm({ ...form, sellerCodes: e.target.checked ? [...form.sellerCodes, s.value] : form.sellerCodes.filter(c => c !== s.value) })} /><span><b>{s.value}</b> · {s.label}</span></label>)}</div>
      </fieldset>}
      <div className="user-editor-footer"><label><input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /> Cuenta activa</label><button className="user-primary" type="submit" disabled={saving || form.role === 'Ejecutivo' && !form.sellerCodes.length}>{saving ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />} Guardar usuario</button></div>
    </form>}
    <label className="user-search">Buscar usuario<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nombre o correo" /></label>
    {loading ? <p role="status"><LoaderCircle className="spin" size={19} /> Cargando usuarios…</p> : <div className="user-table-scroll"><table><thead><tr><th>Usuario</th><th>Rol</th><th>Vendedores</th><th>Estado</th><th>Acciones</th></tr></thead>
      <tbody>{visible.map(u => <tr key={u.id}><td><strong>{u.name}</strong><small>{u.email}</small></td><td>{u.role}</td><td>{u.role === 'Ejecutivo' ? <div className="seller-description-list">{u.sellerCodes.map(code => <SellerDescription key={code} code={code} />)}</div> : 'Todos'}</td><td><span className={`user-status ${u.active ? 'active' : 'inactive'}`}>{u.active ? 'Activo' : 'Inactivo'}</span></td><td>{(current.role === 'Administrador' || u.role !== 'Administrador') && <button aria-label={`Editar usuario ${u.name}`} onClick={() => open(u)}><Pencil size={15} /> Editar</button>}</td></tr>)}</tbody>
    </table>{!visible.length && <p>No hay usuarios que coincidan.</p>}</div>}
  </section>;
}
