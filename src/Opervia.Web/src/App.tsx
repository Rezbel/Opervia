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

import '@xyflow/react/dist/style.css';
import './App.css';

const nodeBaseStyle = {
  width: 180,
  minHeight: 86,
  padding: 0,
  borderRadius: 16,
  border: '1px solid rgba(148, 163, 184, 0.18)',
  background: '#111827',
  color: '#f8fafc',
  boxShadow: '0 14px 30px rgba(0, 0, 0, 0.22)',
};

const nodes: Node[] = [
  {
    id: 'quote',
    position: { x: 20, y: 145 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: nodeBaseStyle,
    data: {
      label: (
        <div className="process-node">
          <span className="node-kicker">COTIZACIÓN</span>
          <strong>C-00418</strong>
          <small>$128,500.00</small>
          <span className="node-status completed">Completada</span>
        </div>
      ),
    },
  },
  {
    id: 'order',
    position: { x: 260, y: 145 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: nodeBaseStyle,
    data: {
      label: (
        <div className="process-node">
          <span className="node-kicker">PEDIDO</span>
          <strong>P-00983</strong>
          <small>5 productos</small>
          <span className="node-status warning">Surtido parcial</span>
        </div>
      ),
    },
  },
  {
    id: 'delivery',
    position: { x: 500, y: 70 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: nodeBaseStyle,
    data: {
      label: (
        <div className="process-node">
          <span className="node-kicker">REMISIÓN</span>
          <strong>R-00552</strong>
          <small>Entrega parcial</small>
          <span className="node-status active">En proceso</span>
        </div>
      ),
    },
  },
  {
    id: 'stock',
    position: { x: 500, y: 220 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: {
      ...nodeBaseStyle,
      border: '1px solid rgba(245, 158, 11, 0.48)',
    },
    data: {
      label: (
        <div className="process-node">
          <span className="node-kicker">INVENTARIO</span>
          <strong>ACET-001</strong>
          <small>Faltan 3 unidades</small>
          <span className="node-status warning">Requiere atención</span>
        </div>
      ),
    },
  },
  {
    id: 'invoice',
    position: { x: 740, y: 70 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: nodeBaseStyle,
    data: {
      label: (
        <div className="process-node">
          <span className="node-kicker">FACTURA</span>
          <strong>F-01872</strong>
          <small>$128,500.00</small>
          <span className="node-status completed">Emitida</span>
        </div>
      ),
    },
  },
  {
    id: 'payment',
    position: { x: 980, y: 70 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: {
      ...nodeBaseStyle,
      border: '1px solid rgba(239, 68, 68, 0.48)',
    },
    data: {
      label: (
        <div className="process-node">
          <span className="node-kicker">CUENTA POR COBRAR</span>
          <strong>$48,500.00</strong>
          <small>8 días de atraso</small>
          <span className="node-status danger">Vencida</span>
        </div>
      ),
    },
  },
];

const edges: Edge[] = [
  {
    id: 'quote-order',
    source: 'quote',
    target: 'order',
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
  },
  {
    id: 'order-delivery',
    source: 'order',
    target: 'delivery',
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
  },
  {
    id: 'order-stock',
    source: 'order',
    target: 'stock',
    markerEnd: { type: MarkerType.ArrowClosed },
  },
  {
    id: 'delivery-invoice',
    source: 'delivery',
    target: 'invoice',
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
  },
  {
    id: 'invoice-payment',
    source: 'invoice',
    target: 'payment',
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
  },
];

function App() {
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

          <button className="nav-item">
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
              <strong>SAE sincronizado</strong>
              <small>Hace 2 minutos</small>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <span className="eyebrow">CENTRO DE CONTROL</span>
            <h1>Visión operativa</h1>
          </div>

          <div className="topbar-actions">
            <label className="global-search">
              <Search size={18} />
              <input
                type="search"
                placeholder="Buscar factura, pedido, cliente o producto..."
              />
            </label>

            <button className="company-selector">
              <Building2 size={18} />
              <div>
                <small>Empresa activa</small>
                <strong>Demo SAE · Empresa 15</strong>
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
              <span>Ventas en proceso</span>
              <strong>24</strong>
              <small>8 requieren atención</small>
            </div>
          </article>

          <article className="metric-card">
            <div className="metric-icon">
              <WalletCards size={21} />
            </div>
            <div>
              <span>Saldo pendiente</span>
              <strong>$824,350</strong>
              <small>$148,500 vencidos</small>
            </div>
          </article>

          <article className="metric-card">
            <div className="metric-icon">
              <Boxes size={21} />
            </div>
            <div>
              <span>Alertas de inventario</span>
              <strong>17</strong>
              <small>5 con prioridad alta</small>
            </div>
          </article>

          <article className="metric-card">
            <div className="metric-icon">
              <Activity size={21} />
            </div>
            <div>
              <span>Operaciones completas</span>
              <strong>92%</strong>
              <small>+4.8% contra el mes anterior</small>
            </div>
          </article>
        </section>

        <section className="workspace-grid">
          <article className="panel flow-panel">
            <div className="panel-header">
              <div>
                <span className="eyebrow">FLUJO SELECCIONADO</span>
                <h2>Venta de Industrias del Centro</h2>
              </div>

              <button className="secondary-button">Ver expediente</button>
            </div>

            <div className="flow-canvas">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                fitView
                fitViewOptions={{ padding: 0.18 }}
                nodesDraggable
                nodesConnectable={false}
                elementsSelectable
                proOptions={{ hideAttribution: true }}
              >
                <Background gap={24} size={1} />
                <Controls position="bottom-left" />
                <MiniMap
                  pannable
                  zoomable
                  nodeColor={(node) =>
                    node.id === 'payment'
                      ? '#ef4444'
                      : node.id === 'stock'
                        ? '#f59e0b'
                        : '#4f7cff'
                  }
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
                <span className="eyebrow">COPILOTO OPERATIVO</span>
                <h2>Opervia AI</h2>
              </div>
            </div>

            <div className="copilot-message user-message">
              ¿Por qué esta venta sigue abierta?
            </div>

            <div className="copilot-message ai-message">
              <strong>Encontré dos causas.</strong>
              <p>
                El pedido P-00983 tiene una partida con existencia insuficiente
                y la factura F-01872 conserva un saldo vencido de $48,500.
              </p>

              <div className="ai-findings">
                <span>Inventario insuficiente</span>
                <span>Factura vencida</span>
              </div>
            </div>

            <div className="copilot-input">
              <input placeholder="Pregunta sobre esta operación..." />
              <button aria-label="Enviar consulta">
                <Bot size={18} />
              </button>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}

export default App;
