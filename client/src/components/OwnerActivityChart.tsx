import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Props = {
  data: { date: string; label: string; volume: number }[];
};

function formatCurrency(value: number) {
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export default function OwnerActivityChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid stroke="#edf1f6" vertical={false} strokeDasharray="3 5" />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} interval={2} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(value: number) => value >= 1000 ? `₹${value / 1000}k` : `₹${value}`} />
        <Tooltip cursor={{ fill: '#f1f9fe' }} formatter={(value) => [formatCurrency(Number(value)), 'Verified volume']} contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 12 }} />
        <Bar dataKey="volume" fill="#0ea5e9" radius={[5, 5, 0, 0]} maxBarSize={25} />
      </BarChart>
    </ResponsiveContainer>
  );
}
