import { describe, expect, it } from 'vitest';
import { hasExplicitMemoryIntent, validateStaffMemoryContent } from './gpBusinessAgentMemory';

describe('GP Business Agent staff memory safety', () => {
  it('requires an explicit request to remember a preference', () => {
    expect(hasExplicitMemoryIntent('Remember that I prefer short customer replies.')).toBe(true);
    expect(hasExplicitMemoryIntent('Save this preference to memory for next time.')).toBe(true);
    expect(hasExplicitMemoryIntent('Write a short customer reply.')).toBe(false);
  });

  it('allows safe communication and workflow preferences', () => {
    expect(validateStaffMemoryContent('Keep customer replies concise and professional.').allowed).toBe(true);
    expect(validateStaffMemoryContent('Prefer a comparison of three practical options.').allowed).toBe(true);
  });

  it('rejects credentials, customer personal data and changing business facts', () => {
    expect(validateStaffMemoryContent('My API key is secret-value.').allowed).toBe(false);
    expect(validateStaffMemoryContent('Remember the customer phone number.').allowed).toBe(false);
    expect(validateStaffMemoryContent('The selling price is R2500.').allowed).toBe(false);
    expect(validateStaffMemoryContent('This tyre has 12 units available.').allowed).toBe(false);
  });
});
