import { AlertTriangle, History } from 'lucide-react';
import { useAdmissionChanges } from '../hooks/useWishlist';
import {
  changeTypeColor, groupByComparison, keywordLabel, type AdmissionChange,
} from '../utils/admissionChange';

interface Props {
  /** 이 항목의 대학명 */
  university: string;
  /** 이 항목의 전형명 — 닮은 변경사항을 위로 올리는 데만 쓴다(거르지 않는다) */
  admissionName?: string | null;
}

/** 전형명 유사도 — 표기가 갈라져 있어 "겹치는 글자 수" 정도의 거친 비교로 충분하다 */
function likeness(a: string, b: string): number {
  const norm = (s: string) => s.replace(/[\s()[\]/·,]/g, '');
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  let hit = 0;
  for (let i = 0; i + 2 <= x.length; i++) if (y.includes(x.slice(i, i + 2))) hit += 1;
  return hit / Math.max(1, x.length - 1);
}

/**
 * 전형 변경사항 상세 — 상세 모달 안에 붙는다.
 *
 * 비교표 셀은 좁아서 요약(종류 배지 + 키워드 + 건수)만 보여준다. **원문은 여기에 있다.**
 * 연도쌍별로 묶고 최신 쌍이 위로 온다.
 *
 * 자료 출처가 **전국 주요 대학 64곳**뿐이라, 매칭이 없을 때 "변경 없음"이라고 쓰지 않고
 * **"자료 없음"**이라고 적는다 — 둘을 섞으면 지방대 지원자가 변경사항을 놓친다.
 */
export function AdmissionChangeSection({ university, admissionName }: Props) {
  const q = useAdmissionChanges(university ? [university] : []);
  const all = q.data?.get(university) ?? [];

  if (q.isLoading) {
    return <p className="text-[11px] text-slate-400">전형 변경사항 불러오는 중...</p>;
  }
  if (q.isError) {
    return <p className="text-[11px] text-rose-400">전형 변경사항을 불러올 수 없습니다.</p>;
  }
  if (all.length === 0) {
    return (
      <div className="flex items-start gap-1.5 rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-2">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-slate-400 mt-px" />
        <p className="text-[11px] text-slate-500 leading-relaxed">
          이 대학의 전형 변경사항 <b>자료가 없습니다</b>. 수록 범위가 전국 주요 대학 64곳이라,
          변경이 없다는 뜻이 아닙니다 — 대학 모집요강을 직접 확인하세요.
        </p>
      </div>
    );
  }

  const groups = groupByComparison(all);

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.comparison}>
          <div className="flex items-center gap-1.5 mb-1">
            <History className="h-3 w-3 text-slate-400" />
            <span className="text-[11px] font-semibold text-slate-600">{g.comparison}</span>
            <span className="text-[10px] text-slate-400">{g.items.length}건</span>
          </div>
          <ul className="space-y-1.5">
            {[...g.items]
              // 전형명이 닮은 것을 위로 — 거르지는 않는다(표기가 갈라져 있어 거르면 대부분 0건)
              .sort((a, b) =>
                likeness(b.admissionItem ?? '', admissionName ?? '') -
                likeness(a.admissionItem ?? '', admissionName ?? ''))
              .map((c) => <ChangeRow key={c.id} change={c} />)}
          </ul>
        </div>
      ))}
      <p className="text-[9.5px] text-slate-400 leading-relaxed">
        출처: 전국 주요 대학 대입 변경사항(한가람고 장태영 자료 · 충청남도교육청진로융합교육원 뷰어).
        전형명 표기가 출처마다 달라 <b>대학 단위로 모아</b> 보여줍니다 — 내 전형과 무관한 항목이 섞일 수 있습니다.
      </p>
    </div>
  );
}

function ChangeRow({ change: c }: { change: AdmissionChange }) {
  return (
    <li className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-1 mb-1">
        <span className={`text-[9.5px] font-bold px-1.5 py-px rounded border ${changeTypeColor(c.changeType)}`}>
          {c.changeType}
        </span>
        {c.keywords.map((k) => (
          <span key={k} className="text-[9.5px] text-slate-500 bg-slate-100 rounded px-1 py-px">
            {keywordLabel(k)}
          </span>
        ))}
        {c.admissionItem && (
          <span className="text-[10.5px] text-slate-500 truncate" title={c.admissionItem}>
            {c.admissionItem}
          </span>
        )}
      </div>
      {c.beforeText && (
        <p className="text-[11px] text-slate-400 whitespace-pre-wrap break-words line-through decoration-slate-300">
          {c.beforeText}
        </p>
      )}
      <p className="text-[11.5px] text-slate-700 whitespace-pre-wrap break-words">{c.afterText}</p>
    </li>
  );
}
