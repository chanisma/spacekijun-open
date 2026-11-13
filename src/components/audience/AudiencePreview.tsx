// ========================================
// 대상 미리보기 — 서버 resolve_audience 결과를 보여 준다.
// "왜 이 사람이 들어왔는가"(이유)를 함께 보여야 만든 사람이 명단을 믿고 보낸다.
// ========================================

import { useMemo } from 'react';
import { AlertTriangle, Loader2, Users } from 'lucide-react';
import {
  summarizeResolution,
  type AudienceResolution,
  type AudienceRow,
} from '@/lib/audienceRule';

interface Props {
  resolution: AudienceResolution | undefined;
  loading: boolean;
  error: Error | null;
  /** 규칙이 비어 있다 */
  empty: boolean;
}

export function AudiencePreview({ resolution, loading, error, empty }: Props) {
  const rows = useMemo(() => resolution?.rows ?? [], [resolution]);
  const summary = useMemo(() => summarizeResolution(rows), [rows]);

  const groups = useMemo(() => {
    if (!resolution || resolution.axis === 'person') return null;
    const map = new Map<string, AudienceRow[]>();
    for (const r of rows) {
      if (r.unit_key === null) continue;
      map.set(r.unit_label, [...(map.get(r.unit_label) ?? []), r]);
    }
    return [...map.entries()];
  }, [resolution, rows]);

  if (empty) {
    return <p className="text-xs text-slate-400">조건을 추가하면 대상 명단이 여기에 나옵니다.</p>;
  }
  if (loading) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        대상을 계산하는 중…
      </p>
    );
  }
  if (error) return <p className="text-xs text-rose-600">대상을 계산하지 못했습니다: {error.message}</p>;
  if (!resolution) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
          <Users className="h-3.5 w-3.5" />
          {summary.people}명
        </span>
        {resolution.axis !== 'person' && <span className="text-slate-500">{summary.lines}줄 · 단위 {summary.units}개</span>}
        <span className="text-slate-400">{resolution.academic_year}학년도 {resolution.semester}학기 시간표·{resolution.ref_date} 분장 기준</span>
      </div>

      {summary.noUnit.length > 0 && (
        <Warn>
          {resolution.axis === 'club' || resolution.axis === 'club_member'
            ? <>지도 동아리 없음 — {summary.noUnit.map((r) => r.name).join(', ')}: 올해 지도하는 동아리{resolution.axis === 'club_member' ? '(부원)' : ''}가 없어 줄이 생기지 않습니다.</>
            : <>수업 없음 — {summary.noUnit.map((r) => r.name).join(', ')}: 이 학기에 가르치는 수업이 없어 줄이 생기지 않습니다.</>}
          사람마다 받으려면 줄 단위를 「사람마다」로 바꾸세요.
        </Warn>
      )}
      {summary.unlinked.length > 0 && (
        <Warn>
          교직원 명단에 없는 이름 — {summary.unlinked.map((r) => r.name).join(', ')}: 알림을 보낼 수도, 입력을 받을 수도 없습니다.
          업무분장에서 담당자를 연결하세요.
        </Warn>
      )}

      <div className="max-h-56 overflow-y-auto rounded-lg border bg-slate-50/60 p-2">
        {summary.lines === 0 && summary.unlinked.length === 0 ? (
          <p className="py-2 text-center text-xs text-slate-400">조건에 맞는 사람이 없습니다.</p>
        ) : groups ? (
          <ul className="space-y-1 text-xs">
            {groups.map(([label, list]) => (
              <li key={label} className="flex gap-2">
                <span className="w-44 shrink-0 truncate font-medium text-slate-700" title={label}>{label}</span>
                <span className="min-w-0 text-slate-600">
                  {list.map((r) => r.name).join(', ')}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-wrap gap-1">
            {rows.map((r) => (
              <span
                key={`${r.resource_id ?? r.name}`}
                className={
                  r.resource_id
                    ? 'rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-700'
                    : 'rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-xs text-rose-700'
                }
                title={r.reasons.join(' · ')}
              >
                {r.name}
                <span className="ml-1 text-[10px] text-slate-400">{r.reasons[0]}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] leading-relaxed text-amber-800">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
