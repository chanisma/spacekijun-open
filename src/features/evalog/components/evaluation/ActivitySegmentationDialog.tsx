import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, BookOpen, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SegmentationRecord } from '../../hooks/useActivitySegmentation';
import type { SegmentedActivity } from '../../types/segmentation';

/**
 * 한 기록 안의 활동 분절을 보여주는 모달.
 *
 * 화면에서 답해야 할 질문은 하나다 — **이 긴 기록 하나에 탐구가 몇 개 들어 있고
 * 각각 무엇을 다뤘는가.** 그래서 좌측은 원문을 활동별 색으로 칠하고, 우측은
 * 그 활동이 무엇인지 카드로 편다. 연구 단계의 육안 판정 화면과 같은 구성이며,
 * 판정 기준도 같다: **개수가 아니라 색이 갈린 덩어리가 정말 다른 탐구 대상인가.**
 */

/** 활동 색. 채도를 낮게 잡아 원문 가독성을 해치지 않는다. */
const PALETTE = [
  { bg: 'bg-sky-100', text: 'text-sky-900', dot: 'bg-sky-500', ring: 'ring-sky-400', border: 'border-sky-200' },
  { bg: 'bg-emerald-100', text: 'text-emerald-900', dot: 'bg-emerald-500', ring: 'ring-emerald-400', border: 'border-emerald-200' },
  { bg: 'bg-violet-100', text: 'text-violet-900', dot: 'bg-violet-500', ring: 'ring-violet-400', border: 'border-violet-200' },
  { bg: 'bg-amber-100', text: 'text-amber-900', dot: 'bg-amber-500', ring: 'ring-amber-400', border: 'border-amber-200' },
  { bg: 'bg-rose-100', text: 'text-rose-900', dot: 'bg-rose-500', ring: 'ring-rose-400', border: 'border-rose-200' },
  { bg: 'bg-teal-100', text: 'text-teal-900', dot: 'bg-teal-500', ring: 'ring-teal-400', border: 'border-teal-200' },
  { bg: 'bg-indigo-100', text: 'text-indigo-900', dot: 'bg-indigo-500', ring: 'ring-indigo-400', border: 'border-indigo-200' },
  { bg: 'bg-orange-100', text: 'text-orange-900', dot: 'bg-orange-500', ring: 'ring-orange-400', border: 'border-orange-200' },
];
const paletteOf = (i: number) => PALETTE[i % PALETTE.length];

const REASON_LABEL: Record<string, string> = {
  기록총평: '기록 총평', 일반태도: '일반 태도', 맥락: '맥락', 미처리: '미분류',
};

interface Props {
  record: SegmentationRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 화면에 보이던 제목(진로활동·공통국어1 등). 모달 머리글에 맥락을 준다. */
  heading?: string;
}

const ActivitySegmentationDialog: React.FC<Props> = ({ record, open, onOpenChange, heading }) => {
  const [hovered, setHovered] = React.useState<number | null>(null);
  const seg = record?.segmentation;

  // 문장 → 활동 인덱스. 한 문장은 한 활동에만 속한다(S0 불변식).
  const sentenceOwner = React.useMemo(() => {
    const owner = new Map<number, number>();
    seg?.activities.forEach((a, ai) => a.sentence_ids.forEach((s) => owner.set(s, ai)));
    return owner;
  }, [seg]);

  const recordLevelReason = React.useMemo(() => {
    const m = new Map<number, string>();
    seg?.record_level?.forEach((e) => e.sentence_ids.forEach((s) => m.set(s, e.reason)));
    return m;
  }, [seg]);

  if (!seg) return null;

  const totalUsefulness = seg.activities.reduce((n, a) => n + (a.usefulness?.score ?? 0), 0);
  const suspect = seg.activities.filter((a) => a.field_mismatch).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] h-[88vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-3 border-b bg-slate-50/80">
          <DialogTitle className="text-base font-semibold text-slate-800 flex items-center gap-2 flex-wrap">
            <Sparkles size={16} className="text-brand-600" />
            {heading ?? '활동 분절'}
            <span className="text-xs font-normal text-slate-500">
              {record?.grade ? `${record.grade}학년` : ''} {record?.subjectName ?? record?.category ?? ''}
            </span>
            <span className="ml-auto flex items-center gap-1.5 text-xs font-normal">
              <span className="px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 border border-brand-100 font-medium">
                활동 {seg.activities.length}개
              </span>
              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                유용성 {totalUsefulness}
              </span>
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* 필드 오배치는 조용히 넘기면 안 된다 — 제목·개념이 다른 활동의 것일 수 있다(§12-4). */}
        {suspect > 0 && (
          <div className="px-5 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-800 flex items-center gap-2">
            <AlertTriangle size={14} />
            제목·개념이 이 문장들과 어긋나 보이는 활동이 {suspect}개 있습니다. 아래 ⚠ 표시를 확인하세요.
          </div>
        )}

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 divide-x divide-slate-200">
          {/* 좌: 원문 + 활동 색 */}
          <div className="overflow-y-auto p-5">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">원문</h4>
            <p className="text-sm leading-8 text-slate-700">
              {seg.sentences.map((s, i) => {
                const ai = sentenceOwner.get(i);
                const reason = recordLevelReason.get(i);
                if (ai === undefined) {
                  // 글자색을 낮추지 않는다 — 활동이 아니라는 것과 덜 중요하다는 것은 다르다.
                  // 총평·태도 서술은 평가에서 오히려 무겁게 읽힌다. 구분은 활동 쪽의
                  // 배경색이 이미 하고 있고, 여기 필요한 정보는 tooltip의 사유다.
                  return (
                    <span
                      key={i}
                      title={reason ? REASON_LABEL[reason] ?? reason : '활동에 귀속되지 않음'}
                    >
                      {s}{' '}
                    </span>
                  );
                }
                const c = paletteOf(ai);
                const dim = hovered !== null && hovered !== ai;
                return (
                  <span
                    key={i}
                    onMouseEnter={() => setHovered(ai)}
                    onMouseLeave={() => setHovered(null)}
                    className={cn(
                      'rounded px-0.5 py-0.5 cursor-default transition-opacity',
                      c.bg, c.text,
                      dim && 'opacity-25',
                      hovered === ai && `ring-2 ${c.ring}`,
                    )}
                  >
                    {s}{' '}
                  </span>
                );
              })}
            </p>
            <p className="mt-4 text-[11px] text-slate-500 leading-relaxed">
              색이 칠해지지 않은 문장은 특정 활동을 가리키지 않는 서술(기록 총평·일반 태도·맥락)입니다.
              활동이 아닐 뿐 평가에서 덜 중요하다는 뜻은 아닙니다.
            </p>
          </div>

          {/* 우: 활동 카드 */}
          <div className="overflow-y-auto p-5 bg-slate-50/40">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">
              분절된 활동
            </h4>
            <div className="space-y-3">
              {seg.activities.map((a, ai) => (
                <ActivityCard
                  key={a.entity_id ?? ai}
                  activity={a}
                  index={ai}
                  active={hovered === ai}
                  onHover={setHovered}
                />
              ))}
              {seg.activities.length === 0 && (
                <p className="text-sm text-slate-400">
                  이 기록에서는 탐구 활동이 확인되지 않았습니다. 총평·태도 서술만으로 이루어진 기록일 수 있습니다.
                </p>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const ActivityCard: React.FC<{
  activity: SegmentedActivity;
  index: number;
  active: boolean;
  onHover: (i: number | null) => void;
}> = ({ activity: a, index, active, onHover }) => {
  const c = paletteOf(index);
  return (
    <div
      onMouseEnter={() => onHover(index)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        'rounded-xl border bg-white p-3.5 shadow-sm transition-all cursor-default',
        c.border,
        active && `ring-2 ${c.ring} shadow-md`,
      )}
    >
      <div className="flex items-start gap-2">
        <span className={cn('mt-1.5 h-2.5 w-2.5 rounded-full flex-shrink-0', c.dot)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h5 className="text-sm font-semibold text-slate-800 leading-snug">
              {a.title}
              {a.field_mismatch && (
                <AlertTriangle size={13} className="inline ml-1 -mt-0.5 text-amber-500" aria-label="필드 어긋남 의심" />
              )}
            </h5>
            {a.usefulness && (
              <span
                className="flex-shrink-0 text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500"
                title={`핵심개념 ${a.usefulness.matters} · 자료 ${a.usefulness.sources} · 문장 ${a.usefulness.sentences}`}
              >
                {a.usefulness.score}
              </span>
            )}
          </div>

          {a.did && <p className="mt-1 text-xs text-slate-600 leading-relaxed">{a.did}</p>}

          {a.subject_matter.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {a.subject_matter.map((m) => (
                <span
                  key={m}
                  className="text-[11px] px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-700 border border-violet-100"
                  // 여러 추출 패스가 함께 낸 개념일수록 합의도가 높다(§13).
                  title={a.concept_support?.[m] ? `추출 합의 ${a.concept_support[m]}회` : undefined}
                >
                  {m}
                </span>
              ))}
            </div>
          )}

          {a.sources.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-teal-700">
              <BookOpen size={12} className="flex-shrink-0" />
              {a.sources.map((s) => (
                <span key={s} className="px-1.5 py-0.5 rounded-md bg-teal-50 border border-teal-100">{s}</span>
              ))}
            </div>
          )}

          {a.detail_markers.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {a.detail_markers.map((m) => (
                <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{m}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ActivitySegmentationDialog;
