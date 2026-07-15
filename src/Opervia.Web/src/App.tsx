import {
  useState,
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
  WalletCards,
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
import { getSalesFlow } from './lib/saeApi';

import type {
  SaeConnectionRequest,
  SaeDocumentKind,
  SaeSalesFlowNode,
  SaeSalesFlowResult,
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

function createReactFlowNode(
  document: SaeSalesFlowNode,
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

          <small>
            Cliente {document.customerCode}
          </small>

          <small>
            {formatCurrency(document.amount)}
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
  const [isConnectionOpen, setIsConnectionOpen] =
    useState(false);

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

  function handleConnectionSubmit(
    connection: SaeConnectionRequest,
  ) {
    setActiveConnection(connection);

    setActiveConnectionName(
      `${connection.displayName} · Empresa ${connection.companyNumber}`,
    );

    setFlowError(null);
    setIsConnectionOpen(false);
  }

  async function handleFlowSearch(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setFlowError(null);

    if (!activeConnection) {
      setFlowError(
        'Primero configura una conexión con Aspel SAE.',
      );

      setIsConnectionOpen(true);
      return;
    }

    const normalizedDocumentNumber =
      documentNumber.trim();

    const documentKind =
      detectDocumentKind(normalizedDocumentNumber);

    if (!documentKind) {
      setFlowError(
        'El documento debe comenzar con C, P, R o F.',
      );
      return;
    }

    setIsLoadingFlow(true);

    try {
      const result = await getSalesFlow(
        activeConnection,
        documentKind,
        normalizedDocumentNumber,
      );

      const nodes = result.nodes.map(
        createReactFlowNode,
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
      setFlowError(
        error instanceof Error
          ? error.message
          : 'No fue posible cargar el flujo.',
      );
    } finally {
      setIsLoadingFlow(false);
    }
  }

  const flowTitle = flowResult
    ? `Flujo real · ${flowResult.startingDocumentNumber}`
    : 'Flujo demostrativo';

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
          <button className="nav-item active">
            <LayoutDashboard size={19} />
            <span>Centro de control</span>
          </button>

          <button className="nav-item">
            <Activity size={19} />
            <span>Flujos de ventas</span>
          </button>

          <button className="nav-item">
            <WalletCards size={19} />
            <span>Cuentas por cobrar</span>
          </button>

          <button className="nav-item">
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
          <div className="sync-indicator">
            <span />

            <div>
              <strong>
                {activeConnection
                  ? 'Conexión configurada'
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

            {activeConnection &&
              !flowResult &&
              !isLoadingFlow && (
                <div className="copilot-message ai-message">
                  <strong>Conexión preparada.</strong>

                  <p>
                    Busca un documento para reconstruir
                    automáticamente su recorrido.
                  </p>
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

            {flowResult && (
              <div className="copilot-message ai-message">
                <strong>
                  Flujo real reconstruido.
                </strong>

                <p>
                  Encontré {flowResult.nodes.length}{' '}
                  documentos relacionados en{' '}
                  {flowResult.elapsedMilliseconds} ms.
                </p>

                <div className="ai-findings">
                  {flowResult.warnings.length === 0 ? (
                    <span>Sin inconsistencias</span>
                  ) : (
                    flowResult.warnings.map(
                      (warning) => (
                        <span key={warning}>
                          {warning}
                        </span>
                      ),
                    )
                  )}
                </div>
              </div>
            )}

            <div className="copilot-input">
              <input
                placeholder="Pregunta sobre esta operación..."
                disabled={!flowResult}
              />

              <button
                aria-label="Enviar consulta"
                disabled={!flowResult}
              >
                <Bot size={18} />
              </button>
            </div>
          </aside>
        </section>
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
    </div>
  );
}

export default App;
