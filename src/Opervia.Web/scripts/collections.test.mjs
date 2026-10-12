import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionView, emptyCollectionFilters } from '../src/features/collections/collections.ts';

const report = {
  customers: [
    { code: '1', name: 'Clínica Sofía', status: 'A', classification: 'QGLA3' },
    { code: '2', name: 'Laboratorio Norte', status: 'M', classification: 'XGLA3' },
  ],
  charges: [
    { customerCode: '1', invoiceNumber: 'F1', sellerCode: '7', sellerName: 'Ana', balance: 100.10, bucket: 'current' },
    { customerCode: '1', invoiceNumber: 'F1', sellerCode: '7', sellerName: 'Ana', balance: 200.20, bucket: '1-30' },
    { customerCode: '1', invoiceNumber: 'F2', sellerCode: '17', sellerName: 'Luis', balance: 300.30, bucket: '90+' },
    { customerCode: '2', invoiceNumber: 'F3', sellerCode: '7', sellerName: 'Ana', balance: 50.05, bucket: 'undated' },
  ],
  accounts: [
    { customerCode: '1', sellerCode: '7', ledgerBalance: 275.30, creditBalance: 25, otherBalance: 0, pendingBalance: 300.30 },
    { customerCode: '1', sellerCode: '17', ledgerBalance: 300.30, creditBalance: 0, otherBalance: 0, pendingBalance: 300.30 },
    { customerCode: '2', sellerCode: '7', ledgerBalance: 60.05, creditBalance: 0, otherBalance: 10, pendingBalance: 50.05 },
  ],
};

test('Rangos, clientes y vendedores concilian al centavo; una factura con dos plazos cuenta una sola vez', () => {
  const view = collectionView(report, emptyCollectionFilters);
  assert.equal(view.total, 65065);
  assert.equal(view.overdue, 50050);
  assert.equal(view.invoiceCount, 3);
  assert.equal(view.customers.find(row => row.key === '1').invoiceCount, 2);
  assert.equal(view.customers.reduce((sum, row) => sum + row.total, 0), view.total);
  assert.equal(view.sellers.reduce((sum, row) => sum + row.total, 0), view.total);
  assert.equal(view.total - view.credits + view.other, view.ledger);
});

test('Vendedor 7 es una clave exacta: no incluye al vendedor 17', () => {
  const view = collectionView(report, { ...emptyCollectionFilters, seller: '7' });
  assert.equal(view.total, 35035);
  assert.equal(view.sellers.length, 1);
  assert.equal(view.amounts['90+'], 0);
  assert.equal(view.total - view.credits + view.other, view.ledger);
});

test('Sucursal, estado, cliente y búsqueda se intersectan para todos los widgets', () => {
  const view = collectionView(report, { seller: '7', branch: 'Q', status: 'A', customer: '1', search: 'sofia clinica' });
  assert.equal(view.total, 30030);
  assert.equal(view.invoiceCount, 1);
  assert.equal(view.customers.length, 1);
  assert.equal(view.accounts.length, 1);
  assert.equal(collectionView(report, { ...emptyCollectionFilters, branch: 'Q', status: 'M' }).total, 0);
});

test('Los vencimientos desconocidos no inflan la cartera al corriente ni la vencida', () => {
  const view = collectionView(report, { ...emptyCollectionFilters, customer: '2' });
  assert.equal(view.amounts.undated, 5005);
  assert.equal(view.amounts.current, 0);
  assert.equal(view.overdue, 0);
});

test('Sin coincidencias no quedan totales residuales ni porcentajes artificiales', () => {
  const view = collectionView(report, { ...emptyCollectionFilters, search: 'no existe' });
  assert.equal(view.total, 0); assert.equal(view.invoiceCount, 0);
  assert.equal(view.customers.length, 0); assert.equal(view.sellers.length, 0);
  assert.equal(view.ledger, 0);
});

test('Sin vendedor es una opción distinta de todos los vendedores', () => {
  const data = { ...report, charges: [...report.charges, { customerCode: '1', invoiceNumber: 'F4', sellerCode: '', sellerName: 'Sin vendedor', balance: 30, bucket: 'current' }] };
  const view = collectionView(data, { ...emptyCollectionFilters, seller: '__unassigned__' });
  assert.equal(view.total, 3000);
  assert.equal(view.sellers.length, 1);
  assert.equal(view.sellers[0].key, '');
});

test('Selección múltiple une opciones e intersecta filtros sin duplicar cargos', () => {
  const view = collectionView(report, { ...emptyCollectionFilters, sellers: ['7', '17'], branches: ['Q', 'X'], statuses: ['A', 'M'], customers: ['1', '2'] });
  assert.equal(view.total, 65065);
  assert.equal(view.invoiceCount, 3);
  assert.equal(view.total - view.credits + view.other, view.ledger);
  const restricted = collectionView(report, { ...emptyCollectionFilters, sellers: ['17'], customers: ['1', '2'], statuses: ['A', 'M'] });
  assert.equal(restricted.total, 30030);
  assert.equal(restricted.accounts.length, 1);
  assert.equal(collectionView(report, { ...emptyCollectionFilters, sellers: [], customers: [] }).total, 65065);
});

test('Filtros compartidos admiten selección codificada de varias claves exactas', () => {
  const view = collectionView(report,{...emptyCollectionFilters,seller:'["7","17"]',branch:'["Q","X"]',status:'["A","M"]'});
  assert.equal(view.total,65065);
  assert.equal(collectionView(report,{...emptyCollectionFilters,seller:'["17","18"]'}).total,30030);
});
