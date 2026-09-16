import dotenv from 'dotenv';
import type { BcrTokenResponse } from './types.ts';

dotenv.config();

export class BcrAuthService {
  private static instance: BcrAuthService;
  private cachedToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private loginPromise: Promise<string> | null = null;

  private constructor() {}

  public static getInstance(): BcrAuthService {
    if (!BcrAuthService.instance) {
      BcrAuthService.instance = new BcrAuthService();
    }
    return BcrAuthService.instance;
  }

  public isConfigured(): boolean {
    const apiKey = process.env.BCR_API_KEY?.trim();
    const apiSecret = process.env.BCR_API_SECRET?.trim();
    return Boolean(apiKey && apiSecret);
  }

  public getBaseUrl(): string {
    return (process.env.BCR_API_URL || 'https://api.bcr.com.ar').trim().replace(/\/+$/, '');
  }

  /**
   * Obtiene un Bearer token válido de BCR GIX.
   * Utiliza cache en memoria y evita solicitudes de login concurrentes.
   */
  public async getBearerToken(forceRefresh = false): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Credenciales de la API BCR no configuradas (BCR_API_KEY / BCR_API_SECRET faltantes).');
    }

    const now = Date.now();
    // Reutilizar token si aún es válido (con margen de seguridad de 2 minutos)
    if (!forceRefresh && this.cachedToken && this.tokenExpiresAt > now + 120_000) {
      return this.cachedToken;
    }

    // Evitar múltiples logins simultáneos reutilizando la promesa en vuelo
    if (this.loginPromise) {
      return this.loginPromise;
    }

    this.loginPromise = this.performLogin()
      .then(token => {
        this.loginPromise = null;
        return token;
      })
      .catch(err => {
        this.loginPromise = null;
        throw err;
      });

    return this.loginPromise;
  }

  public async getToken(forceRefresh = false): Promise<string> {
    return this.getBearerToken(forceRefresh);
  }

  public invalidateToken(): void {
    this.cachedToken = null;
    this.tokenExpiresAt = 0;
  }

  public clearCache(): void {
    this.invalidateToken();
  }

  private async performLogin(): Promise<string> {
    const baseUrl = this.getBaseUrl();
    const apiKey = process.env.BCR_API_KEY?.trim() || '';
    const apiSecret = process.env.BCR_API_SECRET?.trim() || '';

    console.log('[BCR] Authenticating with GIX login service...');

    // Intentamos login con JSON y fallback con URLSearchParams si es OAuth2
    const loginEndpoints = [`${baseUrl}/Login`, `${baseUrl}/connect/token`, `${baseUrl}/api/Login`];
    let lastError: Error | null = null;

    for (const endpoint of loginEndpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'AgroSys-GIX-Client/1.0',
          },
          body: JSON.stringify({
            apiKey,
            apiSecret,
            api_key: apiKey,
            api_secret: apiSecret,
            client_id: apiKey,
            client_secret: apiSecret,
            grant_type: 'client_credentials',
          }),
          signal: AbortSignal.timeout(10000),
        });

        if (response.status === 404 && endpoint !== loginEndpoints[loginEndpoints.length - 1]) {
          continue; // Intentar siguiente endpoint candidato
        }

        if (!response.ok) {
          const status = response.status;
          throw new Error(`Fallo de autenticación BCR HTTP ${status}`);
        }

        const data = (await response.json()) as BcrTokenResponse;
        const token = data.access_token || (data as any).token || (data as any).Bearer;

        if (!token || typeof token !== 'string') {
          throw new Error('Respuesta de autenticación BCR sin token válido');
        }

        // Determinar expiración (por defecto 1 hora si no se especifica)
        const expiresInSeconds = Number(data.expires_in) || 3600;
        this.cachedToken = token;
        this.tokenExpiresAt = Date.now() + expiresInSeconds * 1000;

        console.log('[BCR] Authentication successful. Token cached.');
        return token;
      } catch (err: any) {
        lastError = err;
        if (err.name === 'TimeoutError') {
          console.error('[BCR] Authentication timeout');
          break;
        }
      }
    }

    console.error('[BCR] Authentication failed:', lastError?.message || 'Unknown error');
    throw lastError || new Error('No se pudo autenticar con BCR GIX.');
  }
}

export const bcrAuthService = BcrAuthService.getInstance();
