import { describe, expect, it } from 'vitest';
import type { WheelCatalogItemRow } from './supabaseClient';
import { itemMatchesWheelSearch, wheelMatchesVehiclePcd } from './wheelCatalogSearch';

const item = {
  file_name: '14 VW UP.jpg',
  folder_path: '14 4X100',
  category: '14 4X100',
  rim_size: '14',
  pcd: '4X100',
  pcd_aliases: ['4X114.3'],
  tags: ['VW UP'],
  brand: '',
  model: '7192',
  wheel_size: '14X5.5J',
  width: '5.5J',
  finish: 'Black Machined Face + Red Under Cut',
  colour: 'BLACK/RED',
  wheel_offset: '35',
  center_bore: '73.1',
  load_rating: null,
  vehicle_hints: ['VW UP'],
  image_ocr_text: 'Model 7192 14x5.5J Black Machined Face Pcd 8x100 / 114.3 ET 35 CB 73.1',
  image_spec_text: 'Model 7192, 14X5.5J, 4X100, 4X114.3, ET35, CB73.1'
} as WheelCatalogItemRow;

describe('wheel catalog specification search', () => {
  it.each(['7192', '14x5.5j', 'black machined', 'ET35', 'CB73.1', 'vw up', '4x114.3'])(
    'finds an OCR-enriched wheel using %s',
    (query) => expect(itemMatchesWheelSearch(item, query)).toBe(true)
  );

  it('matches words in any order', () => {
    expect(itemMatchesWheelSearch(item, 'red 7192 5.5j')).toBe(true);
  });

  it.each(['14 inch', '14"', '4/114.3', 'ET 35', 'centre bore 73.1', 'machine face'])(
    'accepts staff-friendly search format %s',
    (query) => expect(itemMatchesWheelSearch(item, query)).toBe(true)
  );

  it('does not match unrelated specifications', () => {
    expect(itemMatchesWheelSearch(item, '18x9 bronze')).toBe(false);
  });

  it('uses dual-PCD aliases for vehicle filtering', () => {
    expect(wheelMatchesVehiclePcd(item, ['4X114.3'])).toBe(true);
    expect(wheelMatchesVehiclePcd(item, ['5X112'])).toBe(false);
  });
});
