import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse, requireUser } from '../app.js';
import { one, q, tx } from '../db.js';
import { AppError, notFound } from '../lib/errors.js';
import { cleanVin, decodeVin, isValidVinFormat, vinCheckDigitOk } from '../lib/vin.js';

const vehicleInput = z.object({
  vin: z.string().trim().max(30).nullable().optional(),
  plate: z.string().trim().max(15).nullable().optional(),
  make: z.string().trim().max(60).default(''),
  model: z.string().trim().max(80).default(''),
  year: z.number().int().min(1950).max(2100).nullable().optional(),
  engine: z.string().trim().max(120).default(''),
  color: z.string().trim().max(40).default(''),
  last_odometer: z.number().int().min(0).max(3_000_000).nullable().optional(),
});

function normVin(v: string | null | undefined): string | null {
  if (!v) return null;
  const c = cleanVin(v);
  if (!isValidVinFormat(c)) throw new AppError(400, 'vin.invalid');
  return c;
}

export async function vehicleRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser());

  /** Decodifica un VIN: marca, modelo, año y motor (NHTSA). */
  app.get('/vin/:vin', async (req) => {
    const { vin } = parse(z.object({ vin: z.string().max(30) }), req.params);
    const v = normVin(vin)!;
    const info = await decodeVin(v);
    return { vin: v, checkDigitOk: vinCheckDigitOk(v), info };
  });

  /** Crea un vehículo para un cliente. Si el VIN ya existe, lo reasigna a este cliente (cambio de dueño). */
  app.post('/vehicles', async (req) => {
    const b = parse(vehicleInput.extend({ client_id: z.string().uuid() }), req.body);
    const vin = normVin(b.vin);
    return tx(async (c) => {
      const client = await one('SELECT id FROM clients WHERE id=$1 AND anonymized_at IS NULL', [b.client_id], c);
      if (!client) throw notFound();
      let vehicle = vin ? await one<{ id: string }>('SELECT id FROM vehicles WHERE upper(vin)=$1', [vin], c) : null;
      if (vehicle) {
        await q(
          `UPDATE vehicles SET plate=COALESCE($2,plate), make=COALESCE(NULLIF($3,''),make), model=COALESCE(NULLIF($4,''),model),
                  year=COALESCE($5,year), engine=COALESCE(NULLIF($6,''),engine), color=COALESCE(NULLIF($7,''),color),
                  last_odometer=GREATEST(COALESCE(last_odometer,0), COALESCE($8,0)) WHERE id=$1`,
          [vehicle.id, b.plate?.toUpperCase() || null, b.make, b.model, b.year ?? null, b.engine, b.color, b.last_odometer ?? null],
          c,
        );
      } else {
        vehicle = await one<{ id: string }>(
          `INSERT INTO vehicles (vin, plate, make, model, year, engine, color, last_odometer)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [vin, b.plate?.toUpperCase() || null, b.make, b.model, b.year ?? null, b.engine, b.color, b.last_odometer ?? null],
          c,
        );
      }
      const owner = await one<{ client_id: string }>('SELECT client_id FROM vehicle_owners WHERE vehicle_id=$1 AND until IS NULL', [vehicle!.id], c);
      if (owner?.client_id !== b.client_id) {
        await q('UPDATE vehicle_owners SET until=now() WHERE vehicle_id=$1 AND until IS NULL', [vehicle!.id], c);
        await q('INSERT INTO vehicle_owners (vehicle_id, client_id) VALUES ($1,$2)', [vehicle!.id, b.client_id], c);
      }
      return { id: vehicle!.id, transferred: Boolean(owner && owner.client_id !== b.client_id) };
    });
  });

  app.get('/vehicles/:id', async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const vehicle = await one('SELECT * FROM vehicles WHERE id=$1', [id]);
    if (!vehicle) throw notFound();
    const owners = await q(
      `SELECT c.id, c.name, vo.since, vo.until FROM vehicle_owners vo JOIN clients c ON c.id=vo.client_id WHERE vo.vehicle_id=$1 ORDER BY vo.since DESC`,
      [id],
    );
    const orders = await q(
      `SELECT o.id, o.number, o.status, o.reason, o.odometer_in, o.created_at,
              (SELECT string_agg(description, ' · ' ORDER BY position) FROM order_lines l WHERE l.order_id=o.id AND l.approval='approved') AS work
         FROM orders o WHERE o.vehicle_id=$1 ORDER BY o.created_at DESC`,
      [id],
    );
    return { vehicle, owners, orders };
  });

  app.patch('/vehicles/:id', async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const b = parse(vehicleInput.partial(), req.body);
    const cur = await one('SELECT * FROM vehicles WHERE id=$1', [id]);
    if (!cur) throw notFound();
    const vin = b.vin === undefined ? cur.vin : normVin(b.vin);
    await q(
      `UPDATE vehicles SET vin=$2, plate=$3, make=$4, model=$5, year=$6, engine=$7, color=$8, last_odometer=$9 WHERE id=$1`,
      [
        id,
        vin,
        b.plate === undefined ? cur.plate : b.plate?.toUpperCase() || null,
        b.make ?? cur.make,
        b.model ?? cur.model,
        b.year === undefined ? cur.year : b.year,
        b.engine ?? cur.engine,
        b.color ?? cur.color,
        b.last_odometer === undefined ? cur.last_odometer : b.last_odometer,
      ],
    );
    return { ok: true };
  });

  /** Cambio de dueño: el historial del vehículo se conserva. */
  app.post('/vehicles/:id/transfer', async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { client_id } = parse(z.object({ client_id: z.string().uuid() }), req.body);
    await tx(async (c) => {
      await q('UPDATE vehicle_owners SET until=now() WHERE vehicle_id=$1 AND until IS NULL', [id], c);
      await q('INSERT INTO vehicle_owners (vehicle_id, client_id) VALUES ($1,$2)', [id, client_id], c);
    });
    return { ok: true };
  });
}
