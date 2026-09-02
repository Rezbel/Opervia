import type {
  SaeConnectionRequest,
  SaeDocumentItemsResult,
  SaeDocumentKind,
  SaeSalesFlowResult,
  OperviaAiAnswer,
  SavedSaeConnectionSummary,
  SaeCustomerReceivableMovementsResult,
  SaeReceivableProbeResult,
  SaeReceivableRootResult,
  SaeReceivablesSummaryResult,
  SaeReceivablesSummaryFilters,
  ProfitabilityDashboardResult,
  ManualProfitabilityEntry,
  CreateManualProfitabilityEntry,
  SaeSalesFlowSummaryResult,
  SaeInventoryAnalyticsResult,
} from '../types/sae';

const API_BASE_URL =
  (import.meta.env.VITE_API_URL ?? 'http://localhost:5106')
    .replace(/\/+$/, '');

async function ensureSuccessfulResponse(
  response: Response,
): Promise<void> {
  if (response.ok) {
    return;
  }

  let message = `La API respondió con el código ${response.status}.`;

  try {
    const errorBody = await response.json();
    const candidates = [
      errorBody?.message,
      errorBody?.detail,
      errorBody?.title,
    ];

    const apiMessage = candidates.find(
      (candidate) => typeof candidate === 'string',
    );

    if (typeof apiMessage === 'string') {
      message = apiMessage;
    }
  } catch {
    // La respuesta no contenía JSON válido.
  }

  throw new Error(message);
}

export async function listManualProfitabilityEntries(
  from: string,
  to: string,
  branch?: string,
  signal?: AbortSignal,
): Promise<ManualProfitabilityEntry[]> {
  const params = new URLSearchParams({ from, to });
  if (branch) params.set('branch', branch);
  const response = await fetch(
    `${API_BASE_URL}/api/manual-profitability-entries?${params.toString()}`,
    { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal },
  );
  await ensureSuccessfulResponse(response);
  return (await response.json()) as ManualProfitabilityEntry[];
}

export async function addManualProfitabilityEntry(
  entry: CreateManualProfitabilityEntry,
): Promise<ManualProfitabilityEntry> {
  const response = await fetch(`${API_BASE_URL}/api/manual-profitability-entries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  await ensureSuccessfulResponse(response);
  return (await response.json()) as ManualProfitabilityEntry;
}

export async function deleteManualProfitabilityEntry(id: string): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/manual-profitability-entries/${encodeURIComponent(id)}`,
    { method: 'DELETE', credentials: 'omit', referrerPolicy: 'no-referrer' },
  );
  await ensureSuccessfulResponse(response);
}

export async function listSavedConnections(
  signal?: AbortSignal,
): Promise<SavedSaeConnectionSummary[]> {
  const response = await fetch(`${API_BASE_URL}/api/connections`, {
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    signal,
  });
  await ensureSuccessfulResponse(response);
  return (await response.json()) as SavedSaeConnectionSummary[];
}

export async function saveConnection(
  connection: SaeConnectionRequest,
): Promise<SavedSaeConnectionSummary> {
  const response = await fetch(`${API_BASE_URL}/api/connections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(connection),
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  await ensureSuccessfulResponse(response);
  return (await response.json()) as SavedSaeConnectionSummary;
}

export async function loadSavedConnection(
  id: string,
  signal?: AbortSignal,
): Promise<SaeConnectionRequest> {
  const response = await fetch(
    `${API_BASE_URL}/api/connections/${encodeURIComponent(id)}/use`,
    { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal },
  );
  await ensureSuccessfulResponse(response);
  return (await response.json()) as SaeConnectionRequest;
}

export async function getLastUsedConnection(
  signal?: AbortSignal,
): Promise<SaeConnectionRequest | null> {
  const response = await fetch(`${API_BASE_URL}/api/connections/last-used`, {
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    signal,
  });
  if (response.status === 204) return null;
  await ensureSuccessfulResponse(response);
  return (await response.json()) as SaeConnectionRequest;
}

export async function deleteSavedConnection(id: string): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/connections/${encodeURIComponent(id)}`,
    { method: 'DELETE', credentials: 'omit', referrerPolicy: 'no-referrer' },
  );
  await ensureSuccessfulResponse(response);
}

export async function askOperviaAi(
  question: string,
  companyLabel: string,
  connection: SaeConnectionRequest,
  flow: SaeSalesFlowResult | null,
  documentItems: SaeDocumentItemsResult | null,
  signal?: AbortSignal,
): Promise<OperviaAiAnswer> {
  const response = await fetch(`${API_BASE_URL}/api/ai/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: question.trim(),
      companyLabel,
      connection,
      flow,
      documentItems,
    }),
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    signal,
  });

  await ensureSuccessfulResponse(response);
  return (await response.json()) as OperviaAiAnswer;
}

export async function getSalesFlow(
  connection: SaeConnectionRequest,
  documentKind: SaeDocumentKind,
  documentNumber: string,
  signal?: AbortSignal,
): Promise<SaeSalesFlowResult> {
  const normalizedDocumentNumber = documentNumber.trim();

  if (!normalizedDocumentNumber) {
    throw new Error('El número de documento es obligatorio.');
  }

  const encodedDocumentNumber =
    encodeURIComponent(normalizedDocumentNumber);

  const response = await fetch(
    `${API_BASE_URL}/api/sae/sales-flow/${documentKind}/${encodedDocumentNumber}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(connection),
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal,
    },
  );

  await ensureSuccessfulResponse(response);

  const result =
    (await response.json()) as SaeSalesFlowResult;

  if (!result.isSuccessful) {
    throw new Error(
      result.message || 'No fue posible reconstruir el flujo.',
    );
  }

  return result;
}

export async function getDocumentItems(
  connection: SaeConnectionRequest,
  documentKind: SaeDocumentKind,
  documentNumber: string,
  signal?: AbortSignal,
): Promise<SaeDocumentItemsResult> {
  const normalizedDocumentNumber = documentNumber.trim();

  if (!normalizedDocumentNumber) {
    throw new Error('El número de documento es obligatorio.');
  }

  const encodedDocumentNumber =
    encodeURIComponent(normalizedDocumentNumber);

  const response = await fetch(
    `${API_BASE_URL}/api/sae/document-items/${documentKind}/${encodedDocumentNumber}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(connection),
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal,
    },
  );

  await ensureSuccessfulResponse(response);

  const result =
    (await response.json()) as SaeDocumentItemsResult;

  if (!result.isSuccessful) {
    throw new Error(
      result.message ||
        'No fue posible obtener las partidas.',
    );
  }

  return result;
}

export async function getSalesFlowSummary(
  connection: SaeConnectionRequest,
  from: string,
  to: string,
  seller?: string,
  signal?: AbortSignal,
): Promise<SaeSalesFlowSummaryResult> {
  const params = new URLSearchParams({ from, to });
  if (seller) params.set('seller', seller);
  const response = await fetch(
    `${API_BASE_URL}/api/sae/sales-flow/summary?${params.toString()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(connection),
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal,
    },
  );
  await ensureSuccessfulResponse(response);
  const result = (await response.json()) as SaeSalesFlowSummaryResult;
  if (!result.isSuccessful) {
    throw new Error(result.message || 'No fue posible analizar los flujos de venta.');
  }
  return result;
}

export async function getInventoryAnalytics(
  connection: SaeConnectionRequest,
  from: string,
  to: string,
  filters: { seller?: string; warehouse?: string; line?: string },
  signal?: AbortSignal,
): Promise<SaeInventoryAnalyticsResult> {
  const params = new URLSearchParams({ from, to });
  if (filters.seller) params.set('seller', filters.seller);
  if (filters.warehouse) params.set('warehouse', filters.warehouse);
  if (filters.line) params.set('line', filters.line);
  const response = await fetch(
    `${API_BASE_URL}/api/sae/inventory/analytics?${params.toString()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(connection),
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal,
    },
  );
  await ensureSuccessfulResponse(response);
  const result = (await response.json()) as SaeInventoryAnalyticsResult;
  if (!result.isSuccessful) {
    throw new Error(result.message || 'No fue posible analizar el inventario.');
  }
  return result;
}

async function postReceivableQuery<T>(
  path: string,
  connection: SaeConnectionRequest,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(connection),
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    signal,
  });

  await ensureSuccessfulResponse(response);
  return (await response.json()) as T;
}

export async function getReceivableRoot(
  connection: SaeConnectionRequest,
  documentNumber: string,
  signal?: AbortSignal,
): Promise<SaeReceivableRootResult> {
  const normalizedDocumentNumber = documentNumber.trim();

  if (!normalizedDocumentNumber) {
    throw new Error('El número de factura o documento es obligatorio.');
  }

  return postReceivableQuery<SaeReceivableRootResult>(
    `/api/sae/receivables/root/${encodeURIComponent(normalizedDocumentNumber)}`,
    connection,
    signal,
  );
}

export async function getReceivableMovements(
  connection: SaeConnectionRequest,
  documentNumber: string,
  signal?: AbortSignal,
): Promise<SaeReceivableProbeResult> {
  const normalizedDocumentNumber = documentNumber.trim();

  if (!normalizedDocumentNumber) {
    throw new Error('El número de factura o documento es obligatorio.');
  }

  return postReceivableQuery<SaeReceivableProbeResult>(
    `/api/sae/receivables/${encodeURIComponent(normalizedDocumentNumber)}`,
    connection,
    signal,
  );
}

export async function getCustomerReceivableMovements(
  connection: SaeConnectionRequest,
  customerCode: string,
  signal?: AbortSignal,
): Promise<SaeCustomerReceivableMovementsResult> {
  const normalizedCustomerCode = customerCode.trim();

  if (!normalizedCustomerCode) {
    throw new Error('La clave del cliente es obligatoria.');
  }

  return postReceivableQuery<SaeCustomerReceivableMovementsResult>(
    `/api/sae/receivables/customer/${encodeURIComponent(normalizedCustomerCode)}/recent`,
    connection,
    signal,
  );
}

export async function getReceivablesSummary(
  connection: SaeConnectionRequest,
  periodStart: string,
  periodEnd: string,
  filters: SaeReceivablesSummaryFilters = {},
  signal?: AbortSignal,
): Promise<SaeReceivablesSummaryResult> {
  const params = new URLSearchParams({
    from: periodStart,
    to: periodEnd,
  });

  if (filters.sellerCode) {
    params.set('seller', filters.sellerCode);
  }
  if (filters.series) {
    params.set('series', filters.series);
  }
  if (filters.folioFrom !== undefined) {
    params.set('folioFrom', String(filters.folioFrom));
  }
  if (filters.folioTo !== undefined) {
    params.set('folioTo', String(filters.folioTo));
  }
  if (filters.customerCode) {
    params.set('customer', filters.customerCode);
  }
  if (filters.warehouseNumber !== undefined) {
    params.set('warehouse', String(filters.warehouseNumber));
  }
  if (filters.invoiceStatus) {
    params.set('status', filters.invoiceStatus);
  }
  if (filters.fiscalPaymentMethod) {
    params.set('fiscalMethod', filters.fiscalPaymentMethod);
  }
  if (filters.paymentConceptNumber !== undefined) {
    params.set(
      'paymentConcept',
      String(filters.paymentConceptNumber),
    );
  }

  return postReceivableQuery<SaeReceivablesSummaryResult>(
    `/api/sae/receivables/summary?${params.toString()}`,
    connection,
    signal,
  );
}

export async function getProfitabilityDashboard(
  connection: SaeConnectionRequest,
  periodStart: string,
  periodEnd: string,
  branch?: string,
  sellerCode?: string,
  signal?: AbortSignal,
): Promise<ProfitabilityDashboardResult> {
  const params = new URLSearchParams({
    from: periodStart,
    to: periodEnd,
  });
  if (branch) params.set('branch', branch);
  if (sellerCode) params.set('seller', sellerCode);

  const response = await fetch(
    `${API_BASE_URL}/api/sae/profitability?${params.toString()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(connection),
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal,
    },
  );
  await ensureSuccessfulResponse(response);
  return (await response.json()) as ProfitabilityDashboardResult;
}
