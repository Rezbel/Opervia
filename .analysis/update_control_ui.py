from pathlib import Path
r=Path.cwd()
def edit(p,a,b):
 q=r/p;s=q.read_text(encoding='utf-8-sig');assert a in s,p;q.write_text(s.replace(a,b),encoding='utf-8')
p=r/'src/Opervia.Web/src/App.tsx';s=p.read_text(encoding='utf-8-sig')
s=s.replace('  CircleDollarSign,\n','').replace("'profitability' | 'inventory'>", "'profitability' | 'inventory' | 'ai'>")
a=s.index('        <section className="metrics-grid">');b=s.index('        {flowError',a);s=s[:a]+s[b:]
a=s.index('          <aside className="panel copilot-panel">');b=s.index('          </aside>',a)+len('          </aside>');chat=s[a:b];s=s[:a]+s[b:]
s=s.replace("        ) : activeView === 'flows' ? (",'''        ) : activeView === 'ai' ? (
          <section className="ai-module">
            <header className="topbar"><div><span className="eyebrow">ASISTENTE</span><h1>Chat IA</h1></div>
              <button className="secondary-button" onClick={() => setIsConnectionOpen(true)}>Conexión SAE</button>
            </header>
'''+chat+'''\n          </section>
        ) : activeView === 'flows' ? (''')
s=s.replace('          <div className="nav-separator" />','''          <button className={`nav-item ${activeView === 'ai' ? 'active' : ''}`} onClick={() => setActiveView('ai')}>
            <Bot size={19} /><span>Chat IA</span>
          </button>
          <div className="nav-separator" />''')
s=s.replace('className="workspace-grid"','className="workspace-grid control-workspace"')
s=s.replace('''              <button className="secondary-button">
                Ver expediente
              </button>''','''              <span>Selecciona un documento para ver su detalle</span>''')
s=s.replace('  taxDisplayMode: TaxDisplayMode,\n): Node {','  taxDisplayMode: TaxDisplayMode,\n  siblings: SaeSalesFlowNode[],\n): Node {\n  const stages = { Quotation: 0, Order: 1, Delivery: 2, Invoice: 3 };\n  const column = siblings.filter(item => item.kind === document.kind);\n  const row = column.findIndex(item => item.id === document.id);')
s=s.replace('x: 30 + document.sequence * 245,\n      y: 145,','x: 30 + stages[document.kind] * 275,\n      y: 40 + row * 170,')
s=s.replace('createReactFlowNode(node, taxDisplayMode)))','createReactFlowNode(node, taxDisplayMode, flowResult.nodes)))')
s=s.replace('createReactFlowNode(node, taxDisplayMode),','createReactFlowNode(node, taxDisplayMode, result.nodes),')
s=s.replace('  const [isItemsPanelOpen, setIsItemsPanelOpen]', '  const [selectedDocument, setSelectedDocument] = useState<SaeSalesFlowNode | null>(null);\n  const [isItemsPanelOpen, setIsItemsPanelOpen]')
s=s.replace('    setIsItemsPanelOpen(true);','    setSelectedDocument(flowResult?.nodes.find(item => item.id === node.id) ?? null);\n    setIsItemsPanelOpen(true);')
s=s.replace('          result={documentItemsResult}','          document={selectedDocument}\n          result={documentItemsResult}')
s=s.replace('                nodesDraggable','                minZoom={0.1}\n                nodesDraggable={false}')
# Retain actionable graph warnings outside removed dashboard metrics.
s=s.replace('        <section className="workspace-grid control-workspace">','''        {flowResult && flowResult.warnings.length > 0 && <div className="flow-error-banner" role="status">
          {flowResult.warnings.map(warning => <p key={warning}>{warning}</p>)}
        </div>}
        <section className="workspace-grid control-workspace">''')
p.write_text(s,encoding='utf-8')
p=r/'src/Opervia.Web/src/features/processes/RecentDocumentsPanel.tsx';s=p.read_text(encoding='utf-8-sig')
s=s.replace("type KindFilter = 'all' | SaeDocumentKind;\n",'').replace("  const [kind, setKind] = useState<KindFilter>('all');\n",'')
s=s.replace("useState<PeriodPreset>('today')","useState<PeriodPreset>('30days')")
s=s.replace('        controller.signal,','        controller.signal,\n        \'Order\',')
s=s.replace("if (kind !== 'all' && document.kind !== kind) return false;","if (document.kind !== 'Order') return false;").replace('[documents, kind, query]','[documents, query]')
a=s.index('        <select');b=s.index('        </select>',a)+len('        </select>');s=s[:a]+s[b:]
s=s.replace('DOCUMENTOS DEL PERIODO','PEDIDOS DEL PERIODO').replace('Selecciona cualquier documento para reconstruir y consultar su flujo.','Selecciona un pedido para consultar sus remisiones y facturas relacionadas.').replace('{visibleDocuments.length} documentos','{visibleDocuments.length} pedidos').replace('Buscar documento, cliente o vendedor','Buscar pedido, cliente o vendedor')
s=s.replace('<h2>Actividad reciente</h2>','<h2>Actividad reciente · Pedidos</h2>')
s=s.replace('<div className="recent-documents-toolbar">','<p>Se muestran hasta 200 pedidos recientes del período seleccionado.</p>\n      <div className="recent-documents-toolbar">')
p.write_text(s,encoding='utf-8')
p=r/'src/Opervia.Web/src/lib/saeApi.ts';s=p.read_text(encoding='utf-8-sig');a=s.index('export async function getSalesFlowSummary(');b=s.index('export async function ',a+20);chunk=s[a:b].replace('  signal?: AbortSignal,','  signal?: AbortSignal,\n  documentKind?: SaeDocumentKind,').replace('  const params = new URLSearchParams({ from, to });','  const params = new URLSearchParams({ from, to });\n  if (documentKind) params.set(\'documentKind\', documentKind);');s=s[:a]+chunk+s[b:];p.write_text(s,encoding='utf-8')
edit('src/Opervia.Web/src/types/sae.ts','export interface SaeSalesFlowNode {','export interface SaeSalesFlowNode {\n  warehouseNumber?: number | null;\n  salespersonCode?: string | null;')
p=r/'src/Opervia.Web/src/features/processes/DocumentItemsPanel.tsx';s=p.read_text(encoding='utf-8-sig').replace('  SaeDocumentItemsResult,','  SaeDocumentItemsResult,\n  SaeSalesFlowNode,').replace('interface DocumentItemsPanelProps {','interface DocumentItemsPanelProps {\n  document?: SaeSalesFlowNode | null;').replace('export function DocumentItemsPanel({','export function DocumentItemsPanel({\n  document,')
s=s.replace('      {isLoading && (','''      {document && <section className="document-context" aria-label="Información del documento">
        <h3>{document.documentNumber}</h3>
        <dl>
          <div><dt>Cliente</dt><dd>{document.customerName || 'Nombre no disponible'} · {document.customerCode}</dd></div>
          <div><dt>RFC</dt><dd>{document.customerRfc || 'No disponible'}</dd></div>
          <div><dt>Fecha</dt><dd>{document.documentDate?.slice(0, 10) || 'No disponible'}</dd></div>
          <div><dt>Estado SAE</dt><dd>{document.status === 'C' ? 'Cancelado' : document.status || 'No disponible'}</dd></div>
          <div><dt>Almacén de cabecera</dt><dd>{document.warehouseNumber ?? 'No disponible'}</dd></div>
          <div><dt>Vendedor</dt><dd>{document.salespersonCode || 'No asignado'}</dd></div>
          <div><dt>Total del documento {taxDisplayMode === 'withTax' ? 'con impuestos' : 'sin impuestos'}</dt>
            <dd>{formatCurrency(taxDisplayMode === 'withTax' ? document.amount : document.amountBeforeTax)}</dd></div>
        </dl>
      </section>}
      {isLoading && (''')
p.write_text(s,encoding='utf-8')
with (r/'src/Opervia.Web/src/App.css').open('a',encoding='utf-8') as f:f.write('''
.control-workspace { grid-template-columns: minmax(0, 1fr); }
.control-workspace .flow-canvas { height: 650px; }
.ai-module { width: 100%; max-width: 1100px; margin: 0 auto; }
.ai-module .copilot-panel { min-height: 65vh; }
.document-context { padding: 18px 24px; border-bottom: 1px solid #64748b40; }
.document-context dl { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.document-context dt { font-size: 12px; color: #8292aa; }
.document-context dd { margin: 4px 0 0; overflow-wrap: anywhere; }
@media(max-width: 600px) { .document-context dl { grid-template-columns: 1fr; } }
''')
