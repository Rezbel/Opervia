from pathlib import Path
p=Path('src/Opervia.Web/src/App.tsx');s=p.read_text(encoding='utf-8-sig')
s=s.replace('  useMemo,\n','').replace('  type CSSProperties,\n','')
a=s.index('  const insights = useMemo(');b=s.index('  useEffect(',a);s=s[:a]+s[b:]
a=s.index('        {flowResult && insights && (');b=s.index('        {flowResult && flowResult.warnings',a);s=s[:a]+s[b:]
s=s.replace('  const row = column.findIndex(item => item.id === document.id);','  const row = column.findIndex(item => item.id === document.id);\n  const maxRows = Math.max(...Object.keys(stages).map(kind => siblings.filter(item => item.kind === kind).length));')
s=s.replace('y: 40 + row * 170,','y: 40 + (row + (maxRows - column.length) / 2) * 260,')
s=s.replace('      setDocumentItemsResult(result);','      if (itemsRequestRef.current === requestController) setDocumentItemsResult(result);')
s=s.replace('''        <section className="workspace-grid control-workspace">''','''        {isLoadingFlow && <p role="status">Buscando los documentos relacionados…</p>}
        <section className="workspace-grid control-workspace">''')
p.write_text(s,encoding='utf-8')
p=Path('src/Opervia.Web/src/features/processes/DocumentItemsPanel.css');s=p.read_text(encoding='utf-8-sig');s+='\n.document-items-list { flex: 1 0 auto; overflow: visible; }\n';p.write_text(s,encoding='utf-8')
