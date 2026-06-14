import { describe, expect, it } from 'vitest';

import { formatPosError } from '@/lib/posError';

describe('formatPosError', () => {
  it('explains a missing POS migration', () => {
    const error = formatPosError({
      code: '42P01',
      message: 'relation "menu_items" does not exist',
    });

    expect(error.message).toContain('migrasi POS');
  });

  it('explains an RLS access failure', () => {
    const error = formatPosError({
      code: '42501',
      message: 'new row violates row-level security policy',
    });

    expect(error.message).toContain('akses POS');
  });

  it('keeps useful database messages', () => {
    const error = formatPosError({
      code: '22000',
      message: 'Menu merchant belum tersedia',
    });

    expect(error.message).toBe('Menu merchant belum tersedia');
  });
});
