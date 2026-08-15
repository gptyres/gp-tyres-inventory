import { describe, expect, it } from 'vitest';
import { getHistorySummary } from './inventoryHistory';

describe('inventory history client helpers', () => {
  it('keeps the history panel stable while no events are loaded', () => {
    expect(getHistorySummary()).toEqual({ soldUnits: 0, netMovement: 0, editCount: 0 });
  });
});
