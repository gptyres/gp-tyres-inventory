import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WheelSearchPanel } from './WheelSearchPanel';

const props = {
  query: '', filters: {}, options: { diameters: ['15', '17'], widths: ['6.5', '7'] },
  count: 2, loading: false, setOfFour: false,
  onQueryChange: () => {}, onFiltersChange: () => {}, onCategoryChange: () => {}, onClear: () => {}
};
describe('wheel search panel', () => {
  it('provides labelled search, category, vehicle, PCD, diameter and width controls', () => {
    const html = renderToStaticMarkup(<WheelSearchPanel {...props} />);
    for (const label of ['Search wheels', 'Category', 'Vehicle', 'PCD', 'Size', 'Width']) {
      expect(html).toContain(`aria-label="${label}"`);
    }
    expect(html).toContain('15 inch');
    expect(html).toContain('6.5 inch');
    expect(html.replace(/<[^>]*>/g, '')).toContain('2 wheels');
    expect(html).toContain('Clear filters');
  });
  it('does not label every supplier as set-of-four pricing', () => {
    expect(renderToStaticMarkup(<WheelSearchPanel {...props} />)).not.toContain('set of 4');
    expect(renderToStaticMarkup(<WheelSearchPanel {...props} setOfFour />)).toContain('set of 4');
  });
  it('announces loading instead of a misleading zero result count', () => {
    const html = renderToStaticMarkup(<WheelSearchPanel {...props} count={0} loading />);
    expect(html).toContain('Loading wheels');
    expect(html).not.toContain('0 wheels');
  });
});
