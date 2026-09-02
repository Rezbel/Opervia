import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileSearch,
  History,
  Landmark,
  LoaderCircle,
  ReceiptText,
  Search,
  ShieldCheck,
  UserRound,
  WalletCards,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';

import {
  getCustomerReceivableMovements,
  getReceivableMovements,
  getReceivableRoot,
} from '../../lib/saeApi';
import type {
  SaeConnectionRequest,
  SaeCustomerReceivableMovementsResult,
  SaeReceivableMovement,
  SaeReceivableProbeResult,
  SaeReceivableRootResult,
  TaxDisplayMode,
} from '../../types/sae';
import { ReceivablesPortfolioSummary } from './ReceivablesPortfolioSummary';

import './ReceivablesDashboard.css';

interface ReceivablesDashboardProps {
  connection: SaeConnectionRequest | null;
  connectionName: string;
  initialDocumentNumber?: string;
  taxDisplayMode: TaxDisplayMode;
  onRequestConnection: () => void;
}

interface AgingBucket {
  key: string;
  label: string;
  amount: number;
  count: number;
  tone: string;
}

const currencyFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
});

const dateFormatter = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

function formatCurrency(value: number | null | undefined): string {
  return currencyFormatter.format(value ?? 0);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Sin fecha';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : dateFormatter.format(parsed);
}

function getMovementSign(movement: SaeReceivableMovement): number {
  return movement.movementSign ?? movement.conceptSign ?? 0;
}

function getSignedAmount(movement: SaeReceivableMovement): number {
  return (movement.amount ?? 0) * getMovementSign(movement);
}

function daysBetweenToday(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const today = new Date();
  const todayUtc = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const valueUtc = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );

  return Math.floor((todayUtc - valueUtc) / 86_400_000);
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    error.name === 'AbortError'
  );
}

function movementIdentity(movement: SaeReceivableMovement): string {
  return [
    movement.movementId,
    movement.lineNumber,
    movement.uuid,
    movement.document,
  ].join(':');
}

export function ReceivablesDashboard({
  connection,
  connectionName,
  initialDocumentNumber = '',
  taxDisplayMode,
  onRequestConnection,
}: ReceivablesDashboardProps) {
  const requestRef = useRef<AbortController | null>(null);
  const [documentNumber, setDocumentNumber] =
    useState(initialDocumentNumber);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rootResult, setRootResult] =
    useState<SaeReceivableRootResult | null>(null);
  const [movementResult, setMovementResult] =
    useState<SaeReceivableProbeResult | null>(null);
  const [customerResult, setCustomerResult] =
    useState<SaeCustomerReceivableMovementsResult | null>(null);

  useEffect(() => {
    if (initialDocumentNumber && !documentNumber) {
      setDocumentNumber(initialDocumentNumber);
    }
  }, [documentNumber, initialDocumentNumber]);

  useEffect(
    () => () => {
      requestRef.current?.abort();
    },
    [],
  );

  const summary = useMemo(() => {
    const root = rootResult?.root;
    const movements = movementResult?.movements ?? [];
    const hasSignedMovements = movements.some(
      (movement) => getMovementSign(movement) !== 0,
    );
    const signedBalance = movements.reduce(
      (total, movement) => total + getSignedAmount(movement),
      0,
    );
    const charges = movements
      .filter((movement) => getMovementSign(movement) > 0)
      .reduce((total, movement) => total + Math.abs(movement.amount ?? 0), 0);
    const credits = movements
      .filter((movement) => getMovementSign(movement) < 0)
      .reduce((total, movement) => total + Math.abs(movement.amount ?? 0), 0);
    const dueDelta = daysBetweenToday(root?.dueDate);
    const daysOverdue = dueDelta === null ? null : Math.max(0, dueDelta);
    const lastCredit = [...movements]
      .filter((movement) => getMovementSign(movement) < 0)
      .sort((left, right) =>
        (right.applicationDate ?? '').localeCompare(
          left.applicationDate ?? '',
        ),
      )[0];

    let status = 'Sin determinar';
    let statusTone = 'neutral';

    if (hasSignedMovements && signedBalance <= 0.01) {
      status = 'Liquidada';
      statusTone = 'success';
    } else if (dueDelta !== null && dueDelta > 0) {
      status = 'Vencida';
      statusTone = 'danger';
    } else if (dueDelta !== null && dueDelta >= -7) {
      status = 'Por vencer';
      statusTone = 'warning';
    } else if (root) {
      status = 'Vigente';
      statusTone = 'success';
    }

    return {
      root,
      hasSignedMovements,
      signedBalance,
      charges,
      credits,
      daysOverdue,
      lastCredit,
      status,
      statusTone,
    };
  }, [movementResult, rootResult]);

  const aging = useMemo(() => {
    const movements = customerResult?.movements ?? [];
    const buckets: AgingBucket[] = [
      { key: 'current', label: 'Por vencer', amount: 0, count: 0, tone: 'current' },
      { key: '1-30', label: '1–30 días', amount: 0, count: 0, tone: 'mild' },
      { key: '31-60', label: '31–60 días', amount: 0, count: 0, tone: 'warning' },
      { key: '61-90', label: '61–90 días', amount: 0, count: 0, tone: 'strong' },
      { key: '90+', label: 'Más de 90', amount: 0, count: 0, tone: 'danger' },
    ];

    movements
      .filter(
        (movement) =>
          getMovementSign(movement) > 0 &&
          (movement.amount ?? 0) > 0,
      )
      .forEach((movement) => {
        const overdue = daysBetweenToday(movement.dueDate);
        const index =
          overdue === null || overdue <= 0
            ? 0
            : overdue <= 30
              ? 1
              : overdue <= 60
                ? 2
                : overdue <= 90
                  ? 3
                  : 4;

        buckets[index].amount += Math.abs(movement.amount ?? 0);
        buckets[index].count += 1;
      });

    return buckets;
  }, [customerResult]);

  const agingTotal = aging.reduce(
    (total, bucket) => total + bucket.amount,
    0,
  );

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!connection) {
      setError('Primero configura o selecciona una conexión con Aspel SAE.');
      onRequestConnection();
      return;
    }

    const normalizedDocumentNumber = documentNumber.trim();
    if (!normalizedDocumentNumber) {
      setError('Escribe una factura o documento para consultar su cobranza.');
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setIsLoading(true);
    setRootResult(null);
    setMovementResult(null);
    setCustomerResult(null);

    try {
      const [root, movements] = await Promise.all([
        getReceivableRoot(
          connection,
          normalizedDocumentNumber,
          controller.signal,
        ),
        getReceivableMovements(
          connection,
          normalizedDocumentNumber,
          controller.signal,
        ),
      ]);

      setRootResult(root);
      setMovementResult(movements);

      if (!root.isSuccessful || !root.root) {
        setError(root.message || movements.message);
        return;
      }

      const customerMovements = await getCustomerReceivableMovements(
        connection,
        root.root.customerCode,
        controller.signal,
      );
      setCustomerResult(customerMovements);

      if (!movements.isSuccessful) {
        setError(
          `${movements.message} El cargo original sí fue localizado.`,
        );
      } else if (!customerMovements.isSuccessful) {
        setError(
          `${customerMovements.message} La factura sí fue localizada.`,
        );
      }
    } catch (searchError) {
      if (!isAbortError(searchError)) {
        setError(
          searchError instanceof Error
            ? searchError.message
            : 'No fue posible consultar las cuentas por cobrar.',
        );
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setIsLoading(false);
      }
    }
  }

  const hasResult = Boolean(summary.root);
  const recentCustomerMovements =
    customerResult?.movements.slice(0, 8) ?? [];

  return (
    <div className="receivables-view">
      <header className="receivables-hero">
        <div>
          <span className="eyebrow">CONTROL DE CARTERA</span>
          <h1>Cuentas por cobrar</h1>
          <p>
            Consulta cargos, aplicaciones y vencimientos directamente
            desde SAE en modo de solo lectura.
          </p>
        </div>

        <div className="receivables-connection">
          <span className={connection ? 'online' : ''} />
          <div>
            <small>Fuente de datos</small>
            <strong>{connectionName}</strong>
          </div>
          <ShieldCheck size={20} />
        </div>
      </header>

      <ReceivablesPortfolioSummary
        connection={connection}
        taxDisplayMode={taxDisplayMode}
        onRequestConnection={onRequestConnection}
        onSelectDocument={(selectedDocumentNumber) => {
          setDocumentNumber(selectedDocumentNumber);
          window.requestAnimationFrame(() => {
            document
              .getElementById('receivable-document-search')
              ?.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
              });
          });
        }}
      />

      <div className="receivable-document-search-heading">
        <div>
          <span className="eyebrow">EXPEDIENTE INDIVIDUAL</span>
          <h2>Consultar una factura</h2>
        </div>
        <p>
          Revisa cargo, aplicaciones, vencimiento y actividad del cliente.
        </p>
      </div>

      <form
        id="receivable-document-search"
        className="receivables-search"
        onSubmit={handleSearch}
      >
        <div className="receivables-search-icon">
          <FileSearch size={23} />
        </div>
        <label>
          <span>Factura, referencia o documento</span>
          <input
            type="search"
            value={documentNumber}
            onChange={(event) => setDocumentNumber(event.target.value)}
            placeholder="Ejemplo: F-XA-005955"
            autoComplete="off"
          />
        </label>
        <button type="submit" disabled={isLoading}>
          {isLoading ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <Search size={18} />
          )}
          {isLoading ? 'Consultando…' : 'Consultar cobranza'}
        </button>
      </form>

      {error && (
        <div className="receivables-alert" role="alert">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {!hasResult && (
        <section className="receivables-empty">
          <div className="receivables-empty-visual">
            <WalletCards size={42} />
            <span />
            <ReceiptText size={34} />
          </div>
          <h2>
            {isLoading
              ? 'Leyendo la cuenta en SAE…'
              : 'Busca una factura para abrir su cuenta'}
          </h2>
          <p>
            Opervia mostrará el cargo original, los abonos relacionados,
            la fecha de vencimiento y el contexto reciente del cliente.
          </p>
          <div className="read-only-note">
            <ShieldCheck size={16} />
            Firebird se consulta únicamente con SELECT; no se escriben datos.
          </div>
        </section>
      )}

      {hasResult && (
        <>
          <section className="receivables-status-row">
            <div>
              <span
                className={`receivable-status ${summary.statusTone}`}
              >
                {summary.statusTone === 'success' ? (
                  <CheckCircle2 size={15} />
                ) : (
                  <Clock3 size={15} />
                )}
                {summary.status}
              </span>
              <strong>
                {summary.root?.invoiceNumber ??
                  summary.root?.document ??
                  rootResult?.documentNumber}
              </strong>
              <small>
                Cliente {summary.root?.customerCode} · Estado SAE{' '}
                {summary.root?.status ?? 'sin dato'}
              </small>
            </div>
            <p>
              Consultado en{' '}
              {Math.max(
                rootResult?.elapsedMilliseconds ?? 0,
                movementResult?.elapsedMilliseconds ?? 0,
              )}{' '}
              ms
            </p>
          </section>

          <section className="receivable-metrics">
            <article>
              <div className="receivable-metric-icon blue">
                <CircleDollarSign size={21} />
              </div>
              <span>Cargo original {taxDisplayMode === 'withTax' ? 'con IVA' : 'sin IVA'}</span>
              <strong>{formatCurrency(
                taxDisplayMode === 'withTax'
                  ? summary.root?.amount
                  : summary.root?.invoiceAmountBeforeTax,
              )}</strong>
              <small>{taxDisplayMode === 'withTax' ? 'Importe registrado en CUEN_M' : 'Subtotal fiscal de FACTF'}</small>
            </article>
            <article>
              <div className="receivable-metric-icon mint">
                <Landmark size={21} />
              </div>
              <span>Saldo según movimientos</span>
              <strong>
                {summary.hasSignedMovements
                  ? formatCurrency(summary.signedBalance)
                  : 'No disponible'}
              </strong>
              <small>
                {summary.hasSignedMovements
                  ? `${formatCurrency(summary.credits)} en abonos detectados`
                  : 'SAE no devolvió signos para calcularlo'}
              </small>
            </article>
            <article>
              <div className="receivable-metric-icon amber">
                <CalendarClock size={21} />
              </div>
              <span>Vencimiento</span>
              <strong className="metric-date">
                {formatDate(summary.root?.dueDate)}
              </strong>
              <small>
                {summary.daysOverdue === null
                  ? 'Sin fecha para calcular atraso'
                  : summary.daysOverdue > 0
                    ? `${summary.daysOverdue} días de atraso`
                    : 'Dentro del plazo registrado'}
              </small>
            </article>
            <article>
              <div className="receivable-metric-icon violet">
                <History size={21} />
              </div>
              <span>Último abono</span>
              <strong className="metric-date">
                {summary.lastCredit
                  ? formatDate(summary.lastCredit.applicationDate)
                  : 'No detectado'}
              </strong>
              <small>
                {summary.lastCredit
                  ? formatCurrency(Math.abs(summary.lastCredit.amount ?? 0))
                  : 'Sin aplicaciones negativas vinculadas'}
              </small>
            </article>
          </section>

          <section className="receivables-grid">
            <article className="receivable-panel aging-panel">
              <div className="receivable-panel-heading">
                <div>
                  <span className="eyebrow">ANTIGÜEDAD DEL CLIENTE</span>
                  <h2>Cargos por vencimiento</h2>
                </div>
                <span className="record-limit">
                  Últimos {customerResult?.movements.length ?? 0} movimientos
                </span>
              </div>

              <div className="aging-bar" aria-label="Distribución por antigüedad">
                {aging.map((bucket) => (
                  <span
                    key={bucket.key}
                    className={bucket.tone}
                    style={{
                      width: `${
                        agingTotal > 0
                          ? (bucket.amount / agingTotal) * 100
                          : 20
                      }%`,
                    }}
                    title={`${bucket.label}: ${formatCurrency(bucket.amount)}`}
                  />
                ))}
              </div>

              <div className="aging-list">
                {aging.map((bucket) => (
                  <div key={bucket.key}>
                    <i className={bucket.tone} />
                    <span>{bucket.label}</span>
                    <b>{formatCurrency(bucket.amount)}</b>
                    <small>{bucket.count} cargos</small>
                  </div>
                ))}
              </div>

              <p className="calculation-note">
                Agrupación informativa de cargos positivos según su fecha
                de vencimiento. No sustituye el reporte contable de SAE.
              </p>
            </article>

            <article className="receivable-panel document-detail-panel">
              <div className="receivable-panel-heading">
                <div>
                  <span className="eyebrow">DOCUMENTO CONSULTADO</span>
                  <h2>Ficha de la cuenta</h2>
                </div>
                <ReceiptText size={20} />
              </div>
              <dl className="document-facts">
                <div>
                  <dt>Cliente</dt>
                  <dd>{summary.root?.customerCode || '—'}</dd>
                </div>
                <div>
                  <dt>Referencia</dt>
                  <dd>{summary.root?.reference || '—'}</dd>
                </div>
                <div>
                  <dt>Aplicación</dt>
                  <dd>{formatDate(summary.root?.applicationDate)}</dd>
                </div>
                <div>
                  <dt>Concepto</dt>
                  <dd>#{summary.root?.conceptNumber ?? '—'}</dd>
                </div>
                <div>
                  <dt>Número de cargo</dt>
                  <dd>{summary.root?.chargeNumber ?? '—'}</dd>
                </div>
                <div>
                  <dt>UUID</dt>
                  <dd className="fact-uuid">{summary.root?.uuid || '—'}</dd>
                </div>
              </dl>
            </article>
          </section>

          <section className="receivable-panel movements-panel">
            <div className="receivable-panel-heading">
              <div>
                <span className="eyebrow">TRAZABILIDAD DE COBRANZA</span>
                <h2>Movimientos vinculados a la factura</h2>
              </div>
              <span className="record-limit">
                {movementResult?.movements.length ?? 0} registros
              </span>
            </div>

            <div className="movement-table-wrap">
              <table className="movement-table">
                <thead>
                  <tr>
                    <th>Movimiento</th>
                    <th>Fecha</th>
                    <th>Documento / referencia</th>
                    <th>Tipo</th>
                    <th>Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {(movementResult?.movements ?? []).map((movement) => {
                    const signedAmount = getSignedAmount(movement);
                    const isCredit = signedAmount < 0;
                    return (
                      <tr key={movementIdentity(movement)}>
                        <td>
                          <span
                            className={`movement-direction ${
                              isCredit ? 'credit' : 'charge'
                            }`}
                          >
                            {isCredit ? (
                              <ArrowDownLeft size={15} />
                            ) : (
                              <ArrowUpRight size={15} />
                            )}
                          </span>
                          <div>
                            <strong>
                              {movement.conceptDescription ||
                                `Concepto ${movement.conceptNumber}`}
                            </strong>
                            <small>ID {movement.movementId}</small>
                          </div>
                        </td>
                        <td>{formatDate(movement.applicationDate)}</td>
                        <td>
                          <strong>
                            {movement.document ||
                              movement.paymentDocument ||
                              movement.invoiceNumber ||
                              '—'}
                          </strong>
                          <small>{movement.reference || 'Sin referencia'}</small>
                        </td>
                        <td>
                          <span
                            className={`movement-type ${
                              isCredit ? 'credit' : 'charge'
                            }`}
                          >
                            {isCredit ? 'Abono' : 'Cargo'}
                          </span>
                        </td>
                        <td className={isCredit ? 'credit-amount' : ''}>
                          {isCredit ? '−' : '+'}
                          {formatCurrency(Math.abs(movement.amount ?? 0))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {(movementResult?.movements.length ?? 0) === 0 && (
                <div className="table-empty">
                  No se localizaron aplicaciones directas para este documento.
                </div>
              )}
            </div>
          </section>

          <section className="receivable-panel customer-history-panel">
            <div className="receivable-panel-heading">
              <div>
                <span className="eyebrow">CONTEXTO DEL CLIENTE</span>
                <h2>Actividad reciente</h2>
              </div>
              <div className="customer-chip">
                <UserRound size={15} />
                {summary.root?.customerCode}
              </div>
            </div>
            <div className="customer-activity">
              {recentCustomerMovements.map((movement) => {
                const isCredit = getSignedAmount(movement) < 0;
                return (
                  <article key={`customer-${movementIdentity(movement)}`}>
                    <span className={isCredit ? 'credit' : 'charge'}>
                      {isCredit ? (
                        <ArrowDownLeft size={16} />
                      ) : (
                        <ArrowUpRight size={16} />
                      )}
                    </span>
                    <div>
                      <strong>
                        {movement.conceptDescription ||
                          `Concepto ${movement.conceptNumber}`}
                      </strong>
                      <small>
                        {movement.document ||
                          movement.invoiceNumber ||
                          movement.reference ||
                          'Sin documento'}
                      </small>
                    </div>
                    <time>{formatDate(movement.applicationDate)}</time>
                    <b className={isCredit ? 'credit-amount' : ''}>
                      {isCredit ? '−' : '+'}
                      {formatCurrency(Math.abs(movement.amount ?? 0))}
                    </b>
                  </article>
                );
              })}
              {recentCustomerMovements.length === 0 && (
                <div className="table-empty">
                  No hay actividad reciente disponible para el cliente.
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
