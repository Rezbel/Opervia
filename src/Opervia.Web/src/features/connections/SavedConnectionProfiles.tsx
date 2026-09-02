import { useEffect, useState } from 'react';
import { History, Trash2 } from 'lucide-react';
import {
  deleteSavedConnection,
  listSavedConnections,
  loadSavedConnection,
} from '../../lib/saeApi';
import type {
  SaeConnectionRequest,
  SavedSaeConnectionSummary,
} from '../../types/sae';

interface Props {
  disabled: boolean;
  onUse: (connection: SaeConnectionRequest) => Promise<void> | void;
}

export function SavedConnectionProfiles({ disabled, onUse }: Props) {
  const [profiles, setProfiles] =
    useState<SavedSaeConnectionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void listSavedConnections(controller.signal)
      .then((savedProfiles) => {
        setProfiles(savedProfiles);
        setError(null);
      })
      .catch((cause) => {
        if (cause instanceof DOMException &&
            cause.name === 'AbortError') return;
        setError(
          'No fue posible cargar las conexiones guardadas en MySQL.',
        );
      });
    return () => controller.abort();
  }, []);

  async function handleUseProfile(id: string) {
    setIsWorking(true);
    setError(null);
    try {
      await onUse(await loadSavedConnection(id));
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : 'No fue posible abrir la conexión guardada.');
    } finally {
      setIsWorking(false);
    }
  }

  async function removeProfile(id: string) {
    setIsWorking(true);
    setError(null);
    try {
      await deleteSavedConnection(id);
      setProfiles((current) =>
        current.filter((profile) => profile.id !== id));
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : 'No fue posible eliminar la conexión.');
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <section className="saved-connections">
      <div className="saved-connections-title">
        <History size={16} />
        <strong>Conexiones guardadas en MySQL</strong>
      </div>
      {profiles.map((profile) => (
        <div className="saved-connection" key={profile.id}>
          <button
            type="button"
            className="saved-connection-main"
            onClick={() => void handleUseProfile(profile.id)}
            disabled={disabled || isWorking}
          >
            <strong>{profile.displayName}</strong>
            <span>
              {profile.host}:{profile.port} · Empresa {profile.companyNumber}
            </span>
          </button>
          <button
            type="button"
            className="saved-connection-delete"
            aria-label={`Eliminar ${profile.displayName}`}
            onClick={() => void removeProfile(profile.id)}
            disabled={disabled || isWorking}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      {profiles.length === 0 && !error && (
        <p className="saved-connections-empty">
          Al usar una conexión por primera vez se guardará aquí,
          con la contraseña cifrada.
        </p>
      )}
      {error && <div className="connection-form-error">{error}</div>}
    </section>
  );
}
