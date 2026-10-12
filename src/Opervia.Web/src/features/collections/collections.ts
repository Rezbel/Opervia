export type AgingBucket = 'current' | '1-30' | '31-60' | '61-90' | '90+' | 'undated';
export const agingBuckets: { key: AgingBucket; label: string; color: string }[] = [
  { key: 'current', label: 'Al corriente', color: '#16865b' },
  { key: '1-30', label: '1–30 días', color: '#3673df' },
  { key: '31-60', label: '31–60 días', color: '#b37908' },
  { key: '61-90', label: '61–90 días', color: '#cf572d' },
  { key: '90+', label: 'Más de 90 días', color: '#d1374a' },
  { key: 'undated', label: 'Sin vencimiento', color: '#748399' },
];
export interface CollectionCustomer { code: string; name: string; status: string; classification: string; assignedSeller: string; catalogBalance: number | null; }
export interface CollectionPendingCharge {
  customerCode: string; invoiceNumber: string; reference: string; chargeNumber: number;
  sellerCode: string; sellerName: string; creationDate: string | null; dueDate: string | null;
  originalAmount: number; balance: number; bucket: AgingBucket;
}
export interface CollectionAccountTotal { customerCode: string; sellerCode: string; ledgerBalance: number; creditBalance: number; otherBalance: number; pendingBalance: number; }
export interface SaeCollectionsControlResult {
  isSuccessful: boolean; message: string; asOfDate: string; generatedAt: string;
  customers: CollectionCustomer[]; charges: CollectionPendingCharge[]; accounts: CollectionAccountTotal[]; elapsedMilliseconds: number;
}
export interface CollectionFilters { seller: string; branch: string; status: string; customer: string; search: string; sellers?: string[]; branches?: string[]; statuses?: string[]; customers?: string[]; }
export const emptyCollectionFilters: CollectionFilters = { seller: '', branch: '', status: '', customer: '', search: '' };
export const cents = (value: number) => Math.round(value * 100);
const moneyFormatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
export const collectionMoney = (amount: number) => moneyFormatter.format(amount / 100);
export const collectionDate = (value: string | null) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Sin fecha';
export const normalizeSearch = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-MX').replace(/\s+/g, ' ').trim();
const emptyAmounts = (): Record<AgingBucket, number> => ({ current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0, undated: 0 });
export interface AgingRow { key: string; name: string; amounts: Record<AgingBucket, number>; total: number; overdue: number; invoiceCount: number; }

// Every widget uses this projection. Amounts are accumulated in cents so table totals reconcile.
export function collectionView(report: SaeCollectionsControlResult, filters: CollectionFilters) {
  const tokens = normalizeSearch(filters.search).split(' ').filter(Boolean);
  const selected = (many: string[] | undefined, single: string) => many ?? (single ? single.startsWith('[') ? JSON.parse(single) as string[] : [single] : []);
  const customers = selected(filters.customers, filters.customer), branches = selected(filters.branches, filters.branch);
  const statuses = selected(filters.statuses, filters.status), sellers = selected(filters.sellers, filters.seller);
  const metadata = new Map(report.customers.filter(customer =>
    (!customers.length || customers.includes(customer.code)) &&
    (!branches.length || branches.some(branch => customer.classification.startsWith(branch))) &&
    (!statuses.length || statuses.includes(customer.status)) &&
    tokens.every(token => normalizeSearch(`${customer.code} ${customer.name}`).includes(token)),
  ).map(customer => [customer.code, customer]));
  const matchesSeller = (code: string) => !sellers.length || sellers.includes(code || '__unassigned__');
  const charges = report.charges.filter(charge => metadata.has(charge.customerCode) && matchesSeller(charge.sellerCode));
  const accounts = report.accounts.filter(account => metadata.has(account.customerCode) && matchesSeller(account.sellerCode));
  const amounts = emptyAmounts();
  const customerMap = new Map<string, AgingRow>();
  const sellerMap = new Map<string, AgingRow>();
  const invoiceSets = new Map<string, Set<string>>();
  function add(map: Map<string, AgingRow>, key: string, name: string, charge: CollectionPendingCharge, prefix: string) {
    let row = map.get(key);
    if (!row) { row = { key, name, amounts: emptyAmounts(), total: 0, overdue: 0, invoiceCount: 0 }; map.set(key, row); }
    const amount = cents(charge.balance);
    row.amounts[charge.bucket] += amount; row.total += amount;
    if (charge.bucket !== 'current' && charge.bucket !== 'undated') row.overdue += amount;
    const setKey = `${prefix}:${key}`;
    const invoices = invoiceSets.get(setKey) ?? new Set<string>();
    invoices.add(`${charge.customerCode}:${charge.invoiceNumber}`);
    invoiceSets.set(setKey, invoices); row.invoiceCount = invoices.size;
  }
  for (const charge of charges) {
    amounts[charge.bucket] += cents(charge.balance);
    add(customerMap, charge.customerCode, metadata.get(charge.customerCode)?.name ?? charge.customerCode, charge, 'customer');
    add(sellerMap, charge.sellerCode, charge.sellerName || 'Sin vendedor', charge, 'seller');
  }
  const total = Object.values(amounts).reduce((sum, amount) => sum + amount, 0);
  const overdue = total - amounts.current - amounts.undated;
  const sort = (a: AgingRow, b: AgingRow) => b.overdue - a.overdue || b.total - a.total || a.name.localeCompare(b.name, 'es-MX');
  return { amounts, total, overdue, charges, accounts, metadata,
    customers: [...customerMap.values()].sort(sort), sellers: [...sellerMap.values()].sort(sort),
    invoiceCount: new Set(charges.map(charge => `${charge.customerCode}:${charge.invoiceNumber}`)).size,
    credits: accounts.reduce((sum, account) => sum + cents(account.creditBalance), 0),
    other: accounts.reduce((sum, account) => sum + cents(account.otherBalance), 0),
    ledger: accounts.reduce((sum, account) => sum + cents(account.ledgerBalance), 0),
  };
}
