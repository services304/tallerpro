-- Registro de ubicación del personal mientras usa la app (taller móvil).
ALTER TABLE settings ADD COLUMN track_staff_location boolean NOT NULL DEFAULT true;
CREATE TABLE user_locations (
  id           bigserial PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lat          double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng          double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  accuracy_m   integer,
  kind         text NOT NULL CHECK (kind IN ('open','heartbeat','action')),
  action       text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX user_locations_user_time_idx ON user_locations (user_id, created_at DESC);
CREATE INDEX user_locations_time_idx ON user_locations (created_at DESC);
