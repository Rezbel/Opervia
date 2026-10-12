import { localIsoDate, periodError, type DatePeriod } from '../../lib/datePeriod.ts';
import { cents, type CollectionCustomer, type CollectionPendingCharge } from '../collections/collections.ts';

export type SchedulePreset = 'today' | 'month' | '7days' | '30days' | '90days';
export function schedulePeriod(preset: SchedulePreset, today: string): DatePeriod {
  const [year, month, day] = today.split('-').map(Number);
  const end = new Date(year, month - 1, day);
  if (preset === 'month') end.setMonth(month, 0);
  else if (preset !== 'today') end.setDate(day + Number(preset.replace('days', '')) - 1);
  return { from: today, to: localIsoDate(end) };
}
export interface ScheduleFilters extends DatePeriod { year: string; months: string[]; day: string; customers: string[]; }
export const dueDay = (charge: CollectionPendingCharge) => charge.dueDate?.slice(0, 10) ?? '';

export function scheduleCharges(charges: CollectionPendingCharge[], filters: ScheduleFilters) {
  if (periodError(filters)) return [];
  const values = (value: string): string[] => !value ? [] : value.startsWith('[') ? JSON.parse(value) : [value];
  const years = values(filters.year), days = values(filters.day);
  const customers = new Set(filters.customers), months = new Set(filters.months);
  return charges.filter(charge => {
    const date = dueDay(charge);
    return cents(charge.balance) > 0 && !!date && date >= filters.from && date <= filters.to &&
      (!years.length || years.includes(date.slice(0, 4))) &&
      (!months.size || months.has(date.slice(0, 7))) &&
      (!days.length || days.some(day => Number(date.slice(8, 10)) === Number(day))) &&
      (!customers.size || customers.has(charge.customerCode));
  });
}

export type ScheduleKind = 'month' | 'day' | 'customer' | 'invoice';
export interface ScheduleNode {
  key: string; kind: ScheduleKind; code: string; label: string; date: string; customerCode: string;
  invoiceNumber: string; total: number; sellers: Map<string, number>; children: ScheduleNode[];
}
const monthFormatter = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' });
const dayFormatter = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: '2-digit', month: 'short' });
export const monthLabel = (key: string) => monthFormatter.format(new Date(`${key}-01T12:00:00`));
export const dayLabel = (key: string) => dayFormatter.format(new Date(`${key}T12:00:00`));

// Group installment balances, not whole invoices. A document can have different due days.
export function scheduleView(charges: CollectionPendingCharge[], customers: Map<string, CollectionCustomer>) {
  const roots: ScheduleNode[] = [], nodes = new Map<string, ScheduleNode>();
  const sellerNames = new Map<string, string>();
  const invoices = new Set<string>(), customerKeys = new Set<string>();
  const getNode = (kind: ScheduleKind, code: string, label: string, path: string[], date: string, customerCode: string, invoiceNumber: string, parent?: ScheduleNode) => {
    const key = JSON.stringify(path);
    let node = nodes.get(key);
    if (!node) {
      node = { key, kind, code, label, date, customerCode, invoiceNumber, total: 0, sellers: new Map(), children: [] };
      nodes.set(key, node); (parent ? parent.children : roots).push(node);
    }
    return node;
  };
  let total = 0;
  for (const charge of charges) {
    const date = dueDay(charge); if (!date || cents(charge.balance) <= 0) continue;
    const month = date.slice(0, 7), customer = charge.customerCode, invoice = charge.invoiceNumber;
    const path = [month, date, customer, invoice];
    const monthNode = getNode('month', month, monthLabel(month), path.slice(0, 1), '', '', '');
    const dayNode = getNode('day', date, dayLabel(date), path.slice(0, 2), date, '', '', monthNode);
    const customerNode = getNode('customer', customer, customers.get(customer)?.name ?? customer, path.slice(0, 3), date, customer, '', dayNode);
    const invoiceNode = getNode('invoice', invoice, invoice, path.slice(0, 4), date, customer, invoice, customerNode);
    const amount = cents(charge.balance); total += amount;
    for (const node of [monthNode, dayNode, customerNode, invoiceNode]) {
      node.total += amount; node.sellers.set(charge.sellerCode, (node.sellers.get(charge.sellerCode) ?? 0) + amount);
    }
    sellerNames.set(charge.sellerCode, charge.sellerName || 'Sin vendedor');
    invoices.add(JSON.stringify([customer, invoice])); customerKeys.add(customer);
  }
  roots.sort((a, b) => a.code.localeCompare(b.code));
  for (const root of roots) {
    root.children.sort((a, b) => a.date.localeCompare(b.date));
    for (const day of root.children) {
      day.children.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'es-MX'));
      for (const customer of day.children) customer.children.sort((a, b) => a.code.localeCompare(b.code));
    }
  }
  const days = roots.flatMap(root => root.children);
  const peak = [...days].sort((a, b) => b.total - a.total || a.date.localeCompare(b.date))[0] ?? null;
  const sellerTotals = new Map<string, number>();
  for (const root of roots) for (const [seller, amount] of root.sellers) sellerTotals.set(seller, (sellerTotals.get(seller) ?? 0) + amount);
  return { roots, days, peak, total, sellers: [...sellerNames].map(([code, name]) => ({ code, name })).sort((a, b) => a.code.localeCompare(b.code, 'es-MX', { numeric: true })),
    sellerTotals, invoiceCount: invoices.size, customerCount: customerKeys.size, chargeCount: charges.filter(charge => !!dueDay(charge) && cents(charge.balance) > 0).length };
}

export function scheduleKeysAtDepth(roots: ScheduleNode[], depth: number) {
  const keys = new Set<string>();
  const visit = (node: ScheduleNode, level: number) => { if (level < depth && node.children.length) keys.add(node.key); node.children.forEach(child => visit(child, level + 1)); };
  roots.forEach(root => visit(root, 0)); return keys;
}
