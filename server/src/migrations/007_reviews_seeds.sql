-- Enlace para pedir reseñas en Google (va en el mensaje de entrega) y tareas de carga inicial ya hechas.
ALTER TABLE settings ADD COLUMN google_review_url text NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN seeds_done text[] NOT NULL DEFAULT '{}'::text[];
