import { describe, expect, it } from 'vitest';
import { royalWorkbookItem } from './royalTyresWorkbook.mjs';

const row = {
  'Supplier SKU': 'test', 'Product Type': 'TYRE', 'Product Name': 'BRIDGESTONE 195R15C (H/T) 106S 8PR 613V',
  TYRE_SIZE: '195R15C', Category: 'PCR', 'Cost Price': '1695', 'Price Column': 'Yellow',
  'Snapshot Date': '2026-09-08', 'Source Sheet': 'Data', 'Source Row': '461',
  'RVTRK Stock Units': '5', 'RTCPHX Stock Units': '4', 'RTCJHB Stock Units': '0', 'RTC_CT Stock Units': '0'
};

describe('Royal workbook import', () => {
  it('preserves numeric model codes and takes only the chosen price', () => {
    expect(royalWorkbookItem({ ...row, Orange: 9999, Red: 8888 })).toMatchObject({
      tyre_pattern: '613V', tyre_index: '106S', cost_price: 1695, selling_price: 1949, stock_units: 9
    });
    expect(() => royalWorkbookItem({ ...row, 'Price Column': 'Orange' })).toThrow();
    expect(() => royalWorkbookItem({ ...row, 'Cost Price': 'invalid' })).toThrow();
  });
  it('retains product identity when stock and prices change', () => {
    expect(royalWorkbookItem(row).source_key).toBe(royalWorkbookItem({ ...row, 'Cost Price': '100', 'RTC_CT Stock Units': '12' }).source_key);
  });
  it('reads spaced rim sizes and wheel specifications', () => {
    expect(royalWorkbookItem({ ...row, 'Product Type': 'WHEEL', 'Product Name': 'RIMS 22.50 X 11.75 SILVER (10 /335 /281 /120 /26SP)' })).toMatchObject({
      size: '22.50X11.75', wheel_pcd: '10/335', wheel_offset: '120', wheel_center_bore: '281'
    });
  });
});
