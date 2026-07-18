import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RADAR_RED_DRIVE_URL, RADAR_RED_EMBED_URL, RadarRedView } from './RadarRedView';

describe('RadarRedView', () => {
  it('embeds the live folder and keeps an external Drive fallback', () => {
    const html = renderToStaticMarkup(<RadarRedView />);

    expect(html).toContain('RADAR RED');
    expect(html).toContain(RADAR_RED_EMBED_URL.replaceAll('&', '&amp;'));
    expect(html).toContain(RADAR_RED_DRIVE_URL.replaceAll('&', '&amp;'));
    expect(html).toContain('Open in Google Drive');
    expect(html).toContain('updates automatically');
  });
});
