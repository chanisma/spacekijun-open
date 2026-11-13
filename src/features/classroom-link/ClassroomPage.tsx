import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  Copy, HelpCircle, History, KeyRound, Loader2, Monitor, MoreHorizontal, Pencil, Plus, QrCode, Radio, Search,
  Smartphone, Trash2,
} from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { PageContainer } from '@/components/layout/PageContainer';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { DIALOG_HEADER_CLASS, SectionLabel, TitleIconChip } from '@/components/tasks/dialogDesign';
import { useTodayTimetable } from '@/hooks/useTodayTimetable';
import { useUnifiedAuth } from '@/services/unifiedAuth';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  OVERVIEW_KEY, PRESETS_KEY, deletePreset, fetchOverview, forgetClassroomLogin, listPresets, savePreset, stopLink,
} from './classroomLinkService';
import { itemLabel, type ClassroomPreset, type PresetDraft } from './presetItems';
import { useMyClassSections } from './useMyClassSections';
import { FixedDockIcon, ItemIcon } from './components/ItemIcon';
import { PresetEditor } from './components/PresetEditor';

const ago = (iso: string | null | undefined) => (iso ? formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ko }) : '');
const clock = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

type Confirm =
  | { kind: 'delete'; preset: ClassroomPreset }
  | { kind: 'stop'; code: string; device: string }
  | { kind: 'forget'; ref: string; device: string };

/**
 * 교실 기기 — 반별 세팅 · 지금 연결된 교실 · 교실 PC 별 구글 로그인 보관 (/classroom, 2026-10-14)
 *
 * 화면 규약(CLAUDE.md «UI 큰 틀 규약»): 머리글에 기능명·아이콘을 쓰지 않는다 — 머리글 카드는 검색·[사용 방법]·[새 세팅]만.
 * PageContainer(full) · 카드 그리드 · 휴대폰에서는 단추 44px · 아이콘만 남기고 글자는 sm 부터.
 */
export default function ClassroomPage() {
  const queryClient = useQueryClient();
  const { user: authUser } = useUnifiedAuth();
  const resourceId = authUser?.primaryResource?.id ?? null;
  const { data: presets = [], isLoading, error } = useQuery({ queryKey: PRESETS_KEY, queryFn: listPresets });
  const { data: overview } = useQuery({ queryKey: OVERVIEW_KEY, queryFn: fetchOverview, refetchInterval: 30_000 });
  const { data: sections = [] } = useMyClassSections(resourceId);
  const { data: today = [] } = useTodayTimetable(resourceId);
  const currentSection = today.find((slot) => slot.isCurrent)?.section_name ?? null;

  const [q, setQ] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ClassroomPreset | null>(null);
  const [initial, setInitial] = useState<Partial<PresetDraft> | undefined>(undefined);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: PRESETS_KEY });
    void queryClient.invalidateQueries({ queryKey: OVERVIEW_KEY });
  };
  const nextOrder = presets.reduce((m, p) => Math.max(m, p.sort_order + 1), 0);

  const save = useMutation({
    mutationFn: (draft: PresetDraft) => savePreset(draft, editing?.id, nextOrder),
    onSuccess: () => { toast.success('교실 세팅을 저장했습니다.'); setEditorOpen(false); refresh(); },
    onError: () => toast.error('저장하지 못했습니다. 항목을 확인하고 다시 시도해 주세요.'),
  });

  const runConfirm = useMutation({
    mutationFn: async (c: Confirm) => {
      if (c.kind === 'delete') await deletePreset(c.preset.id);
      else if (c.kind === 'stop') await stopLink(c.code);
      else await forgetClassroomLogin(c.ref);
      return c;
    },
    onSuccess: (c) => {
      toast.success(c.kind === 'delete' ? '세팅을 지웠습니다.'
        : c.kind === 'stop' ? '수업을 끝냈습니다. 교실 기기가 곧 정리합니다.'
          : `${c.device} 의 구글 로그인 보관을 지웠습니다.`);
      setConfirm(null);
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '처리하지 못했습니다.'),
  });

  const openNew = (seed?: Partial<PresetDraft>) => { setEditing(null); setInitial(seed); setEditorOpen(true); };
  const openEdit = (preset: ClassroomPreset) => { setEditing(preset); setInitial(undefined); setEditorOpen(true); };
  const duplicate = (preset: ClassroomPreset) => openNew({
    title: `${preset.title} (복사본)`, section_name: null, items: preset.items, auto_end_minutes: preset.auto_end_minutes,
  });

  // 지금 수업 → 그 반 세팅을 맨 앞에, 나머지는 최근에 쓴 순
  const ordered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return [...presets]
      .filter((p) => !needle || p.title.toLowerCase().includes(needle) || (p.section_name ?? '').toLowerCase().includes(needle)
        || p.items.some((i) => itemLabel(i).toLowerCase().includes(needle)))
      .sort((a, b) => {
        const am = currentSection && a.section_name === currentSection ? 1 : 0;
        const bm = currentSection && b.section_name === currentSection ? 1 : 0;
        if (am !== bm) return bm - am;
        return (b.last_used_at ? Date.parse(b.last_used_at) : 0) - (a.last_used_at ? Date.parse(a.last_used_at) : 0)
          || a.sort_order - b.sort_order;
      });
  }, [presets, currentSection, q]);
  const sectionsWithout = sections.filter((s) => !presets.some((p) => p.section_name === s));

  const active = overview?.active ?? [];
  const logins = overview?.logins ?? [];
  const recent = overview?.recent ?? [];

  return (
    <Layout>
      <PageContainer>
        {/* 머리글 카드 — 기능명 없이 검색·사용 방법·새 세팅만 */}
        <div className="rounded-xl border bg-card p-2.5 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 sm:flex">
              <QrCode className="h-4 w-4" aria-hidden />
            </div>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="세팅·반·항목 찾기" aria-label="세팅 찾기"
                className="h-11 pl-8 text-base sm:h-8 sm:text-xs" />
            </div>
            <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-slate-500 sm:h-8 sm:w-auto sm:gap-1.5 sm:px-2.5 sm:text-xs"
              onClick={() => setHelpOpen(true)} aria-label="사용 방법">
              <HelpCircle className="h-4 w-4 sm:h-3.5 sm:w-3.5" /><span className="hidden sm:inline">사용 방법</span>
            </Button>
            <Button className="h-11 w-11 shrink-0 bg-blue-600 p-0 hover:bg-blue-700 sm:h-8 sm:w-auto sm:gap-1.5 sm:px-3 sm:text-xs"
              onClick={() => openNew()} aria-label="새 세팅">
              <Plus className="h-5 w-5 sm:h-3.5 sm:w-3.5" /><span className="hidden sm:inline">새 세팅</span>
            </Button>
          </div>
        </div>

        {/* 지금 연결된 교실 */}
        {active.map((a) => (
          <div key={a.code} className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center dark:border-emerald-900 dark:bg-emerald-950/40">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Radio className="h-5 w-5 shrink-0 animate-pulse text-emerald-600" aria-hidden />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                  {a.device_name} <span className="font-normal text-emerald-700 dark:text-emerald-300">· {a.title ?? '세팅'}</span>
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-300">{clock(a.approved_at)} 연결 · {clock(a.ends_at)} 자동 정리</p>
              </div>
            </div>
            <Button variant="outline" className="h-11 border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100 sm:h-8 sm:text-xs"
              onClick={() => setConfirm({ kind: 'stop', code: a.code, device: a.device_name })}>
              여기서 수업 끝내기
            </Button>
          </div>
        ))}

        {/* 세팅이 없는 반 — 바로 만들기(휴대폰은 가로로 밀기) */}
        {!isLoading && sectionsWithout.length > 0 && (
          <div className="space-y-2">
            <SectionLabel icon={Plus}>세팅이 없는 반</SectionLabel>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
              {sectionsWithout.map((s) => (
                <button key={s} type="button"
                  onClick={() => openNew({ title: `${s} 수업`, section_name: s, items: [], auto_end_minutes: 50 })}
                  className="flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-blue-300 bg-blue-50/50 px-4 text-sm text-blue-700 transition-colors hover:bg-blue-50 sm:h-8 sm:px-3 sm:text-xs">
                  <Plus className="h-3.5 w-3.5" aria-hidden />{s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 세팅 카드 */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">세팅을 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.</div>
        ) : presets.length === 0 ? (
          <EmptyState onCreate={() => openNew()} onHelp={() => setHelpOpen(true)} />
        ) : ordered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">«{q}» 에 맞는 세팅이 없습니다.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ordered.map((preset) => (
              <PresetCard key={preset.id} preset={preset} now={!!currentSection && preset.section_name === currentSection}
                onEdit={() => openEdit(preset)} onDuplicate={() => duplicate(preset)}
                onDelete={() => setConfirm({ kind: 'delete', preset })} />
            ))}
          </div>
        )}

        {/* 교실 상태 — 보관한 구글 로그인 · 최근 연결 */}
        {(logins.length > 0 || recent.length > 0) && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <section className="space-y-2 rounded-xl border bg-card p-4 shadow-sm">
              <SectionLabel icon={KeyRound}>보관한 구글 로그인</SectionLabel>
              {logins.length === 0 ? (
                <p className="text-sm text-muted-foreground">아직 없습니다. 교실 독의 «구글»로 로그인하면 그 PC 에 암호화해 보관합니다.</p>
              ) : (
                <ul className="divide-y">
                  {logins.map((l) => (
                    <li key={l.ref} className="flex items-center gap-3 py-2">
                      <Monitor className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{l.device_name}</p>
                        <p className="text-xs text-muted-foreground">{ago(l.last_used_at)} 사용</p>
                      </div>
                      <Button variant="ghost" className="h-11 text-rose-600 hover:bg-rose-50 hover:text-rose-700 sm:h-8 sm:px-2.5 sm:text-xs"
                        onClick={() => setConfirm({ kind: 'forget', ref: l.ref, device: l.device_name })}>지우기</Button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs leading-5 text-muted-foreground">열쇠는 서버에 있어, 그 PC 에서 선생님이 QR 로 승인할 때만 풀립니다.</p>
            </section>
            <section className="space-y-2 rounded-xl border bg-card p-4 shadow-sm">
              <SectionLabel icon={History}>최근 연결</SectionLabel>
              {recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">아직 없습니다.</p>
              ) : (
                <ul className="divide-y">
                  {recent.map((r, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                      <span className="min-w-0 truncate">{r.device_name} <span className="text-muted-foreground">· {r.title ?? '세팅'}</span></span>
                      <span className="shrink-0 text-xs text-muted-foreground">{ago(r.approved_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </PageContainer>

      <PresetEditor open={editorOpen} onOpenChange={setEditorOpen} preset={editing} initial={initial}
        sections={sections} saving={save.isPending} onSave={(draft) => save.mutate(draft)} />

      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />

      <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === 'delete' ? `«${confirm.preset.title}» 세팅을 지울까요?`
                : confirm?.kind === 'stop' ? `${confirm.device} 의 수업을 끝낼까요?`
                  : confirm ? `${confirm.device} 의 구글 로그인 보관을 지울까요?` : ''}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === 'delete' ? '교실 기기에서 이 세팅을 더 고를 수 없습니다. 지금 연결된 수업에는 영향이 없습니다.'
                : confirm?.kind === 'stop' ? '교실 기기가 30초 안에 알아채고, 열린 창을 닫고 고친 드라이브 파일을 올린 뒤 받은 파일과 로그인을 지웁니다.'
                  : '그 PC 에 남은 암호문은 더 열 수 없게 되고, 다음에 그 PC 에서는 구글에 다시 로그인해야 합니다.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 text-white hover:bg-rose-700" disabled={runConfirm.isPending}
              onClick={(e) => { e.preventDefault(); if (confirm) runConfirm.mutate(confirm); }}>
              {confirm?.kind === 'stop' ? '수업 끝' : '지우기'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}

function PresetCard({ preset, now, onEdit, onDuplicate, onDelete }: {
  preset: ClassroomPreset; now: boolean; onEdit: () => void; onDuplicate: () => void; onDelete: () => void;
}) {
  const shown = preset.items.slice(0, 7);
  const more = preset.items.length - shown.length;
  return (
    <article className={cn('flex flex-col rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md',
      now && 'border-blue-400 ring-1 ring-blue-400')}>
      <div className="flex items-start gap-2">
        <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
          <h2 className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{preset.title}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {preset.section_name
              ? <Badge variant="secondary" className="font-normal">{preset.section_name}</Badge>
              : <Badge variant="outline" className="font-normal">공통</Badge>}
            {now && <Badge className="bg-blue-600 hover:bg-blue-600">지금 수업</Badge>}
          </div>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="-mr-2 -mt-1 h-11 w-11 shrink-0 text-slate-500 sm:h-8 sm:w-8" aria-label={`${preset.title} 메뉴`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}><Pencil className="mr-2 h-4 w-4" />고치기</DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}><Copy className="mr-2 h-4 w-4" />복제(다른 반용)</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-rose-600 focus:text-rose-700">
              <Trash2 className="mr-2 h-4 w-4" />지우기
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* 교실 독 미리 보기 줄 */}
      <button type="button" onClick={onEdit} aria-label={`${preset.title} 고치기`}
        className="mt-3 flex items-center gap-1.5 overflow-hidden rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-slate-900">
        <FixedDockIcon kind="google" size="sm" />
        <FixedDockIcon kind="drive" size="sm" />
        <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
        {shown.map((item, i) => <span key={i} title={itemLabel(item)}><ItemIcon item={item} size="sm" /></span>)}
        {more > 0 && <span className="text-xs text-muted-foreground">+{more}</span>}
      </button>

      <p className="mt-3 line-clamp-1 text-xs text-muted-foreground">{preset.items.map(itemLabel).join(' · ') || '구글 · 내 드라이브만'}</p>
      <p className="mt-auto pt-2 text-[11px] text-slate-400">
        {preset.auto_end_minutes}분 뒤 자동 정리{preset.last_used_at ? ` · ${ago(preset.last_used_at)} 사용` : ' · 아직 안 씀'}
      </p>
    </article>
  );
}

function EmptyState({ onCreate, onHelp }: { onCreate: () => void; onHelp: () => void }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/50 px-6 py-16 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100"><QrCode className="h-8 w-8 text-blue-500" /></div>
      <h3 className="text-base font-semibold text-slate-700">아직 교실 세팅이 없습니다</h3>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500">
        수업에 쓰는 드라이브 폴더·클래스룸·패들렛·PowerPoint 를 한 세팅에 묶어 두면, 교실에서 QR 한 번으로 화면 아래 독에 놓입니다.
      </p>
      <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
        <Button variant="ghost" className="h-11 gap-1.5 text-slate-600 sm:h-8 sm:text-xs" onClick={onHelp}><HelpCircle className="h-3.5 w-3.5" />사용 방법</Button>
        <Button className="h-11 gap-1.5 bg-blue-600 hover:bg-blue-700 sm:h-8 sm:text-xs" onClick={onCreate}><Plus className="h-3.5 w-3.5" />새 세팅</Button>
      </div>
    </div>
  );
}

function HelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const steps = [
    { icon: Monitor, title: '교실 PC 에서 프로그램 켜기', body: '«스페이스기전 교실»을 켜면(Windows 를 켜면 저절로) 화면에 QR 이 뜹니다.' },
    { icon: Smartphone, title: '휴대폰으로 QR 찍기', body: '카메라로 찍고 이 반 세팅을 골라 «이 기기에 펼치기». 구글 허용 창이 잠깐 뜰 수 있습니다.' },
    { icon: QrCode, title: '독에서 눌러 열기', body: '화면 아래 독에 세팅·구글·내 드라이브가 놓입니다. 저절로 열리지 않고 누르면 열립니다.' },
    { icon: Radio, title: '수업 끝', body: '정해 둔 시간이 지나거나 [수업 끝]을 누르면 고친 파일을 드라이브에 올리고, 교실 PC 의 사본·로그인을 지웁니다.' },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-0 p-0 sm:max-w-md">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-center gap-3">
            <TitleIconChip icon={HelpCircle} />
            <div className="text-left">
              <DialogTitle className="text-base">사용 방법</DialogTitle>
              <DialogDescription className="text-xs">교실 PC 화면의 QR 로 반별 세팅을 화면 아래 독에 놓습니다.</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <ol className="space-y-4 px-4 py-5 sm:px-6">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600"><s.icon className="h-4 w-4" aria-hidden /></span>
              <div>
                <p className="text-sm font-semibold">{i + 1}. {s.title}</p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
