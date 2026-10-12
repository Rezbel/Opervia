import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleCharges, scheduleKeysAtDepth, schedulePeriod, scheduleView } from '../src/features/maturities/schedule.ts';
import { collectionView, emptyCollectionFilters } from '../src/features/collections/collections.ts';

const customers = [
  { code: '1', name: 'Clínica Sofía', status: 'A', classification: 'QGLA3' },
  { code: '2', name: 'Laboratorio Norte', status: 'M', classification: 'XGLA3' },
];
const charge = (number, due, balance, extra = {}) => ({ customerCode: '1', invoiceNumber: 'F1', reference: 'F1', chargeNumber: number,
  sellerCode: '7', sellerName: 'Ana', creationDate: '2026-09-01', dueDate: due, originalAmount: balance, balance, bucket: 'current', ...extra });
const charges = [
  charge(0, '2026-10-07', 55.68), charge(1, '2026-10-15', 24.73), charge(2, '2026-11-15', 24.74),
  charge(1, '2026-10-15', 30.10, { customerCode: '2', invoiceNumber: 'F2', reference: 'F2', sellerCode: '17', sellerName: 'Luis' }),
  charge(0, '2026-10-06', 19.99, { invoiceNumber: 'F3', reference: 'F3' }),
  charge(3, null, 13.20), charge(4, '2026-10-07', 0), charge(5, '2026-10-07', -10),
];
const filters = { from: '2026-10-07', to: '2026-11-15', year: '', months: [], day: '', customers: [] };
const metadata = new Map(customers.map(customer => [customer.code, customer]));

test('Filtra por vencimiento del plazo, no elaboración: rango inclusivo y exclusión de saldos liquidados o a favor', () => {
  const selected = scheduleCharges(charges, filters);
  assert.equal(selected.length, 4);
  assert.deepEqual(selected.map(row => row.chargeNumber), [0, 1, 2, 1]);
  assert.equal(scheduleCharges(charges, { ...filters, from: '2026-10-07', to: '2026-10-07' }).length, 1);
});

test('Una factura a plazos aparece en varios días; se cuenta una vez y no se duplica el importe', () => {
  const view = scheduleView(scheduleCharges(charges, filters), metadata);
  assert.equal(view.total, 13525);
  assert.equal(view.invoiceCount, 2); assert.equal(view.customerCount, 2); assert.equal(view.chargeCount, 4);
  assert.deepEqual(view.days.map(day => [day.date, day.total]), [['2026-10-07', 5568], ['2026-10-15', 5483], ['2026-11-15', 2474]]);
  assert.equal(view.roots.reduce((sum, root) => sum + root.total, 0), view.total);
  assert.equal(view.days.reduce((sum, day) => sum + day.total, 0), view.total);
  assert.equal([...view.sellerTotals.values()].reduce((sum, amount) => sum + amount, 0), view.total);
  const reconcile = node => {
    assert.equal([...node.sellers.values()].reduce((sum, amount) => sum + amount, 0), node.total);
    if (node.children.length) assert.equal(node.children.reduce((sum, child) => sum + child.total, 0), node.total);
    node.children.forEach(reconcile);
  };
  view.roots.forEach(reconcile);
  const initial = view.days[0].children[0].children[0];
  assert.equal(initial.kind, 'invoice'); assert.equal(initial.code, 'F1'); assert.equal(initial.total, 5568);
  assert.equal(initial.children.length, 0);
});

test('Varios cargos de una misma factura y día suman en una sola fila final', () => {
  const view = scheduleView([charge(1, '2026-10-15', 10.01), charge(2, '2026-10-15', 20.02, { sellerCode: '17', sellerName: 'Luis' })], metadata);
  const invoices = view.days[0].children[0].children;
  assert.equal(invoices.length, 1);
  assert.equal(invoices[0].total, 3003);
  assert.equal(invoices[0].sellers.get('7'), 1001);
  assert.equal(invoices[0].sellers.get('17'), 2002);
  assert.deepEqual(invoices[0].children, []);
  assert.equal(view.total, 3003);
  assert.equal(view.invoiceCount, 1);
});

test('Año, meses, día, cliente y vendedor se intersectan; clave 7 no incluye 17', () => {
  const report = { customers, charges, accounts: [] };
  const base = collectionView(report, { ...emptyCollectionFilters, seller: '7', branch: 'Q', status: 'A', search: 'sofia clinica' });
  const filtered = scheduleCharges(base.charges, { ...filters, year: '2026', months: ['2026-10'], day: '15', customers: ['1'] });
  assert.equal(scheduleView(filtered, base.metadata).total, 2473);
  assert.equal(scheduleCharges(base.charges, { ...filters, customers: ['2'] }).length, 0);
  assert.equal(scheduleCharges(base.charges, { ...filters, months: ['2027-10'] }).length, 0);
  assert.equal(scheduleCharges(base.charges, { ...filters, year: '2027' }).length, 0);
});

test('Los presets programan fechas futuras inclusivas, incluso fin de año y febrero bisiesto', () => {
  assert.deepEqual(schedulePeriod('today', '2026-10-07'), { from: '2026-10-07', to: '2026-10-07' });
  assert.deepEqual(schedulePeriod('month', '2026-10-07'), { from: '2026-10-07', to: '2026-10-31' });
  assert.deepEqual(schedulePeriod('month', '2028-02-23'), { from: '2028-02-23', to: '2028-02-29' });
  assert.deepEqual(schedulePeriod('7days', '2026-12-29'), { from: '2026-12-29', to: '2027-01-04' });
  assert.deepEqual(schedulePeriod('30days', '2026-12-29'), { from: '2026-12-29', to: '2027-01-27' });
  assert.deepEqual(schedulePeriod('90days', '2026-10-07'), { from: '2026-10-07', to: '2027-01-04' });
});

test('Los meses conservan el año: octubre de dos años no se mezcla', () => {
  const source = [charge(0, '2026-10-07', 1), charge(1, '2027-10-07', 2)];
  const selected = scheduleCharges(source, { ...filters, to: '2027-12-31', months: ['2027-10'] });
  assert.equal(scheduleView(selected, metadata).total, 200);
});

test('Rangos inválidos y sin coincidencias producen cero; sin vencimiento queda fuera', () => {
  assert.equal(scheduleCharges(charges, { ...filters, from: '2026-11-16' }).length, 0);
  assert.equal(scheduleCharges(charges, { ...filters, from: '2026-02-30' }).length, 0);
  const empty = scheduleView(scheduleCharges(charges, { ...filters, customers: ['999'] }), metadata);
  assert.equal(empty.total, 0); assert.equal(empty.peak, null); assert.equal(empty.invoiceCount, 0);
  assert.equal(scheduleView([charge(1, null, 100)], metadata).total, 0);
});

test('Desglose conserva padres de meses, días y clientes; total del día seleccionado coincide con la barra', () => {
  const source = scheduleCharges(charges, filters), all = scheduleView(source, metadata);
  assert.equal(scheduleKeysAtDepth(all.roots, 0).size, 0);
  assert.equal(scheduleKeysAtDepth(all.roots, 1).size, 2);
  assert.equal(scheduleKeysAtDepth(all.roots, 2).size, 5);
  assert.equal(scheduleKeysAtDepth(all.roots, 3).size, 9);
  const focused = scheduleView(source.filter(charge => charge.dueDate === '2026-10-15'), metadata);
  assert.equal(focused.total, all.days.find(day => day.date === '2026-10-15').total);
  assert.equal(focused.invoiceCount, 2);
});


test('Varios años y días se combinan con meses y clientes sin duplicar cargos', () => {
  const selected = scheduleCharges(charges, {...filters, year: '["2026","2027"]', day: '["7","15"]', customers: ['1','2']});
  assert.equal(selected.length, 4);
  assert.equal(scheduleView(selected,metadata).total,13525);
  assert.equal(scheduleCharges(charges,{...filters, year:'["2025","2027"]'}).length,0);
  assert.equal(scheduleCharges(charges,{...filters, day:'["7","15"]', months:['2026-10'], customers:['1']}).length,2);
});
