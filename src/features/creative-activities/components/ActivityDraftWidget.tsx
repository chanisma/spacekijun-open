// ========================================
// 활동 기록 AI 초안 위젯 (우측 하단 플로팅)
//
// 생기부 분석의 AIWriterWidget과 같은 자리·같은 모양이라 교사가 이미 아는 버튼이다.
//
// **되묻기가 이 기능의 핵심이다.** 필수 항목(이름·영역·날짜·내용)이 확정되지 않으면
// 값을 만들지 않고 질문을 돌려준다 — 판정의 정본은 모델이 아니라 코드다
// (`utils/activityDraft.findMissingRequired`).
//
// **초안은 저장하지 않는다.** 완성되면 활동 기록 폼을 채워 열고, 사람이 확인해 저장한다.
// 이 기록이 생기부의 근거가 되므로 확인 없는 저장은 이 시스템이 없애려던 문제를
// 자동화하는 것이 된다.
// ========================================

import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  Loader2,
  MapPin,
  MessageCircleQuestion,
  RotateCcw,
  Send,
  Sparkles,
  Tag,
  Wand2,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useAcademicTerm } from '@/hooks/useAcademicTerm';
import {
  generateActivityDraft,
  todayISO,
} from '../services/activityDraftService';
import {
  findMissingRecommended,
  isDraftReady,
  type ActivityDraft,
} from '../utils/activityDraft';
import { getAreaGroupLabel, getAreaGroupTone } from '../utils/activityLabels';
import type { ActivityHost } from '../types';

const MAX_TURNS = 6;

export interface ActivityDraftSeed {
  name?: string;
  areaGroup?: ActivityDraft['areaGroup'];
  careerFields?: string[];
  keywords?: string[];
  relatedSubjects?: string[];
  content?: string;
  startsOn?: string;
  endsOn?: string | null;
  place?: string;
  hostId?: string | null;
  /** 탐구 원본의 동아리명 — 폼에서 실제 주최 동아리 id로 매칭한다. */
  hostClubName?: string;
  operatorName?: string;
}

interface ActivityDraftWidgetProps {
  /** 주최 이름 → id 매칭용. LLM은 이름만 주고 id 매칭은 여기서 한다 */
  hosts: ActivityHost[];
  /** 초안이 완성되면 활동 기록 폼을 이 값으로 채워 연다 */
  onUseDraft: (seed: ActivityDraftSeed) => void;
}

export function ActivityDraftWidget({ hosts, onUseDraft }: ActivityDraftWidgetProps) {
  const { data: term } = useAcademicTerm();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<string[]>([]);
  const [draft, setDraft] = useState<ActivityDraft | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // 닫을 때 진행 중 요청을 끊는다 — 닫힌 창의 응답이 상태를 되살리면 안 된다
  useEffect(() => {
    if (open) return;
    abortRef.current?.abort();
    abortRef.current = null;
  }, [open]);

  const reset = () => {
    abortRef.current?.abort();
    setInput('');
    setTurns([]);
    setDraft(null);
    setQuestions([]);
    setNote(null);
    setBusy(false);
  };

  const ready = draft ? isDraftReady(draft) : false;
  const missingRecommended = draft ? findMissingRecommended(draft) : [];

  const ask = async () => {
    const text = input.trim();
    if (!text || busy) return;

    if (turns.length >= MAX_TURNS) {
      toast.warning('대화가 길어졌습니다. 폼에서 직접 채워 주세요.', {
        description: '초안이 있으면 그대로 열 수 있습니다.',
      });
      return;
    }

    const nextTurns = [...turns, text];
    setTurns(nextTurns);
    setInput('');
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await generateActivityDraft({
        turns: nextTurns,
        academicYear: term?.year ?? new Date().getFullYear(),
        today: todayISO(),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setDraft(result.draft);
      setQuestions(result.questions);
      setNote(result.note ?? null);
    } catch (e) {
      if (controller.signal.aborted) return;
      console.error('활동 초안 생성 실패:', e);
      toast.error(e instanceof Error ? e.message : '초안 생성에 실패했습니다.');
      // 실패한 턴은 되돌린다 — 다음 요청에 실패한 입력이 두 번 실리지 않게
      setTurns(turns);
      setInput(text);
    } finally {
      setBusy(false);
    }
  };

  const useDraft = () => {
    if (!draft) return;
    // LLM은 주최 '이름'만 준다 — id 매칭은 여기서. 못 찾으면 조용히 비운다.
    const host =
      draft.hostName
        ? hosts.find(
            (h) => h.name === draft.hostName || h.name.includes(draft.hostName!)
          ) ?? null
        : null;

    onUseDraft({
      name: draft.name,
      areaGroup: draft.areaGroup,
      careerFields: draft.careerFields,
      keywords: draft.keywords,
      relatedSubjects: draft.relatedSubjects,
      content: draft.content,
      startsOn: draft.startsOn,
      endsOn: draft.endsOn ?? null,
      place: draft.place,
      hostId: host?.id ?? null,
      operatorName: draft.operatorName,
    });
    setOpen(false);
    reset();
  };

  return (
    <>
      {/* 플로팅 버튼 — 생기부 분석과 같은 자리 */}
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg hover:from-violet-700 hover:to-indigo-700"
        title="AI로 활동 기록 만들기"
        aria-label="AI로 활동 기록 만들기"
      >
        <Wand2 className="h-6 w-6" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] max-w-xl gap-0 overflow-hidden p-0">
          <DialogHeader className="space-y-0 border-b bg-gradient-to-b from-violet-50/70 to-transparent px-4 pb-4 pt-4 sm:px-6 sm:pt-5">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600 ring-1 ring-violet-200">
                <Wand2 className="h-3.5 w-3.5" />
              </span>
              <DialogTitle className="text-base">AI로 활동 기록 만들기</DialogTitle>
            </div>
            <DialogDescription className="mt-1 text-xs leading-relaxed text-slate-500">
              활동을 편하게 적어 주세요. 부족한 내용이 있으면 되묻고, 정리되면
              <span className="font-medium text-slate-600"> 기록 폼을 채워 </span>
              드립니다. 저장은 확인 후에 하시면 됩니다.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[calc(92vh-13rem)] space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
            {/* 지금까지 말한 것 */}
            {turns.length > 0 && (
              <ul className="space-y-1.5">
                {turns.map((t, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-[12.5px] leading-relaxed text-slate-600"
                  >
                    {t}
                  </li>
                ))}
              </ul>
            )}

            {busy && (
              <div className="flex items-center gap-2 px-1 py-3 text-xs text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                정리하는 중…
              </div>
            )}

            {/* 초안 미리보기 */}
            {draft && !busy && <DraftPreview draft={draft} />}

            {/* 되묻기 — 이 기능의 핵심 */}
            {!busy && questions.length > 0 && (
              <div className="space-y-1.5 rounded-lg border-l-2 border-amber-300 bg-amber-50/70 px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-700">
                  <MessageCircleQuestion className="h-3.5 w-3.5" />
                  조금만 더 알려 주세요
                </div>
                <ul className="space-y-1">
                  {questions.map((q, i) => (
                    <li key={i} className="text-[13px] leading-relaxed text-slate-700">
                      · {q}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 권장 항목 안내 — 되묻지는 않되 비면 손해라는 것만 알린다 */}
            {!busy && ready && missingRecommended.length > 0 && (
              <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-[12px] leading-relaxed text-slate-500">
                <span className="font-medium text-slate-600">진로·분야</span>가 비어 있습니다.
                비워 두면 목록에서 <span className="font-medium">분야 미지정</span>으로 모입니다 —
                폼에서 채우실 수 있습니다.
              </p>
            )}

            {note && !busy && (
              <p className="px-1 text-[11.5px] leading-relaxed text-slate-400">{note}</p>
            )}

            {/* 입력 */}
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={turns.length === 0 ? 5 : 3}
              disabled={busy}
              className="resize-none text-sm"
              aria-label="활동 설명"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void ask();
              }}
            />
            {turns.length === 0 && (
              <p className="px-1 text-[11.5px] leading-relaxed text-slate-400">
                무엇을 · 언제 · 어디서 했는지 적으면 충분합니다.
                학생 이름은 적지 않으셔도 됩니다 — 참여자는 폼에서 명단으로 고릅니다.
              </p>
            )}
          </div>

          <div className="flex items-center gap-1.5 border-t bg-slate-50/50 px-4 py-3 sm:px-6">
            {turns.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2 text-xs text-slate-500"
                onClick={reset}
                disabled={busy}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                다시
              </Button>
            )}
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-3 text-xs text-slate-600"
              onClick={() => setOpen(false)}
            >
              <X className="h-3.5 w-3.5" />
              닫기
            </Button>
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={ask}
              disabled={!input.trim() || busy}
              variant={ready ? 'outline' : 'default'}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {turns.length === 0 ? '정리하기' : '답변 보내기'}
            </Button>
            {ready && (
              <Button
                size="sm"
                className="h-8 gap-1.5 bg-blue-600 text-xs hover:bg-blue-700"
                onClick={useDraft}
                disabled={busy}
              >
                <ArrowRight className="h-3.5 w-3.5" />
                이 내용으로 기록
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ----------------------------------------

function DraftPreview({ draft }: { draft: ActivityDraft }) {
  const tone = draft.areaGroup ? getAreaGroupTone(draft.areaGroup) : null;

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {draft.areaGroup && tone && (
          <Badge variant="outline" className={cn('h-[18px] px-1.5 text-[10px]', tone.chip)}>
            {getAreaGroupLabel(draft.areaGroup)}
          </Badge>
        )}
        <span className="min-w-0 text-[14.5px] font-semibold text-slate-900">
          {draft.name ?? <span className="text-slate-400">활동 이름 미정</span>}
        </span>
      </div>

      {draft.content && (
        <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-slate-600">
          {draft.content}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-slate-400">
        <span className="inline-flex items-center gap-1 tabular-nums">
          <CalendarDays className="h-3 w-3" />
          {draft.startsOn ?? '날짜 미정'}
          {draft.endsOn ? ` ~ ${draft.endsOn}` : ''}
        </span>
        {draft.place && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {draft.place}
          </span>
        )}
        {draft.hostName && <span>{draft.hostName}</span>}
        {draft.careerFields?.length ? (
          <span className="inline-flex items-center gap-1">
            <Tag className="h-3 w-3" />
            {draft.careerFields.join(' · ')}
          </span>
        ) : null}
      </div>

      {draft.keywords?.length ? (
        <div className="flex flex-wrap gap-1">
          {draft.keywords.map((k) => (
            <span key={k} className="text-[10.5px] text-slate-400">
              #{k}
            </span>
          ))}
        </div>
      ) : null}

      <p className="flex items-center gap-1 border-t border-slate-100 pt-1.5 text-[11px] text-slate-400">
        <Sparkles className="h-3 w-3" />
        저장 전에 폼에서 확인·수정하실 수 있습니다.
      </p>
    </div>
  );
}
