'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatRupiah } from '@/lib/utils';

interface RevenueChartProps {
  data: Array<{ date: string; revenue: number }>;
}

export default function RevenueChart({ data }: RevenueChartProps) {
  const hasNoRevenue = data.every(item => item.revenue === 0);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ left: -25, right: 5 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e3db" />
        <XAxis dataKey="date" fontSize={9} stroke="#64748b" />
        <YAxis
          fontSize={9}
          stroke="#64748b"
          domain={hasNoRevenue ? [0, 10000] : [0, 'auto']}
          tickFormatter={value => value === 0 ? 'Rp0' : value % 1000 === 0 ? `Rp${value / 1000}k` : `Rp${(value / 1000).toFixed(1)}k`}
        />
        <Tooltip
          formatter={value => formatRupiah(Number(value))}
          contentStyle={{ fontSize: 10, borderRadius: 8 }}
        />
        <Bar dataKey="revenue" fill="#29ABE2" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
