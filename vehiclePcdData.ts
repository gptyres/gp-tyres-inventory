export interface VehiclePcdModel {
  brand: string;
  model: string;
  pcds: string[];
  years?: string;
}

export const SOUTH_AFRICA_VEHICLE_PCD_MODELS: VehiclePcdModel[] = [
  { brand: 'Audi', model: 'A3 / A4 / A5 / Q3', pcds: ['5X112'] },
  { brand: 'BMW', model: '1 / 3 / 4 Series older fitment', pcds: ['5X120'] },
  { brand: 'BMW', model: 'Newer 1 / 2 / 3 Series fitment', pcds: ['5X112'] },
  { brand: 'Chery', model: 'Tiggo 4 Pro', pcds: ['5X108'] },
  { brand: 'Ford', model: 'EcoSport / Fiesta', pcds: ['4X108'] },
  { brand: 'Ford', model: 'Ranger / Everest', pcds: ['6X139'] },
  { brand: 'Haval', model: 'Jolion / H6', pcds: ['5X114', '5X114.3'] },
  { brand: 'Hyundai', model: 'Grand i10 / i20', pcds: ['4X100'] },
  { brand: 'Hyundai', model: 'Creta / Tucson', pcds: ['5X114', '5X114.3'] },
  { brand: 'Isuzu', model: 'D-Max / MU-X', pcds: ['6X139'] },
  { brand: 'Kia', model: 'Picanto / Rio', pcds: ['4X100'] },
  { brand: 'Kia', model: 'Sonet / Seltos / Sportage', pcds: ['5X114', '5X114.3'] },
  { brand: 'Mahindra', model: 'Scorpio Pik-Up / XUV', pcds: ['6X139'] },
  { brand: 'Mazda', model: 'Mazda2', pcds: ['4X100'] },
  { brand: 'Mazda', model: 'Mazda3 / CX-3 / CX-5', pcds: ['5X114', '5X114.3'] },
  { brand: 'Mercedes-Benz', model: 'A / C / E / GLA / GLC', pcds: ['5X112'] },
  { brand: 'Nissan', model: 'NP200 / Almera', pcds: ['4X100'] },
  { brand: 'Nissan', model: 'Navara / NP300', pcds: ['6X114', '6X139'] },
  { brand: 'Omoda', model: 'C5', pcds: ['5X108'] },
  { brand: 'Renault', model: 'Kwid', pcds: ['3X100'] },
  { brand: 'Renault', model: 'Clio / Captur', pcds: ['4X100'] },
  { brand: 'Suzuki', model: 'Swift / Dzire / Baleno / Starlet', pcds: ['4X100'] },
  { brand: 'Suzuki', model: 'Ertiga / Fronx / Grand Vitara', pcds: ['5X114', '5X114.3'] },
  { brand: 'Toyota', model: 'Hilux / Fortuner', pcds: ['6X139'] },
  { brand: 'Toyota', model: 'Corolla Cross / RAV4', pcds: ['5X114', '5X114.3'] },
  { brand: 'Toyota', model: 'Starlet / Vitz / older Yaris', pcds: ['4X100'] },
  { brand: 'Toyota', model: 'Urban Cruiser', pcds: ['5X114', '5X114.3'] },
  { brand: 'Volkswagen', model: 'Polo / Polo Vivo', pcds: ['5X100'] },
  { brand: 'Volkswagen', model: 'Golf 5-7 / Jetta / Tiguan', pcds: ['5X112'] },
  { brand: 'Volkswagen', model: 'T-Cross / Taigo', pcds: ['5X100'] }
];
