/**
 * Datos para empezar:
 *  - 8 clientes de EJEMPLO (personas ficticias, teléfonos 555-01xx reservados para ficción, correos @example.com).
 *  - Inventario básico de un mecánico móvil. Costos APROXIMADOS de distribuidor en Quebec (antes de impuestos):
 *    el dueño los ajusta con sus facturas. Los consumibles de uso interno (guantes, papel) tienen precio 0.
 */
import type { Lang } from './i18n.js';

export interface SampleClient {
  name: string;
  phone: string;
  email: string | null;
  address: string;
  lang: Lang;
  channels: ('sms' | 'whatsapp' | 'email')[];
  notes: string;
  vehicle: { make: string; model: string; year: number; plate: string; color: string; engine: string; odometer: number; vin: string | null };
}

export const SAMPLE_CLIENTS: SampleClient[] = [
  { name: 'Jean Tremblay', phone: '514 555 0101', email: 'jean.tremblay@example.com', address: '1200, rue Exemple, Montréal', lang: 'fr', channels: ['sms'], notes: 'Prefiere citas por la mañana.',
    vehicle: { make: 'Honda', model: 'Civic', year: 2018, plate: 'EXM 101', color: 'Gris', engine: '2.0 L 4 cil.', odometer: 128400, vin: null } },
  { name: 'Marie Gagnon', phone: '438 555 0102', email: 'marie.gagnon@example.com', address: '45, avenue Démo, Laval', lang: 'fr', channels: ['sms', 'email'], notes: '',
    vehicle: { make: 'Toyota', model: 'RAV4', year: 2020, plate: 'EXM 102', color: 'Blanco', engine: '2.5 L 4 cil.', odometer: 76200, vin: null } },
  { name: 'Luc Bouchard', phone: '450 555 0103', email: null, address: '88, boulevard Essai, Longueuil', lang: 'fr', channels: ['sms'], notes: 'Camioneta de trabajo, la usa todos los días.',
    vehicle: { make: 'Ford', model: 'F-150', year: 2016, plate: 'EXM 103', color: 'Negro', engine: '3.5 L V6 EcoBoost', odometer: 201300, vin: null } },
  { name: 'Sarah Thompson', phone: '514 555 0104', email: 'sarah.thompson@example.com', address: '300, Sample Street, Pointe-Claire', lang: 'en', channels: ['email'], notes: 'Habla inglés. Prefiere correo.',
    vehicle: { make: 'Mazda', model: 'CX-5', year: 2019, plate: 'EXM 104', color: 'Rojo', engine: '2.5 L 4 cil.', odometer: 94800, vin: null } },
  { name: "Michael O'Brien", phone: '514 555 0105', email: 'michael.obrien@example.com', address: '17, Demo Avenue, Westmount', lang: 'en', channels: ['sms'], notes: '',
    vehicle: { make: 'Chevrolet', model: 'Silverado 1500', year: 2017, plate: 'EXM 105', color: 'Azul', engine: '5.3 L V8', odometer: 168900, vin: null } },
  { name: 'Carlos Ramírez', phone: '438 555 0106', email: 'carlos.ramirez@example.com', address: '560, rue Modèle, Montréal-Nord', lang: 'es', channels: ['whatsapp'], notes: 'Habla español. Le escribimos por WhatsApp.',
    vehicle: { make: 'Hyundai', model: 'Elantra', year: 2015, plate: 'EXM 106', color: 'Plata', engine: '1.8 L 4 cil.', odometer: 187500, vin: null } },
  { name: 'Daniela Restrepo', phone: '514 555 0107', email: 'daniela.restrepo@example.com', address: '23, rue Pratique, Saint-Léonard', lang: 'es', channels: ['whatsapp', 'email'], notes: 'Habla español.',
    vehicle: { make: 'Nissan', model: 'Rogue', year: 2021, plate: 'EXM 107', color: 'Blanco', engine: '2.5 L 4 cil.', odometer: 52300, vin: null } },
  { name: 'Nadia Benali', phone: '450 555 0108', email: null, address: '9, rue Fictive, Terrebonne', lang: 'fr', channels: ['sms'], notes: 'Tiene perro en el patio: avisar antes de llegar.',
    vehicle: { make: 'Kia', model: 'Soul', year: 2014, plate: 'EXM 108', color: 'Verde', engine: '2.0 L 4 cil.', odometer: 214600, vin: null } },
];

export interface StarterItem {
  key: string;
  name: string; // en francés: así sale en la factura en Quebec
  part_number?: string;
  category: 'fluids' | 'filters' | 'brakes' | 'electrical' | 'ignition' | 'engine' | 'suspension' | 'tires' | 'hardware' | 'other';
  unit: 'unit' | 'l' | 'qt' | 'kg' | 'm' | 'box' | 'set';
  qty: number;
  min: number;
  cost: number; // $ por unidad, aproximado
  price: number; // $ al cliente por unidad (0 = uso interno)
  notes: string; // en español, para el mecánico
}

export const STARTER_INVENTORY: StarterItem[] = [
  // Aceites y líquidos (comprados en bidón de 5 L / 3,78 L; se controlan por litro)
  { key: 'oil-5w30', name: 'Huile synthétique 5W-30', category: 'fluids', unit: 'l', qty: 20, min: 8, cost: 9, price: 14, notes: 'Aceite sintético 5W-30. Bidón de 5 L.' },
  { key: 'oil-0w20', name: 'Huile synthétique 0W-20', category: 'fluids', unit: 'l', qty: 20, min: 8, cost: 9.5, price: 15, notes: 'Aceite sintético 0W-20 (Toyota, Honda, Mazda recientes).' },
  { key: 'oil-5w20', name: 'Huile 5W-20', category: 'fluids', unit: 'l', qty: 10, min: 5, cost: 8, price: 13, notes: 'Aceite 5W-20 (Ford, Hyundai/Kia).' },
  { key: 'coolant', name: 'Antigel prémélangé 50/50', category: 'fluids', unit: 'l', qty: 8, min: 4, cost: 4.5, price: 9, notes: 'Refrigerante universal ya mezclado 50/50.' },
  { key: 'brake-fluid', name: 'Liquide de frein DOT 3/4', category: 'fluids', unit: 'l', qty: 2, min: 1, cost: 12, price: 22, notes: 'Líquido de frenos DOT 3/4.' },
  { key: 'atf', name: 'Huile de transmission automatique (multi-véhicules)', category: 'fluids', unit: 'l', qty: 4, min: 2, cost: 10, price: 17, notes: 'ATF universal: revisar compatibilidad antes de usar.' },
  { key: 'washer', name: 'Lave-glace hiver -40', category: 'fluids', unit: 'l', qty: 16, min: 8, cost: 1.25, price: 3, notes: 'Limpiaparabrisas de invierno (-40 °C).' },
  // Filtros (los más comunes; los demás se piden por vehículo)
  { key: 'oil-filter-a', name: "Filtre à huile (Honda/Acura, Hyundai/Kia)", part_number: 'PH7317', category: 'filters', unit: 'unit', qty: 6, min: 3, cost: 8, price: 15, notes: 'Equivalente Fram PH7317.' },
  { key: 'oil-filter-b', name: "Filtre à huile (Toyota/Lexus, Mazda)", part_number: 'PH4967', category: 'filters', unit: 'unit', qty: 4, min: 2, cost: 8, price: 15, notes: 'Equivalente Fram PH4967. Confirmar por vehículo.' },
  { key: 'oil-filter-c', name: "Filtre à huile (Ford, GM)", part_number: 'PH3614', category: 'filters', unit: 'unit', qty: 4, min: 2, cost: 8, price: 15, notes: 'Equivalente Fram PH3614. Confirmar por vehículo.' },
  // Frenos
  { key: 'brake-clean', name: 'Nettoyant à freins (aérosol)', category: 'brakes', unit: 'unit', qty: 6, min: 3, cost: 6.5, price: 0, notes: 'Uso interno.' },
  { key: 'brake-grease', name: 'Graisse pour freins (sachet)', category: 'brakes', unit: 'unit', qty: 10, min: 4, cost: 1.5, price: 4, notes: 'Grasa para guías y pastillas.' },
  // Eléctrico
  { key: 'bulb-194', name: 'Ampoule 194/168', category: 'electrical', unit: 'unit', qty: 10, min: 4, cost: 1.5, price: 5, notes: 'Bombillo pequeño (placa, interiores, posición).' },
  { key: 'fuses', name: 'Fusible mini/ATO (assortiment)', category: 'electrical', unit: 'unit', qty: 30, min: 10, cost: 0.4, price: 2.5, notes: 'Fusibles surtidos 5–30 A.' },
  { key: 'terminal', name: 'Protecteur de bornes de batterie', category: 'electrical', unit: 'unit', qty: 2, min: 1, cost: 8, price: 0, notes: 'Uso interno.' },
  // Llantas
  { key: 'plugs', name: 'Bouchon de réparation de crevaison', category: 'tires', unit: 'unit', qty: 20, min: 10, cost: 0.75, price: 5, notes: 'Tapones para pinchazos.' },
  { key: 'valves', name: 'Valve de pneu TR413', category: 'tires', unit: 'unit', qty: 10, min: 4, cost: 1, price: 5, notes: 'Válvula estándar.' },
  // Varios
  { key: 'wipers', name: "Balai d'essuie-glace (18–24 po)", category: 'other', unit: 'unit', qty: 6, min: 2, cost: 12, price: 22, notes: 'Plumillas en tamaños comunes.' },
  { key: 'drain-washers', name: 'Rondelle de bouchon de vidange (assortiment)', category: 'hardware', unit: 'unit', qty: 30, min: 10, cost: 0.4, price: 2, notes: 'Arandelas de tapón de cárter surtidas.' },
  { key: 'gloves', name: 'Gants en nitrile (boîte de 100)', category: 'hardware', unit: 'box', qty: 2, min: 1, cost: 18, price: 0, notes: 'Uso interno.' },
  { key: 'paper', name: "Papier d'atelier (rouleau)", category: 'hardware', unit: 'unit', qty: 4, min: 2, cost: 6, price: 0, notes: 'Uso interno.' },
  { key: 'penetrant', name: 'Dégrippant en aérosol', category: 'hardware', unit: 'unit', qty: 2, min: 1, cost: 9, price: 0, notes: 'Aflojatodo. Uso interno.' },
  { key: 'zip-ties', name: 'Attaches autobloquantes (sac de 100)', category: 'hardware', unit: 'unit', qty: 1, min: 0, cost: 6, price: 0, notes: 'Bridas plásticas. Uso interno.' },
];
