export const COLORS = {
  primary: '#1D9E75',
  primaryLight: '#E1F5EE',
  background: '#f7f7f5',
  border: '#e5e3db',
  text: '#1e293b',
  textMuted: '#64748b'
} as const;

export const TICKET_TYPES = ['Regular', 'VIP', 'Family', 'Group'] as const;
export type TicketType = typeof TICKET_TYPES[number];

export const MERCHANT_CATEGORIES = ['Adventure', 'F&B', 'Retail', 'Sightseeing', 'Loket/Gerbang'] as const;
export type MerchantCategory = typeof MERCHANT_CATEGORIES[number];

export const TRANSACTION_TYPES = ['entry', 'payment'] as const;
export type TransactionType = typeof TRANSACTION_TYPES[number];

export const MERCHANT_TYPES = ['loket', 'regular'] as const;
export type MerchantType = typeof MERCHANT_TYPES[number];
