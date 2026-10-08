import { buildApp } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';
import { migrate } from './migrate.js';
import { runStartupSeeds } from './services/samples.js';
import { startWorker } from './worker.js';

async function main() {
  try {
    await migrate();
  } catch (e) {
    console.error(`No se pudo preparar la base de datos (${config.databaseUrl.replace(/\/\/[^@]*@/, '//***@')}): ${(e as Error).message}`);
    process.exit(1);
  }
  if (config.demo) {
    // Instalación de prueba: clientes de ejemplo e inventario básico, una sola vez.
    await runStartupSeeds()
      .then((r) => r && console.log(`Carga inicial: ${r.clients} clientes de ejemplo, ${r.items} artículos de inventario`))
      .catch((e) => console.error('Carga inicial fallida:', (e as Error).message));
  }
  const app = await buildApp({ logger: config.env === 'production' });
  await app.listen({ port: config.port, host: config.host });
  console.log(`TallerPro ${config.version} escuchando en ${config.host}:${config.port}`);
  const stop = config.disableWorker ? () => {} : startWorker(config.workerIntervalMs);

  const shutdown = async () => {
    stop();
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => {
  console.error('Error al arrancar el servidor:', e);
  process.exit(1);
});
