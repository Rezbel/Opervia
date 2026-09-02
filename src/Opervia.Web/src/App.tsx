import {
  useEffect,
  useRef,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';

import {
  Activity,
  Bot,
  Boxes,
  Building2,
  ChevronDown,
  CircleDollarSign,
  LayoutDashboard,
  PackageSearch,
  Search,
  Settings,
  Moon,
  Sun,
  WalletCards,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react';

import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';

import { SaeConnectionForm } from './features/connections/SaeConnectionForm';
import { DocumentItemsPanel } from './features/processes/DocumentItemsPanel';
import { RecentDocumentsPanel } from './features/processes/RecentDocumentsPanel';
import { SalesFlowsDashboard } from './features/processes/SalesFlowsDashboard';
import { InventoryDashboard } from './features/inventory/InventoryDashboard';
import { ReceivablesDashboard } from './features/receivables/ReceivablesDashboard';
import { ProfitabilityDashboard } from './features/profitability/ProfitabilityDashboard';
import {
  askOperviaAi,
  getDocumentItems,
  getLastUsedConnection,
  getSalesFlow,
  saveConnection,
} from './lib/saeApi';

import type {
  SaeConnectionRequest,
  SaeDocumentItemsResult,
  SaeDocumentKind,
  SaeSalesFlowNode,
  SaeSalesFlowResult,
  OperviaAiAnswer,
  TaxDisplayMode,
} from './types/sae';

import '@xyflow/react/dist/style.css';
import './App.css';

const nodeBaseStyle = {
  width: 185,
  minHeight: 90,
  padding: 0,
  borderRadius: 16,
  border: '1px solid rgba(79, 124, 255, 0.32)',
  background: '#111827',
  color: '#f8fafc',
  boxShadow: '0 14px 30px rgba(0, 0, 0, 0.22)',
};

function formatCurrency(value: number | null): string {
  if (value === null) {
    return 'Importe no disponible';
  }

  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(value);
}

function formatDate(value: string | null): string {
  if (!value) {
    return 'Fecha no disponible';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
  }).format(date);
}

function getKindLabel(kind: SaeDocumentKind): string {
  switch (kind) {
    case 'Quotation':
      return 'COTIZACIÓN';

    case 'Order':
      return 'PEDIDO';

    case 'Delivery':
      return 'REMISIÓN';

    case 'Invoice':
      return 'FACTURA';

    default:
      return 'DOCUMENTO';
  }
}

function detectDocumentKind(
  documentNumber: string,
): SaeDocumentKind | null {
  const firstCharacter =
    documentNumber.trim().charAt(0).toUpperCase();

  switch (firstCharacter) {
    case 'C':
      return 'Quotation';

    case 'P':
      return 'Order';

    case 'R':
      return 'Delivery';

    case 'F':
      return 'Invoice';

    default:
      return null;
  }
}

function parseFlowNodeId(
  nodeId: string,
): {
  kind: SaeDocumentKind;
  documentNumber: string;
} | null {
  const separatorIndex = nodeId.indexOf(':');

  if (separatorIndex <= 0) {
    return null;
  }

  const kindValue =
    nodeId.slice(0, separatorIndex).toLowerCase();

  const documentNumber =
    nodeId.slice(separatorIndex + 1).trim();

  if (!documentNumber) {
    return null;
  }

  const kind: SaeDocumentKind | null =
    kindValue === 'quotation'
      ? 'Quotation'
      : kindValue === 'order'
        ? 'Order'
        : kindValue === 'delivery'
          ? 'Delivery'
          : kindValue === 'invoice'
            ? 'Invoice'
            : null;

  if (!kind) {
    return null;
  }

  return {
    kind,
    documentNumber,
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function createReactFlowNode(
  document: SaeSalesFlowNode,
  taxDisplayMode: TaxDisplayMode,
): Node {
  return {
    id: document.id,
    position: {
      x: 30 + document.sequence * 245,
      y: 145,
    },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: {
      ...nodeBaseStyle,
      border:
        document.kind === 'Invoice'
          ? '1px solid rgba(79, 124, 255, 0.68)'
          : nodeBaseStyle.border,
    },
    data: {
      label: (
        <div className="process-node">
          <span className="node-kicker">
            {getKindLabel(document.kind)}
          </span>

          <strong>{document.documentNumber}</strong>

          <small className="node-customer-code">
            Cliente {document.customerCode}
          </small>

          {(document.customerCommercialName ||
            document.customerName) && (
            <span className="node-customer-name">
              {document.customerCommercialName ||
                document.customerName}
            </span>
          )}

          {document.customerRfc && (
            <small className="node-customer-rfc">
              RFC: {document.customerRfc}
            </small>
          )}

          <small>
            {formatCurrency(
              taxDisplayMode === 'withTax'
                ? document.amount
                : document.amountBeforeTax,
            )}
          </small>

          <small>
            {formatDate(document.documentDate)}
          </small>

          <span className="node-status active">
            Estado SAE: {document.status || 'N/D'}
          </span>
        </div>
      ),
    },
  };
}

const demoNodes: Node[] = [
  {
    id: 'demo-quotation',
    position: { x: 30, y: 145 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: nodeBaseStyle,
    data: {
      label: (
        <div className="process-node">
          <span className="node-kicker">
            COTIZACIÓN
          </span>
          <strong>C-DEMO-001</strong>
          <small>Flujo demostrativo</small>
          <span className="node-status completed">
            Demo
          </span>
        </div>
      ),
    },
  },
  {
    id: 'demo-order',
    position: { x: 275, y: 145 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: nodeBaseStyle,
    data: {
      label: (
        <div className="process-node">
          <span className="node-kicker">
            PEDIDO
          </span>
          <strong>P-DEMO-001</strong>
          <small>Flujo demostrativo</small>
          <span className="node-status warning">
            Demo
          </span>
        </div>
      ),
    },
  },
  {
    id: 'demo-delivery',
    position: { x: 520, y: 145 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: nodeBaseStyle,
    data: {
      label: (
        <div className="process-node">
          <span className="node-kicker">
            REMISIÓN
          </span>
          <strong>R-DEMO-001</strong>
          <small>Flujo demostrativo</small>
          <span className="node-status active">
            Demo
          </span>
        </div>
      ),
    },
  },
  {
    id: 'demo-invoice',
    position: { x: 765, y: 145 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: nodeBaseStyle,
    data: {
      label: (
        <div className="process-node">
          <span className="node-kicker">
            FACTURA
          </span>
          <strong>F-DEMO-001</strong>
          <small>Flujo demostrativo</small>
          <span className="node-status completed">
            Demo
          </span>
        </div>
      ),
    },
  },
];

const demoEdges: Edge[] = [
  {
    id: 'demo-quotation-order',
    source: 'demo-quotation',
    target: 'demo-order',
    animated: true,
    markerEnd: {
      type: MarkerType.ArrowClosed,
    },
  },
  {
    id: 'demo-order-delivery',
    source: 'demo-order',
    target: 'demo-delivery',
    animated: true,
    markerEnd: {
      type: MarkerType.ArrowClosed,
    },
  },
  {
    id: 'demo-delivery-invoice',
    source: 'demo-delivery',
    target: 'demo-invoice',
    animated: true,
    markerEnd: {
      type: MarkerType.ArrowClosed,
    },
  },
];

function App() {
  const flowRequestRef = useRef<AbortController | null>(null);
  const itemsRequestRef = useRef<AbortController | null>(null);
  const aiRequestRef = useRef<AbortController | null>(null);

  const [isConnectionOpen, setIsConnectionOpen] =
    useState(false);
  const [activeView, setActiveView] =
    useState<'dashboard' | 'flows' | 'receivables' | 'profitability' | 'inventory'>('dashboard');
  const [taxDisplayMode, setTaxDisplayMode] = useState<TaxDisplayMode>(() =>
    window.localStorage.getItem('opervia.taxDisplayMode') === 'withoutTax'
      ? 'withoutTax'
      : 'withTax',
  );
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>(() =>
    window.localStorage.getItem('opervia.themeMode') === 'light'
      ? 'light'
      : 'dark',
  );

  const [activeConnection, setActiveConnection] =
    useState<SaeConnectionRequest | null>(null);

  const [activeConnectionName, setActiveConnectionName] =
    useState('Sin conexión configurada');

  const [documentNumber, setDocumentNumber] =
    useState('');

  const [isLoadingFlow, setIsLoadingFlow] =
    useState(false);

  const [flowError, setFlowError] =
    useState<string | null>(null);

  const [flowResult, setFlowResult] =
    useState<SaeSalesFlowResult | null>(null);

  const [flowNodes, setFlowNodes] =
    useState<Node[]>(demoNodes);

  const [flowEdges, setFlowEdges] =
    useState<Edge[]>(demoEdges);
  const [isItemsPanelOpen, setIsItemsPanelOpen] =
    useState(false);

  const [isLoadingItems, setIsLoadingItems] =
    useState(false);

  const [documentItemsError, setDocumentItemsError] =
    useState<string | null>(null);

  const [documentItemsResult, setDocumentItemsResult] =
    useState<SaeDocumentItemsResult | null>(null);
  const [aiQuestion, setAiQuestion] = useState('');
  const [lastAiQuestion, setLastAiQuestion] = useState('');
  const [aiAnswer, setAiAnswer] =
    useState<OperviaAiAnswer | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isAskingAi, setIsAskingAi] = useState(false);

  const insights = useMemo(() => {
    if (!flowResult) return null;
    const amounts = flowResult.nodes
      .map((node) =>
        taxDisplayMode === 'withTax'
          ? node.amount
          : node.amountBeforeTax,
      )
      .filter((value): value is number => value !== null);
    const missing = flowResult.nodes.filter(
      (node) => node.amount === null || !node.documentDate,
    ).length;
    const maxAmount = Math.max(...amounts, 1);
    const integrity = Math.max(
      0,
      100 - flowResult.warnings.length * 12 - missing * 8,
    );
    return { amounts, maxAmount, missing, integrity };
  }, [flowResult, taxDisplayMode]);

  useEffect(() => {
    window.localStorage.setItem('opervia.taxDisplayMode', taxDisplayMode);
    if (flowResult) {
      setFlowNodes(flowResult.nodes.map((node) =>
        createReactFlowNode(node, taxDisplayMode)));
    }
  }, [flowResult, taxDisplayMode]);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.style.colorScheme = themeMode;
    window.localStorage.setItem('opervia.themeMode', themeMode);
  }, [themeMode]);

  useEffect(() => {
    const controller = new AbortController();
    void getLastUsedConnection(controller.signal)
      .then((connection) => {
        if (!connection) return;
        setActiveConnection(connection);
        setActiveConnectionName(
          `${connection.displayName} · Empresa ${connection.companyNumber}`,
        );
      })
      .catch((error) => {
        if (!isAbortError(error)) {
          console.warn('No fue posible restaurar la conexión guardada.');
        }
      });

    return () => {
      const flowRequest = flowRequestRef.current;
      const itemsRequest = itemsRequestRef.current;

      flowRequestRef.current = null;
      itemsRequestRef.current = null;
      flowRequest?.abort();
      itemsRequest?.abort();
      aiRequestRef.current?.abort();
      controller.abort();
    };
  }, []);

  function clearFlowState() {
    setFlowResult(null);
    setFlowNodes(demoNodes);
    setFlowEdges(demoEdges);
    setAiAnswer(null);
    setAiError(null);
    setAiQuestion('');
    setLastAiQuestion('');
  }

  async function handleAiQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeConnection || !aiQuestion.trim() || isAskingAi) return;
    aiRequestRef.current?.abort();
    const controller = new AbortController();
    aiRequestRef.current = controller;
    const normalizedQuestion = aiQuestion.trim();
    setLastAiQuestion(normalizedQuestion);
    setAiAnswer(null);
    setIsAskingAi(true);
    setAiError(null);
    try {
      setAiAnswer(await askOperviaAi(
        normalizedQuestion,
        activeConnectionName,
        activeConnection,
        flowResult,
        documentItemsResult,
        controller.signal,
      ));
    } catch (error) {
      if (!isAbortError(error)) {
        setAiError(error instanceof Error ? error.message : 'No fue posible consultar Opervia AI.');
      }
    } finally {
      if (aiRequestRef.current === controller) {
        aiRequestRef.current = null;
        setIsAskingAi(false);
      }
    }
  }

  function clearDocumentItemsState() {
    setIsItemsPanelOpen(false);
    setIsLoadingItems(false);
    setDocumentItemsResult(null);
    setDocumentItemsError(null);
  }

  async function handleConnectionSubmit(
    connection: SaeConnectionRequest,
  ) {
    await saveConnection(connection);
    flowRequestRef.current?.abort();
    flowRequestRef.current = null;
    itemsRequestRef.current?.abort();
    itemsRequestRef.current = null;

    setActiveConnection(connection);

    setActiveConnectionName(
      `${connection.displayName} · Empresa ${connection.companyNumber}`,
    );

    setDocumentNumber('');
    setIsLoadingFlow(false);
    setFlowError(null);
    clearFlowState();
    clearDocumentItemsState();
    setIsConnectionOpen(false);
  }

  async function loadFlow(
    kind: SaeDocumentKind,
    normalizedDocumentNumber: string,
  ) {
    setFlowError(null);

    if (!activeConnection) {
      setFlowError(
        'Primero configura una conexión con Aspel SAE.',
      );

      setIsConnectionOpen(true);
      return;
    }

    flowRequestRef.current?.abort();
    flowRequestRef.current = null;
    itemsRequestRef.current?.abort();
    itemsRequestRef.current = null;
    clearFlowState();
    clearDocumentItemsState();

    const requestController = new AbortController();
    flowRequestRef.current = requestController;
    setIsLoadingFlow(true);

    try {
      const result = await getSalesFlow(
        activeConnection,
        kind,
        normalizedDocumentNumber,
        requestController.signal,
      );

      const nodes = result.nodes.map(
        (node) => createReactFlowNode(node, taxDisplayMode),
      );

      const edges: Edge[] = result.edges.map(
        (edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          animated: true,
          markerEnd: {
            type: MarkerType.ArrowClosed,
          },
        }),
      );

      setFlowResult(result);
      setFlowNodes(nodes);
      setFlowEdges(edges);
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      setFlowError(
        error instanceof Error
          ? error.message
          : 'No fue posible cargar el flujo.',
      );
    } finally {
      if (flowRequestRef.current === requestController) {
        flowRequestRef.current = null;
        setIsLoadingFlow(false);
      }
    }
  }

  async function handleFlowSearch(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const normalizedDocumentNumber = documentNumber.trim();
    const kind = detectDocumentKind(normalizedDocumentNumber);

    if (!kind) {
      setFlowError('El documento debe comenzar con C, P, R o F.');
      return;
    }

    await loadFlow(kind, normalizedDocumentNumber);
  }

  async function handleRecentDocumentSelect(
    kind: SaeDocumentKind,
    selectedDocumentNumber: string,
  ) {
    setDocumentNumber(selectedDocumentNumber);
    await loadFlow(kind, selectedDocumentNumber);
    window.requestAnimationFrame(() => {
      document.querySelector('.flow-panel')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }

  async function handleNodeClick(
    node: Node,
  ) {
    if (!activeConnection) {
      setFlowError(
        'Primero configura una conexión con Aspel SAE.',
      );

      setIsConnectionOpen(true);
      return;
    }

    if (node.id.startsWith('demo-')) {
      return;
    }

    const identity = parseFlowNodeId(node.id);

    if (!identity) {
      setFlowError(
        'No fue posible identificar el documento seleccionado.',
      );
      return;
    }

    itemsRequestRef.current?.abort();
    const requestController = new AbortController();
    itemsRequestRef.current = requestController;

    setIsItemsPanelOpen(true);
    setIsLoadingItems(true);
    setDocumentItemsError(null);
    setDocumentItemsResult(null);

    try {
      const result = await getDocumentItems(
        activeConnection,
        identity.kind,
        identity.documentNumber,
        requestController.signal,
      );

      setDocumentItemsResult(result);
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      setDocumentItemsError(
        error instanceof Error
          ? error.message
          : 'No fue posible cargar las partidas.',
      );
    } finally {
      if (itemsRequestRef.current === requestController) {
        itemsRequestRef.current = null;
        setIsLoadingItems(false);
      }
    }
  }
  const flowTitle = flowResult
    ? `Flujo real · ${flowResult.startingDocumentNumber}`
    : 'Flujo demostrativo';
  const receivableDocumentNumber =
    flowResult?.nodes.find((node) => node.kind === 'Invoice')
      ?.documentNumber ??
    (detectDocumentKind(documentNumber) === 'Invoice'
      ? documentNumber
      : '');

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Activity size={22} />
          </div>

          <div>
            <strong>Opervia</strong>
            <span>Process Intelligence</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${
              activeView === 'dashboard' ? 'active' : ''
            }`}
            onClick={() => setActiveView('dashboard')}
          >
            <LayoutDashboard size={19} />
            <span>Centro de control</span>
          </button>

          <button
            className={`nav-item ${
              activeView === 'flows' ? 'active' : ''
            }`}
            onClick={() => setActiveView('flows')}
          >
            <Activity size={19} />
            <span>Flujos de ventas</span>
          </button>

          <button
            className={`nav-item ${
              activeView === 'receivables' ? 'active' : ''
            }`}
            onClick={() => setActiveView('receivables')}
          >
            <WalletCards size={19} />
            <span>Cuentas por cobrar</span>
          </button>

          <button
            className={`nav-item ${
              activeView === 'profitability' ? 'active' : ''
            }`}
            onClick={() => setActiveView('profitability')}
          >
            <TrendingUp size={19} />
            <span>Rentabilidad</span>
          </button>

          <button
            className={`nav-item ${activeView === 'inventory' ? 'active' : ''}`}
            onClick={() => setActiveView('inventory')}
          >
            <Boxes size={19} />
            <span>Inventario</span>
          </button>

          <button className="nav-item">
            <PackageSearch size={19} />
            <span>Explorador</span>
          </button>

          <div className="nav-separator" />

          <button
            className="nav-item"
            onClick={() => setIsConnectionOpen(true)}
          >
            <Building2 size={19} />
            <span>Conexiones SAE</span>
          </button>

          <button className="nav-item">
            <Settings size={19} />
            <span>Configuración</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="theme-display-control">
            <span>APARIENCIA</span>
            <button
              type="button"
              onClick={() => setThemeMode((current) => current === 'dark' ? 'light' : 'dark')}
              aria-label={`Cambiar a modo ${themeMode === 'dark' ? 'claro' : 'oscuro'}`}
            >
              {themeMode === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
              <span>{themeMode === 'dark' ? 'Modo oscuro' : 'Modo claro'}</span>
              <small>Cambiar</small>
            </button>
          </div>
          <div className="tax-display-control">
            <span>IMPORTES DE FACTURA</span>
            <div>
              <button
                type="button"
                className={taxDisplayMode === 'withoutTax' ? 'active' : ''}
                onClick={() => setTaxDisplayMode('withoutTax')}
              >
                Sin IVA
              </button>
              <button
                type="button"
                className={taxDisplayMode === 'withTax' ? 'active' : ''}
                onClick={() => setTaxDisplayMode('withTax')}
              >
                Con IVA
              </button>
            </div>
          </div>
          <div className="sync-indicator">
            <span />

            <div>
              <strong>
                {activeConnection
                  ? 'Perfil SAE configurado'
                  : 'SAE sin configurar'}
              </strong>

              <small>
                {activeConnection
                  ? activeConnection.host
                  : 'Configura una empresa'}
              </small>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-content">
        {activeView === 'dashboard' ? (
          <>
        <header className="topbar">
          <div>
            <span className="eyebrow">
              CENTRO DE CONTROL
            </span>

            <h1>Visión operativa</h1>
          </div>

          <div className="topbar-actions">
            <form
              className="global-search"
              onSubmit={handleFlowSearch}
            >
              <Search size={18} />

              <input
                type="search"
                value={documentNumber}
                onChange={(event) =>
                  setDocumentNumber(event.target.value)
                }
                placeholder="Ejemplo: F-XA-005879"
              />

              <button
                type="submit"
                aria-label="Buscar flujo"
                disabled={isLoadingFlow}
              >
                <Search size={16} />
              </button>
            </form>

            <button
              className="company-selector"
              onClick={() => setIsConnectionOpen(true)}
            >
              <Building2 size={18} />

              <div>
                <small>Empresa activa</small>
                <strong>{activeConnectionName}</strong>
              </div>

              <ChevronDown size={17} />
            </button>
          </div>
        </header>

        <section className="metrics-grid">
          <article className="metric-card">
            <div className="metric-icon">
              <CircleDollarSign size={21} />
            </div>

            <div>
              <span>Documentos del flujo</span>
              <strong>
                {flowResult?.nodes.length ?? '—'}
              </strong>
              <small>
                {flowResult
                  ? 'Datos reales de SAE'
                  : 'Esperando consulta'}
              </small>
            </div>
          </article>

          <article className="metric-card">
            <div className="metric-icon">
              <WalletCards size={21} />
            </div>

            <div>
              <span>Documento inicial</span>
              <strong className="metric-document-number">
                {flowResult?.startingDocumentNumber ?? '—'}
              </strong>
              <small>Referencia consultada</small>
            </div>
          </article>

          <article className="metric-card">
            <div className="metric-icon">
              <Boxes size={21} />
            </div>

            <div>
              <span>Advertencias</span>
              <strong>
                {flowResult?.warnings.length ?? '—'}
              </strong>
              <small>Inconsistencias detectadas</small>
            </div>
          </article>

          <article className="metric-card">
            <div className="metric-icon">
              <Activity size={21} />
            </div>

            <div>
              <span>Tiempo de consulta</span>
              <strong>
                {flowResult
                  ? `${flowResult.elapsedMilliseconds} ms`
                  : '—'}
              </strong>
              <small>API + Firebird</small>
            </div>
          </article>
        </section>

        {flowError && (
          <div className="flow-error-banner">
            {flowError}
          </div>
        )}

        {activeConnection && (
          <RecentDocumentsPanel
            connection={activeConnection}
            taxDisplayMode={taxDisplayMode}
            onSelectDocument={(kind, number) => {
              void handleRecentDocumentSelect(kind, number);
            }}
          />
        )}

        {flowResult && insights && (
          <section className="insights-panel" aria-label="Indicadores del flujo">
            <div className="insight-score">
              <div
                className="score-ring"
                style={{ '--score': `${insights.integrity * 3.6}deg` } as CSSProperties}
              >
                <strong>{insights.integrity}%</strong>
              </div>
              <div>
                <span className="eyebrow">CALIDAD DEL FLUJO</span>
                <h2>Integridad de datos</h2>
                <p>{insights.missing === 0 ? 'Datos principales completos' : `${insights.missing} documentos con datos faltantes`}</p>
              </div>
            </div>
            <div className="amount-chart">
              <div className="chart-title">
                <TrendingUp size={18} />
                <strong>Importe por etapa</strong>
              </div>
              {flowResult.nodes.map((node) => (
                <div className="amount-row" key={node.id}>
                  <span>{node.documentNumber}</span>
                  <div><i style={{ width: `${Math.max(4, ((node.amount ?? 0) / insights.maxAmount) * 100)}%` }} /></div>
                  <b>{formatCurrency(
                    taxDisplayMode === 'withTax'
                      ? node.amount
                      : node.amountBeforeTax,
                  )}</b>
                </div>
              ))}
            </div>
            <div className="anomaly-card">
              <AlertTriangle size={22} />
              <strong>{flowResult.warnings.length + insights.missing} alertas</strong>
              <span>Revisión automática del proceso</span>
            </div>
          </section>
        )}

        <section className="workspace-grid">
          <article className="panel flow-panel">
            <div className="panel-header">
              <div>
                <span className="eyebrow">
                  FLUJO SELECCIONADO
                </span>

                <h2>{flowTitle}</h2>
              </div>

              <button className="secondary-button">
                Ver expediente
              </button>
            </div>

            <div className="flow-canvas">
              <ReactFlow
                key={
                  flowResult?.startingDocumentNumber ??
                  'demo'
                }
                nodes={flowNodes}
                onNodeClick={(_, node) => {
                  void handleNodeClick(node);
                }}
                edges={flowEdges}
                fitView
                fitViewOptions={{
                  padding: 0.22,
                }}
                nodesDraggable
                nodesConnectable={false}
                elementsSelectable
                proOptions={{
                  hideAttribution: true,
                }}
              >
                <Background gap={24} size={1} />

                <Controls position="bottom-left" />

                <MiniMap
                  pannable
                  zoomable
                  nodeColor="#4f7cff"
                />
              </ReactFlow>
            </div>
          </article>

          <aside className="panel copilot-panel">
            <div className="copilot-heading">
              <div className="copilot-icon">
                <Bot size={22} />
              </div>

              <div>
                <span className="eyebrow">
                  COPILOTO OPERATIVO
                </span>

                <h2>Opervia AI</h2>
                <small className="local-ai-badge">
                  LOCAL · SIN COSTO
                </small>
                <small className="readonly-ai-badge">
                  SAE · SOLO LECTURA
                </small>
              </div>

              <span className="copilot-online">
                <i /> Disponible
              </span>
            </div>

            {!activeConnection && (
              <div className="copilot-message ai-message">
                <strong>Conecta una empresa SAE.</strong>

                <p>
                  Después escribe una cotización, pedido,
                  remisión o factura en el buscador.
                </p>
              </div>
            )}

            {activeConnection && !lastAiQuestion && !isLoadingFlow && (
              <div className="copilot-welcome">
                <span className="copilot-welcome-icon"><Bot size={20} /></span>
                <div>
                  <strong>¿Qué necesitas consultar?</strong>
                  <p>
                    Pregunta con tus propias palabras. Buscaré la respuesta
                    directamente en SAE sin modificar ningún dato.
                  </p>
                </div>
                <div className="copilot-capabilities">
                  <span><Boxes size={14} /> Existencias</span>
                  <span><Building2 size={14} /> Clientes</span>
                  <span><WalletCards size={14} /> Ventas y facturas</span>
                </div>
              </div>
            )}

            {isLoadingFlow && (
              <div className="copilot-message ai-message">
                <strong>
                  Reconstruyendo el proceso...
                </strong>

                <p>
                  Opervia está siguiendo las referencias
                  anteriores de los documentos SAE.
                </p>
              </div>
            )}

            {flowResult && !lastAiQuestion && (
              <div className="copilot-context-note">
                <span>Contexto activo</span>
                <strong>{flowResult.startingDocumentNumber}</strong>
                <small>{flowResult.nodes.length} documentos relacionados</small>
              </div>
            )}

            {lastAiQuestion && (
              <div className="copilot-message user-message ai-user-question">
                <small>Tú</small>
                <p>{lastAiQuestion}</p>
              </div>
            )}

            {isAskingAi && (
              <div className="copilot-message ai-message ai-thinking">
                <span><Activity size={16} /></span>
                <div>
                  <strong>Consultando Aspel SAE…</strong>
                  <p>Estoy revisando los datos relacionados con tu pregunta.</p>
                </div>
              </div>
            )}

            {aiAnswer && (
              <div className="copilot-message ai-message ai-answer">
                <div className="ai-answer-heading">
                  <span><Bot size={17} /></span>
                  <div>
                    <small>Opervia AI</small>
                    <strong>{aiAnswer.summary}</strong>
                  </div>
                </div>
                <p className="ai-answer-body">{aiAnswer.answer}</p>
                {aiAnswer.alerts.length > 0 && (
                  <div className="ai-alert-list">
                    <small>Ten en cuenta</small>
                    {aiAnswer.alerts.map((alert) => (
                      <div key={alert}>
                        <AlertTriangle size={14} />
                        <span>{alert}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="ai-answer-meta">
                  <span><i /> Datos consultados en SAE</span>
                  <small>{aiAnswer.model}</small>
                </div>
                <div className="suggested-questions ai-followups">
                  <small>También puedes preguntar</small>
                  {aiAnswer.suggestedQuestions.map((question) => (
                    <button type="button" key={question} onClick={() => setAiQuestion(question)}>
                      <Search size={13} />
                      <span>{question}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {aiError && <div className="copilot-message ai-error">{aiError}</div>}

            {activeConnection && !lastAiQuestion && !aiAnswer && !isAskingAi && (
              <div className="suggested-questions ai-starters">
                <small>Prueba con una pregunta</small>
                <button type="button" onClick={() => setAiQuestion('¿Cuánto stock hay del producto ')}>
                  <Boxes size={14} />
                  <span>¿Cuánto stock hay de un producto?</span>
                </button>
                <button type="button" onClick={() => setAiQuestion('¿Cuál fue la última venta vigente del cliente ')}>
                  <WalletCards size={14} />
                  <span>¿Cuál fue la última venta de un cliente?</span>
                </button>
              </div>
            )}

            <form className="copilot-input" onSubmit={handleAiQuestion}>
              <input
                placeholder="Escribe tu pregunta sobre SAE…"
                disabled={!activeConnection}
                value={aiQuestion}
                maxLength={1000}
                onChange={(event) => setAiQuestion(event.target.value)}
              />

              <button
                aria-label="Enviar consulta"
                title="Enviar pregunta"
                disabled={!activeConnection || !aiQuestion.trim() || isAskingAi}
              >
                {isAskingAi ? <Activity size={18} /> : <Bot size={18} />}
              </button>
            </form>
          </aside>
        </section>
          </>
        ) : activeView === 'flows' ? (
          <SalesFlowsDashboard
            connection={activeConnection}
            connectionName={activeConnectionName}
            taxDisplayMode={taxDisplayMode}
            onRequestConnection={() => setIsConnectionOpen(true)}
          />
        ) : activeView === 'inventory' ? (
          <InventoryDashboard
            connection={activeConnection}
            connectionName={activeConnectionName}
            taxDisplayMode={taxDisplayMode}
            onRequestConnection={() => setIsConnectionOpen(true)}
          />
        ) : activeView === 'receivables' ? (
          <ReceivablesDashboard
            connection={activeConnection}
            connectionName={activeConnectionName}
            initialDocumentNumber={receivableDocumentNumber}
            onRequestConnection={() => setIsConnectionOpen(true)}
            taxDisplayMode={taxDisplayMode}
          />
        ) : (
          <ProfitabilityDashboard
            connection={activeConnection}
            connectionName={activeConnectionName}
            taxDisplayMode={taxDisplayMode}
            onRequestConnection={() => setIsConnectionOpen(true)}
          />
        )}
      </main>

      {isConnectionOpen && (
        <div
          className="connection-modal-backdrop"
          role="presentation"
          onMouseDown={() =>
            setIsConnectionOpen(false)
          }
        >
          <div
            className="connection-modal-content"
            role="dialog"
            aria-modal="true"
            aria-label="Configurar conexión SAE"
            onMouseDown={(event) =>
              event.stopPropagation()
            }
          >
            <SaeConnectionForm
              onCancel={() =>
                setIsConnectionOpen(false)
              }
              onSubmit={handleConnectionSubmit}
            />
          </div>
        </div>
      )}

      {isItemsPanelOpen && (
        <DocumentItemsPanel
          result={documentItemsResult}
          taxDisplayMode={taxDisplayMode}
          isLoading={isLoadingItems}
          error={documentItemsError}
          onClose={() => {
            itemsRequestRef.current?.abort();
            itemsRequestRef.current = null;
            clearDocumentItemsState();
          }}
        />
      )}
    </div>
  );
}

export default App;
