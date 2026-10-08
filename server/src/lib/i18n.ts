/** Mensajes del servidor, etiquetas de documentos y plantillas por defecto en FR / EN / ES. */

export type Lang = 'fr' | 'en' | 'es';
export const LANGS: Lang[] = ['fr', 'en', 'es'];

export function pickLang(...candidates: (string | null | undefined)[]): Lang {
  for (const c of candidates) {
    if (!c) continue;
    for (const part of c.split(',')) {
      const code = part.trim().slice(0, 2).toLowerCase();
      if ((LANGS as string[]).includes(code)) return code as Lang;
    }
  }
  return 'fr';
}

type Dict = Record<string, string>;

const messages: Record<Lang, Dict> = {
  es: {
    'auth.invalid': 'Correo o contraseña incorrectos.',
    'auth.locked': 'Demasiados intentos. Inténtalo de nuevo en {minutes} min.',
    'auth.required': 'Tu sesión expiró. Vuelve a iniciar sesión.',
    'auth.forbidden': 'No tienes permiso para hacer esto.',
    'auth.reset_sent': 'Si existe una cuenta con ese correo, te enviamos un enlace para cambiar la contraseña.',
    'auth.reset_invalid': 'El enlace para cambiar la contraseña no es válido o ya expiró.',
    'auth.wrong_current': 'La contraseña actual no es correcta.',
    'auth.setup_done': 'La cuenta del dueño ya fue creada.',
    'samples.exist': 'Los clientes de ejemplo ya existen.',
    'validation.failed': 'Revisa los datos: {fields}',
    'not_found': 'No encontramos lo que buscas.',
    'client.duplicate': 'Ya existe un cliente con ese teléfono o correo: {name}.',
    'order.bad_transition': 'No se puede pasar de «{from}» a «{to}».',
    'order.not_editable': 'La orden está en «{status}»; ya no se pueden cambiar sus líneas.',
    'order.need_intake_signature': 'Falta la firma del cliente en la recepción.',
    'quote.no_lines': 'La cotización no tiene líneas.',
    'quote.not_pending': 'Esta cotización ya fue respondida.',
    'quote.decide_all': 'Indica si apruebas o rechazas cada línea.',
    'quote.offer_missing': 'Falta elegir una oferta para: {parts}.',
    'invoice.nothing': 'No hay trabajos aprobados para facturar.',
    'parts.unavailable': 'Esta pieza no está disponible en ese proveedor; elige otra oferta.',
    'invoice.exists': 'Esta orden ya tiene una factura vigente (n.º {number}).',
    'invoice.void': 'La factura está anulada.',
    'payment.exceeds': 'El pago supera el saldo pendiente ({balance}).',
    'upload.bad_type': 'Tipo de archivo no permitido.',
    'upload.too_big': 'El archivo es demasiado grande (máximo {mb} MB).',
    'vin.invalid': 'El VIN no es válido (17 caracteres, sin I, O ni Q).',
    'portal.link_invalid': 'Este enlace no es válido o ya expiró. Pide uno nuevo.',
    'portal.code_sent': 'Si tus datos coinciden, te enviamos un código de 6 dígitos.',
    'portal.code_invalid': 'El código no es correcto o ya expiró.',
    'import.empty': 'No encontramos contactos en el archivo.',
    'import.undone': 'Esta importación ya fue deshecha.',
    'import.too_old': 'Solo se puede deshacer durante 30 días.',
    'rate_limited': 'Demasiadas solicitudes. Espera un momento.',
    'server.error': 'Algo salió mal en el servidor. Inténtalo de nuevo.',
  },
  en: {
    'auth.invalid': 'Incorrect email or password.',
    'auth.locked': 'Too many attempts. Try again in {minutes} min.',
    'auth.required': 'Your session has expired. Please sign in again.',
    'auth.forbidden': "You don't have permission to do this.",
    'auth.reset_sent': "If an account exists for that email, we've sent a link to reset the password.",
    'auth.reset_invalid': 'The password reset link is invalid or has expired.',
    'auth.wrong_current': 'The current password is incorrect.',
    'auth.setup_done': "The owner's account has already been created.",
    'samples.exist': 'The sample clients already exist.',
    'validation.failed': 'Please check: {fields}',
    'not_found': "We couldn't find what you're looking for.",
    'client.duplicate': 'A client with that phone or email already exists: {name}.',
    'order.bad_transition': 'Cannot move from “{from}” to “{to}”.',
    'order.not_editable': 'The order is “{status}”; its lines can no longer be changed.',
    'order.need_intake_signature': "The client's intake signature is missing.",
    'quote.no_lines': 'The quote has no lines.',
    'quote.not_pending': 'This quote has already been answered.',
    'quote.decide_all': 'Please approve or decline each line.',
    'quote.offer_missing': 'Choose an offer for: {parts}.',
    'invoice.nothing': 'There is no approved work to invoice.',
    'parts.unavailable': "This part isn't available from that supplier; choose another offer.",
    'invoice.exists': 'This order already has an active invoice (no. {number}).',
    'invoice.void': 'The invoice is void.',
    'payment.exceeds': 'The payment exceeds the balance due ({balance}).',
    'upload.bad_type': 'File type not allowed.',
    'upload.too_big': 'The file is too large (max {mb} MB).',
    'vin.invalid': 'The VIN is not valid (17 characters, no I, O or Q).',
    'portal.link_invalid': 'This link is invalid or has expired. Request a new one.',
    'portal.code_sent': 'If your details match, we sent you a 6-digit code.',
    'portal.code_invalid': 'The code is incorrect or has expired.',
    'import.empty': 'No contacts were found in the file.',
    'import.undone': 'This import has already been undone.',
    'import.too_old': 'Imports can only be undone within 30 days.',
    'rate_limited': 'Too many requests. Please wait a moment.',
    'server.error': 'Something went wrong on the server. Please try again.',
  },
  fr: {
    'auth.invalid': 'Courriel ou mot de passe incorrect.',
    'auth.locked': 'Trop de tentatives. Réessayez dans {minutes} min.',
    'auth.required': 'Votre session a expiré. Reconnectez-vous.',
    'auth.forbidden': "Vous n'avez pas la permission de faire ceci.",
    'auth.reset_sent': 'Si un compte existe pour ce courriel, nous avons envoyé un lien pour changer le mot de passe.',
    'auth.reset_invalid': "Le lien de réinitialisation n'est pas valide ou a expiré.",
    'auth.wrong_current': "Le mot de passe actuel n'est pas correct.",
    'auth.setup_done': 'Le compte du propriétaire a déjà été créé.',
    'samples.exist': 'Les clients exemples existent déjà.',
    'validation.failed': 'Vérifiez : {fields}',
    'not_found': 'Introuvable.',
    'client.duplicate': 'Un client avec ce téléphone ou ce courriel existe déjà : {name}.',
    'order.bad_transition': 'Impossible de passer de « {from} » à « {to} ».',
    'order.not_editable': 'Le bon de travail est « {status} » ; ses lignes ne peuvent plus être modifiées.',
    'order.need_intake_signature': 'La signature du client à la réception est manquante.',
    'quote.no_lines': "L'évaluation n'a aucune ligne.",
    'quote.not_pending': 'Cette évaluation a déjà reçu une réponse.',
    'quote.decide_all': 'Indiquez si vous acceptez ou refusez chaque ligne.',
    'quote.offer_missing': 'Choisissez une offre pour : {parts}.',
    'invoice.nothing': "Aucun travail approuvé à facturer.",
    'parts.unavailable': "Cette pièce n'est pas disponible chez ce fournisseur; choisissez une autre offre.",
    'invoice.exists': 'Ce bon de travail a déjà une facture en vigueur (no {number}).',
    'invoice.void': 'La facture est annulée.',
    'payment.exceeds': 'Le paiement dépasse le solde dû ({balance}).',
    'upload.bad_type': 'Type de fichier non permis.',
    'upload.too_big': 'Le fichier est trop volumineux (max. {mb} Mo).',
    'vin.invalid': "Le NIV n'est pas valide (17 caractères, sans I, O ni Q).",
    'portal.link_invalid': "Ce lien n'est pas valide ou a expiré. Demandez-en un nouveau.",
    'portal.code_sent': 'Si vos coordonnées correspondent, nous vous avons envoyé un code à 6 chiffres.',
    'portal.code_invalid': "Le code n'est pas correct ou a expiré.",
    'import.empty': 'Aucun contact trouvé dans le fichier.',
    'import.undone': 'Cette importation a déjà été annulée.',
    'import.too_old': "Une importation ne peut être annulée que dans les 30 jours.",
    'rate_limited': 'Trop de requêtes. Patientez un instant.',
    'server.error': 'Une erreur est survenue sur le serveur. Réessayez.',
  },
};

export const statusLabels: Record<Lang, Record<string, string>> = {
  es: {
    received: 'Recibido', diagnosis: 'Diagnóstico', parts_quote: 'Cotizando repuestos', quote_sent: 'Cotización enviada',
    approved: 'Aprobada', rejected: 'Rechazada', waiting_parts: 'Esperando piezas', in_repair: 'En reparación',
    quality_check: 'Control de calidad', ready: 'Listo', delivered: 'Entregado', closed: 'Cerrada', cancelled: 'Cancelada',
  },
  en: {
    received: 'Received', diagnosis: 'Diagnosis', parts_quote: 'Quoting parts', quote_sent: 'Quote sent',
    approved: 'Approved', rejected: 'Declined', waiting_parts: 'Waiting for parts', in_repair: 'In repair',
    quality_check: 'Quality check', ready: 'Ready', delivered: 'Delivered', closed: 'Closed', cancelled: 'Cancelled',
  },
  fr: {
    received: 'Reçu', diagnosis: 'Diagnostic', parts_quote: 'Prix des pièces', quote_sent: 'Évaluation envoyée',
    approved: 'Acceptée', rejected: 'Refusée', waiting_parts: 'En attente de pièces', in_repair: 'En réparation',
    quality_check: 'Contrôle qualité', ready: 'Prêt', delivered: 'Livré', closed: 'Fermé', cancelled: 'Annulé',
  },
};

export function t(lang: Lang, key: string, params: Record<string, string | number> = {}): string {
  const s = messages[lang][key] ?? messages.es[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}

/** Etiquetas de los documentos (factura, cotización). */
export const docLabels: Record<Lang, Record<string, string>> = {
  fr: {
    invoice: 'FACTURE', quote: 'ÉVALUATION', inspectionInvoice: 'FACTURE — DIAGNOSTIC', number: 'No',
    date: 'Date', client: 'Client', vehicle: 'Véhicule', order: 'Bon de travail', description: 'Description',
    qty: 'Qté', unitPrice: 'Prix unitaire', amount: 'Montant', subtotal: 'Sous-total', gst: 'TPS (5 %)',
    qst: 'TVQ (9,975 %)', total: 'Total', paid: 'Payé', balance: 'Solde dû', gstNo: 'No TPS', qstNo: 'No TVQ',
    validUntil: "Valide jusqu'au", warranty: 'Garantie', new: 'neuve', used: 'usagée', rebuilt: 'reconditionnée',
    labor: "Main-d'œuvre", part: 'Pièce', fee: 'Frais', discount: 'Rabais', odometer: 'Kilométrage',
    visitFee: 'Visite à domicile et diagnostic', approved: 'Accepté', rejected: 'Refusé', pending: 'En attente',
    returnParts: 'Le client demande la remise des pièces remplacées.',
  },
  en: {
    invoice: 'INVOICE', quote: 'ESTIMATE', inspectionInvoice: 'INVOICE — DIAGNOSIS', number: 'No.',
    date: 'Date', client: 'Client', vehicle: 'Vehicle', order: 'Work order', description: 'Description',
    qty: 'Qty', unitPrice: 'Unit price', amount: 'Amount', subtotal: 'Subtotal', gst: 'GST (5%)',
    qst: 'QST (9.975%)', total: 'Total', paid: 'Paid', balance: 'Balance due', gstNo: 'GST No.', qstNo: 'QST No.',
    validUntil: 'Valid until', warranty: 'Warranty', new: 'new', used: 'used', rebuilt: 'rebuilt',
    labor: 'Labour', part: 'Part', fee: 'Fee', discount: 'Discount', odometer: 'Odometer',
    visitFee: 'Home visit and diagnosis', approved: 'Approved', rejected: 'Declined', pending: 'Pending',
    returnParts: 'The client asked to receive the replaced parts.',
  },
  es: {
    invoice: 'FACTURA', quote: 'COTIZACIÓN', inspectionInvoice: 'FACTURA — DIAGNÓSTICO', number: 'N.º',
    date: 'Fecha', client: 'Cliente', vehicle: 'Vehículo', order: 'Orden', description: 'Descripción',
    qty: 'Cant.', unitPrice: 'Precio unitario', amount: 'Importe', subtotal: 'Subtotal', gst: 'TPS (5 %)',
    qst: 'TVQ (9,975 %)', total: 'Total', paid: 'Pagado', balance: 'Saldo pendiente', gstNo: 'N.º TPS', qstNo: 'N.º TVQ',
    validUntil: 'Válida hasta', warranty: 'Garantía', new: 'nueva', used: 'usada', rebuilt: 'reconstruida',
    labor: 'Mano de obra', part: 'Pieza', fee: 'Cargo', discount: 'Descuento', odometer: 'Kilometraje',
    visitFee: 'Visita a domicilio y diagnóstico', approved: 'Aprobado', rejected: 'Rechazado', pending: 'Pendiente',
    returnParts: 'El cliente pidió que se le entreguen las piezas reemplazadas.',
  },
};

/** Plantillas de notificación por defecto. {link}, {name}, etc. se reemplazan al enviar. */
export const NOTIFICATION_EVENTS = [
  'visit_scheduled',
  'visit_reminder',
  'on_the_way',
  'intake',
  'quote_ready',
  'quote_approved',
  'inspection_invoice',
  'waiting_parts',
  'ready',
  'delivered',
  'payment_reminder',
  'portal_code',
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export const defaultTemplates: Record<Lang, Record<NotificationEvent, { subject: string; body: string }>> = {
  fr: {
    visit_scheduled: { subject: 'Visite confirmée — {shop}', body: 'Bonjour {name}, votre visite est confirmée le {date} à {time} au {address}. Frais de visite et diagnostic : {fee}. — {shop}' },
    visit_reminder: { subject: 'Rappel : visite demain — {shop}', body: 'Bonjour {name}, rappel : nous passons demain {date} à {time} au {address}. — {shop}' },
    on_the_way: { subject: 'En route — {shop}', body: 'Bonjour {name}, nous sommes en route. Arrivée prévue vers {eta}. — {shop}' },
    intake: { subject: 'Véhicule reçu — {order}', body: "Bonjour {name}, nous avons pris en charge votre {vehicle} (bon {order}). Suivez l'avancement et les photos ici : {link}" },
    quote_ready: { subject: 'Votre évaluation est prête — {order}', body: 'Bonjour {name}, votre évaluation pour {vehicle} est prête ({total}). Consultez-la et répondez ici : {link}' },
    quote_approved: { subject: 'Évaluation acceptée — {order}', body: 'Merci {name}! Nous avons bien reçu votre accord pour {vehicle}. Nous vous tiendrons au courant : {link}' },
    inspection_invoice: { subject: 'Facture de diagnostic — {order}', body: 'Bonjour {name}, vous avez refusé les travaux pour {vehicle}. Voici la facture de la visite et du diagnostic ({total}) : {link}' },
    waiting_parts: { subject: 'En attente de pièces — {order}', body: 'Bonjour {name}, nous attendons des pièces pour votre {vehicle}. Nous vous confirmerons la nouvelle date : {link}' },
    ready: { subject: 'Travaux terminés — {order}', body: 'Bonjour {name}, les travaux sur votre {vehicle} sont terminés. Total : {total}. Détails et paiement : {link}' },
    delivered: { subject: 'Merci! Votre facture — {order}', body: 'Merci {name}! Votre facture et la garantie sont ici : {link}{review}' },
    payment_reminder: { subject: 'Rappel de paiement — {order}', body: 'Bonjour {name}, un solde de {total} reste à payer pour {order}. Détails : {link}' },
    portal_code: { subject: 'Votre code — {shop}', body: 'Votre code {shop} : {code}. Il expire dans 10 minutes.' },
  },
  en: {
    visit_scheduled: { subject: 'Visit confirmed — {shop}', body: 'Hi {name}, your visit is confirmed for {date} at {time} at {address}. Visit and diagnosis fee: {fee}. — {shop}' },
    visit_reminder: { subject: 'Reminder: visit tomorrow — {shop}', body: "Hi {name}, reminder: we'll be at {address} tomorrow {date} at {time}. — {shop}" },
    on_the_way: { subject: 'On our way — {shop}', body: "Hi {name}, we're on our way. Expected arrival around {eta}. — {shop}" },
    intake: { subject: 'Vehicle received — {order}', body: 'Hi {name}, we have taken in your {vehicle} (order {order}). Follow progress and photos here: {link}' },
    quote_ready: { subject: 'Your estimate is ready — {order}', body: 'Hi {name}, your estimate for {vehicle} is ready ({total}). Review and reply here: {link}' },
    quote_approved: { subject: 'Estimate approved — {order}', body: "Thanks {name}! We received your approval for {vehicle}. We'll keep you posted: {link}" },
    inspection_invoice: { subject: 'Diagnosis invoice — {order}', body: 'Hi {name}, you declined the work on {vehicle}. Here is the invoice for the visit and diagnosis ({total}): {link}' },
    waiting_parts: { subject: 'Waiting for parts — {order}', body: "Hi {name}, we're waiting for parts for your {vehicle}. We'll confirm the new date: {link}" },
    ready: { subject: 'Work completed — {order}', body: 'Hi {name}, the work on your {vehicle} is done. Total: {total}. Details and payment: {link}' },
    delivered: { subject: 'Thank you! Your invoice — {order}', body: 'Thank you {name}! Your invoice and warranty are here: {link}{review}' },
    payment_reminder: { subject: 'Payment reminder — {order}', body: 'Hi {name}, a balance of {total} is still due for {order}. Details: {link}' },
    portal_code: { subject: 'Your code — {shop}', body: 'Your {shop} code: {code}. It expires in 10 minutes.' },
  },
  es: {
    visit_scheduled: { subject: 'Visita confirmada — {shop}', body: 'Hola {name}, tu visita está confirmada el {date} a las {time} en {address}. Cargo de visita y diagnóstico: {fee}. — {shop}' },
    visit_reminder: { subject: 'Recordatorio: visita mañana — {shop}', body: 'Hola {name}, te recordamos que mañana {date} a las {time} pasamos por {address}. — {shop}' },
    on_the_way: { subject: 'Vamos en camino — {shop}', body: 'Hola {name}, vamos en camino. Llegamos hacia las {eta}. — {shop}' },
    intake: { subject: 'Vehículo recibido — {order}', body: 'Hola {name}, recibimos tu {vehicle} (orden {order}). Sigue el avance y las fotos aquí: {link}' },
    quote_ready: { subject: 'Tu cotización está lista — {order}', body: 'Hola {name}, la cotización para tu {vehicle} está lista ({total}). Revísala y responde aquí: {link}' },
    quote_approved: { subject: 'Cotización aprobada — {order}', body: '¡Gracias {name}! Recibimos tu aprobación para el {vehicle}. Te mantendremos al tanto: {link}' },
    inspection_invoice: { subject: 'Factura de diagnóstico — {order}', body: 'Hola {name}, rechazaste los trabajos del {vehicle}. Esta es la factura de la visita y el diagnóstico ({total}): {link}' },
    waiting_parts: { subject: 'Esperando piezas — {order}', body: 'Hola {name}, estamos esperando piezas para tu {vehicle}. Te confirmamos la nueva fecha: {link}' },
    ready: { subject: 'Trabajo terminado — {order}', body: 'Hola {name}, terminamos el trabajo en tu {vehicle}. Total: {total}. Detalles y pago: {link}' },
    delivered: { subject: '¡Gracias! Tu factura — {order}', body: '¡Gracias {name}! Tu factura y la garantía están aquí: {link}{review}' },
    payment_reminder: { subject: 'Recordatorio de pago — {order}', body: 'Hola {name}, queda un saldo de {total} por pagar de la orden {order}. Detalles: {link}' },
    portal_code: { subject: 'Tu código — {shop}', body: 'Tu código de {shop}: {code}. Vence en 10 minutos.' },
  },
};

/**
 * Invitación a dejar una reseña en Google (va al final del mensaje de entrega, a todos los clientes por igual).
 * Da ideas para que el cliente cuente SU experiencia con sus palabras; no se le escribe la reseña.
 */
export const reviewInvite: Record<Lang, string> = {
  fr:
    "\n\nVotre avis compte beaucoup! Un commentaire sur Google aide d'autres gens à trouver un mécanicien de confiance. Ça prend 1 minute : {url}\n" +
    "Racontez avec vos mots ce qu'on a réparé, où on vous a servi et ce que vous avez aimé. Par exemple : « Mécanicien à domicile à [votre ville]. Il a remplacé [le travail] dans mon entrée, il était à l'heure et m'a tout expliqué avec des photos. »\n" +
    "Et si quelque chose ne va pas, répondez à ce message : on s'en occupe. Merci! — {shop}",
  en:
    "\n\nYour opinion means a lot! A Google review helps other people find a mechanic they can trust. It takes 1 minute: {url}\n" +
    'Tell it in your own words: what we fixed, where we served you and what you liked. For example: "Mobile mechanic in [your city]. He replaced [the job] in my driveway, was on time and explained everything with photos."\n' +
    "And if anything isn't right, just reply to this message and we'll take care of it. Thank you! — {shop}",
  es:
    '\n\n¡Tu opinión vale mucho! Una reseña en Google ayuda a que más personas encuentren un mecánico de confianza. Toma 1 minuto: {url}\n' +
    'Cuenta con tus palabras qué te arreglamos, dónde te atendimos y qué te gustó. Por ejemplo: «Mecánico a domicilio en [tu ciudad]. Me cambió [el trabajo] en la entrada de mi casa, llegó a tiempo y me explicó todo con fotos.»\n' +
    'Y si algo no quedó bien, responde este mensaje y lo arreglamos. ¡Gracias! — {shop}',
};

export function fill(template: string, vars: Record<string, string | number | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : ''));
}
