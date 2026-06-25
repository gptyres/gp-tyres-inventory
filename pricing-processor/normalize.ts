const ENTITY_MAP: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'"
};

export const decodeHtmlEntities = (input: string): string => (
  input.replace(/&(nbsp|amp|lt|gt|quot|apos);|&#39;/gi, (entity) => ENTITY_MAP[entity.toLowerCase()] ?? entity)
);

export const stripUnsafeHtml = (input: string): string => (
  input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
);

export const normalizeInput = (input: string): string => {
  const decoded = decodeHtmlEntities(input);
  return stripUnsafeHtml(decoded)
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export const normalizeTokenText = (input: string): string => (
  normalizeInput(input)
    .toUpperCase()
    .replace(/[^A-Z0-9/+.&* -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);
