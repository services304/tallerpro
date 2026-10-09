-- Mapa de trabajo: las visitas con dirección escrita pero sin GPS se ubican solas (una vez).
ALTER TABLE visits ADD COLUMN geocode_tried_at timestamptz;
CREATE INDEX visits_geo_idx ON visits (scheduled_start) WHERE lat IS NOT NULL;
