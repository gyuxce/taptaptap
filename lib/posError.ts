type DatabaseErrorLike = {
  code?: string | null;
  message?: string | null;
};

export function formatPosError(
  error: unknown,
  fallback = 'Terjadi kendala saat membuka POS',
) {
  if (error instanceof Error) return error;

  const databaseError = error as DatabaseErrorLike | null;
  const code = databaseError?.code ?? '';
  const message = databaseError?.message ?? '';
  const normalizedMessage = message.toLowerCase();

  if (
    code === '42P01' ||
    code === 'PGRST202' ||
    normalizedMessage.includes('does not exist') ||
    normalizedMessage.includes('could not find the function')
  ) {
    return new Error(
      'Database POS belum aktif sepenuhnya. Jalankan kembali migrasi POS di Supabase.',
    );
  }

  if (
    code === '42501' ||
    normalizedMessage.includes('row-level security') ||
    normalizedMessage.includes('permission denied')
  ) {
    return new Error(
      'Akun merchant belum mendapat akses POS. Periksa profil dan kebijakan database.',
    );
  }

  if (code === '23503') {
    return new Error(
      'Data merchant atau wisatawan tidak terhubung dengan benar. Muat ulang lalu coba lagi.',
    );
  }

  return new Error(message || fallback);
}
