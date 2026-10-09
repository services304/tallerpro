-- Ubicación exacta (GPS) del lugar del servicio: el taller es móvil.
ALTER TABLE visits ADD COLUMN lat double precision CHECK (lat IS NULL OR lat BETWEEN -90 AND 90);
ALTER TABLE visits ADD COLUMN lng double precision CHECK (lng IS NULL OR lng BETWEEN -180 AND 180);
ALTER TABLE visits ADD COLUMN location_accuracy_m integer;
ALTER TABLE clients ADD COLUMN lat double precision CHECK (lat IS NULL OR lat BETWEEN -90 AND 90);
ALTER TABLE clients ADD COLUMN lng double precision CHECK (lng IS NULL OR lng BETWEEN -180 AND 180);
