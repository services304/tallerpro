-- Reservas en línea: el cliente pide una cita desde una página pública; el dueño la confirma.
ALTER TABLE settings ADD COLUMN booking_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE settings ADD COLUMN booking_days integer[] NOT NULL DEFAULT '{1,2,3,4,5,6}'::integer[]; -- 1 = lunes … 7 = domingo
ALTER TABLE settings ADD COLUMN booking_start_hour integer NOT NULL DEFAULT 8 CHECK (booking_start_hour BETWEEN 0 AND 23);
ALTER TABLE settings ADD COLUMN booking_end_hour integer NOT NULL DEFAULT 18 CHECK (booking_end_hour BETWEEN 1 AND 24);
ALTER TABLE settings ADD COLUMN booking_slot_minutes integer NOT NULL DEFAULT 90 CHECK (booking_slot_minutes BETWEEN 15 AND 480);
ALTER TABLE settings ADD COLUMN booking_min_notice_hours integer NOT NULL DEFAULT 12 CHECK (booking_min_notice_hours BETWEEN 0 AND 336);
ALTER TABLE settings ADD COLUMN booking_max_days integer NOT NULL DEFAULT 21 CHECK (booking_max_days BETWEEN 1 AND 120);

ALTER TABLE visits DROP CONSTRAINT IF EXISTS visits_status_check;
ALTER TABLE visits ADD CONSTRAINT visits_status_check CHECK (status IN ('requested','scheduled','on_the_way','in_progress','done','cancelled'));
ALTER TABLE visits ADD COLUMN source text NOT NULL DEFAULT 'staff' CHECK (source IN ('staff','online'));
ALTER TABLE visits ADD COLUMN work_type_id uuid REFERENCES work_types(id) ON DELETE SET NULL;
ALTER TABLE visits ADD COLUMN client_message text NOT NULL DEFAULT '';
