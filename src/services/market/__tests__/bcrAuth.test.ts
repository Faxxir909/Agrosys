import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { BcrAuthService } from '../bcrAuthService.ts';

describe('BcrAuthService Unit Tests', () => {
  let authService: BcrAuthService;

  beforeEach(() => {
    // Restaurar entorno
    process.env.BCR_API_KEY = 'test_key';
    process.env.BCR_API_SECRET = 'test_secret';
    authService = BcrAuthService.getInstance();
    authService.clearCache();
  });

  test('isConfigured() retorna true si existen las dos variables de entorno', () => {
    assert.equal(authService.isConfigured(), true);
  });

  test('isConfigured() retorna false si falta alguna variable de entorno', () => {
    delete process.env.BCR_API_KEY;
    assert.equal(authService.isConfigured(), false);

    process.env.BCR_API_KEY = 'test_key';
    delete process.env.BCR_API_SECRET;
    assert.equal(authService.isConfigured(), false);
  });

  test('getToken() arroja error claro si faltan credenciales', async () => {
    delete process.env.BCR_API_KEY;
    await assert.rejects(
      async () => {
        await authService.getToken();
      },
      /Credenciales de la API BCR no configuradas/
    );
  });

  test('clearCache() invalida el token almacenado', () => {
    // Simular que teníamos token
    (authService as any).cachedToken = 'old_token';
    (authService as any).tokenExpiresAt = Date.now() + 3600000;

    authService.clearCache();

    assert.equal((authService as any).cachedToken, null);
    assert.equal((authService as any).tokenExpiresAt, 0);
  });

  test('Deduplica llamadas concurrentes (in-flight promise)', async () => {
    let callCount = 0;
    (authService as any).performLogin = async () => {
      callCount++;
      await new Promise(r => setTimeout(r, 50));
      (authService as any).cachedToken = 'fake_jwt_token';
      (authService as any).tokenExpiresAt = Date.now() + 3600000;
      return 'fake_jwt_token';
    };

    // Disparar 5 llamadas simultáneas
    const results = await Promise.all([
      authService.getToken(),
      authService.getToken(),
      authService.getToken(),
      authService.getToken(),
      authService.getToken(),
    ]);

    // Todas deben recibir el mismo token
    assert.equal(results.length, 5);
    results.forEach(tok => assert.equal(tok, 'fake_jwt_token'));

    // Debe haberse ejecutado performLogin() una sola vez
    assert.equal(callCount, 1);
  });
});
