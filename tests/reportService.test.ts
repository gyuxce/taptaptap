import { describe, expect, it } from 'vitest';
import { toLocalDateRangeIso } from '@/lib/reportDate';

describe('report date range', () => {
  it('covers the entire selected local calendar day', () => {
    const range = toLocalDateRangeIso('2026-06-13', '2026-06-13');
    const duration = new Date(range.dateTo).getTime() - new Date(range.dateFrom).getTime();

    expect(duration).toBe(86_399_999);
  });

  it('keeps a multi-day range inclusive', () => {
    const range = toLocalDateRangeIso('2026-06-01', '2026-06-13');

    expect(new Date(range.dateTo).getTime()).toBeGreaterThan(new Date(range.dateFrom).getTime());
  });
});
