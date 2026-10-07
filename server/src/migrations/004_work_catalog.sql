-- Tipos de trabajo con categoría y nombre en FR / EN / ES (la línea de la factura sale en el idioma del cliente).
ALTER TABLE work_types ADD COLUMN category text NOT NULL DEFAULT 'other';
ALTER TABLE work_types ADD COLUMN names jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE work_types ADD COLUMN suggested_key text;
CREATE UNIQUE INDEX work_types_suggested_uq ON work_types(suggested_key) WHERE suggested_key IS NOT NULL;
UPDATE work_types SET names = jsonb_build_object('fr', name) WHERE names = '{}'::jsonb;
