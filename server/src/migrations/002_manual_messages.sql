-- Modo de mensajes: 'auto' (Twilio envía solo) o 'manual' (el dueño envía desde su celular, sin costo).
ALTER TABLE settings ADD COLUMN messaging_mode text NOT NULL DEFAULT 'manual'
  CHECK (messaging_mode IN ('auto', 'manual'));

-- Nuevo estado: aviso preparado que espera que el dueño lo envíe desde su teléfono.
ALTER TABLE notifications DROP CONSTRAINT notifications_status_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_status_check
  CHECK (status IN ('queued', 'manual', 'sent', 'delivered', 'failed', 'skipped'));
CREATE INDEX notifications_manual_idx ON notifications(created_at) WHERE status = 'manual';
