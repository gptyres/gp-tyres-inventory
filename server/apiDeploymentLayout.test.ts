import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Vercel API deployment layout', () => {
  it('does not deploy test files as serverless functions', () => {
    const files = readdirSync('api', { recursive: true }).map(String);
    expect(files.filter((file) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(file))).toEqual([]);
  });
});
