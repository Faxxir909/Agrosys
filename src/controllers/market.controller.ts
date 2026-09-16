import type { Request, Response } from 'express';
import { marketService } from '../services/market/marketService.ts';
import { calculateOpportunitySpread } from '../services/market/opportunityComparison.ts';
import type { GrainCode } from '../services/market/types.ts';

/**
 * GET /api/market/rosario
 * Obtiene las cotizaciones oficiales de la Pizarra Rosario más recientes
 * para los 5 granos principales (Soja, Maíz, Trigo, Girasol, Sorgo).
 */
export async function getCurrentRosarioPrices(_req: Request, res: Response) {
  try {
    const data = await marketService.getRosarioCurrentPrices();
    return res.json(data);
  } catch (error: any) {
    console.error('[MarketController] Error en getCurrentRosarioPrices:', error?.message || error);
    return res.status(500).json({
      success: false,
      error: 'Error interno al consultar las cotizaciones de la Pizarra Rosario.',
    });
  }
}

/**
 * GET /api/market/rosario/history
 * Obtiene la serie temporal histórica de cotizaciones de Rosario.
 * Query params:
 * - grain: 'soja' | 'maiz' | 'trigo' | 'girasol' | 'sorgo'
 * - days: número de días hacia atrás (ej: 7, 30, 90, 180, 365)
 * - currency: 'ARS' | 'USD' | 'ALL'
 */
export async function getRosarioHistory(req: Request, res: Response) {
  try {
    const grainParam = req.query.grain ? String(req.query.grain).toLowerCase().trim() : undefined;
    const daysParam = req.query.days ? parseInt(String(req.query.days), 10) : 30;
    const currencyParam = req.query.currency ? String(req.query.currency).toUpperCase().trim() : 'ALL';
    const limitParam = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;

    const days = Math.min(Math.max(Number.isFinite(daysParam) ? daysParam : 30, 1), 365);

    let startDate: string | undefined;
    const start = new Date();
    start.setDate(start.getDate() - days);
    startDate = start.toISOString().split('T')[0];

    const history = await marketService.getRosarioHistory({
      grain: grainParam as GrainCode | undefined,
      days,
      startDate,
      currency: currencyParam as any,
      limit: limitParam,
    });

    return res.json({
      success: true,
      grain: grainParam || 'all',
      days,
      count: history.length,
      data: history,
    });
  } catch (error: any) {
    console.error('[MarketController] Error en getRosarioHistory:', error?.message || error);
    return res.status(500).json({
      success: false,
      error: 'Error interno al consultar el histórico de cotizaciones.',
    });
  }
}

/**
 * POST /api/market/rosario/sync
 * Fuerza una sincronización manual con la API oficial de BCR GIX.
 * Body opcional: { daysBack?: number }
 */
export async function syncRosarioPrices(req: Request, res: Response) {
  try {
    const daysBack = req.body?.daysBack ? parseInt(String(req.body.daysBack), 10) : 7;
    const boundedDays = Math.min(Math.max(Number.isFinite(daysBack) ? daysBack : 7, 1), 60);

    const result = await marketService.syncBcrRosarioPrices(boundedDays);

    if (!result.success) {
      return res.status(200).json({
        success: false,
        message: result.message || 'No se pudo consultar la publicación oficial de BCR.',
        log: {
          status: 'error',
          recordsReceived: 0,
          recordsSaved: 0,
          priceDate: null,
          errorMessage: result.message || 'Publicación no disponible',
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: `Sincronización exitosa: ${result.saved} cotizaciones actualizadas.`,
      log: {
        status: 'success',
        recordsReceived: result.received,
        recordsSaved: result.saved,
        priceDate: result.priceDate || null,
        errorMessage: null,
      },
    });
  } catch (error: any) {
    console.error('[MarketController] Error en syncRosarioPrices:', error?.message || error);
    return res.status(500).json({
      success: false,
      error: 'Error inesperado durante la sincronización con BCR GIX.',
    });
  }
}

/**
 * GET /api/market/rosario/status
 * Devuelve el estado de integración con la API oficial BCR GIX:
 * si están configuradas las credenciales, si se conectó exitosamente y última fecha registrada.
 */
export async function getIntegrationStatus(_req: Request, res: Response) {
  try {
    const status = await marketService.getIntegrationStatus();
    return res.json(status);
  } catch (error: any) {
    console.error('[MarketController] Error en getIntegrationStatus:', error?.message || error);
    return res.status(500).json({
      provider: 'BCR_CAC_WEB',
      connected: false,
      configured: false,
      error: 'Error al consultar el estado de la integración.',
    });
  }
}

/**
 * GET /api/market/compare
 * Compara un precio ofrecido de oportunidad comercial contra la cotización oficial de Pizarra Rosario.
 * Query params:
 * - grain: 'soja' | 'maiz' | 'trigo' | 'girasol' | 'sorgo'
 * - offeredPrice: number
 * - currency: 'ARS' | 'USD'
 * - quantityTn: number (opcional)
 */
export async function compareOpportunity(req: Request, res: Response) {
  try {
    const grain = req.query.grain ? String(req.query.grain).toLowerCase().trim() : '';
    const offeredPrice = req.query.offeredPrice ? parseFloat(String(req.query.offeredPrice)) : NaN;
    const currency = (req.query.currency ? String(req.query.currency).toUpperCase().trim() : 'USD') as 'ARS' | 'USD';
    const quantityTn = req.query.quantityTn ? parseFloat(String(req.query.quantityTn)) : 0;

    if (!grain || isNaN(offeredPrice) || offeredPrice <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Parámetros obligatorios inválidos: grain y offeredPrice (> 0).',
      });
    }

    const latestPrice = await marketService.getLatestPizarraPriceForGrain(grain);
    if (!latestPrice) {
      return res.json({
        success: false,
        hasReference: false,
        message: `No hay cotización de Pizarra Rosario disponible para el grano '${grain}'.`,
      });
    }

    // Convertir precio a USD si vino en ARS y se tiene tipo de cambio oficial
    let priceUsd = offeredPrice;
    if (currency === 'ARS') {
      const tc = latestPrice.exchangeRate || 1;
      priceUsd = offeredPrice / tc;
    }

    const comparison = calculateOpportunitySpread(
      grain as GrainCode,
      priceUsd,
      quantityTn,
      latestPrice
    );

    return res.json({
      success: true,
      hasReference: Boolean(comparison),
      comparison,
    });
  } catch (error: any) {
    console.error('[MarketController] Error en compareOpportunity:', error?.message || error);
    return res.status(500).json({
      success: false,
      error: 'Error al calcular la comparación con la Pizarra.',
    });
  }
}
