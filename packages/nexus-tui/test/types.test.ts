import { describe, it, expect } from 'vitest';
import { darkTheme, lightTheme } from '../src/types.js';

describe('darkTheme', () => {
  it('has all required color fields', () => {
    const fields = ['primary', 'secondary', 'success', 'warning', 'error', 'muted', 'text', 'background', 'border'] as const;
    for (const field of fields) {
      expect(darkTheme).toHaveProperty(field);
      expect(typeof darkTheme[field]).toBe('string');
    }
  });
});

describe('lightTheme', () => {
  it('has all required color fields', () => {
    const fields = ['primary', 'secondary', 'success', 'warning', 'error', 'muted', 'text', 'background', 'border'] as const;
    for (const field of fields) {
      expect(lightTheme).toHaveProperty(field);
      expect(typeof lightTheme[field]).toBe('string');
    }
  });
});

it('darkTheme and lightTheme have different values for at least some fields', () => {
  expect(darkTheme).not.toEqual(lightTheme);
});
