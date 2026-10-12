import {
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
  type FormEvent,
} from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { modulePaths, settingsPaths, usersPath, loginPath, resolveAppRoute, safeReturnPath, canOpenRoute, type SettingsSection } from './lib/appRoutes';

import {
  Activity,
  Bot,
  Boxes,
  UsersRound,
  Building2,
  Menu,
  Settings,
  Database,
  ShieldCheck,
  CalendarClock,
  X,
  LayoutDashboard,
  Search,
  Moon,
  Sun,
  LogOut,
  WalletCards,
  AlertTriangle,
  TrendingUp,
  BarChart3,
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
import { CompanyBadge, CompanyProvider } from './features/connections/CompanyIdentity';
import { DocumentItemsPanel } from './features/processes/DocumentItemsPanel';
import { RecentDocumentsPanel } from './features/processes/RecentDocumentsPanel';
import { CustomersDashboard } from './features/customers/CustomersDashboard';
import { CommercialDashboard } from './features/commercial/CommercialDashboard';
import { ReceivablesDashboard } from './features/receivables/ReceivablesDashboard';
import { ProfitabilityDashboard } from './features/profitability/ProfitabilityDashboard';
import { AccessContext } from './features/access/AccessContext';
import { accessRequest, sessionUser, setSellerScope } from './features/access/accessApi';
import { ControlOverview } from './features/control/ControlOverview';
import { SellerCatalogProvider, SellerDescription, ExecutiveSellerPicker } from './features/sellers/SellerCatalogProvider';
const CollectionsControl = lazy(() => import('./features/collections/CollectionsControl').then(module => ({ default: module.CollectionsControl })));
const MaturitiesDashboard = lazy(() => import('./features/maturities/MaturitiesDashboard').then(module => ({ default: module.MaturitiesDashboard })));
import { UserAdministration } from './features/access/UserAdministration';
import { BasicLogin } from './features/access/BasicLogin';
import type { BasicAccessUser } from './features/access/basicAccess';
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
import './Sidebar.css';
import './ModuleHeader.css';
import './SettingsModal.css';
import './WorkspacePanels.css';

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
  siblings: SaeSalesFlowNode[],
): Node {
  const stages = { Quotation: 0, Order: 1, Delivery: 2, Invoice: 3 };
  const column = siblings.filter(item => item.kind === document.kind);
  const row = column.findIndex(item => item.id === document.id);
  const maxRows = Math.max(...Object.keys(stages).map(kind => siblings.filter(item => item.kind === kind).length));
  return {
    id: document.id,
    position: {
      x: 30 + stages[document.kind] * 275,
      y: 40 + (row + (maxRows - column.length) / 2) * 260,
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

          <small>Vendedor: <SellerDescription code={document.salespersonCode} inline /></small>
          <small>Almacén: {document.warehouseNumber ?? 'N/D'}</small>

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = window.localStorage.getItem('opervia.sidebarCollapsed');
    return saved === null ? window.innerWidth <= 860 : saved === 'true';
  });
  const [sidebarTextVisible, setSidebarTextVisible] = useState(() => window.localStorage.getItem('opervia.sidebarCollapsed') === 'false' || (window.localStorage.getItem('opervia.sidebarCollapsed') === null && window.innerWidth > 860));
  const sidebarRevealTimer = useRef<number | null>(null);
  const sidebarDesiredOpen = useRef(!sidebarCollapsed);
  useEffect(() => () => { if (sidebarRevealTimer.current !== null) window.clearTimeout(sidebarRevealTimer.current); }, []);
  const toggleSidebar = () => {
    if (sidebarRevealTimer.current !== null) window.clearTimeout(sidebarRevealTimer.current);
    sidebarDesiredOpen.current = !sidebarDesiredOpen.current;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setSidebarTextVisible(false);
    if (sidebarDesiredOpen.current) {
      setSidebarCollapsed(false);
      if (reducedMotion) setSidebarTextVisible(true);
      else sidebarRevealTimer.current = window.setTimeout(() => setSidebarTextVisible(true), 275);
    } else {
      if (reducedMotion) setSidebarCollapsed(true);
      else sidebarRevealTimer.current = window.setTimeout(() => setSidebarCollapsed(true), 110);
    }
  };
  useEffect(() => { window.localStorage.setItem('opervia.sidebarCollapsed', String(sidebarCollapsed)); }, [sidebarCollapsed]);
  const flowRequestRef = useRef<AbortController | null>(null);
  const itemsRequestRef = useRef<AbortController | null>(null);
  const aiRequestRef = useRef<AbortController | null>(null);

  const location = useLocation();
  const navigate = useNavigate();
  const route = resolveAppRoute(location.pathname);
  const isConnectionOpen = !!route?.settings;
  const settingsSection = route?.settings ?? 'connection';
  const currentPath = `${location.pathname}${location.search}${location.hash}`;
  const settingsReturnPath = safeReturnPath(new URLSearchParams(location.search).get('desde'), false);
  const activeView = isConnectionOpen ? resolveAppRoute(settingsReturnPath.split(/[?#]/)[0])!.view : route?.view ?? 'control';
  function openSettings(section: SettingsSection = 'connection') {
    const from = isConnectionOpen ? settingsReturnPath : safeReturnPath(currentPath, false);
    navigate(`${settingsPaths[section]}?${new URLSearchParams({ desde: from })}`);
  }
  function closeSettings() { navigate(settingsReturnPath); }
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
  const [basicUser, setBasicUser] = useState<BasicAccessUser | null>(null);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [selectedSeller, setSelectedSeller] = useState('');
  const isAdmin = basicUser?.role === 'Administrador';
  const isExecutive = basicUser?.role === 'Ejecutivo';
  useEffect(() => {
    const titles = { control: 'Centro de control', flows: 'Flujos', receivables: 'Cuentas por cobrar', collections: 'Control Cobranza', maturities: 'Programación de vencimientos', profitability: 'Rentabilidad', commercial: 'Comercial', customers: 'Clientes', ai: 'Chat IA' };
    document.title = `${location.pathname === loginPath ? 'Iniciar sesión' : isConnectionOpen ? 'Configuración' : titles[activeView]} · Opervia`;
  }, [activeView, isConnectionOpen, location.pathname]);
  function applyUser(user: BasicAccessUser | null) {
    const seller = user?.role === 'Ejecutivo' && user.sellerCodes.length === 1 ? user.sellerCodes[0] : '';
    setSellerScope(seller); setSelectedSeller(seller); setBasicUser(user);
    setActiveConnection(null);
    clearFlowState(); clearDocumentItemsState(); setAiAnswer(null);
  }
  useEffect(() => {
    window.localStorage.removeItem('opervia.basicUser');
    let alive = true;
    void sessionUser().then(user => { if (alive) applyUser(user); }).catch(() => {}).finally(() => { if (alive) setSessionChecking(false); });
    const expired = () => applyUser(null);
    window.addEventListener('opervia-session-expired', expired);
    return () => { alive = false; window.removeEventListener('opervia-session-expired', expired); };
  }, []);
  useEffect(() => {
    if (!basicUser) return;
    const check = () => void sessionUser().then(user => { if (!user) applyUser(null); }).catch(() => {});
    const interval = window.setInterval(check, 60_000);
    const visible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', visible);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', visible); };
  }, [basicUser]);

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
  const [selectedDocument, setSelectedDocument] = useState<SaeSalesFlowNode | null>(null);
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

  useEffect(() => {
    window.localStorage.setItem('opervia.taxDisplayMode', taxDisplayMode);
    if (flowResult) {
      setFlowNodes(flowResult.nodes.map((node) =>
        createReactFlowNode(node, taxDisplayMode, flowResult.nodes)));
    }
  }, [flowResult, taxDisplayMode]);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.style.colorScheme = themeMode;
    window.localStorage.setItem('opervia.themeMode', themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (!basicUser) return;
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
  }, [basicUser]);

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
    closeSettings();
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

      openSettings();
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
        (node) => createReactFlowNode(node, taxDisplayMode, result.nodes),
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

      openSettings();
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

    setSelectedDocument(flowResult?.nodes.find(item => item.id === node.id) ?? null);
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

      if (itemsRequestRef.current === requestController) setDocumentItemsResult(result);
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

  if (sessionChecking) return <main className="basic-login"><p role="status">Comprobando tu sesión…</p></main>;
  const canonicalPath = location.pathname.replace(/\/+$/, '') || modulePaths.control;
  if (canonicalPath !== location.pathname) return <Navigate replace to={`${canonicalPath}${location.search}${location.hash}`} />;
  if (location.pathname === '/configuracion') return <Navigate replace to={`${settingsPaths.connection}${location.search}`} />;
  if (!route && location.pathname !== loginPath) return <Navigate replace to={modulePaths.control} />;
  if (!basicUser) {
    if (location.pathname !== loginPath) return <Navigate replace to={`${loginPath}?${new URLSearchParams({ volver: currentPath })}`} />;
    return <BasicLogin onLogin={applyUser} />;
  }
  if (location.pathname === loginPath) return <Navigate replace to={safeReturnPath(new URLSearchParams(location.search).get('volver'))} />;
  if (route && !canOpenRoute(route, basicUser.role)) return <Navigate replace to={modulePaths.control} />;
  if (isConnectionOpen && !canOpenRoute(resolveAppRoute(settingsReturnPath.split(/[?#]/)[0])!, basicUser.role)) return <Navigate replace to={settingsPaths[settingsSection]} />;

  return (
    <AccessContext.Provider value={basicUser}><CompanyProvider connection={activeConnection}><SellerCatalogProvider key={basicUser.id} connection={activeConnection}><div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'} ${sidebarTextVisible ? '' : 'sidebar-text-hidden'}`}>
      <aside className="sidebar" aria-label="Menú principal">
        <div className="brand">
          <button type="button" className="sidebar-toggle" aria-expanded={sidebarDesiredOpen.current} aria-controls="opervia-navigation" aria-label={sidebarDesiredOpen.current ? 'Contraer menú' : 'Expandir menú'} title={sidebarDesiredOpen.current ? 'Contraer menú' : 'Expandir menú'} onClick={toggleSidebar}>
            <Menu size={22} />
          </button>
          <div className="brand-name">
            <strong title={basicUser.name}>{basicUser.name}</strong>
          </div>
        </div>

        <nav className="sidebar-nav" id="opervia-navigation" aria-label="Módulos">
          <Link title="Centro de control" aria-label="Centro de control"
            className={`nav-item ${
              activeView === 'control' ? 'active' : ''
            }`}
            to={modulePaths.control} aria-current={activeView === 'control' && !isConnectionOpen ? 'page' : undefined}
          >
            <LayoutDashboard size={19} />
            <span>Centro de control</span>
          </Link>

          <Link title="Flujos" aria-label="Flujos"
            className={`nav-item ${activeView === 'flows' ? 'active' : ''}`}
            to={modulePaths.flows} aria-current={activeView === 'flows' && !isConnectionOpen ? 'page' : undefined}
          >
            <Activity size={19} />
            <span>Flujos</span>
          </Link>

          <Link title="Cuentas por cobrar" aria-label="Cuentas por cobrar"
            className={`nav-item ${
              activeView === 'receivables' ? 'active' : ''
            }`}
            to={modulePaths.receivables} aria-current={activeView === 'receivables' && !isConnectionOpen ? 'page' : undefined}
          >
            <WalletCards size={19} />
            <span>Cuentas por cobrar</span>
          </Link>

          <Link title="Control Cobranza" aria-label="Control Cobranza" className={`nav-item ${activeView === 'collections' ? 'active' : ''}`} to={modulePaths.collections} aria-current={activeView === 'collections' && !isConnectionOpen ? 'page' : undefined}>
            <ShieldCheck size={19} /><span>Control Cobranza</span>
          </Link>

          <Link title="Programación de vencimientos" aria-label="Programación de vencimientos" className={`nav-item ${activeView === 'maturities' ? 'active' : ''}`} to={modulePaths.maturities} aria-current={activeView === 'maturities' && !isConnectionOpen ? 'page' : undefined}>
            <CalendarClock size={19} /><span>Programación de vencimientos</span>
          </Link>

          {!isExecutive && <Link title="Rentabilidad" aria-label="Rentabilidad"
            className={`nav-item ${
              activeView === 'profitability' ? 'active' : ''
            }`}
            to={modulePaths.profitability} aria-current={activeView === 'profitability' && !isConnectionOpen ? 'page' : undefined}
          >
            <TrendingUp size={19} />
            <span>Rentabilidad</span>
          </Link>}          <Link title="Comercial" aria-label="Comercial" className={`nav-item ${activeView === 'commercial' ? 'active' : ''}`} to={modulePaths.commercial} aria-current={activeView === 'commercial' && !isConnectionOpen ? 'page' : undefined}>
            <BarChart3 size={19} /><span>Comercial</span>
          </Link>



          <Link title="Clientes" aria-label="Clientes"
            className={`nav-item ${activeView === 'customers' ? 'active' : ''}`}
            to={modulePaths.customers} aria-current={activeView === 'customers' && !isConnectionOpen ? 'page' : undefined}
          >
            <UsersRound size={19} />
            <span>Clientes</span>
          </Link>

          {!isExecutive && <Link title="Chat IA" aria-label="Chat IA" className={`nav-item ${activeView === 'ai' ? 'active' : ''}`} to={modulePaths.ai} aria-current={activeView === 'ai' && !isConnectionOpen ? 'page' : undefined}>
            <Bot size={19} /><span>Chat IA</span>
          </Link>}
          <div className="nav-separator" />

          {isAdmin && <Link title="Configuración" aria-label="Configuración"
            className={`nav-item ${isConnectionOpen ? 'active' : ''}`}
            to={`${settingsPaths.connection}?${new URLSearchParams({ desde: isConnectionOpen ? settingsReturnPath : safeReturnPath(currentPath, false) })}`} aria-current={isConnectionOpen ? 'page' : undefined}
          >
            <Settings size={19} />
            <span>Configuración</span>
          </Link>}


        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-logout" title="Cerrar sesión" aria-label="Cerrar sesión"
            onClick={() => {
              void accessRequest('logout', { method: 'POST' }).then(() => applyUser(null)).catch(() => applyUser(null));
            }}
          >
            <LogOut size={15} /><span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      <main className="main-content" key={`${basicUser.id}:${selectedSeller}`}>
        <header className="module-header">
          <h1>{activeView === 'control' ? 'Operación de hoy' : activeView === 'flows' ? 'Flujos operativos' : activeView === 'receivables' ? 'Cuentas por cobrar' : activeView === 'collections' ? 'Control Cobranza' : activeView === 'maturities' ? 'Programación de vencimientos' : activeView === 'profitability' ? 'Rentabilidad comercial' : activeView === 'commercial' ? 'Facturación por marca' : activeView === 'customers' ? 'Clientes' : 'Chat IA'}</h1>
          <div className="module-header-actions">
            <CompanyBadge />
            <button type="button" className="header-theme-toggle" onClick={() => setThemeMode(current => current === 'dark' ? 'light' : 'dark')}
              aria-label={`Cambiar a modo ${themeMode === 'dark' ? 'claro' : 'oscuro'}`}
              title={`Cambiar a modo ${themeMode === 'dark' ? 'claro' : 'oscuro'}`}>
              {themeMode === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
              <span>{themeMode === 'dark' ? 'Modo claro' : 'Modo oscuro'}</span>
            </button>
          </div>
        </header>
        {isExecutive && <ExecutiveSellerPicker codes={basicUser.sellerCodes} value={selectedSeller} onChange={value => {
            setSellerScope(value); setSelectedSeller(value);
            flowRequestRef.current?.abort(); itemsRequestRef.current?.abort(); clearFlowState(); clearDocumentItemsState();
          }} />}
        {activeView === 'control' ? (
          <section className="control-home">
            <ControlOverview connection={activeConnection} usersOpen={!!route?.users && !isConnectionOpen} onUsersOpenChange={open => navigate(open ? usersPath : modulePaths.control)} />
          </section>
        ) : activeView === 'flows' ? (
          <>
        {flowError && (
          <div className="flow-error-banner">
            {flowError}
          </div>
        )}

        {activeConnection && (
          <RecentDocumentsPanel
            connection={activeConnection}
            onSelectDocument={(kind, number) => {
              void handleRecentDocumentSelect(kind, number);
            }}
          />
        )}

        {flowResult && flowResult.warnings.length > 0 && <div className="flow-error-banner" role="status">
          {flowResult.warnings.map(warning => <p key={warning}>{warning}</p>)}
        </div>}
        {isLoadingFlow && <p role="status">Buscando los documentos relacionados…</p>}
        <section className="workspace-grid control-workspace">
          <article className="panel flow-panel">
            <div className="panel-header">
              <div>

                <h2>{flowTitle}</h2>
              </div>

              <span>Selecciona un documento para ver su detalle</span>
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
                minZoom={0.52}
                maxZoom={1.55}
                nodesDraggable={false}
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


        </section>
          </>
        ) : activeView === 'ai' ? (
          <section className="ai-module">
          <aside className="panel copilot-panel">
            <div className="copilot-heading">
              <div className="copilot-icon">
                <Bot size={22} />
              </div>

              <div>

                <h2>Opervia AI</h2>
                <small className="local-ai-badge">
                  LOCAL · SIN COSTO
                </small>
                <small className="readonly-ai-badge">
                  SAE · SOLO LECTURA
                </small>
              </div>

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
        ) : activeView === 'commercial' ? (
          <CommercialDashboard connection={activeConnection} onRequestConnection={() => { if (isAdmin) openSettings(); }} />
        ) : activeView === 'collections' ? (
          <Suspense fallback={<p role="status">Abriendo control de cobranza…</p>}><CollectionsControl connection={activeConnection} onRequestConnection={() => { if (isAdmin) openSettings(); }} /></Suspense>
        ) : activeView === 'maturities' ? (
          <Suspense fallback={<p role="status">Abriendo programación de vencimientos…</p>}><MaturitiesDashboard connection={activeConnection} onRequestConnection={() => { if (isAdmin) openSettings(); }} /></Suspense>
        ) : activeView === 'customers' ? (
          <CustomersDashboard
            connection={activeConnection}
             onRequestConnection={() => { if (isAdmin) openSettings(); }}
          />
        ) : activeView === 'receivables' ? (
          <ReceivablesDashboard
            connection={activeConnection}
            initialDocumentNumber={receivableDocumentNumber}
            onRequestConnection={() => { if (isAdmin) openSettings(); }}
            taxDisplayMode={taxDisplayMode}
            onTaxDisplayModeChange={setTaxDisplayMode}
          />
        ) : (
          <ProfitabilityDashboard
            connection={activeConnection}
            taxDisplayMode={taxDisplayMode}
            onRequestConnection={() => { if (isAdmin) openSettings(); }}
          />
        )}
      </main>

      {isAdmin && isConnectionOpen && (
        <div
          className="connection-modal-backdrop"
          role="presentation"
          onMouseDown={() =>
            closeSettings()
          }
        >
          <div
            className="connection-modal-content"
            role="dialog"
            aria-modal="true"
            aria-label="Configuración"
            onMouseDown={(event) =>
              event.stopPropagation()
            }
          >
            <div className="settings-modal-heading">
              <h2>Configuración</h2>
              <button type="button" onClick={() => closeSettings()} aria-label="Cerrar configuración" title="Cerrar"><X size={20} /></button>
            </div>
            <div className="settings-modal-layout">
              <nav className="settings-modal-nav" aria-label="Apartados de configuración">
                <button type="button" className={settingsSection === 'connection' ? 'active' : ''} aria-current={settingsSection === 'connection' ? 'page' : undefined} onClick={() => openSettings('connection')}><Database size={18} /> Conexión</button>
                <button type="button" className={settingsSection === 'users' ? 'active' : ''} aria-current={settingsSection === 'users' ? 'page' : undefined} onClick={() => openSettings('users')}><UsersRound size={18} /> Usuarios</button>
                <button type="button" className={settingsSection === 'permissions' ? 'active' : ''} aria-current={settingsSection === 'permissions' ? 'page' : undefined} onClick={() => openSettings('permissions')}><ShieldCheck size={18} /> Permisos</button>
              </nav>
              <div className="settings-modal-panel">
                {settingsSection === 'connection' ? <SaeConnectionForm onSubmit={handleConnectionSubmit} /> : settingsSection === 'users' ? <UserAdministration /> :
                  <section className="settings-modal-empty" aria-label="Permisos">
                    <h3>Permisos</h3>
                  </section>}
              </div>
            </div>
          </div>
        </div>
      )}

      {isItemsPanelOpen && (
        <DocumentItemsPanel
          document={selectedDocument}
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
    </div></SellerCatalogProvider></CompanyProvider></AccessContext.Provider>
  );
}

export default App;
