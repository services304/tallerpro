import { processQueue } from './lib/notify.js';
import { sendVisitReminders } from './routes/visits.js';

/** Tareas en segundo plano: envío de avisos en cola y recordatorios de visita. */
export function startWorker(intervalMs: number, log: (msg: string) => void = console.log) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await sendVisitReminders();
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
