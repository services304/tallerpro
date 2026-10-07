-- Almacenamiento de archivos (fotos, firmas) dentro de PostgreSQL.
-- Se usa con STORAGE_DRIVER=db en servicios gratuitos cuyo disco se borra al reiniciar (Render).
CREATE TABLE stored_files (
  key         text PRIMARY KEY,
  mime        text NOT NULL,
  data        bytea NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
