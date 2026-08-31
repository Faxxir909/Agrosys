import http from 'http';

function checkPort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/whatsapp/status`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ port, ok: true, status: res.statusCode, data });
      });
    });
    req.on('error', (err) => {
      resolve({ port, ok: false, error: err.message });
    });
    req.setTimeout(1500, () => {
      req.destroy();
      resolve({ port, ok: false, error: 'TIMEOUT' });
    });
  });
}

async function run() {
  console.log('Verificando puertos locales...');
  for (const p of [3000, 3001, 3002, 5173, 8080]) {
    const res = await checkPort(p);
    console.log(`Puerto ${p}:`, res.ok ? `ACTIVO (Status ${res.status})` : `Inactivo (${res.error})`);
  }
}

run();
