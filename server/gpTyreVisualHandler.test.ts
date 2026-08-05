import { describe, expect, it } from 'vitest';
import { extractBingRssSearchLinks, searchTyreProductPages, selectExactMetadataCandidate } from './gpTyreVisualHandler';

describe('supplier tyre visual web search', () => {
  it('extracts product links from Bing RSS and removes search/social links', () => {
    const xml = `
      <rss><channel>
        <item><link>https://www.dunloptyres.co.za/grandtrek-at3</link></item>
        <item><link>https://www.youtube.com/watch?v=123</link></item>
      </channel></rss>
    `;

    expect(extractBingRssSearchLinks(xml)).toEqual([
      'https://www.dunloptyres.co.za/grandtrek-at3'
    ]);
  });

  it('continues with another provider when one search endpoint is unavailable', async () => {
    const fetcher = async (url: string) => {
      if (url.includes('search.brave.com')) return new Response('unavailable', { status: 503 });
      if (url.includes('duckduckgo.com')) return new Response('blocked', { status: 202 });
      return new Response(`
        <rss><channel>
          <item><link>https://retailer.example.com/dunlop-grandtrek-at3</link></item>
        </channel></rss>
      `, { status: 200, headers: { 'Content-Type': 'text/xml' } });
    };

    await expect(searchTyreProductPages('Dunlop Grandtrek AT3 tyre', fetcher)).resolves.toEqual([
      'https://retailer.example.com/dunlop-grandtrek-at3'
    ]);
  });

  it('uses only exact brand and pattern metadata for the deterministic fallback', () => {
    const exact = {
      pageUrl: 'https://www.dunloptyres.co.za/grandtrek-at3',
      imageUrl: 'https://www.dunloptyres.co.za/images/grandtrek-at3.jpg',
      title: 'Dunlop Grandtrek AT3 Tyre',
      excerpt: 'Official Dunlop all-terrain product page.',
      official: true
    };
    const wrongPattern = {
      ...exact,
      pageUrl: 'https://www.dunloptyres.co.za/grandtrek-at5',
      title: 'Dunlop Grandtrek AT5 Tyre'
    };

    expect(selectExactMetadataCandidate('Dunlop', 'Grandtrek AT3', [wrongPattern, exact])?.candidate).toEqual(exact);
    expect(selectExactMetadataCandidate('Dunlop', 'Grandtrek AT3', [wrongPattern])).toBeNull();
  });
});
