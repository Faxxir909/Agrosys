import { marketService } from './marketService.ts';

export class BcrScheduler {
  private static instance: BcrScheduler;
  private intervalTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private startupTimer: NodeJS.Timeout | null = null;

  private constructor() {}

  public static getInstance(): BcrScheduler {
    if (!BcrScheduler.instance) {
      BcrScheduler.instance = new BcrScheduler();
    }
    return BcrScheduler.instance;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('[BCR-SCHEDULER] Consulta de la publicación CAC-BCR cada 30 minutos.');

    // 1. Sincronización inicial diferida 5s tras el inicio del servidor si está configurado
    this.startupTimer = setTimeout(() => {
        console.log('[BCR-SCHEDULER] Running startup market price sync check...');
        marketService.syncBcrRosarioPrices().catch(err => {
          console.warn('[BCR-SCHEDULER] Initial sync error:', err.message || err);
        });
    }, 5000);

    // 2. Intervalo de verificación periódica cada 30 minutos
    const checkIntervalMs = 30 * 60 * 1000;
    this.intervalTimer = setInterval(() => {
      this.evaluateScheduledSync().catch(err => {
        console.warn('[BCR-SCHEDULER] Periodic sync check error:', err.message || err);
      });
    }, checkIntervalMs);
  }

  public stop(): void {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    this.isRunning = false;
    console.log('[BCR-SCHEDULER] Scheduler stopped.');
  }

  private async evaluateScheduledSync(): Promise<void> {
    await marketService.syncBcrRosarioPrices(1);
  }
}

export const bcrScheduler = BcrScheduler.getInstance();
