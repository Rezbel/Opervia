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

export interface SavedSaeConnectionSummary {
  id: string;
  displayName: string;
  host: string;
  port: number;
  database: string;
  username: string;
  companyNumber: string;
  saeVersion: string;
  charset: string;
  updatedAtUtc: string;
}

export interface SaeSalesFlowNode {
  warehouseNumber?: number | null;
  salespersonCode?: string | null;
  id: string;
  sequence: number;
  kind: SaeDocumentKind;
  documentType: string | null;
  documentNumber: string;
  customerCode: string;
  customerName: string | null;
  customerCommercialName: string | null;
  customerRfc: string | null;
  status: string | null;
  documentDate: string | null;
  amount: number | null;
  amountBeforeTax: number | null;
  taxAmount: number | null;
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

export interface SaeDocumentItem {
  lineNumber: number;
  productCode: string | null;
  description: string | null;
  quantity: number | null;
  price: number | null;
  netPrice: number | null;
  cost: number | null;
  lineTotal: number | null;
  taxAmount: number | null;
  lineTotalWithTax: number | null;
  priceWithTax: number | null;
  discount1: number | null;
  discount2: number | null;
  discount3: number | null;
  warehouseNumber: number | null;
  movementNumber: number | null;
  lotLink: number | null;
  salesUnit: string | null;
}

export interface SaeDocumentItemsResult {
  isSuccessful: boolean;
  message: string;
  tableName: string;
  documentNumber: string;
  items: SaeDocumentItem[];
  totalQuantity: number;
  totalAmount: number;
  totalAmountWithTax: number;
  isTruncated: boolean;
  elapsedMilliseconds: number;
}

export interface SaeSalesFlowStageMetric {
  kind: SaeDocumentKind;
  label: string;
  documentCount: number;
  activeCount: number;
  cancelledCount: number;
  activeAmountBeforeTax: number;
  activeAmountWithTax: number;
}

export interface SaeSalesFlowTransitionMetric {
  fromKind: SaeDocumentKind;
  toKind: SaeDocumentKind;
  label: string;
  consideredCount: number;
  progressedCount: number;
  conversionRatePercent: number;
  averageDays: number | null;
}

export interface SaeSalesFlowBottleneck {
  kind: SaeDocumentKind;
  stageLabel: string;
  expectedNextStage: string;
  documentNumber: string;
  customerCode: string;
  sellerCode: string | null;
  documentDate: string;
  waitingDays: number;
  amountBeforeTax: number;
  amountWithTax: number;
}

export interface SaeSalesFlowSellerOption {
  value: string;
  label: string;
  documentCount: number;
}

export interface SaeSalesFlowSummaryResult {
  isSuccessful: boolean;
  message: string;
  periodStart: string;
  periodEnd: string;
  sellerCode: string | null;
  stages: SaeSalesFlowStageMetric[];
  transitions: SaeSalesFlowTransitionMetric[];
  bottlenecks: SaeSalesFlowBottleneck[];
  sellerOptions: SaeSalesFlowSellerOption[];
  skippedStageCount: number;
  brokenLinkCount: number;
  recentQuotationWithoutOrderCount: number;
  documents: SaeSalesFlowDocumentListItem[];
  documentPage: number;
  documentPageSize: number;
  totalDocumentCount: number;
  elapsedMilliseconds: number;
}

export interface SaeSalesFlowDocumentListItem {
  kind: SaeDocumentKind;
  stageLabel: string;
  documentNumber: string;
  customerCode: string;
  customerName: string | null;
  sellerCode: string | null;
  documentDate: string;
  isCancelled: boolean;
  amountBeforeTax: number;
  amountWithTax: number;
}

export interface SaeInventoryProductPerformance {
  productCode: string;
  description: string;
  lineCode: string | null;
  lineName: string | null;
  unit: string | null;
  currentStock: number;
  stockMinimum: number;
  stockMaximum: number;
  averageCost: number;
  stockValue: number;
  quantitySold: number;
  salesWithoutTax: number;
  salesWithTax: number;
  costOfSales: number;
  grossProfit: number;
  grossMarginPercent: number;
  invoiceCount: number;
  lastSaleDate: string | null;
  monthlyVelocity: number;
  coverageDays: number | null;
}

export interface SaeInventoryRiskProduct {
  riskType: 'OutOfStock' | 'LowStock' | 'Overstock' | 'Dormant';
  severity: 'Critical' | 'High' | 'Medium';
  productCode: string;
  description: string;
  lineName: string | null;
  currentStock: number;
  referenceStock: number;
  stockValue: number;
  quantitySold: number;
  daysSinceLastSale: number | null;
}

export interface SaeInventoryBreakdownItem {
  key: string;
  label: string;
  salesWithoutTax: number;
  salesWithTax: number;
  grossProfit: number;
  quantitySold: number;
  stockValue: number;
  productCount: number;
}

export interface SaeInventoryFilterOption {
  value: string;
  label: string;
}

export interface SaeInventoryAnalyticsResult {
  isSuccessful: boolean;
  message: string;
  periodStart: string;
  periodEnd: string;
  sellerCode: string | null;
  warehouseNumber: number | null;
  productLine: string | null;
  activeProductCount: number;
  sellingProductCount: number;
  inventoryValue: number;
  lowStockCount: number;
  outOfStockSellingCount: number;
  dormantStockValue: number;
  products: SaeInventoryProductPerformance[];
  risks: SaeInventoryRiskProduct[];
  sellers: SaeInventoryBreakdownItem[];
  warehouses: SaeInventoryBreakdownItem[];
  productLines: SaeInventoryBreakdownItem[];
  filterOptions: {
    sellers: SaeInventoryFilterOption[];
    warehouses: SaeInventoryFilterOption[];
    productLines: SaeInventoryFilterOption[];
  };
  elapsedMilliseconds: number;
}

export interface OperviaAiAnswer {
  answer: string;
  summary: string;
  alerts: string[];
  suggestedQuestions: string[];
  model: string;
}

export interface SaeReceivableMovement {
  customerCode: string;
  reference: string | null;
  movementId: number;
  conceptNumber: number;
  conceptDescription: string | null;
  conceptType: string | null;
  chargeNumber: number | null;
  lineNumber: number;
  invoiceNumber: string | null;
  document: string | null;
  amount: number | null;
  applicationDate: string | null;
  dueDate: string | null;
  movementType: string | null;
  movementSign: number | null;
  conceptSign: number | null;
  systemReference: string | null;
  operation: string | null;
  originBankReference: string | null;
  destinationBankReference: string | null;
  originPaymentAccount: string | null;
  destinationPaymentAccount: string | null;
  checkNumber: string | null;
  paymentDocument: string | null;
  operationId: string | null;
  uuid: string | null;
}

export interface SaeReceivableRoot {
  customerCode: string;
  reference: string | null;
  conceptNumber: number;
  chargeNumber: number;
  observationKey: number | null;
  invoiceNumber: string | null;
  document: string | null;
  amount: number | null;
  applicationDate: string | null;
  dueDate: string | null;
  folioKey: number | null;
  logKey: number | null;
  systemReference: string | null;
  uuid: string | null;
  status: string | null;
  sign: number | null;
  invoiceAmountBeforeTax: number | null;
}

export interface SaeReceivableRootResult {
  isSuccessful: boolean;
  message: string;
  tableName: string;
  documentNumber: string;
  root: SaeReceivableRoot | null;
  elapsedMilliseconds: number;
}

export interface SaeReceivableProbeResult {
  isSuccessful: boolean;
  message: string;
  movementsTableName: string;
  conceptsTableName: string;
  documentNumber: string;
  movements: SaeReceivableMovement[];
  elapsedMilliseconds: number;
}

export interface SaeCustomerReceivableMovementsResult {
  isSuccessful: boolean;
  message: string;
  movementsTableName: string;
  conceptsTableName: string;
  customerCode: string;
  movements: SaeReceivableMovement[];
  elapsedMilliseconds: number;
}

export interface SaeReceivableConceptTotal {
  conceptNumber: number;
  description: string;
  classification: string;
  amount: number;
  movementCount: number;
}

export interface SaeReceivablesDailyPoint {
  date: string;
  netInvoicedAmount: number;
  realIncomeAmount: number;
  netInvoicedAmountWithoutTax: number;
}

export interface SaeReceivableRecentMovement {
  customerCode: string;
  invoiceNumber: string | null;
  document: string | null;
  conceptNumber: number;
  description: string;
  amount: number;
  applicationDate: string;
}

export interface SaeReceivableRecentCancellation {
  invoiceNumber: string;
  customerCode: string;
  amount: number;
  documentDate: string;
  cancellationDate: string;
}

export interface SaeReceivableInvoiceRow {
  invoiceNumber: string;
  customerCode: string;
  customerName: string;
  sellerCode: string | null;
  dueDate: string | null;
  status: 'Liquidada' | 'Adeudo' | 'Vencido' | 'Cancelada' | 'Sin datos';
  creationDate: string | null;
}

export interface SaeReceivableInvoiceAccountResult {
  isSuccessful: boolean;
  message: string;
  invoice: {
    invoiceNumber: string;
    customerCode: string;
    customerName: string;
    sellerCode: string;
    creationDate: string | null;
    documentDate: string | null;
    amountWithVat: number;
    amountWithoutVat: number;
    vatAmount: number;
    balance: number | null;
    originalCharges: number;
    appliedReductions: number;
    nextDueDate: string | null;
    status: string;
    saeStatus: string;
    chargeCount: number;
    uuid: string | null;
  } | null;
  movements: {
    key: string;
    reference: string;
    chargeNumber: number;
    conceptNumber: number;
    conceptDescription: string;
    document: string;
    signedAmount: number;
    applicationDate: string | null;
    dueDate: string | null;
    isOriginalCharge: boolean;
    chargeBalance: number | null;
    chargeStatus: string | null;
  }[];
  elapsedMilliseconds: number;
}

export interface SaeReceivableInvoiceListingResult {
  isSuccessful: boolean;
  message: string;
  periodStart: string;
  periodEnd: string;
  invoices: SaeReceivableInvoiceRow[];
  invoicePage: number;
  invoicePageSize: number;
  totalInvoiceCount: number;
  elapsedMilliseconds: number;
}

export interface SaeCustomerPortfolioRow {
  customerCode: string;
  customerName: string;
  sellerCode: string | null;
  customerStatus: string;
  classification: string;
  hasCredit: boolean;
  creditLimit: number;
  creditDays: number;
  balance: number;
}

export interface SaeCustomerPeriodInvoice {
  invoiceNumber: string;
  documentDate: string;
  dueDate: string | null;
  sellerCode: string | null;
  amount: number;
  status: string;
  originalAmount: number;
}

export interface SaeCustomerPortfolioResult {
  isSuccessful: boolean;
  message: string;
  periodStart: string;
  periodEnd: string;
  customers: SaeCustomerPortfolioRow[];
  invoices: SaeCustomerPeriodInvoice[];
  elapsedMilliseconds: number;
  pendingInvoiceBalance: number | null;
  creditBalance: number | null;
  otherAccountBalance: number | null;
  accountingBalance: number | null;
  balanceDifference: number | null;
  pendingCharges: { dueDate: string | null; amount: number }[] | null;
}

export interface SaeReceivablesSummaryFilters {
  sellerCode?: string;
  series?: string;
  folioFrom?: number;
  folioTo?: number;
  customerCode?: string;
  warehouseNumber?: number;
  invoiceStatus?: 'Active' | 'Canceled';
  fiscalPaymentMethod?: string;
  paymentConceptNumber?: number;
  invoiceSearch?: string;
}

export interface SaeReceivableFilterOption {
  value: string;
  label: string;
  recordCount: number;
  amount: number;
  amountWithoutTax: number;
  activeRecordCount?: number;
  activeAmount?: number;
  activeAmountWithoutTax?: number;
}

export interface SaeReceivablesFilterOptions {
  sellers: SaeReceivableFilterOption[];
  series: SaeReceivableFilterOption[];
  warehouses: SaeReceivableFilterOption[];
  invoiceStatuses: SaeReceivableFilterOption[];
  fiscalPaymentMethods: SaeReceivableFilterOption[];
  paymentConcepts: SaeReceivableFilterOption[];
}

export interface SaeReceivablesSummaryResult {
  isSuccessful: boolean;
  message: string;
  periodStart: string;
  periodEnd: string;
  appliedFilters: SaeReceivablesSummaryFilters;
  filterOptions: SaeReceivablesFilterOptions;
  grossInvoicedAmount: number;
  netInvoicedAmount: number;
  invoiceCount: number;
  netInvoiceCount: number;
  voidedInvoiceAmount: number;
  voidedInvoiceCount: number;
  canceledInPeriodAmount: number;
  canceledInPeriodCount: number;
  realIncomeAmount: number;
  realPaymentCount: number;
  returnsAndCreditsAmount: number;
  returnAndCreditCount: number;
  appliedAdvanceAmount: number;
  appliedAdvanceCount: number;
  otherReductionAmount: number;
  otherReductionCount: number;
  incomeBreakdown: SaeReceivableConceptTotal[];
  nonCashBreakdown: SaeReceivableConceptTotal[];
  dailySeries: SaeReceivablesDailyPoint[];
  recentPayments: SaeReceivableRecentMovement[];
  recentCancellations: SaeReceivableRecentCancellation[];
  invoices: SaeReceivableInvoiceRow[];
  invoicePage: number;
  invoicePageSize: number;
  totalInvoiceCount: number;
  futureDatedReductionCount: number;
  grossInvoicedAmountWithoutTax: number;
  netInvoicedAmountWithoutTax: number;
  voidedInvoiceAmountWithoutTax: number;
  canceledInPeriodAmountWithoutTax: number;
  invoiceTableName: string;
  movementsTableName: string;
  conceptsTableName: string;
  elapsedMilliseconds: number;
}

export interface ProfitabilityPeriodPoint {
  year: number;
  month: number;
  netSales: number;
  netSalesWithTax: number;
  costOfSales: number;
  invoiceCount: number;
}

export interface ProfitabilityBreakdownItem {
  key: string;
  label: string;
  netSales: number;
  netSalesWithTax: number;
  costOfSales: number;
  invoiceCount: number;
}

export interface ProfitabilityFilterOption {
  value: string;
  label: string;
}

export interface ProfitabilitySourceInfo {
  saeMode: string;
  saeInvoiceTable: string;
  saeLinesTable: string;
  saePurchaseTable: string;
}

export interface ProfitabilityDashboardResult {
  isSuccessful: boolean;
  message: string;
  periodStart: string;
  periodEnd: string;
  branch: string | null;
  sellerCode: string | null;
  netSalesWithoutTax: number;
  netSalesWithTax: number;
  costOfSales: number;
  purchasesWithoutTax: number;
  purchasesWithTax: number;
  purchaseCount: number;
  grossProfit: number;
  grossMarginPercent: number;
  invoiceCount: number;
  averageTicket: number;
  monthly: ProfitabilityPeriodPoint[];
  branches: ProfitabilityBreakdownItem[];
  sellers: ProfitabilityBreakdownItem[];
  branchOptions: ProfitabilityFilterOption[];
  sellerOptions: ProfitabilityFilterOption[];
  sources: ProfitabilitySourceInfo;
  warnings: string[];
  elapsedMilliseconds: number;
}

export type TaxDisplayMode = 'withoutTax' | 'withTax';

export interface ManualProfitabilityEntry {
  id: string;
  entryDate: string;
  category: string;
  branch: string | null;
  amount: number;
  note: string | null;
  createdAtUtc: string;
}

export interface CreateManualProfitabilityEntry {
  entryDate: string;
  category: string;
  branch?: string;
  amount: number;
  note?: string;
}
export interface SaeCommercialOption { value: string; label: string; }
export interface SaeCommercialBrand { brand: string; salesWithoutTax: number; salesWithTax: number; invoiceCount: number; customerCount: number; }
export interface SaeCommercialBrandAmount { brand: string; salesWithoutTax: number; salesWithTax: number; }
export interface SaeCommercialCustomer { customerCode: string; customerName: string; salesWithoutTax: number; salesWithTax: number; invoiceCount: number; brands: SaeCommercialBrandAmount[]; }
export interface SaeCommercialResult { isSuccessful: boolean; message: string; periodStart: string; periodEnd: string; salesWithoutTax: number; salesWithTax: number; invoiceCount: number; customerCount: number; brands: SaeCommercialBrand[]; customers: SaeCommercialCustomer[]; sellers: SaeCommercialOption[]; brandOptions: SaeCommercialOption[]; productLines: SaeCommercialOption[]; elapsedMilliseconds: number; }
export interface SaeCommercialProductPurchase {
  invoiceNumber: string; elaborationDate: string; quantity: number; salesWithoutTax: number; salesWithTax: number;
}
export interface SaeCommercialPurchasedProduct {
  productCode: string; productName: string; productLine: string; productLineName: string; unit: string;
  quantity: number; averageUnitPrice: number | null; salesWithoutTax: number; salesWithTax: number;
  lastPurchaseDate: string; purchases: SaeCommercialProductPurchase[];
}
export interface SaeCommercialPurchasedBrand {
  brand: string; salesWithoutTax: number; salesWithTax: number; products: SaeCommercialPurchasedProduct[];
}
export interface SaeCommercialCustomerPurchasesResult {
  isSuccessful: boolean; message: string; periodStart: string; periodEnd: string; customerCode: string;
  customerName: string; salesWithoutTax: number; salesWithTax: number; invoiceCount: number; productCount: number;
  brands: SaeCommercialPurchasedBrand[]; elapsedMilliseconds: number;
}
