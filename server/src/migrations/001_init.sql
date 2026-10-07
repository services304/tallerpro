-- TallerPro — esquema inicial (fase 1)
-- Montos en centavos (enteros). Fechas en timestamptz (UTC).

CREATE TABLE settings (
  id                 integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  shop_name          text    NOT NULL DEFAULT 'TallerPro',
  shop_address       text    NOT NULL DEFAULT '',
  shop_phone         text    NOT NULL DEFAULT '',
  shop_email         text    NOT NULL DEFAULT '',
  taxes_registered   boolean NOT NULL DEFAULT true,
  gst_number         text    NOT NULL DEFAULT '',
  qst_number         text    NOT NULL DEFAULT '',
  visit_fee_cents    integer NOT NULL DEFAULT 9000 CHECK (visit_fee_cents >= 0),
  labor_rate_cents   integer NOT NULL DEFAULT 9000 CHECK (labor_rate_cents >= 0),
  parts_margin_bp    integer NOT NULL DEFAULT 3000 CHECK (parts_margin_bp >= 0), -- 3000 = 30 %
  quote_valid_days   integer NOT NULL DEFAULT 15 CHECK (quote_valid_days > 0),
  default_lang       text    NOT NULL DEFAULT 'fr' CHECK (default_lang IN ('fr','en','es')),
  quiet_start_hour   integer NOT NULL DEFAULT 21 CHECK (quiet_start_hour BETWEEN 0 AND 23),
  quiet_end_hour     integer NOT NULL DEFAULT 8  CHECK (quiet_end_hour BETWEEN 0 AND 23),
  warranty_text      jsonb   NOT NULL DEFAULT '{}'::jsonb,
  updated_at         timestamptz NOT NULL DEFAULT now()
);
INSERT INTO settings (id, warranty_text) VALUES (1, jsonb_build_object(
  'fr', 'Garantie sur la réparation : 3 mois ou 5 000 km, selon la première éventualité.',
  'en', 'Repair warranty: 3 months or 5,000 km, whichever comes first.',
  'es', 'Garantía de la reparación: 3 meses o 5 000 km, lo que ocurra primero.'));

CREATE TABLE counters (
  name  text PRIMARY KEY,
  value bigint NOT NULL
);
INSERT INTO counters (name, value) VALUES ('invoice', 1000);

CREATE TABLE users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  email            text NOT NULL,
  phone            text,
  role             text NOT NULL CHECK (role IN ('admin','reception','mechanic')),
  is_mechanic      boolean NOT NULL DEFAULT false,
  password_hash    text NOT NULL,
  lang             text NOT NULL DEFAULT 'es' CHECK (lang IN ('fr','en','es')),
  active           boolean NOT NULL DEFAULT true,
  failed_attempts  integer NOT NULL DEFAULT 0,
  locked_until     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_uq ON users (lower(email));

CREATE TABLE sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz NOT NULL DEFAULT now(),
  user_agent    text
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE password_resets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);

CREATE TABLE import_batches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind           text NOT NULL CHECK (kind IN ('clients')),
  filename       text NOT NULL,
  mapping        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_count  integer NOT NULL DEFAULT 0,
  updated_count  integer NOT NULL DEFAULT 0,
  skipped_count  integer NOT NULL DEFAULT 0,
  user_id        uuid REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  undone_at      timestamptz
);

CREATE TABLE clients (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  phone            text,              -- E.164 (+15145551234)
  email            text,
  address          text NOT NULL DEFAULT '',
  lang             text NOT NULL DEFAULT 'fr' CHECK (lang IN ('fr','en','es')),
  channels         text[] NOT NULL DEFAULT ARRAY['sms']::text[],
  notes_internal   text NOT NULL DEFAULT '',
  import_batch_id  uuid REFERENCES import_batches(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  anonymized_at    timestamptz,
  CHECK (channels <@ ARRAY['sms','whatsapp','email']::text[])
);
CREATE INDEX clients_phone_idx ON clients(phone);
CREATE INDEX clients_email_idx ON clients(lower(email));
CREATE INDEX clients_name_idx ON clients(lower(name));

CREATE TABLE consents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('service','maintenance','promo')),
  granted     boolean NOT NULL,
  source      text NOT NULL,           -- 'intake', 'portal', 'staff', 'sms_stop'
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consents_client_idx ON consents(client_id, kind, created_at DESC);

CREATE TABLE vehicles (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vin            text,
  plate          text,
  make           text NOT NULL DEFAULT '',
  model          text NOT NULL DEFAULT '',
  year           integer CHECK (year IS NULL OR year BETWEEN 1950 AND 2100),
  engine         text NOT NULL DEFAULT '',
  color          text NOT NULL DEFAULT '',
  last_odometer  integer CHECK (last_odometer IS NULL OR last_odometer >= 0),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vehicles_vin_idx ON vehicles(upper(vin));
CREATE INDEX vehicles_plate_idx ON vehicles(upper(plate));

CREATE TABLE vehicle_owners (
  vehicle_id  uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  since       timestamptz NOT NULL DEFAULT now(),
  until       timestamptz,
  PRIMARY KEY (vehicle_id, client_id, since)
);

CREATE TABLE work_types (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  mode              text NOT NULL CHECK (mode IN ('fixed','hourly')),
  price_cents       integer NOT NULL CHECK (price_cents >= 0),
  est_minutes       integer CHECK (est_minutes IS NULL OR est_minutes > 0),
  active            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE suppliers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  contact_name  text NOT NULL DEFAULT '',
  phone         text,
  email         text,
  notes         text NOT NULL DEFAULT '',
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number            text NOT NULL UNIQUE,
  client_id         uuid NOT NULL REFERENCES clients(id),
  vehicle_id        uuid NOT NULL REFERENCES vehicles(id),
  status            text NOT NULL DEFAULT 'received' CHECK (status IN (
                      'received','diagnosis','parts_quote','quote_sent','approved','rejected',
                      'waiting_parts','in_repair','quality_check','ready','delivered','closed','cancelled')),
  odometer_in       integer CHECK (odometer_in IS NULL OR odometer_in >= 0),
  fuel_level        integer CHECK (fuel_level IS NULL OR fuel_level BETWEEN 0 AND 8), -- octavos
  reason            text NOT NULL DEFAULT '',
  diagnosis         text NOT NULL DEFAULT '',
  service_address   text NOT NULL DEFAULT '',
  promised_at       timestamptz,
  priority          text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  return_parts      boolean NOT NULL DEFAULT false,
  waive_estimate    boolean NOT NULL DEFAULT false,
  contact_first     boolean NOT NULL DEFAULT true,
  items_left        text NOT NULL DEFAULT '',
  assigned_user_id  uuid REFERENCES users(id),
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  closed_at         timestamptz
);
CREATE INDEX orders_status_idx ON orders(status);
CREATE INDEX orders_client_idx ON orders(client_id);

CREATE TABLE order_status_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status  text,
  to_status    text NOT NULL,
  user_id      uuid REFERENCES users(id),
  actor        text NOT NULL DEFAULT 'staff' CHECK (actor IN ('staff','client','system')),
  note         text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX osh_order_idx ON order_status_history(order_id, created_at);

CREATE TABLE visits (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         uuid NOT NULL REFERENCES clients(id),
  vehicle_id        uuid REFERENCES vehicles(id),
  order_id          uuid REFERENCES orders(id) ON DELETE SET NULL,
  purpose           text NOT NULL DEFAULT 'diagnosis' CHECK (purpose IN ('diagnosis','repair','other')),
  address           text NOT NULL,
  scheduled_start   timestamptz NOT NULL,
  scheduled_end     timestamptz NOT NULL,
  status            text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','on_the_way','in_progress','done','cancelled')),
  visit_fee_cents   integer NOT NULL CHECK (visit_fee_cents >= 0),
  notes             text NOT NULL DEFAULT '',
  reminder_sent_at  timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (scheduled_end > scheduled_start)
);
CREATE INDEX visits_start_idx ON visits(scheduled_start);

CREATE TABLE parts_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  description  text NOT NULL,
  part_number  text NOT NULL DEFAULT '',
  quantity     numeric(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','quoted','chosen','ordered','received')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE supplier_offers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id       uuid NOT NULL REFERENCES parts_requests(id) ON DELETE CASCADE,
  supplier_id      uuid NOT NULL REFERENCES suppliers(id),
  unit_cost_cents  integer NOT NULL CHECK (unit_cost_cents > 0),
  availability     text NOT NULL DEFAULT '',
  lead_days        integer CHECK (lead_days IS NULL OR lead_days >= 0),
  condition        text NOT NULL DEFAULT 'new' CHECK (condition IN ('new','used','rebuilt')),
  channel          text NOT NULL DEFAULT 'phone' CHECK (channel IN ('email','sms','phone','other')),
  chosen           boolean NOT NULL DEFAULT false,
  notes            text NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX supplier_offers_one_chosen ON supplier_offers(request_id) WHERE chosen;

CREATE TABLE order_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind              text NOT NULL CHECK (kind IN ('labor','part','fee','discount')),
  description       text NOT NULL,
  work_type_id      uuid REFERENCES work_types(id),
  parts_request_id  uuid REFERENCES parts_requests(id) ON DELETE SET NULL,
  quantity          numeric(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_cents  integer NOT NULL CHECK (unit_price_cents >= 0),
  unit_cost_cents   integer NOT NULL DEFAULT 0 CHECK (unit_cost_cents >= 0),
  part_condition    text CHECK (part_condition IS NULL OR part_condition IN ('new','used','rebuilt')),
  approval          text NOT NULL DEFAULT 'pending' CHECK (approval IN ('pending','approved','rejected')),
  position          integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_lines_order_idx ON order_lines(order_id, position);

CREATE TABLE time_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  line_id     uuid REFERENCES order_lines(id) ON DELETE SET NULL,
  user_id     uuid NOT NULL REFERENCES users(id),
  started_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz,
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE TABLE photos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  author_id     uuid REFERENCES users(id),
  stage         text NOT NULL CHECK (stage IN ('intake','diagnosis','during','after')),
  kind          text NOT NULL DEFAULT 'photo' CHECK (kind IN ('photo','video')),
  caption       text NOT NULL DEFAULT '',
  damage_zone   text,
  storage_key   text NOT NULL,
  mime          text NOT NULL,
  size_bytes    integer NOT NULL,
  shared        boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX photos_order_idx ON photos(order_id, created_at);

CREATE TABLE signatures (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('intake','quote','delivery')),
  signer_name  text NOT NULL,
  storage_key  text NOT NULL,
  ip           text,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE quotes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  version         integer NOT NULL,
  status          text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','approved','partial','rejected','superseded')),
  subtotal_cents  integer NOT NULL,
  gst_cents       integer NOT NULL,
  qst_cents       integer NOT NULL,
  total_cents     integer NOT NULL,
  valid_until     date NOT NULL,
  sent_at         timestamptz NOT NULL DEFAULT now(),
  decided_at      timestamptz,
  decided_by      text CHECK (decided_by IS NULL OR decided_by IN ('client','staff')),
  decided_ip      text,
  signature_id    uuid REFERENCES signatures(id),
  created_by      uuid REFERENCES users(id),
  UNIQUE (order_id, version)
);

CREATE TABLE quote_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id          uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  order_line_id     uuid REFERENCES order_lines(id) ON DELETE SET NULL,
  kind              text NOT NULL,
  description       text NOT NULL,
  quantity          numeric(10,2) NOT NULL,
  unit_price_cents  integer NOT NULL,
  total_cents       integer NOT NULL,
  part_condition    text,
  decision          text NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending','approved','rejected')),
  position          integer NOT NULL DEFAULT 0
);

CREATE TABLE invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number          bigint NOT NULL UNIQUE,
  order_id        uuid REFERENCES orders(id),
  client_id       uuid NOT NULL REFERENCES clients(id),
  kind            text NOT NULL CHECK (kind IN ('repair','inspection')),
  lang            text NOT NULL CHECK (lang IN ('fr','en','es')),
  subtotal_cents  integer NOT NULL,
  gst_cents       integer NOT NULL,
  qst_cents       integer NOT NULL,
  total_cents     integer NOT NULL,
  paid_cents      integer NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','partial','paid','void')),
  gst_number      text NOT NULL DEFAULT '',
  qst_number      text NOT NULL DEFAULT '',
  warranty_text   text NOT NULL DEFAULT '',
  issued_at       timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES users(id)
);
CREATE INDEX invoices_client_idx ON invoices(client_id);

CREATE TABLE invoice_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id        uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  kind              text NOT NULL,
  description       text NOT NULL,
  quantity          numeric(10,2) NOT NULL,
  unit_price_cents  integer NOT NULL,
  total_cents       integer NOT NULL,
  part_condition    text,
  position          integer NOT NULL DEFAULT 0
);

CREATE TABLE credit_notes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    uuid NOT NULL REFERENCES invoices(id),
  reason        text NOT NULL,
  amount_cents  integer NOT NULL CHECK (amount_cents > 0),
  user_id       uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    uuid NOT NULL REFERENCES invoices(id),
  method        text NOT NULL CHECK (method IN ('cash','interac','card','debit','cheque','stripe')),
  amount_cents  integer NOT NULL CHECK (amount_cents > 0),
  reference     text NOT NULL DEFAULT '',
  paid_at       timestamptz NOT NULL DEFAULT now(),
  user_id       uuid REFERENCES users(id)
);

CREATE TABLE client_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  order_id      uuid REFERENCES orders(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz
);

CREATE TABLE portal_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  code_hash   text NOT NULL,
  expires_at  timestamptz NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  used_at     timestamptz
);

CREATE TABLE notification_templates (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event    text NOT NULL,
  channel  text NOT NULL CHECK (channel IN ('sms','whatsapp','email')),
  lang     text NOT NULL CHECK (lang IN ('fr','en','es')),
  subject  text NOT NULL DEFAULT '',
  body     text NOT NULL,
  UNIQUE (event, channel, lang)
);

CREATE TABLE notifications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid REFERENCES clients(id) ON DELETE CASCADE,
  order_id       uuid REFERENCES orders(id) ON DELETE CASCADE,
  event          text NOT NULL,
  channel        text NOT NULL CHECK (channel IN ('sms','whatsapp','email')),
  to_address     text NOT NULL,
  subject        text NOT NULL DEFAULT '',
  body           text NOT NULL,
  status         text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','delivered','failed','skipped')),
  provider_id    text,
  error          text,
  attempts       integer NOT NULL DEFAULT 0,
  scheduled_for  timestamptz NOT NULL DEFAULT now(),
  sent_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_queue_idx ON notifications(status, scheduled_for);

CREATE TABLE client_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid REFERENCES orders(id) ON DELETE CASCADE,
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  direction   text NOT NULL CHECK (direction IN ('in','out')),
  channel     text NOT NULL CHECK (channel IN ('portal','sms','whatsapp','email')),
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE privacy_incidents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at      timestamptz NOT NULL,
  description      text NOT NULL,
  data_affected    text NOT NULL,
  measures         text NOT NULL,
  notified         boolean NOT NULL DEFAULT false,
  created_by       uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);
