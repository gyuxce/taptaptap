export interface CSVColumn {
  key: string;
  label: string;
}

export const TRANSACTION_COLUMNS: CSVColumn[] = [
  { key: 'created_at', label: 'Waktu' },
  { key: 'visitor_name', label: 'Nama Wisatawan' },
  { key: 'ticket_type', label: 'Tipe Tiket' },
  { key: 'merchant_name', label: 'Merchant' },
  { key: 'type', label: 'Jenis Tap' },
  { key: 'amount', label: 'Nominal' },
  { key: 'whatsapp_status', label: 'Status WA' }
];

export const COMMISSION_COLUMNS: CSVColumn[] = [
  { key: 'date', label: 'Tanggal' },
  { key: 'total_taps', label: 'Total Tap' },
  { key: 'total_revenue', label: 'Total Pendapatan' },
  { key: 'commission', label: 'Komisi (10%)' },
  { key: 'net_payout', label: 'Pendapatan Bersih' }
];

export const VISITOR_COLUMNS: CSVColumn[] = [
  { key: 'name', label: 'Nama Wisatawan' },
  { key: 'phone', label: 'No Telepon' },
  { key: 'ticket_type', label: 'Tipe Tiket' },
  { key: 'credit_limit', label: 'Limit Kredit' },
  { key: 'credit_used', label: 'Kredit Terpakai' },
  { key: 'created_at', label: 'Tanggal Registrasi' }
];

/**
 * Generates and downloads a CSV file from structured data.
 * Prepends UTF-8 BOM to ensure compatibility with Microsoft Excel.
 */
export function generateCSV(
  data: any[],
  columns: CSVColumn[],
  filename: string
) {
  // Create CSV header row
  const headers = columns.map(col => `"${col.label.replace(/"/g, '""')}"`).join(',');

  // Create CSV body rows
  const rows = data.map(row => {
    return columns.map(col => {
      const val = row[col.key];
      if (val === undefined || val === null) {
        return '""';
      }
      
      // If it's a number, output it directly. Avoid currency symbols or special formatting for numbers.
      if (typeof val === 'number') {
        return val.toString();
      }

      const strVal = String(val);
      // Double quote strings and escape inner double quotes
      return `"${strVal.replace(/"/g, '""')}"`;
    }).join(',');
  });

  // Combine header and rows with UTF-8 BOM
  const csvContent = '\uFEFF' + [headers, ...rows].join('\r\n');

  // Trigger download in browser
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
