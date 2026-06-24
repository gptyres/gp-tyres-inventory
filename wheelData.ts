
import { WheelCatalogItem } from './types';

// Helper to generate IDs
let idCounter = 1;
const getId = () => `w-cat-${idCounter++}`;

const createWheel = (category: string, sub: string, design: string, specSize: string, offset: string, finish: string): WheelCatalogItem => ({
  id: getId(),
  category,
  subCategory: sub,
  designName: design,
  size: specSize,
  pcd: sub.replace('x', '/'), // Standardize PCD format for display
  offset,
  finish
});

export const MOCK_WHEEL_CATALOG: WheelCatalogItem[] = [
  // --- 13 INCH ---
  createWheel('13 Inch', '4x100', 'Mini Lite Style', '13x7J', 'ET0', 'Silver Polished Lip'),
  createWheel('13 Inch', '4x100', 'Super Lite', '13x6J', 'ET15', 'Gold Polished Lip'),
  createWheel('13 Inch', '4x100', 'Steelie Wide', '13x8J', 'ET-7', 'Matt Black'),

  // --- 15 INCH ---
  createWheel('15 Inch', '4x100', 'BBS RS Replica', '15x8J', 'ET25', 'Gold with Polished Lip'),
  createWheel('15 Inch', '4x100', 'BBS RS Replica', '15x8J', 'ET25', 'Silver with Polished Lip'),
  createWheel('15 Inch', '4x100', 'TE37 Style', '15x7J', 'ET35', 'Bronze'),
  createWheel('15 Inch', '4x100', 'TE37 Style', '15x7J', 'ET35', 'White'),
  createWheel('15 Inch', '4x100', 'Enkei RPF1 Style', '15x7J', 'ET35', 'Silver'),
  createWheel('15 Inch', '4x100', 'Spoon SW388 Style', '15x6.5J', 'ET38', 'Matt Black'),
  createWheel('15 Inch', '4x100', 'Work Equip 03', '15x8J', 'ET20', 'Black Polish'),
  createWheel('15 Inch', '5x100', 'OEM VW Polo Vivo', '15x6J', 'ET38', 'Silver'),
  createWheel('15 Inch', '5x100', 'OEM VW Golf 4 Avus', '15x6J', 'ET38', 'Silver'),
  createWheel('15 Inch', '6x139', 'Steel Modular', '15x8J', 'ET0', 'Black'),
  createWheel('15 Inch', '6x139', 'Steel Modular', '15x10J', 'ET-44', 'Black'),

  // --- 17 INCH ---
  // 4x100
  createWheel('17 Inch', '4x100', 'BBS LM Style', '17x7.5J', 'ET35', 'Silver Machined Lip'),
  createWheel('17 Inch', '4x100', 'HRE P101 Style', '17x7.5J', 'ET35', 'Gloss Black'),
  createWheel('17 Inch', '4x100', 'OZ Superturismo', '17x7J', 'ET40', 'White Red Lettering'),
  
  // 5x100 (VW Polo, Golf 4, Subaru)
  createWheel('17 Inch', '5x100', 'Rotiform BLQ', '17x8J', 'ET30', 'Silver'),
  createWheel('17 Inch', '5x100', 'Work Emotion CR Kai', '17x8J', 'ET32', 'White'),
  createWheel('17 Inch', '5x100', 'TE37 SL', '17x8J', 'ET35', 'Pressed Graphite'),
  createWheel('17 Inch', '5x100', 'OEM VW Polo GTI Detroit', '17x7.5J', 'ET38', 'Diamond Cut Black'),
  createWheel('17 Inch', '5x100', 'Tsw Sebring', '17x8J', 'ET35', 'Matte Black'),

  // 5x112 (VW Golf 5/6/7, Audi, Merc)
  createWheel('17 Inch', '5x112', 'Mercedes AMG Mono', '17x7.5J', 'ET35', 'Silver Polish'),
  createWheel('17 Inch', '5x112', 'VW Santiago Style', '17x7.5J', 'ET40', 'Black Polish'),
  createWheel('17 Inch', '5x112', 'Audi Rotor', '17x7.5J', 'ET35', 'Gunmetal Polish'),

  // 5x114.3 (JDM)
  createWheel('17 Inch', '5x114', 'Rays CE28N', '17x8.5J', 'ET30', 'Bronze'),
  createWheel('17 Inch', '5x114', 'Enkei NT03+M', '17x9J', 'ET40', 'Silver'),

  // 6x139 (Bakkie)
  createWheel('17 Inch', '6x139', 'Fuel Vapor', '17x9J', 'ET-12', 'Matte Black'),
  createWheel('17 Inch', '6x139', 'Black Rhino Arsenal', '17x9.5J', 'ET-18', 'Sand on Black'),
  createWheel('17 Inch', '6x139', 'Method 305 NV', '17x8.5J', 'ET0', 'Bronze'),
  createWheel('17 Inch', '6x139', 'OEM Toyota Hilux Legend', '17x7.5J', 'ET30', 'Gunmetal'),

  // --- 18 INCH ---
  // 5x100
  createWheel('18 Inch', '5x100', 'Rotiform LAS-R', '18x8.5J', 'ET35', 'Matte Black'),
  createWheel('18 Inch', '5x100', '3SDM 0.06', '18x8.5J', 'ET35', 'Silver Polish'),
  
  // 5x112
  createWheel('18 Inch', '5x112', 'Vossen CV3', '18x8.5J', 'ET42', 'Matte Black'),
  createWheel('18 Inch', '5x112', 'VW Pretoria', '18x8J', 'ET45', 'Gloss Black'),
  createWheel('18 Inch', '5x112', 'VW Pretoria', '18x8J', 'ET45', 'Hyper Silver'),
  createWheel('18 Inch', '5x112', 'Audi RS3 Blade', '18x8J', 'ET42', 'Black Red Detail'),
  createWheel('18 Inch', '5x112', 'Mercedes C63 Multi', '18x8.5J', 'ET40', 'Black Machined Lip'),
  createWheel('18 Inch', '5x112', 'Rotiform RSE', '18x8.5J', 'ET45', 'Silver'),

  // 5x120 (BMW)
  createWheel('18 Inch', '5x120', 'BMW M3 CSL Style', '18x8.5J', 'ET35', 'Hyper Silver'),
  createWheel('18 Inch', '5x120', 'BMW 359M Style', '18x9J', 'ET30', 'Satin Black'),
  createWheel('18 Inch', '5x120', 'AC Schnitzer Type 3', '18x8.5J', 'ET20', 'Silver'),

  // 6x139
  createWheel('18 Inch', '6x139', 'Fuel Rebel', '18x9J', 'ET1', 'Bronze Black Ring'),
  createWheel('18 Inch', '6x139', 'OEM Ford Ranger Raptor', '18x8.5J', 'ET55', 'Black'),

  // --- 19 INCH ---
  // 5x112
  createWheel('19 Inch', '5x112', 'VW Spielberg', '19x8.5J', 'ET45', 'Diamond Cut Black'),
  createWheel('19 Inch', '5x112', 'VW Brescia', '19x8.5J', 'ET45', 'Diamond Cut Black'),
  createWheel('19 Inch', '5x112', 'Audi RS6 Peelers', '19x9J', 'ET35', 'Gunmetal'),
  createWheel('19 Inch', '5x112', 'Vossen CVT', '19x8.5J', 'ET42', 'Silver Directional'),
  createWheel('19 Inch', '5x112', 'Rotiform CCV', '19x8.5J', 'ET45', 'Silver Machined'),

  // 5x120
  createWheel('19 Inch', '5x120', 'BMW M4 Comp Style', '19x8.5/9.5', 'ET35', 'Diamond Cut Black'),
  createWheel('19 Inch', '5x120', 'BMW M5 F10 Style', '19x9/10', 'ET30', 'Gunmetal Polish'),
  createWheel('19 Inch', '5x120', 'Vossen HF-2', '19x8.5/9.5', 'ET35', 'Tinted Matte Gunmetal'),

  // --- 20 INCH ---
  // 5x112
  createWheel('20 Inch', '5x112', 'Audi RSQ8 Style', '20x9J', 'ET30', 'Black Polish'),
  
  // 5x120 (Amarok / T5)
  createWheel('20 Inch', '5x120', 'Range Rover SVR Style', '20x9.5J', 'ET45', 'Gloss Black'),
  createWheel('20 Inch', '5x120', 'Amarok Milford', '20x9J', 'ET45', 'Grey Polish'),

  // 6x139
  createWheel('20 Inch', '6x139', 'Fuel Contra', '20x9J', 'ET1', 'Black Milled'),
  createWheel('20 Inch', '6x139', 'Black Rhino Warlord', '20x9J', 'ET12', 'Matte Gunmetal'),
  createWheel('20 Inch', '6x139', 'OEM Toyota Fortuner Limited', '20x8J', 'ET30', 'Two Tone'),

  // --- 21 & 22 INCH ---
  createWheel('21 Inch', '5x112', 'Audi RS6 Performance', '21x10J', 'ET25', 'Black Polish'),
  createWheel('22 Inch', '5x120', 'Vossen HF-5', '22x10.5J', 'ET35', 'Gloss Black'),
  createWheel('22 Inch', '6x139', 'Fuel Sledge', '22x12J', 'ET-44', 'Chrome'),
  createWheel('22 Inch', '5x130', 'Porsche Cayenne Turbo GT', '22x10/11.5', 'ET48/52', 'Neodyme Gold'),
];