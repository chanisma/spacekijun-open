import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Loader2, Sparkles, Wand2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useResources } from '@/hooks/useTasks';
import { generateScheduleDraft } from '@/services/scheduleDraftService';
import {
  SCHEDULE_DRAFT_KINDS,
  SCHEDULE_DRAFT_KIND_LABELS,
  SCHEDULE_DRAFT_MAX_INPUT,
  matchPeople,
  toScheduleDraftSeed,
  type NamedResource,
  type ScheduleDraft,
  type ScheduleDraftKind,
  type ScheduleDraftSeed,
} from '@/lib/scheduleDraft';

/**
 * 일정 AI 도우미 — 공지사항 AI 도우미(`NoticeDraftWidget`)와 같은 흐름이다 (2026-09-30).
 * 메모·공문을 넣으면 초안을 만들고, 사람이 고친 뒤 [일정 추가로 이어가기]를 누르면
 * 채워진 일정 추가 창이 열린다. **이 모달은 일정을 저장하지 않는다** — 저장은 언제나
 * 일정 추가 창이 한다(결강 미리보기·첨부·담당자 선택이 거기에 있다).
 */
export function ScheduleDraftWidget({
  onUseDraft,
}: {
  onUseDraft: (seed: ScheduleDraftSeed) => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [draft, setDraft] = useState<ScheduleDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  const { data: resources } = useResources();
  const people = useMemo(
    () => (draft ? matchPeople(draft.people, (resources ?? []) as NamedResource[]) : null),
    [draft, resources]
  );

  const changeOpen = (next: boolean) => {
    if (!next) {
      request.current?.abort();
      request.current = null;
      setBusy(false);
    }
    setOpen(next);
  };
  const generate = async () => {
    if (busy || !input.trim()) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    try {
      const result = await generateScheduleDraft(input, controller.signal);
      if (!controller.signal.aborted && request.current === controller) setDraft(result);
    } catch (error) {
      if (!controller.signal.aborted && request.current === controller)
        toast.error(error instanceof Error ? error.message : '일정 초안을 만들지 못했습니다.');
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  };

  const update = (patch: Partial<ScheduleDraft>) => draft && setDraft({ ...draft, ...patch });

  return (
    <>
      <Button
        type="button"
        onClick={() => changeOpen(true)}
        title="일정 AI 도우미"
        aria-label="일정 AI 도우미"
        // 휴대폰에서는 하단 네비(--mobile-nav-height) 위로 올린다 — 겹치면 네비 5번째 칸이 가려진다
        className="fixed bottom-[calc(var(--mobile-nav-height,96px)+16px)] right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg hover:from-violet-700 hover:to-indigo-700 md:bottom-6 md:right-6"
      >
        <Wand2 className="h-6 w-6" />
      </Button>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="max-h-[92dvh] max-w-2xl gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-slate-100 bg-gradient-to-b from-violet-50/70 to-white px-6 py-5">
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
                <Wand2 className="h-5 w-5" />
              </span>
              일정 AI 도우미
            </DialogTitle>
            <DialogDescription>
              메모나 공문 내용을 넣으면 일정 초안을 만듭니다. 확인한 초안은 일정 추가 화면으로
              이어지고, 저장은 그 화면에서 합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 space-y-5 overflow-y-auto px-6 py-5">
            <div className="space-y-2">
              <Label htmlFor="schedule-ai-source">일정으로 만들 내용</Label>
              <Textarea
                id="schedule-ai-source"
                value={input}
                maxLength={SCHEDULE_DRAFT_MAX_INPUT}
                disabled={busy}
                rows={6}
                className="min-h-36 leading-relaxed"
                placeholder="예: 다음 주 수요일 오후 2시부터 4시까지 전북교육청 AI 교육 담당자 협의회. 김민수 선생님 출장."
                onChange={(e) => {
                  setInput(e.target.value);
                  setDraft(null);
                }}
              />
              <p className="text-right text-xs tabular-nums text-slate-400">
                {input.length.toLocaleString()} / {SCHEDULE_DRAFT_MAX_INPUT.toLocaleString()}자
              </p>
            </div>
            {busy && (
              <p role="status" className="flex items-center gap-2 text-sm text-violet-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                날짜·시간·종류를 정리하고 있습니다.
              </p>
            )}
            {draft && !busy && (
              <section className="space-y-3 rounded-2xl border border-violet-100 bg-violet-50/30 p-4">
                <h3 className="text-sm font-semibold text-violet-800">일정 초안</h3>
                <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor="schedule-ai-title">제목</Label>
                    <Input
                      id="schedule-ai-title"
                      value={draft.title}
                      maxLength={200}
                      className="bg-white"
                      onChange={(e) => update({ title: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="schedule-ai-kind">종류</Label>
                    <Select
                      value={draft.kind}
                      onValueChange={(value) => update({ kind: value as ScheduleDraftKind })}
                    >
                      <SelectTrigger id="schedule-ai-kind" className="bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SCHEDULE_DRAFT_KINDS.map((kind) => (
                          <SelectItem key={kind} value={kind}>
                            {SCHEDULE_DRAFT_KIND_LABELS[kind]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="schedule-ai-date">날짜</Label>
                    <Input
                      id="schedule-ai-date"
                      type="date"
                      value={draft.date ?? ''}
                      className="bg-white"
                      onChange={(e) => update({ date: e.target.value || null })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="schedule-ai-start">시작</Label>
                    <Input
                      id="schedule-ai-start"
                      type="time"
                      value={draft.startTime ?? ''}
                      disabled={draft.allDay}
                      className="bg-white"
                      onChange={(e) => update({ startTime: e.target.value || null })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="schedule-ai-end">종료</Label>
                    <Input
                      id="schedule-ai-end"
                      type="time"
                      value={draft.endTime ?? ''}
                      disabled={draft.allDay}
                      className="bg-white"
                      onChange={(e) => update({ endTime: e.target.value || null })}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="schedule-ai-allday"
                    checked={draft.allDay}
                    onCheckedChange={(checked) =>
                      update(checked ? { allDay: true } : { allDay: false, startTime: draft.startTime ?? '09:00' })
                    }
                  />
                  <Label htmlFor="schedule-ai-allday" className="text-sm font-normal">
                    하루 종일
                  </Label>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="schedule-ai-description">세부 사항</Label>
                  <Textarea
                    id="schedule-ai-description"
                    value={draft.description}
                    rows={4}
                    maxLength={5000}
                    className="bg-white leading-relaxed"
                    onChange={(e) => update({ description: e.target.value })}
                  />
                </div>
                {draft.kind !== 'personal' && people && (people.matched.length > 0 || people.unmatched.length > 0) && (
                  <div className="space-y-1.5 text-sm">
                    <p className="font-medium text-slate-700">담당자</p>
                    <div className="flex flex-wrap gap-1.5">
                      {people.matched.map((person) => (
                        <span
                          key={person.id}
                          className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-100"
                        >
                          {person.name}
                        </span>
                      ))}
                      {people.unmatched.map((name) => (
                        <span
                          key={name}
                          title="교직원 명단에서 한 명으로 특정되지 않아 넣지 않았습니다"
                          className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 line-through decoration-slate-300"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                    {people.unmatched.length > 0 && (
                      <p className="text-xs text-slate-500">
                        줄 그은 이름은 교직원 명단에서 한 명으로 특정되지 않아 넣지 않았습니다. 일정 추가
                        화면에서 직접 골라 주세요.
                      </p>
                    )}
                  </div>
                )}
                {draft.checks.length > 0 && (
                  <div className="space-y-1 text-sm text-amber-800">
                    <p className="font-medium">저장 전 확인해 주세요</p>
                    <ul className="list-disc space-y-1 pl-5">
                      {draft.checks.map((check, index) => (
                        <li key={index}>{check}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}
          </div>
          <DialogFooter className="border-t border-slate-100 bg-slate-50/50 px-6 py-4">
            <Button
              type="button"
              variant="outline"
              className="sm:mr-auto"
              onClick={() => changeOpen(false)}
            >
              {busy ? '생성 취소' : '닫기'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || !input.trim()}
              className="gap-2"
              onClick={() => void generate()}
            >
              <Sparkles className="h-4 w-4" />
              {draft ? '다시 생성' : '초안 만들기'}
            </Button>
            {draft && (
              <Button
                type="button"
                disabled={busy || !draft.title.trim()}
                className="gap-2 bg-blue-600 text-white hover:bg-blue-700"
                onClick={() => {
                  onUseDraft(
                    toScheduleDraftSeed(
                      { ...draft, title: draft.title.trim(), description: draft.description.trim() },
                      people?.matched.map((person) => person.id) ?? []
                    )
                  );
                  changeOpen(false);
                  setDraft(null);
                  setInput('');
                }}
              >
                일정 추가로 이어가기
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
