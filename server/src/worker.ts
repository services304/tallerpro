import { processQueue } from './lib/notify.js';
import { sendVisitReminders } from './routes/visits.js';
import { q } from './db.js';
import { config } from './config.js';
import { geocodePendingVisits } from './routes/heatmap.js';

/** Tareas en segundo plano: envío de avisos en cola y recordatorios de visita. */
export function startWorker(intervalMs: number, log: (msg: string) => void = console.log) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await sendVisitReminders();
      // Ley 25: el registro de ubicación del personal no se guarda más de 12 meses.
      await q(`DELETE FROM user_locations WHERE created_at < now() - interval '365 days'`);
      // Ubicar en el mapa las visitas que solo tienen dirección escrita.
      if (config.env !== 'test') await geocodePendingVisits();
      while ((await processQueue()) > 0) {
        /* vaciar la cola */
      }
    } catch (e) {
      log(`error en tareas de fondo: ${(e as Error).message}`);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  void tick();
  return () => clearInterval(timer);
}
