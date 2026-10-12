import { Check, ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import './MultiSelect.css';

export function MultiSelect({ label, placeholder, options, value, onChange, disabled = false, searchField = false, resetKey = 0 }: {
  label: string; placeholder: string; options: { value: string; label: string }[];
  value: string[]; onChange: (value: string[]) => void; disabled?: boolean; searchField?: boolean; resetKey?: number;
}) {
  const [open, setOpen] = useState(false), [search, setSearch] = useState('');
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const close = () => { (searchField ? searchInput.current : trigger.current)?.focus(); setOpen(false); };
  const id = useId();
  useEffect(() => { setSearch(''); setOpen(false); }, [resetKey]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-MX');
  const tokens = normalize(search).split(/\s+/).filter(Boolean);
  const visible = options.filter(option => tokens.every(token => normalize(option.label).includes(token)));
  const summary = value.length === 1 ? options.find(option => option.value === value[0])?.label : `${value.length} seleccionados`;
  return <div className="multi-select" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }} onKeyDown={event => {
    if (event.key === 'Escape') { close(); event.stopPropagation(); }
  }}>
    <span className="multi-select-label" id={`${id}-label`}>{label}</span>
    {searchField ? <div className="multi-select-input-trigger"><Search size={17} />
      <input ref={searchInput} disabled={disabled} aria-labelledby={`${id}-label`} aria-expanded={open} aria-controls={`${id}-panel`}
        placeholder={placeholder} value={search} onFocus={() => setOpen(true)} onChange={event => { setSearch(event.target.value); setOpen(true); }}
        onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); window.requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>('.multi-select-option')?.focus()); } }} />
      {search && <button type="button" aria-label="Borrar búsqueda" onClick={() => { setSearch(''); searchInput.current?.focus(); }}><X size={16} /></button>}
      <button type="button" aria-label="Mostrar clientes" onClick={() => setOpen(!open)}><ChevronDown size={16} /></button>
    </div> : <button ref={trigger} type="button" className={`multi-select-trigger${value.length ? ' has-selection' : ''}`} disabled={disabled}
      aria-labelledby={`${id}-label ${id}-summary`} aria-expanded={open} aria-controls={`${id}-panel`}
      onClick={() => { setOpen(!open); setSearch(''); }}>
      <span id={`${id}-summary`}>{value.length ? summary : placeholder}</span>
      {value.length > 0 && <b>{value.length}</b>}<ChevronDown size={16} />
    </button>}
    {searchField && value.length > 0 && <div className="multi-select-chips">{value.map(code => <button type="button" key={code} onClick={() => onChange(value.filter(item => item !== code))} aria-label={`Quitar ${options.find(option => option.value === code)?.label ?? code}`}>
      <span>{options.find(option => option.value === code)?.label ?? code}</span><X size={13} /></button>)}</div>}
    {open && <div className="multi-select-panel" id={`${id}-panel`}>
      {!searchField && <div className="multi-select-search"><Search size={16} /><input autoFocus aria-label={`Buscar en ${label}`} placeholder="Buscar opciones…" value={search} onChange={event => setSearch(event.target.value)} /></div>}
      <div className="multi-select-actions"><span>{value.length ? `${value.length} seleccionados` : 'Sin filtro · todas las opciones'}</span><button type="button" onClick={() => onChange([])}>Limpiar</button></div>
      <div className="multi-select-options" role="group" aria-label={label}>
        {visible.map(option => <button type="button" key={option.value} className={`multi-select-option${value.includes(option.value) ? ' selected' : ''}`} aria-pressed={value.includes(option.value)}
          onClick={() => onChange(value.includes(option.value) ? value.filter(item => item !== option.value) : [...value, option.value])}>
          <i>{value.includes(option.value) && <Check size={14} />}</i><span>{option.label}</span>
        </button>)}
        {!visible.length && <p className="multi-select-empty">No hay coincidencias.</p>}
      </div>
      <div className="multi-select-footer"><span>Haz clic para marcar o desmarcar</span><button type="button" onClick={close}>Listo</button></div>
    </div>}
  </div>;
}
