export const COLORS = {
  primary: '#29ABE2',
  primaryLight: '#E8F6FD',
  background: '#F8FAFF',
  border: '#E2EEFF',
  text: '#1B2340',
  textMuted: '#64748B'
} as const;

export const TICKET_TYPES = ['Regular', 'VIP', 'Family', 'Group'] as const;
export type TicketType = typeof TICKET_TYPES[number];

export const MERCHANT_CATEGORIES = ['Adventure', 'F&B', 'Retail', 'Sightseeing', 'Loket/Gerbang'] as const;
export type MerchantCategory = typeof MERCHANT_CATEGORIES[number];

export const TRANSACTION_TYPES = ['entry', 'payment'] as const;
export type TransactionType = typeof TRANSACTION_TYPES[number];

export const MERCHANT_TYPES = ['loket', 'regular'] as const;
export type MerchantType = typeof MERCHANT_TYPES[number];
