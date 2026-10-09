-- El cliente puede pedir servicio a domicilio o traer el vehículo.
ALTER TABLE settings ADD COLUMN dropoff_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE settings ADD COLUMN dropoff_fee_cents integer NOT NULL DEFAULT 0 CHECK (dropoff_fee_cents >= 0);
UPDATE settings SET dropoff_fee_cents = visit_fee_cents;
ALTER TABLE visits ADD COLUMN service_mode text NOT NULL DEFAULT 'home' CHECK (service_mode IN ('home','dropoff'));
