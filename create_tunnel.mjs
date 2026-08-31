import localtunnel from 'localtunnel';

async function start() {
  console.log('Iniciando túnel seguro para AgroSys (puerto 3000)...');
  try {
    const tunnel = await localtunnel({ port: 3000 });
    console.log('\n======================================================');
    console.log('🔗 ENLACE PÚBLICO ACTIVO PARA EL CLIENTE:');
    console.log(tunnel.url);
    console.log('======================================================\n');
    console.log('Tu cliente puede acceder directamente con el enlace anterior.');

    tunnel.on('close', () => {
      console.log('Túnel cerrado.');
    });

    tunnel.on('error', (err) => {
      console.error('Error en el túnel:', err);
    });
  } catch (err) {
    console.error('No se pudo abrir el túnel:', err);
  }
}

start();
