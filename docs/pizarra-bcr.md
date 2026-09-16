# Pizarra oficial CAC-BCR

La fuente activa es https://www.cac.bcr.com.ar/es. No requiere claves BCR ni Gemini.
La consulta SOAP `https://services.bcr.com.ar/cotiza/wsCotizaciones.asmx`
(`GetCotizaciones`) se probó el 16/09/2026 y devolvió precios del 10/08/2020;
por eso no se utiliza como fuente vigente ni como respaldo.

## Comportamiento

- El servidor consulta la publicación al iniciar y cada 30 minutos. La lectura del
  tablero también intenta actualizar si pasaron 15 minutos desde el último intento.
- Conserva ARS/tn, USD/tn informativo tal como lo publica la Cámara, tipo de cambio
  BNA divisa comprador, fecha del mercado y condición estimativa. No calcula precios
  con IA ni mezcla FOB, futuros u otros mercados.
- Valida los cinco granos, formato, fecha y coherencia entre importes y cambio.
  Rechaza publicaciones con más de siete días y páginas con formato desconocido.
- S/C sin estimación se almacena como null. Los estimativos se identifican en el
  tablero y se excluyen del gráfico y de los valores del endpoint legado.
- Los cinco registros se guardan juntos en una transacción, con source=BCR_CAC_WEB.
  La fecha de consulta queda registrada en market_sync_logs. La fecha del mercado
  no se reemplaza por la fecha de consulta.
- Ante fallos se conserva la última publicación verificada con advertencia. Sin
  datos previos se informa indisponibilidad. Consultar precios no envía WhatsApp.
- Se excluyen de las consultas los registros anteriores de Gemini o de demostración;
  no se borran datos existentes. Se eliminó la generación inicial de precios ficticios
  en PostgreSQL. El histórico se acumula con las publicaciones observadas: la fuente
  pública no ofrece una descarga histórica en este adaptador.

## Verificación

La fixture de pruebas contiene el bloque real de la publicación del 15/09/2026,
capturado el 16/09/2026. Ejecutar con Node 22 compatible con strip-types o Node 24:

```sh
node --experimental-strip-types --test src/services/market/__tests__/bcrPublicProvider.test.ts
npm run lint
npm run build
```

Si CAC cambia el HTML, el lector falla explícitamente; actualizarlo contra una
publicación real y sus pruebas antes de reanudar la ingestión. La integración GIX
preexistente permanece en el repositorio, pero no es el proveedor activo.
