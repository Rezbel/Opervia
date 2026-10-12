import test from 'node:test';
import assert from 'node:assert/strict';
import { sellerDescription, sellerLabel } from '../src/features/sellers/sellerLabels.ts';
const names = new Map([['1','SERGIO ARMANDO ALVARADO'],['8','CDMX'],['18','XALAPA 2'],['08','Otra clave']]);

test('Usa el nombre autorizado del catálogo, aunque el reporte repita la clave o conserve un nombre anterior', () => {
  assert.equal(sellerLabel(names, ' 1 ', '1'), '1 · SERGIO ARMANDO ALVARADO');
  assert.equal(sellerLabel(names, '8', 'Nombre anterior'), '8 · CDMX');
  assert.equal(sellerDescription(names, '18'), 'XALAPA 2');
});
test('Las claves se mantienen exactas, sin mezclar 8 con 18 ni eliminar ceros', () => {
  assert.equal(sellerLabel(names, '8'), '8 · CDMX');
  assert.equal(sellerLabel(names, '18'), '18 · XALAPA 2');
  assert.equal(sellerLabel(names, '08'), '08 · Otra clave');
});
test('Una clave sin descripción no se presenta como su propio nombre; ausencia de vendedor es explícita', () => {
  assert.equal(sellerLabel(new Map(), '21', '21'), '21 · Descripción no disponible');
  assert.equal(sellerLabel(new Map(), '21', 'ALBERTO GUADARRAMA'), '21 · ALBERTO GUADARRAMA');
  assert.equal(sellerLabel(names, null), 'Sin vendedor');
  assert.equal(sellerLabel(names, 'SIN VENDEDOR'), 'Sin vendedor');
});
