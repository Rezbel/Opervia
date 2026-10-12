import test from 'node:test';
import assert from 'node:assert/strict';
import { modulePaths, settingsPaths, usersPath, resolveAppRoute, safeReturnPath, canOpenRoute } from '../src/lib/appRoutes.ts';

test('every module and settings subsection has a unique recognized route', () => {
  const paths = [...Object.values(modulePaths), ...Object.values(settingsPaths), usersPath];
  assert.equal(new Set(paths).size, paths.length);
  for (const [view, path] of Object.entries(modulePaths)) assert.equal(resolveAppRoute(path).view, view);
  for (const [section, path] of Object.entries(settingsPaths)) assert.equal(resolveAppRoute(path).settings, section);
  assert.equal(resolveAppRoute(usersPath).users, true);
  assert.equal(resolveAppRoute('/no-existe'), null);
});

test('login retains local page, query and fragment without external redirects', () => {
  const destination = '/cobranza?cliente=231#facturas';
  assert.equal(safeReturnPath(destination), destination);
  for (const value of ['https://example.com', '//example.com', '/\\example.com', '/no-existe', '/iniciar-sesion', null]) {
    assert.equal(safeReturnPath(value), modulePaths.control);
  }
  assert.equal(safeReturnPath('/configuracion/conexion', false), modulePaths.control);
});

test('direct URLs enforce the same roles as the navigation menu', () => {
  for (const path of [modulePaths.ai, modulePaths.profitability, usersPath, ...Object.values(settingsPaths)]) assert.equal(canOpenRoute(resolveAppRoute(path), 'Ejecutivo'), false);
  for (const path of Object.values(modulePaths).filter(p => p !== modulePaths.ai && p !== modulePaths.profitability)) assert.equal(canOpenRoute(resolveAppRoute(path), 'Ejecutivo'), true);
  assert.equal(canOpenRoute(resolveAppRoute(usersPath), 'Gerencia'), true);
  assert.equal(canOpenRoute(resolveAppRoute(settingsPaths.users), 'Gerencia'), false);
  for (const path of [...Object.values(modulePaths), ...Object.values(settingsPaths), usersPath]) assert.equal(canOpenRoute(resolveAppRoute(path), 'Administrador'), true);
});
