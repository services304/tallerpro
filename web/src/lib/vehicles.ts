/**
 * Marcas y modelos comunes en Quebec/Canadá (autos, SUV y camionetas de los últimos ~30 años).
 * No es exhaustivo: siempre existe «Otra / otro» para escribirlo a mano.
 */
export const VEHICLES: Record<string, string[]> = {
  Acura: ['CSX', 'EL', 'ILX', 'Integra', 'MDX', 'RDX', 'RSX', 'TL', 'TLX', 'TSX', 'ZDX'],
  'Alfa Romeo': ['Giulia', 'Stelvio', 'Tonale'],
  Audi: ['A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'Q3', 'Q4 e-tron', 'Q5', 'Q7', 'Q8', 'e-tron', 'S4', 'TT'],
  BMW: ['Série 1', 'Série 2', 'Série 3', 'Série 4', 'Série 5', 'Série 7', 'i3', 'i4', 'iX', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'Z4'],
  Buick: ['Allure', 'Enclave', 'Encore', 'Encore GX', 'Envision', 'Envista', 'LaCrosse', 'Regal', 'Verano'],
  Cadillac: ['ATS', 'CT4', 'CT5', 'CTS', 'Escalade', 'Lyriq', 'SRX', 'XT4', 'XT5', 'XT6'],
  Chevrolet: [
    'Avalanche', 'Aveo', 'Blazer', 'Bolt EV', 'Bolt EUV', 'Camaro', 'Captiva', 'Cobalt', 'Colorado', 'Corvette', 'Cruze', 'Equinox', 'Express',
    'Impala', 'Malibu', 'Orlando', 'Silverado 1500', 'Silverado 2500HD', 'Sonic', 'Spark', 'Suburban', 'Tahoe', 'Trailblazer', 'Traverse', 'Trax', 'Uplander', 'Volt',
  ],
  Chrysler: ['200', '300', 'Grand Caravan', 'Pacifica', 'PT Cruiser', 'Sebring', 'Town & Country'],
  Dodge: ['Caliber', 'Challenger', 'Charger', 'Dakota', 'Durango', 'Grand Caravan', 'Hornet', 'Journey', 'Neon', 'Nitro', 'Ram 1500'],
  Fiat: ['500', '500L', '500X'],
  Ford: [
    'Bronco', 'Bronco Sport', 'C-Max', 'E-Series', 'Edge', 'Escape', 'Expedition', 'Explorer', 'F-150', 'F-250', 'F-350', 'Fiesta', 'Flex',
    'Focus', 'Fusion', 'Maverick', 'Mustang', 'Mustang Mach-E', 'Ranger', 'Taurus', 'Transit', 'Transit Connect',
  ],
  Genesis: ['G70', 'G80', 'G90', 'GV60', 'GV70', 'GV80'],
  GMC: ['Acadia', 'Canyon', 'Savana', 'Sierra 1500', 'Sierra 2500HD', 'Terrain', 'Yukon', 'Hummer EV'],
  Honda: ['Accord', 'Civic', 'CR-V', 'CR-Z', 'Element', 'Fit', 'HR-V', 'Insight', 'Odyssey', 'Passport', 'Pilot', 'Prologue', 'Ridgeline'],
  Hyundai: ['Accent', 'Elantra', 'Elantra GT', 'Ioniq', 'Ioniq 5', 'Ioniq 6', 'Kona', 'Palisade', 'Santa Cruz', 'Santa Fe', 'Sonata', 'Tucson', 'Veloster', 'Venue'],
  Infiniti: ['G35', 'G37', 'Q50', 'Q60', 'QX50', 'QX55', 'QX60', 'QX80'],
  Jaguar: ['E-Pace', 'F-Pace', 'I-Pace', 'XE', 'XF'],
  Jeep: ['Cherokee', 'Compass', 'Gladiator', 'Grand Cherokee', 'Liberty', 'Patriot', 'Renegade', 'Wagoneer', 'Wrangler'],
  Kia: ['Carnival', 'EV6', 'EV9', 'Forte', 'K5', 'Niro', 'Optima', 'Rio', 'Rondo', 'Sedona', 'Seltos', 'Sorento', 'Soul', 'Sportage', 'Telluride'],
  'Land Rover': ['Defender', 'Discovery', 'Discovery Sport', 'Range Rover', 'Range Rover Evoque', 'Range Rover Sport', 'Range Rover Velar'],
  Lexus: ['ES', 'GX', 'IS', 'LX', 'NX', 'RX', 'RZ', 'UX'],
  Lincoln: ['Aviator', 'Corsair', 'MKC', 'MKX', 'MKZ', 'Nautilus', 'Navigator'],
  Mazda: ['Mazda2', 'Mazda3', 'Mazda5', 'Mazda6', 'CX-3', 'CX-30', 'CX-5', 'CX-50', 'CX-70', 'CX-9', 'CX-90', 'MX-5', 'MX-30'],
  'Mercedes-Benz': ['Classe A', 'Classe B', 'Classe C', 'Classe E', 'Classe S', 'CLA', 'GLA', 'GLB', 'GLC', 'GLE', 'GLS', 'Sprinter', 'Metris', 'EQB', 'EQE'],
  Mini: ['Clubman', 'Cooper', 'Countryman'],
  Mitsubishi: ['Eclipse Cross', 'Lancer', 'Mirage', 'Outlander', 'Outlander PHEV', 'RVR'],
  Nissan: ['Altima', 'Ariya', 'Frontier', 'Juke', 'Kicks', 'Leaf', 'Maxima', 'Micra', 'Murano', 'Pathfinder', 'Qashqai', 'Rogue', 'Sentra', 'Titan', 'Versa', 'X-Trail'],
  Polestar: ['Polestar 2', 'Polestar 3'],
  Pontiac: ['G5', 'G6', 'Grand Am', 'Montana', 'Pursuit', 'Torrent', 'Vibe', 'Wave'],
  Porsche: ['911', 'Cayenne', 'Macan', 'Panamera', 'Taycan'],
  Ram: ['1500', '1500 Classic', '2500', '3500', 'ProMaster', 'ProMaster City'],
  Saturn: ['Ion', 'Outlook', 'Vue'],
  Scion: ['FR-S', 'iA', 'iM', 'tC', 'xB', 'xD'],
  Smart: ['Fortwo'],
  Subaru: ['Ascent', 'BRZ', 'Crosstrek', 'Forester', 'Impreza', 'Legacy', 'Outback', 'Solterra', 'WRX'],
  Suzuki: ['Grand Vitara', 'SX4', 'Swift'],
  Tesla: ['Model 3', 'Model S', 'Model X', 'Model Y', 'Cybertruck'],
  Toyota: [
    '4Runner', 'bZ4X', 'C-HR', 'Camry', 'Corolla', 'Corolla Cross', 'Echo', 'Highlander', 'Matrix', 'Prius', 'RAV4', 'Sequoia', 'Sienna',
    'Tacoma', 'Tundra', 'Venza', 'Yaris',
  ],
  Volkswagen: ['Atlas', 'Atlas Cross Sport', 'Beetle', 'Golf', 'Golf GTI', 'ID.4', 'Jetta', 'Passat', 'Taos', 'Tiguan', 'Touareg'],
  Volvo: ['C40', 'S60', 'S90', 'V60', 'V90', 'XC40', 'XC60', 'XC90'],
};

export const MAKES = Object.keys(VEHICLES).sort((a, b) => a.localeCompare(b));

/** Años: del próximo año-modelo hacia atrás hasta 1990. */
export function modelYears(now = new Date()) {
  const top = now.getFullYear() + 1;
  return Array.from({ length: top - 1990 + 1 }, (_, i) => top - i);
}
