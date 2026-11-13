// 탐구 활동 상세 — 근거·심화 경로·비슷한 활동.
//
// 설계 = docs/features/creative-activities-graphrag.md §6-1·§6-2
//
// ── 왜 두 목록을 나누는가 ──────────────────────────────────────────────────
// **심화 경로(DEEPENED_FROM)와 비슷한 활동(SIMILAR_TO)은 다른 질문에 답한다.**
// 앞은 "이 학생이 이 다음에 뭘 했나"(같은 학생의 시간 순), 뒤는 "남들은 뭘 했나"(학생 간).
// 한 목록으로 합치면 "이걸 하면 저기로 간다"는 경로가 "이것과 비슷하다"에 묻힌다.
import { FilePlus2, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DIALOG_HEADER_CLASS } from '@/components/tasks/dialogDesign';
import { cn } from '@/lib/utils';
import { useInquiryActivity, useInquiryNeighbors } from '../hooks/useInquiryExplore';
import { AREA_LABEL, LEVEL_LABEL, LEVEL_TONE } from '../utils/inquiryLabels';
import { activityToSeed } from '../utils/inquiryToActivity';
import type { ActivityDraftSeed } from './ActivityDraftWidget';
import type { InquiryActivity } from '../types';

const EVIDENCE_HINT: Record<number, string> = {
  0: '탐구로 보기 어려운 기록입니다.',
  1: '한 일을 적었지만 그 과정에서 무엇을 알아냈는지는 드러나지 않습니다.',
  2: '개념을 이해하고 적용한 자취가 있습니다.',
  3: '자료를 견주어 원인을 좁히거나 관계를 설명했습니다.',
  4: '스스로 기준을 세우거나 다른 맥락으로 옮겨 갔습니다.',
};

interface Props {
  activityId: string | null;
  onClose: () => void;
  onOpenActivity: (id: string) => void;
  /** 활동 기록 폼을 이 내용으로 채워 연다(저장하지 않는다). 학생에게는 주지 않는다. */
  onSeedActivity?: (seed: ActivityDraftSeed) => void;
}

export function InquiryActivityDialog({ activityId, onClose, onOpenActivity, onSeedActivity }: Props) {
  const { data: a, isLoading } = useInquiryActivity(activityId);
  const { data: nb } = useInquiryNeighbors(activityId);

  return (
    <Dialog open={!!activityId} onOpenChange={(o) => { if (!o) onClose(); }}>
      {/* DialogContent 에 overflow 를 주지 않는다 — 안쪽 팝오버가 모달 경계에서 잘린다(CLAUDE.md) */}
      <DialogContent className="max-w-3xl p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <DialogTitle className="min-w-0 break-words text-base">{a?.title ?? '탐구 활동'}</DialogTitle>
          <DialogDescription className="text-xs">
            {a
              ? [
                  AREA_LABEL[a.area] ?? a.area,
                  a.club_name,                                   // 동아리활동이면 어느 동아리인지
                  a.grade != null ? `${a.grade}학년` : null,
                  a.subject_name,
                  a.hours != null ? `${a.hours}시간` : null,
                ].filter(Boolean).join(' · ')
              : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto px-4 py-4 sm:px-6">
          {isLoading || !a ? (
            <div className="flex h-40 items-center justify-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <div className="space-y-4">
              <LevelBlock activity={a} />

              {a.research_question && (
                <Section label="연구 질문">
                  <p className="text-sm leading-relaxed text-slate-700">{a.research_question}</p>
                </Section>
              )}

              {/* "한 일"(`did`)은 표시하지 않는다 — 생기부 원문에 가까워 화면에 내보내지 않기로 했다
                  (2026-09-11 사용자 결정). **뷰가 아예 주지 않으므로** 여기서 되살릴 수도 없다.
                  대신 아래 연구 질문·개념·방법·산출물이 무엇을 했는지 말한다. */}

              {!!a.concepts.length && (
                <Section label="다룬 개념">
                  <div className="flex flex-wrap gap-1">
                    {a.concepts.slice(0, 20).map((c) => (
                      <Badge key={c} variant="secondary" className="h-5 rounded-md px-1.5 text-[10px] font-normal">{c}</Badge>
                    ))}
                  </div>
                </Section>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                {!!a.method_types.length && <ChipSection label="방법" items={a.method_types} />}
                {!!a.career_fields.length && <ChipSection label="관련 분야" items={a.career_fields} />}
              </div>

              {onSeedActivity && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => { onSeedActivity(activityToSeed(a)); onClose(); }}
                >
                  <FilePlus2 className="h-3.5 w-3.5" />
                  이 탐구를 활동 기록으로
                </Button>
              )}

              {a.extension_hint && (
                <Section label="여기서 더 나갈 수 있는 것">
                  <p className="text-sm leading-relaxed text-slate-700">{a.extension_hint}</p>
                </Section>
              )}

              {!!nb?.deepenedFrom.length && (
                <NeighborSection
                  label="이 활동이 딛고 선 것"
                  hint="같은 학생이 앞서 한 활동입니다."
                  items={nb.deepenedFrom}
                  onOpen={onOpenActivity}
                />
              )}
              {!!nb?.deepenedInto.length && (
                <NeighborSection
                  label="여기서 이어진 것"
                  hint="같은 학생이 이 활동을 딛고 더 나아간 활동입니다."
                  items={nb.deepenedInto}
                  onOpen={onOpenActivity}
                />
              )}
              {!!nb?.similar.length && (
                <NeighborSection
                  label="비슷한 탐구를 한 다른 활동"
                  hint="다른 학생들이 가까운 주제로 한 활동입니다."
                  items={nb.similar}
                  onOpen={onOpenActivity}
                />
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LevelBlock({ activity: a }: { activity: InquiryActivity }) {
  if (a.level == null) return null;
  return (
    <div className="rounded-xl border bg-slate-50/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset', LEVEL_TONE[a.level])}>
          L{a.level} {LEVEL_LABEL[a.level]}
        </span>
        {a.n_sentences != null && <span className="text-[11px] text-slate-400">기록 {a.n_sentences}문장</span>}
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{EVIDENCE_HINT[a.level]}</p>
      {/* 수준은 모델이 매긴 것이 아니라 **코드가 근거 개수에서 유도**한 값이다 — 화면이 그 사실을 밝힌다 */}
      <p className="mt-1 text-[10px] text-slate-400">
        근거 항목 {a.breadth ?? 0}개 · 사고 문항의 강한 답 {a.strength ?? 0}개에서 유도한 수준입니다.
      </p>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold text-slate-500">{label}</p>
      {children}
    </div>
  );
}

function ChipSection({ label, items }: { label: string; items: string[] }) {
  return (
    <Section label={label}>
      <div className="flex flex-wrap gap-1">
        {items.map((m) => (
          <span key={m} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{m}</span>
        ))}
      </div>
    </Section>
  );
}

function NeighborSection({ label, hint, items, onOpen }: {
  label: string; hint: string; items: InquiryActivity[]; onOpen: (id: string) => void;
}) {
  return (
    <div className="border-t pt-3">
      <p className="text-[11px] font-semibold text-slate-500">{label}</p>
      <p className="text-[10px] text-slate-400">{hint}</p>
      <div className="mt-1.5 space-y-1.5">
        {items.slice(0, 6).map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => onOpen(n.id)}
            className="flex w-full items-center gap-2 rounded-lg border bg-card px-2.5 py-2 text-left transition-colors hover:bg-slate-50"
          >
            {n.level != null && (
              <span className={cn('shrink-0 rounded px-1 py-0.5 text-[9px] font-medium ring-1 ring-inset', LEVEL_TONE[n.level])}>
                L{n.level}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-xs text-slate-700" title={n.title}>{n.title}</span>
            {n.grade != null && <span className="shrink-0 text-[10px] text-slate-400">{n.grade}학년</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
