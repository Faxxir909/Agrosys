import type { GrainCode, MarketPrice } from './types.ts';

export const BCR_PIZARRA_URL = 'https://www.cac.bcr.com.ar/es';
export const BCR_PUBLIC_SOURCE = 'BCR_CAC_WEB' as const;
const GRAINS: GrainCode[] = ['soja', 'maiz', 'trigo', 'sorgo', 'girasol'];

function plainText(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim();
}

function amount(value: string): number {
  if (!/^\d{1,3}(?:\.\d{3})*,\d{2}$|^\d+,\d{2}$/.test(value)) {
    throw new Error('Formato de importe BCR no reconocido');
  }
  const result = Number(value.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(result) || result <= 0) throw new Error('Importe BCR inválido');
  return result;
}

/** Reads only the observed official board markup. A changed/incomplete page fails closed. */
export function parseBcrPublicBoard(html: string, now = new Date()): MarketPrice[] {
  const heading = /Precios Pizarra del día\s+(\d{2})\/(\d{2})\/(\d{4})/.exec(html);
  if (!heading) throw new Error('BCR no publicó una fecha de pizarra reconocible');
  const priceDate = `${heading[3]}-${heading[2]}-${heading[1]}`;
  const date = new Date(`${priceDate}T12:00:00-03:00`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== priceDate ||
      date.getTime() > now.getTime() + 86400000 || now.getTime() - date.getTime() > 7 * 86400000) {
    throw new Error('La fecha publicada por BCR es inválida o tiene más de siete días');
  }
  const footerIndex = html.indexOf('class="price-board-footer"', heading.index);
  if (footerIndex < 0) throw new Error('No se encontró el pie de la pizarra oficial');
  const board = html.slice(heading.index, footerIndex);
  const footer = plainText(html.slice(footerIndex, footerIndex + 2500));
  const rate = /TC BNA Divisas Comprador\s+(\d{2}\/\d{2}\/\d{4}):\s*\$\s*([\d.,]+)/.exec(footer);
  if (!rate || rate[1] !== `${heading[1]}/${heading[2]}/${heading[3]}`) {
    throw new Error('BCR no publicó el tipo de cambio para la fecha de pizarra');
  }
  const exchangeRate = amount(rate[2]);
  const blocks = [...board.matchAll(/<div\s+class="board board-([a-z]+)\s*"[^>]*>/g)];
  const result = new Map<GrainCode, MarketPrice>();
  for (let i = 0; i < blocks.length; i++) {
    const grain = blocks[i][1] as GrainCode;
    if (!GRAINS.includes(grain) || result.has(grain)) throw new Error('Grano BCR inesperado o duplicado');
    const block = board.slice(blocks[i].index, blocks[i + 1]?.index ?? board.length);
    const arsBlock = /<div class="price">([\s\S]*?)<\/div>/.exec(block)?.[1];
    if (arsBlock === undefined) throw new Error(`Precio BCR ausente para ${grain}`);
    const arsText = plainText(arsBlock);
    const isEstimated = /\(E\)/.test(arsText);
    const noQuote = /S\/C/.test(arsText);
    const ars = /\$\s*([\d.,]+)/.exec(arsText);
    const usd = /US\$\s*(?:\(E\)\s*)?([\d.,]+)/.exec(plainText(block));
    if ((!ars && !noQuote) || (isEstimated && !ars) || (noQuote && ars && !isEstimated)) {
      throw new Error(`Estado de cotización BCR no reconocido para ${grain}`);
    }
    const priceArs = ars ? amount(ars[1]) : null;
    const priceUsd = usd ? amount(usd[1]) : null;
    if ((priceArs === null) !== (priceUsd === null)) throw new Error(`Monedas incompletas para ${grain}`);
    if (priceArs !== null && priceUsd !== null && Math.abs(priceArs / exchangeRate - priceUsd) > 0.02) {
      throw new Error(`Conversión publicada inconsistente para ${grain}`);
    }
    result.set(grain, {
      grain, market: 'Rosario', priceArs, priceUsd, isEstimated, exchangeRate,
      priceDate, source: BCR_PUBLIC_SOURCE, variationArs: null,
      movement: block.includes('fa-arrow-up') ? 1 : block.includes('fa-arrow-down') ? -1 : null,
    });
  }
  if (result.size !== GRAINS.length) throw new Error('La pizarra BCR está incompleta');
  return GRAINS.map(grain => result.get(grain)!);
}

export async function fetchBcrPublicPrices(): Promise<MarketPrice[]> {
  const response = await fetch(BCR_PIZARRA_URL, {
    headers: { Accept: 'text/html', 'User-Agent': 'AgroSys/1.0 (official market prices)' },
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`La publicación BCR respondió HTTP ${response.status}`);
  if (!response.headers.get('content-type')?.includes('text/html')) throw new Error('Respuesta BCR no reconocida');
  const html = await response.text();
  if (html.length > 2_000_000) throw new Error('Publicación BCR demasiado grande');
  return parseBcrPublicBoard(html);
}
