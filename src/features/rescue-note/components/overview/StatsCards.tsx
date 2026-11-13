import type { CrisisDashboardRow } from '../../services/rescueRoster';

interface Props { rows: CrisisDashboardRow[]; }

export function StatsCards({ rows }: Props) {
  const total = rows.length;
  const last30 = rows.filter((r) => {
    if (!r.lastNoteAt) return false;
    const t = new Date(r.lastNoteAt).getTime();
    return t > Date.now() - 30 * 24 * 60 * 60 * 1000;
  }).length;
  const noContact = rows.filter((r) => {
    if (!r.lastNoteAt) return true;
    return new Date(r.lastNoteAt).getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000;
  }).length;

  const item = (label: string, value: number | string, accent?: string) => (
    <div className="bg-white/60 backdrop-blur-sm border border-white/40 rounded-xl shadow-sm p-4 hover:shadow-md transition-all">
      <div className="text-xs font-medium text-slate-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold text-slate-800 ${accent ?? ''}`}>{value}</div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
      {item('위기 학생', total)}
      {item('최근 30일 상담', last30)}
      {item('30일+ 미상담', noContact, noContact > 0 ? 'text-amber-600' : '')}
    </div>
  );
}
