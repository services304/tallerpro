-- Clientes de ejemplo (para probar la app; se borran de un toque) e inventario básico sugerido.
ALTER TABLE clients ADD COLUMN is_sample boolean NOT NULL DEFAULT false;
ALTER TABLE vehicles ADD COLUMN is_sample boolean NOT NULL DEFAULT false;
ALTER TABLE inventory_items ADD COLUMN starter_key text;
CREATE UNIQUE INDEX inventory_items_starter_uq ON inventory_items(starter_key) WHERE starter_key IS NOT NULL;
