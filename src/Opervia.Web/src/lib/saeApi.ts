import type {
  SaeConnectionRequest,
  SaeDocumentKind,
  SaeSalesFlowResult,
} from '../types/sae';

const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? 'http://localhost:5106';

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
      signal,
    },
  );

  if (!response.ok) {
    let message = `La API respondió con el código ${response.status}.`;

    try {
      const errorBody = await response.json();

      if (typeof errorBody?.message === 'string') {
        message = errorBody.message;
      }
    } catch {
      // La respuesta no contenía JSON válido.
    }

    throw new Error(message);
  }

  const result =
    (await response.json()) as SaeSalesFlowResult;

  if (!result.isSuccessful) {
    throw new Error(
      result.message || 'No fue posible reconstruir el flujo.',
    );
  }

  return result;
}
