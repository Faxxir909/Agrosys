import { bcrAuthService } from './bcrAuthService.ts';

export interface BcrRequestOptions {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
}

export class BcrApiClient {
  private static instance: BcrApiClient;
  private readonly defaultTimeoutMs = 12000;
  private readonly defaultRetries = 2;

  private constructor() {}

  public static getInstance(): BcrApiClient {
    if (!BcrApiClient.instance) {
      BcrApiClient.instance = new BcrApiClient();
    }
    return BcrApiClient.instance;
  }

  public async get<T>(path: string, options: BcrRequestOptions = {}): Promise<T> {
    return this.executeWithRetry<T>('GET', path, undefined, options);
  }

  public async post<T>(path: string, body?: unknown, options: BcrRequestOptions = {}): Promise<T> {
    return this.executeWithRetry<T>('POST', path, body, options);
  }

  private async executeWithRetry<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    options: BcrRequestOptions = {}
  ): Promise<T> {
    const maxRetries = options.retries ?? this.defaultRetries;
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const baseUrl = bcrAuthService.getBaseUrl();

    let attempt = 0;
    let hasRefreshedTokenOn401 = false;

    while (attempt <= maxRetries) {
      attempt++;

      try {
        const token = await bcrAuthService.getBearerToken();
        const url = new URL(path.startsWith('http') ? path : `${baseUrl}/${path.replace(/^\/+/, '')}`);

        if (options.params) {
          for (const [k, v] of Object.entries(options.params)) {
            if (v !== undefined && v !== null) {
              url.searchParams.set(k, String(v));
            }
          }
        }

        const headers: Record<string, string> = {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'AgroSys-GIX-Client/1.0',
          ...(options.headers || {}),
        };

        const response = await fetch(url.toString(), {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(timeoutMs),
        });

        // 1. Manejo de 401 Unauthorized -> Renovar token 1 sola vez y reintentar
        if (response.status === 401) {
          if (!hasRefreshedTokenOn401) {
            hasRefreshedTokenOn401 = true;
            console.warn('[BCR] Token expirado o 401 recibido. Renovando token...');
            bcrAuthService.invalidateToken();
            await bcrAuthService.getBearerToken(true);
            continue;
          }
          throw new Error('Error de autorización BCR (401 Unauthorized persistente)');
        }

        // 2. Manejo de 429 Rate Limit -> Backoff de espera
        if (response.status === 429) {
          console.warn('[BCR] Rate limited (429). Esperando antes de reintentar...');
          if (attempt <= maxRetries) {
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          throw new Error('Límite de solicitudes alcanzado en API BCR (429 Rate Limited)');
        }

        // 3. Manejo de errores de servidor 5xx
        if (response.status >= 500) {
          if (attempt <= maxRetries) {
            const delay = Math.pow(2, attempt) * 600;
            console.warn(`[BCR] Error servidor BCR (${response.status}). Reintentando en ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          throw new Error(`Servidor BCR temporalmente no disponible (HTTP ${response.status})`);
        }

        // 4. Otros errores 4xx
        if (!response.ok) {
          const errorMsg = await response.text().catch(() => '');
          throw new Error(`Error en consulta BCR HTTP ${response.status}: ${errorMsg.slice(0, 150)}`);
        }

        const data = (await response.json()) as T;
        return data;
      } catch (err: any) {
        const isLastAttempt = attempt > maxRetries;
        const isNetworkOrTimeout = err.name === 'TimeoutError' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT';

        if (isNetworkOrTimeout && !isLastAttempt) {
          const delay = Math.pow(2, attempt) * 800;
          console.warn(`[BCR] Problema de red/timeout (${err.message}). Reintentando en ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        if (isLastAttempt || !isNetworkOrTimeout) {
          // Log seguro: nunca logueamos el token ni URL con credenciales
          console.error('[BCR] Error en cliente HTTP:', err.message || 'Error desconocido');
          throw err;
        }
      }
    }

    throw new Error('Número máximo de reintentos alcanzado al consultar API BCR');
  }
}

export const bcrApiClient = BcrApiClient.getInstance();
