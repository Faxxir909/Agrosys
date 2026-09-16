import type { RawBcrPreciosCamaraItem } from './types.ts';

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
}

/**
 * Valida y extrae el listado de registros crudos desde una respuesta de BCR GIX.
 * Tolera estructuras como arrays directos o contenedores { data: [...] }, { result: [...] }, etc.
 */
export function validateBcrPreciosResponse(payload: unknown): RawBcrPreciosCamaraItem[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  let items: unknown[] = [];

  if (Array.isArray(payload)) {
    items = payload;
  } else {
    const obj = payload as Record<string, unknown>;
    const candidate = obj.data || obj.result || obj.results || obj.items || obj.precios || obj.cotizaciones || obj.PreciosCamara;
    if (Array.isArray(candidate)) {
      items = candidate;
    } else {
      // Podría ser un único objeto devuelto
      items = [obj];
    }
  }

  const validItems: RawBcrPreciosCamaraItem[] = [];

  for (const item of items) {
    if (isValidBcrRecord(item)) {
      validItems.push(item);
    }
  }

  return validItems;
}

/**
 * Verifica si un registro crudo devuelto por BCR contiene al menos la estructura básica
 * necesaria para ser normalizado (información de grano y precio o fecha).
 */
export function isValidBcrRecord(record: unknown): record is RawBcrPreciosCamaraItem {
  if (!record || typeof record !== 'object') {
    return false;
  }

  const r = record as Record<string, unknown>;

  // Debe poseer alguna referencia al grano (id o nombre)
  const hasGrain =
    r.id_Grano !== undefined ||
    r.idGrano !== undefined ||
    typeof r.grano === 'string' ||
    typeof r.nombre_Grano === 'string';

  if (!hasGrain) {
    return false;
  }

  // Debe tener algún precio o fecha
  const hasPrice =
    r.precio_Cotizacion !== undefined ||
    r.precioCotizacion !== undefined ||
    r.precio_Dolar !== undefined ||
    r.precioDolar !== undefined;

  const hasDate =
    typeof r.fecha_Operacion_Pizarra === 'string' ||
    typeof r.fechaOperacion === 'string' ||
    typeof r.fecha === 'string';

  return hasPrice || hasDate;
}
