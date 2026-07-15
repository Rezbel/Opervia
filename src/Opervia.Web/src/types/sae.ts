export type SaeDocumentKind =
  | 'Quotation'
  | 'Order'
  | 'Delivery'
  | 'Invoice';

export interface SaeConnectionRequest {
  displayName: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  companyNumber: string;
  saeVersion: string;
  charset: string;
}

export interface SaeSalesFlowNode {
  id: string;
  sequence: number;
  kind: SaeDocumentKind;
  documentType: string | null;
  documentNumber: string;
  customerCode: string;
  status: string | null;
  documentDate: string | null;
  amount: number | null;
  previousDocumentNumber: string | null;
  nextDocumentNumber: string | null;
}

export interface SaeSalesFlowEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
}

export interface SaeSalesFlowResult {
  isSuccessful: boolean;
  message: string;
  startingDocumentNumber: string;
  nodes: SaeSalesFlowNode[];
  edges: SaeSalesFlowEdge[];
  warnings: string[];
  elapsedMilliseconds: number;
}
