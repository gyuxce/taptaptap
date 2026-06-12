export function cn(...inputs: (string | undefined | null | boolean | Record<string, boolean>)[]) {
  const classes: string[] = [];
  for (const input of inputs) {
    if (!input) continue;
    if (typeof input === 'string') {
      classes.push(input);
    } else if (typeof input === 'object') {
      for (const [key, value] of Object.entries(input)) {
        if (value) {
          classes.push(key);
        }
      }
    }
  }
  return classes.join(' ');
}

export function formatTime(iso: string | Date): string {
  try {
    const date = typeof iso === 'string' ? new Date(iso) : iso;
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleTimeString('id-ID', { 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: false 
    }).replace('.', ':');
  } catch {
    return '-';
  }
}

export function formatDate(iso: string | Date): string {
  try {
    const date = typeof iso === 'string' ? new Date(iso) : iso;
    if (isNaN(date.getTime())) return '-';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  } catch {
    return '-';
  }
}

export function formatDatetime(iso: string | Date): string {
  try {
    const date = typeof iso === 'string' ? new Date(iso) : iso;
    if (isNaN(date.getTime())) return '-';
    return `${formatDate(date)}, ${formatTime(date)}`;
  } catch {
    return '-';
  }
}

export function formatRupiah(n: number): string {
  if (n === undefined || n === null) return 'Rp 0';
  return 'Rp ' + new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export function getInitials(name: string): string {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function normalizeUID(uid: string): string {
  if (!uid) return '';
  return uid.replace(/[^0-9a-f]/gi, '').toUpperCase();
}

export function getTicketColor(type: string): string {
  switch (type) {
    case 'Regular':
      return 'bg-gray-100 text-gray-700 border-gray-200';
    case 'VIP':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'Family':
      return 'bg-[#E8F6FD] text-[#29ABE2] border-[#29ABE2]/10';
    case 'Group':
      return 'bg-sky-50 text-sky-700 border-sky-200';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

export function formatPhoneForWA(phone: string | null | undefined): string {
  if (!phone) return '';
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.substring(1);
  }
  return cleaned;
}
