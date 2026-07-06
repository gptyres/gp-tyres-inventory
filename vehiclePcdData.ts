export interface VehiclePcdModel {
  brand: string;
  model: string;
  pcdKey: string;
  pcds: string[];
  commonAliases: string[];
  priorityLevel: string;
  segment: string;
  fitmentNote: string;
}

interface PcdDefinition {
  pcdKey: string;
  catalogPcds: string[];
  commonAliases: string[];
  priorityLevel: string;
  segment: string;
}

const FITMENT_NOTE = 'PCD is a search filter only. Confirm centre bore, ET/offset, wheel width, brake clearance, nut/bolt type, thread pitch and load rating before fitting.';

const PCD_DEFINITIONS: Record<string, PcdDefinition> = {
  '6x139.7': {
    pcdKey: '6x139.7',
    catalogPcds: ['6X139.7', '6X139'],
    commonAliases: ['6x139', '6/139.7', '6x5.5'],
    priorityLevel: 'Very High',
    segment: 'Bakkie, 4x4, taxi/commercial'
  },
  '4x100': {
    pcdKey: '4x100',
    catalogPcds: ['4X100'],
    commonAliases: ['4/100'],
    priorityLevel: 'Very High',
    segment: 'Small passenger cars, budget hatches'
  },
  '5x100': {
    pcdKey: '5x100',
    catalogPcds: ['5X100'],
    commonAliases: ['5/100'],
    priorityLevel: 'Very High',
    segment: 'VW Polo/Vivo, stance, compact hatch'
  },
  '5x114.3': {
    pcdKey: '5x114.3',
    catalogPcds: ['5X114.3', '5X114'],
    commonAliases: ['5/114.3', '5x4.5'],
    priorityLevel: 'Very High',
    segment: 'Japanese/Korean sedans and SUVs'
  },
  '5x112': {
    pcdKey: '5x112',
    catalogPcds: ['5X112'],
    commonAliases: ['5/112'],
    priorityLevel: 'High',
    segment: 'VW/Audi/Mercedes premium passenger'
  },
  '5x108': {
    pcdKey: '5x108',
    catalogPcds: ['5X108'],
    commonAliases: ['5/108', '5x4.25'],
    priorityLevel: 'High / Rising',
    segment: 'Chery/Omoda/Jetour, Ford/Volvo/Peugeot/Citroen'
  },
  '5x120': {
    pcdKey: '5x120',
    catalogPcds: ['5X120'],
    commonAliases: ['5/120'],
    priorityLevel: 'High',
    segment: 'BMW, Amarok, Land Rover/Range Rover'
  },
  '4x108': {
    pcdKey: '4x108',
    catalogPcds: ['4X108'],
    commonAliases: ['4/108'],
    priorityLevel: 'Medium-High',
    segment: 'Ford compact, Peugeot/Citroen'
  },
  '5x150': {
    pcdKey: '5x150',
    catalogPcds: ['5X150'],
    commonAliases: ['5/150'],
    priorityLevel: 'Medium-High',
    segment: 'Land Cruiser heavy-duty 4x4'
  },
  '6x114.3': {
    pcdKey: '6x114.3',
    catalogPcds: ['6X114.3', '6X114'],
    commonAliases: ['6/114.3'],
    priorityLevel: 'Medium',
    segment: 'Nissan Navara-specific bakkie fitment'
  },
  '5x160': {
    pcdKey: '5x160',
    catalogPcds: ['5X160'],
    commonAliases: ['5/160'],
    priorityLevel: 'Medium',
    segment: 'Mahindra bakkies/commercial'
  },
  '5x139.7': {
    pcdKey: '5x139.7',
    catalogPcds: ['5X139.7', '5X139'],
    commonAliases: ['5x139', '5/139.7', '5x5.5'],
    priorityLevel: 'Medium',
    segment: 'Jimny / compact 4x4 niche'
  },
  '5x127': {
    pcdKey: '5x127',
    catalogPcds: ['5X127'],
    commonAliases: ['5/127', '5x5'],
    priorityLevel: 'Medium',
    segment: 'Jeep 4x4'
  },
  '5x105': {
    pcdKey: '5x105',
    catalogPcds: ['5X105'],
    commonAliases: ['5/105'],
    priorityLevel: 'Medium-Low',
    segment: 'Chevrolet/Opel compact sedan/SUV'
  },
  '6x130': {
    pcdKey: '6x130',
    catalogPcds: ['6X130'],
    commonAliases: ['6/130'],
    priorityLevel: 'Medium-Low',
    segment: 'Large vans/commercial'
  }
};

const vehicle = (brand: string, model: string, pcdKey: keyof typeof PCD_DEFINITIONS): VehiclePcdModel => {
  const definition = PCD_DEFINITIONS[pcdKey];
  return {
    brand,
    model,
    pcdKey: definition.pcdKey,
    pcds: definition.catalogPcds,
    commonAliases: definition.commonAliases,
    priorityLevel: definition.priorityLevel,
    segment: definition.segment,
    fitmentNote: FITMENT_NOTE
  };
};

export const SOUTH_AFRICA_VEHICLE_PCD_MODELS: VehiclePcdModel[] = [
  vehicle('Audi', 'A1 older models', '5x100'),
  vehicle('Audi', 'A3 / A4 / A5 / Q3 / Q5', '5x112'),
  vehicle('Audi', 'TT older models', '5x100'),
  vehicle('BMW', '1 Series / 3 Series / 5 Series', '5x120'),
  vehicle('BMW', 'X1 / X3 / X5 older platforms', '5x120'),
  vehicle('Chery', 'Tiggo 4 Pro', '5x108'),
  vehicle('Chevrolet', 'Aveo', '4x100'),
  vehicle('Chevrolet', 'Cruze / Sonic / newer Aveo', '5x105'),
  vehicle('Chevrolet', 'Utility', '4x100'),
  vehicle('Chrysler', 'Selected Chrysler / Dodge SUV models', '5x127'),
  vehicle('Citroen', 'C2 / C3 / C4 / C5', '4x108'),
  vehicle('Citroen', 'C3 / C4 / C5 newer variants', '5x108'),
  vehicle('Ford', 'Bantam', '4x108'),
  vehicle('Ford', 'EcoSport / Fiesta / Figo', '4x108'),
  vehicle('Ford', 'Focus / Kuga', '5x108'),
  vehicle('Ford', 'Ranger / Everest', '6x139.7'),
  vehicle('GWM', 'P-Series', '6x139.7'),
  vehicle('Haval', 'Jolion', '5x114.3'),
  vehicle('Honda', 'Civic / CR-V', '5x114.3'),
  vehicle('Honda', 'Older Honda models', '4x100'),
  vehicle('Hyundai', 'Creta / Tucson / ix35', '5x114.3'),
  vehicle('Hyundai', 'Grand i10 / i10', '4x100'),
  vehicle('Isuzu', 'D-Max / KB', '6x139.7'),
  vehicle('Jeep', 'Wrangler / Grand Cherokee / Commander', '5x127'),
  vehicle('Jetour', 'T2', '5x108'),
  vehicle('Kia', 'Sonet / Seltos / Sportage', '5x114.3'),
  vehicle('Land Rover', 'Discovery 3 / Discovery 4', '5x120'),
  vehicle('Lexus', 'LX variants', '5x150'),
  vehicle('Mahindra', 'Bolero Pik-Up / Pik-Up / Scorpio Pik-Up', '5x160'),
  vehicle('Mahindra', 'Selected Thar / Scorpio-N variants', '5x139.7'),
  vehicle('Mazda', 'Mazda 3 / CX-5', '5x114.3'),
  vehicle('Mercedes-Benz', 'A-Class / C-Class / E-Class / GLA / GLC', '5x112'),
  vehicle('Mercedes-Benz', 'Sprinter', '6x130'),
  vehicle('Mercedes-Benz', 'X-Class', '6x114.3'),
  vehicle('Mitsubishi', 'Lancer newer models', '5x114.3'),
  vehicle('Mitsubishi', 'Triton / Pajero Sport', '6x139.7'),
  vehicle('Nissan', 'Navara D23 / Pathfinder platform variants', '6x114.3'),
  vehicle('Nissan', 'NP300 / Hardbody', '6x139.7'),
  vehicle('Nissan', 'Qashqai / X-Trail', '5x114.3'),
  vehicle('Omoda', 'C5', '5x108'),
  vehicle('Opel', 'Corsa older models', '4x100'),
  vehicle('Opel', 'Grandland / Crossland variants', '5x108'),
  vehicle('Opel', 'Insignia', '5x120'),
  vehicle('Opel', 'Mokka first generation', '5x105'),
  vehicle('Opel', 'Newer Corsa / Crossland variants', '4x108'),
  vehicle('Peugeot', '206 / 207 / 208', '4x108'),
  vehicle('Peugeot', '2008 / 3008 / 308', '5x108'),
  vehicle('Range Rover', 'Sport older models', '5x120'),
  vehicle('Renault', 'Clio / Sandero', '4x100'),
  vehicle('Skoda', 'Octavia / Superb', '5x112'),
  vehicle('Subaru', 'BRZ', '5x100'),
  vehicle('Subaru', 'Impreza / Forester older models', '5x100'),
  vehicle('Suzuki', 'Jimny', '5x139.7'),
  vehicle('Suzuki', 'Older Suzuki models', '4x100'),
  vehicle('Suzuki', 'Swift', '4x100'),
  vehicle('Suzuki', 'Vitara / Grand Vitara older models', '5x139.7'),
  vehicle('Toyota', '86', '5x100'),
  vehicle('Toyota', 'Corolla Cross / RAV4', '5x114.3'),
  vehicle('Toyota', 'Etios / Yaris / Tazz', '4x100'),
  vehicle('Toyota', 'Hilux / Fortuner', '6x139.7'),
  vehicle('Toyota', 'Land Cruiser 76 / 78 / 79 / 100 / 105 / 200', '5x150'),
  vehicle('Toyota', 'Older Toyota models', '4x100'),
  vehicle('Toyota', 'Prado 120 / Prado 150', '6x139.7'),
  vehicle('Toyota', 'Quantum / HiAce', '6x139.7'),
  vehicle('Toyota', 'Starlet / Vitz', '4x100'),
  vehicle('Volkswagen', 'Amarok 2010-2022', '5x120'),
  vehicle('Volkswagen', 'Caddy', '5x112'),
  vehicle('Volkswagen', 'Golf 4 / Jetta 4', '5x100'),
  vehicle('Volkswagen', 'Golf 5 onwards / Jetta 5 onwards / Tiguan', '5x112'),
  vehicle('Volkswagen', 'Polo / Polo Vivo', '5x100'),
  vehicle('Volkswagen', 'Crafter', '6x130'),
  vehicle('Volvo', 'S40 / S60 / XC60 variants', '5x108')
].sort((first, second) => (
  first.brand.localeCompare(second.brand) || first.model.localeCompare(second.model)
));
