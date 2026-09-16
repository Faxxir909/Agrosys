import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateBcrPreciosResponse } from '../bcrValidation.ts';

describe('BcrValidation Unit Tests', () => {
  test('extrae array directo de la respuesta', () => {
    const raw = [{ idGrano: 21, precio_Cotizacion: 350000 }];
    const res = validateBcrPreciosResponse(raw);
    assert.equal(res.length, 1);
    assert.equal((res[0] as any).idGrano, 21);
  });

  test('extrae array envuelto en { data: [...] }', () => {
    const raw = { data: [{ idGrano: 1, precio_Cotizacion: 210000 }] };
    const res = validateBcrPreciosResponse(raw);
    assert.equal(res.length, 1);
    assert.equal((res[0] as any).idGrano, 1);
  });

  test('extrae array envuelto en { results: [...] }', () => {
    const raw = { results: [{ idGrano: 2, precio_Cotizacion: 180000 }] };
    const res = validateBcrPreciosResponse(raw);
    assert.equal(res.length, 1);
  });

  test('extrae array envuelto en { PreciosCamara: [...] }', () => {
    const raw = { PreciosCamara: [{ idGrano: 20, precio_Cotizacion: 420000 }] };
    const res = validateBcrPreciosResponse(raw);
    assert.equal(res.length, 1);
  });

  test('devuelve array vacío ante inputs nulos, strings o vacíos sin arrojar excepción', () => {
    assert.deepEqual(validateBcrPreciosResponse(null), []);
    assert.deepEqual(validateBcrPreciosResponse(undefined), []);
    assert.deepEqual(validateBcrPreciosResponse('string invalido'), []);
    assert.deepEqual(validateBcrPreciosResponse(12345), []);
    assert.deepEqual(validateBcrPreciosResponse({}), []);
  });
});
