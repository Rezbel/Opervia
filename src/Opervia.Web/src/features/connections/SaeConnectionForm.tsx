import { useState, type FormEvent } from 'react';
import {
  Building2,
  Database,
  KeyRound,
  Network,
  PlugZap,
  Server,
  UserRound,
  X,
} from 'lucide-react';

import type { SaeConnectionRequest } from '../../types/sae';

import './SaeConnectionForm.css';

interface SaeConnectionFormProps {
  isSubmitting?: boolean;
  onCancel?: () => void;
  onSubmit: (
    connection: SaeConnectionRequest,
  ) => Promise<void> | void;
}

export function SaeConnectionForm({
  isSubmitting = false,
  onCancel,
  onSubmit,
}: SaeConnectionFormProps) {
  const [displayName, setDisplayName] = useState('Empresa SAE');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('3050');
  const [database, setDatabase] = useState('');
  const [username, setUsername] = useState('SYSDBA');
  const [password, setPassword] = useState('');
  const [companyNumber, setCompanyNumber] = useState('');
  const [saeVersion, setSaeVersion] = useState('10');
  const [charset, setCharset] = useState('UTF8');
  const [validationError, setValidationError] =
    useState<string | null>(null);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setValidationError(null);

    const normalizedPort = Number(port);

    if (!displayName.trim()) {
      setValidationError(
        'Escribe un nombre para identificar la conexión.',
      );
      return;
    }

    if (!host.trim()) {
      setValidationError(
        'Escribe la dirección IP o nombre del servidor.',
      );
      return;
    }

    if (
      !Number.isInteger(normalizedPort) ||
      normalizedPort < 1 ||
      normalizedPort > 65535
    ) {
      setValidationError(
        'El puerto debe ser un número entre 1 y 65535.',
      );
      return;
    }

    if (!database.trim()) {
      setValidationError(
        'Escribe la ruta local o alias de la base Firebird.',
      );
      return;
    }

    if (!username.trim() || !password) {
      setValidationError(
        'El usuario y la contraseña de Firebird son obligatorios.',
      );
      return;
    }

    if (!/^[0-9]+$/.test(companyNumber.trim())) {
      setValidationError(
        'El número de empresa debe contener solamente dígitos.',
      );
      return;
    }

    await onSubmit({
      displayName: displayName.trim(),
      host: host.trim(),
      port: normalizedPort,
      database: database.trim(),
      username: username.trim(),
      password,
      companyNumber: companyNumber.trim(),
      saeVersion: saeVersion.trim(),
      charset: charset.trim(),
    });
  }

  return (
    <form
      className="sae-connection-form"
      onSubmit={handleSubmit}
    >
      <header className="connection-form-header">
        <div className="connection-form-heading">
          <div className="connection-form-icon">
            <PlugZap size={21} />
          </div>

          <div>
            <span>CONEXIÓN DE ORIGEN</span>
            <h2>Conectar con Aspel SAE</h2>
          </div>
        </div>

        {onCancel && (
          <button
            type="button"
            className="connection-close-button"
            onClick={onCancel}
            aria-label="Cerrar"
          >
            <X size={19} />
          </button>
        )}
      </header>

      <p className="connection-form-description">
        Configura el servidor y la empresa que Opervia utilizará
        para consultar información en modo de solo lectura.
      </p>

      <div className="connection-form-grid">
        <label className="connection-field full-width">
          <span>Nombre de la conexión</span>

          <div className="connection-input">
            <Building2 size={17} />

            <input
              value={displayName}
              onChange={(event) =>
                setDisplayName(event.target.value)
              }
              placeholder="Empresa principal"
              autoComplete="off"
            />
          </div>
        </label>

        <label className="connection-field">
          <span>Servidor o dirección IP</span>

          <div className="connection-input">
            <Server size={17} />

            <input
              value={host}
              onChange={(event) => setHost(event.target.value)}
              placeholder="192.168.1.20"
              autoComplete="off"
            />
          </div>
        </label>

        <label className="connection-field">
          <span>Puerto Firebird</span>

          <div className="connection-input">
            <Network size={17} />

            <input
              type="number"
              min="1"
              max="65535"
              value={port}
              onChange={(event) => setPort(event.target.value)}
            />
          </div>
        </label>

        <label className="connection-field full-width">
          <span>Ruta local o alias de la base</span>

          <div className="connection-input">
            <Database size={17} />

            <input
              value={database}
              onChange={(event) =>
                setDatabase(event.target.value)
              }
              placeholder="C:\Aspel\...\SAE90EMPRE01.FDB"
              autoComplete="off"
            />
          </div>

          <small>
            Debe ser la ruta vista desde el servidor Firebird,
            no una ruta compartida de Windows.
          </small>
        </label>

        <label className="connection-field">
          <span>Usuario Firebird</span>

          <div className="connection-input">
            <UserRound size={17} />

            <input
              value={username}
              onChange={(event) =>
                setUsername(event.target.value)
              }
              autoComplete="username"
            />
          </div>
        </label>

        <label className="connection-field">
          <span>Contraseña Firebird</span>

          <div className="connection-input">
            <KeyRound size={17} />

            <input
              type="password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>
        </label>

        <label className="connection-field">
          <span>Número de empresa</span>

          <div className="connection-input">
            <Building2 size={17} />

            <input
              inputMode="numeric"
              value={companyNumber}
              onChange={(event) =>
                setCompanyNumber(
                  event.target.value.replace(/\D/g, ''),
                )
              }
              placeholder="15"
              autoComplete="off"
            />
          </div>
        </label>

        <label className="connection-field">
          <span>Versión de SAE</span>

          <div className="connection-input">
            <input
              value={saeVersion}
              onChange={(event) =>
                setSaeVersion(event.target.value)
              }
              placeholder="10"
              autoComplete="off"
            />
          </div>
        </label>

        <label className="connection-field">
          <span>Juego de caracteres</span>

          <div className="connection-input">
            <input
              value={charset}
              onChange={(event) =>
                setCharset(event.target.value)
              }
              placeholder="UTF8"
              autoComplete="off"
            />
          </div>
        </label>
      </div>

      {validationError && (
        <div className="connection-form-error">
          {validationError}
        </div>
      )}

      <footer className="connection-form-actions">
        {onCancel && (
          <button
            type="button"
            className="connection-cancel-button"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancelar
          </button>
        )}

        <button
          type="submit"
          className="connection-submit-button"
          disabled={isSubmitting}
        >
          <PlugZap size={17} />

          {isSubmitting
            ? 'Conectando...'
            : 'Usar esta conexión'}
        </button>
      </footer>
    </form>
  );
}

