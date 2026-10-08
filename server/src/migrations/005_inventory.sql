-- Inventario: piezas y consumibles que el taller tiene (en la camioneta o en el taller).
CREATE TABLE inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  part_number text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'other',
  unit text NOT NULL DEFAULT 'unit',
  location text NOT NULL DEFAULT 'van',
  quantity numeric(12,2) NOT NULL DEFAULT 0,
  min_quantity numeric(12,2) NOT NULL DEFAULT 0,
  cost_cents integer NOT NULL DEFAULT 0,      -- costo promedio por unidad
  price_cents integer NOT NULL DEFAULT 0,     -- precio al cliente por unidad
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  notes text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_items_name_idx ON inventory_items (lower(name));

-- Cada entrada y salida queda registrada (compra, uso en una orden, devolución, ajuste, conteo).
CREATE TABLE inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('initial','purchase','use','return','adjust','count')),
  quantity numeric(12,2) NOT NULL,            -- con signo: + entra, - sale
  unit_cost_cents integer,
  balance numeric(12,2) NOT NULL,             -- existencia después del movimiento
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  order_line_id uuid REFERENCES order_lines(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  note text NOT NULL DEFAULT '',
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX inventory_movements_item_idx ON inventory_movements (item_id, created_at DESC);

ALTER TABLE order_lines ADD COLUMN inventory_item_id uuid REFERENCES inventory_items(id) ON DELETE SET NULL;
ALTER TABLE order_lines ADD COLUMN stock_taken boolean NOT NULL DEFAULT false;
