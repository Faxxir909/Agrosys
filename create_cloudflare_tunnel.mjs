import { startTunnel } from 'untun';

async function start() {
  console.log('Iniciando Cloudflare Tunnel para AgroSys (puerto 3000)...');
  try {
    const tunnel = await startTunnel({
      url: 'http://localhost:3000',
    });
    
    const url = await tunnel.getURL();
    console.log('\n======================================================');
    console.log('🚀 ENLACE PÚBLICO CLOUDFLARE HTTPS LISTO:');
    console.log(url);
    console.log('======================================================\n');
    console.log('Puedes compartir este enlace directamente con tu cliente.');
  } catch (err) {
    console.error('Error iniciando Cloudflare tunnel:', err);
  }
}

start();
