import { z } from 'zod';

export const registerVisitorSchema = z.object({
  name: z.string()
    .min(2, 'Nama minimal 2 karakter')
    .max(100, 'Nama maksimal 100 karakter')
    .regex(/^[a-zA-Z\s]+$/, 'Nama hanya boleh huruf dan spasi'),
  phone: z.string()
    .regex(/^(08|\+62)[0-9]{8,11}$/, 'Format nomor HP tidak valid')
    .optional()
    .or(z.literal('')),
  ticket_type: z.enum(['Regular', 'VIP', 'Family', 'Group']),
  credit_limit: z.number()
    .min(0, 'Credit limit tidak boleh negatif')
    .max(10000000, 'Credit limit maksimal Rp 10.000.000')
});

export type RegisterVisitorInput = z.infer<typeof registerVisitorSchema>;

export const createMerchantSchema = z.object({
  name: z.string().min(3, 'Nama minimal 3 karakter').max(100),
  category: z.enum(['Adventure', 'F&B', 'Retail', 'Sightseeing', 'Loket/Gerbang']),
  location: z.string().min(3, 'Lokasi minimal 3 karakter').max(200),
  merchant_type: z.enum(['loket', 'regular']),
  phone: z.string().regex(/^(08|\+62)[0-9]{8,11}$/, 'Format nomor HP tidak valid (mulai 08 atau +62)'),
  owner_email: z.string().email('Email tidak valid'),
  owner_password: z.string().min(8, 'Password minimal 8 karakter')
});

export type CreateMerchantInput = z.infer<typeof createMerchantSchema>;

export const loginSchema = z.object({
  email: z.string().email('Email tidak valid'),
  password: z.string().min(1, 'Password wajib diisi')
});

export type LoginInput = z.infer<typeof loginSchema>;
