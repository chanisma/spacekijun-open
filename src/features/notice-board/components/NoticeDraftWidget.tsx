import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Loader2, Sparkles, Wand2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { generateNoticeDraft } from '../services/noticeDraftService';
import {
  NOTICE_DRAFT_MAX_INPUT,
  type NoticeDraft,
  type NoticeDraftSeed,
} from '../utils/noticeDraft';

export function NoticeDraftWidget({
  onUseDraft,
}: {
  onUseDraft: (draft: NoticeDraftSeed) => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [draft, setDraft] = useState<NoticeDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

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
      const result = await generateNoticeDraft(input, controller.signal);
      if (!controller.signal.aborted && request.current === controller) setDraft(result);
    } catch (error) {
      if (!controller.signal.aborted && request.current === controller)
        toast.error(error instanceof Error ? error.message : '초안을 만들지 못했습니다.');
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  };

  return (
    <>
      <Button
        type="button"
        onClick={() => changeOpen(true)}
        title="공지사항 AI 도우미"
        aria-label="공지사항 AI 도우미"
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg hover:from-violet-700 hover:to-indigo-700"
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
              공지사항 AI 도우미
            </DialogTitle>
            <DialogDescription>
              메모나 안내 내용을 넣으면 공지 초안을 작성합니다. 확인한 초안은 공지 작성 화면으로
              이어집니다.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 space-y-5 overflow-y-auto px-6 py-5">
            <div className="space-y-2">
              <Label htmlFor="notice-ai-source">공지로 만들 내용</Label>
              <Textarea
                id="notice-ai-source"
                value={input}
                maxLength={NOTICE_DRAFT_MAX_INPUT}
                disabled={busy}
                rows={7}
                className="min-h-40 leading-relaxed"
                placeholder="예: 다음 주 수요일 오후 3시 도서관에서 교직원 연수. 개인 노트북 지참. 참석 여부는 월요일까지 정보화부에 알려 주세요."
                onChange={(e) => {
                  setInput(e.target.value);
                  setDraft(null);
                }}
              />
              <p className="text-right text-xs tabular-nums text-slate-400">
                {input.length.toLocaleString()} / 30,000자
              </p>
            </div>
            {busy && (
              <p role="status" className="flex items-center gap-2 text-sm text-violet-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                공지 제목과 내용을 정리하고 있습니다.
              </p>
            )}
            {draft && !busy && (
              <section className="space-y-3 rounded-2xl border border-violet-100 bg-violet-50/30 p-4">
                <h3 className="text-sm font-semibold text-violet-800">공지 초안</h3>
                <div className="space-y-1.5">
                  <Label htmlFor="notice-ai-title">제목</Label>
                  <Input
                    id="notice-ai-title"
                    value={draft.title}
                    maxLength={200}
                    className="bg-white"
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="notice-ai-content">본문</Label>
                  <Textarea
                    id="notice-ai-content"
                    value={draft.content}
                    rows={9}
                    maxLength={30000}
                    className="bg-white leading-relaxed"
                    onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                  />
                </div>
                {draft.checks.length > 0 && (
                  <div className="space-y-1 text-sm text-amber-800">
                    <p className="font-medium">게시 전 확인해 주세요</p>
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
                disabled={busy || !draft.title.trim() || !draft.content.trim()}
                className="gap-2 bg-blue-600 text-white hover:bg-blue-700"
                onClick={() => {
                  onUseDraft({ title: draft.title.trim(), content: draft.content.trim() });
                  changeOpen(false);
                  setDraft(null);
                  setInput('');
                }}
              >
                공지 작성으로 이어가기
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
