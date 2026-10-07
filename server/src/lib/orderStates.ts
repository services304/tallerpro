/** Estados de una orden y transiciones permitidas (ver diagrama de la especificación). */

export const ORDER_STATUSES = [
  'received',
  'diagnosis',
  'parts_quote',
  'quote_sent',
  'approved',
  'rejected',
  'waiting_parts',
  'in_repair',
  'quality_check',
  'ready',
  'delivered',
  'closed',
  'cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  received: ['diagnosis', 'cancelled'],
  diagnosis: ['parts_quote', 'quote_sent', 'cancelled'],
  parts_quote: ['quote_sent', 'cancelled'],
  quote_sent: ['approved', 'rejected', 'parts_quote'],
  approved: ['in_repair', 'waiting_parts'],
  rejected: ['ready'],
  waiting_parts: ['in_repair'],
  in_repair: ['waiting_parts', 'parts_quote', 'quality_check'],
  quality_check: ['in_repair', 'ready'],
  ready: ['delivered'],
  delivered: ['closed'],
  closed: [],
  cancelled: [],
};

/**
 * Transiciones que el personal NO puede hacer a mano porque tienen su propio flujo:
 * - quote_sent: solo al enviar una cotización.
 * - approved / rejected: solo al registrar la decisión del cliente (portal o en persona).
 * - closed: automático cuando todas las facturas están pagadas.
 */
const SYSTEM_ONLY: OrderStatus[] = ['quote_sent', 'approved', 'rejected', 'closed'];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function manualTargets(from: OrderStatus): OrderStatus[] {
  return (TRANSITIONS[from] ?? []).filter((s) => !SYSTEM_ONLY.includes(s));
}

export function isManualAllowed(from: OrderStatus, to: OrderStatus): boolean {
  return manualTargets(from).includes(to);
}

/** Estados en los que una orden se considera abierta (aparece en el tablero). */
export const OPEN_STATUSES: OrderStatus[] = ORDER_STATUSES.filter((s) => !['closed', 'cancelled'].includes(s));

/** Estados en los que se pueden editar las líneas de trabajo. */
export const EDITABLE_LINE_STATUSES: OrderStatus[] = ['received', 'diagnosis', 'parts_quote', 'in_repair', 'waiting_parts', 'approved'];

/** Eventos de notificación al cliente asociados a un cambio de estado. */
export const STATUS_EVENTS: Partial<Record<OrderStatus, string>> = {
  waiting_parts: 'waiting_parts',
  ready: 'ready',
  delivered: 'delivered',
};
