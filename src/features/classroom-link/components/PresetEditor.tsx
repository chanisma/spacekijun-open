import { useEffect, useMemo, useState } from 'react';
import {
  DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Check, Clock, Eye, FolderOpen, Globe, GripVertical, LayoutGrid, ListOrdered, Monitor, Plus, QrCode, Tag, Users, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DIALOG_FOOTER_CLASS, DIALOG_HEADER_CLASS, FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS, SectionLabel, TitleIconChip,
} from '@/components/tasks/dialogDesign';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { getGoogleDriveService } from '@/services/googleDriveServiceNew';
import { preloadGoogleIdentity, requestGoogleTokenPopup } from '@/services/googleIdentityPopup';
import {
  AUTO_END_CHOICES, CLASSROOM_PROGRAMS, GOOGLE_APPS, MAX_ITEMS, SPACE_PAGES, SUGGESTED_SITES,
  itemLabel, kindLabel, normalizeUrl, validateDraft,
  type ClassroomPreset, type PresetDraft, type PresetItem,
} from '../presetItems';
import { FixedDockIcon, ItemIcon, RealIcon } from './ItemIcon';
import { googleIconUrl, googleLook, programIconUrl, programLook, siteIconUrl } from './iconSources';

interface Row { uid: string; item: PresetItem }
let seq = 0;
const toRows = (items: PresetItem[]): Row[] => items.map((item) => ({ uid: `r${++seq}`, item }));
/** 같은 항목인가 — 웹사이트는 주소의 끝 «/» 를 무시한다(추천 사이트를 두 번 넣지 않게) */
const keyOf = (i: PresetItem) => (i.kind === 'url' ? `url:${i.url.replace(/\/+$/, '')}` : JSON.stringify(i));
const same = (a: PresetItem, b: PresetItem) => keyOf(a) === keyOf(b);

/** 칩 — 휴대폰은 44px, sm 부터 32px */
const CHIP = 'h-11 shrink-0 rounded-full border px-4 text-sm transition-colors sm:h-8 sm:px-3 sm:text-xs';
const chipOn = (on: boolean) => (on ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:bg-transparent dark:text-slate-300');

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 고치는 세팅(없으면 새로) */
  preset: ClassroomPreset | null;
  /** 새로 만들 때 미리 채울 값(반에서 바로 만들기 · 복제) */
  initial?: Partial<PresetDraft>;
  sections: string[];
  saving: boolean;
  onSave: (draft: PresetDraft) => void;
}

/**
 * 교실 세팅 편집 — 모달 디자인 부품(dialogDesign) 3단: 머리(아이콘 칩) · 본문(스크롤) · 바닥(저장).
 * 휴대폰(640 미만)에서는 전체 화면(dialog-layout 이 max-w 로 판정), 바닥이 아래에 붙는다. «더하기»를 «순서»보다 먼저 보인다.
 */
export function PresetEditor({ open, onOpenChange, preset, initial, sections, saving, onSave }: Props) {
  const [title, setTitle] = useState('');
  const [section, setSection] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(50);
  const [rows, setRows] = useState<Row[]>([]);
  const [tab, setTab] = useState('google');
  const [url, setUrl] = useState('');
  const [urlName, setUrlName] = useState('');
  const [otherProgram, setOtherProgram] = useState('');
  // 구글 Picker 는 Radix 모달 밖에 뜬다 — 모달이 열려 있으면 포커스 가두기 때문에 누를 수 없다. 고르는 동안만 내린다.
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!open) return;
    const base = preset ?? initial ?? {};
    setTitle(base.title ?? '');
    setSection(base.section_name ?? null);
    setMinutes(base.auto_end_minutes ?? 50);
    setRows(toRows(base.items ?? []));
    setTab('google');
    setUrl(''); setUrlName(''); setOtherProgram('');
    void preloadGoogleIdentity().catch(() => { /* 고를 때 다시 */ });
  }, [open, preset, initial]);

  const items = useMemo(() => rows.map((r) => r.item), [rows]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const has = (item: PresetItem) => items.some((i) => same(i, item));
  const add = (list: PresetItem[]) => setRows((prev) => {
    const next = [...prev];
    for (const item of list) {
      if (next.length >= MAX_ITEMS) { toast.error(`항목은 ${MAX_ITEMS}개까지입니다.`); break; }
      if (!next.some((r) => same(r.item, item))) next.push(...toRows([item]));
    }
    return next;
  });
  const toggle = (item: PresetItem) => {
    if (has(item)) setRows((prev) => prev.filter((r) => !same(r.item, item)));
    else add([item]);
  };
  const remove = (uid: string) => setRows((prev) => prev.filter((r) => r.uid !== uid));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setRows((prev) => arrayMove(prev, prev.findIndex((r) => r.uid === active.id), prev.findIndex((r) => r.uid === over.id)));
  };

  const pickDrive = async () => {
    setPicking(true);
    await new Promise((r) => setTimeout(r, 100));
    const service = getGoogleDriveService();
    const show = () => service.showPicker((files) => {
      add(files.map((f) => ({ kind: 'drive' as const, id: f.id, name: f.name, mimeType: f.mimeType })));
      setPicking(false);
    }, { multiselect: true, enableFolderSelect: true });
    try {
      try {
        await show();
      } catch {
        if (!(await requestGoogleTokenPopup())) throw new Error('google');
        await show();
      }
      // Picker 를 취소하면 콜백이 오지 않는다 — 창이 닫히면 모달을 되살린다
      const restore = () => { if (!document.querySelector('.picker-dialog')) setPicking(false); else setTimeout(restore, 400); };
      setTimeout(restore, 1200);
    } catch {
      setPicking(false);
      toast.error('구글 드라이브를 열지 못했습니다. 구글 창에서 허용한 뒤 다시 시도해 주세요.');
    }
  };

  const addUrl = () => {
    const href = normalizeUrl(url);
    if (!href) { toast.error('웹사이트 주소를 확인해 주세요.'); return; }
    add([{ kind: 'url', url: href, name: urlName.trim() || new URL(href).hostname }]);
    setUrl(''); setUrlName('');
  };

  const addOtherProgram = () => {
    const key = otherProgram.trim().toLowerCase();
    if (!/^[a-z0-9_-]{1,40}$/.test(key)) { toast.error('기기에 등록한 영문 이름(소문자·숫자·-·_)을 입력해 주세요.'); return; }
    add([{ kind: 'program', program: key, name: key }]);
    setOtherProgram('');
  };

  const suggestedTitle = section ? `${section} 수업` : '';
  const submit = () => {
    const draft: PresetDraft = { title: title.trim() || suggestedTitle, section_name: section, items, auto_end_minutes: minutes };
    const error = validateDraft(draft);
    if (error) { toast.error(error); return; }
    onSave(draft);
  };

  const sectionChoices = section && !sections.includes(section) ? [section, ...sections] : sections;
  const customSites = items.filter((i) => i.kind === 'url' && !i.app && !SUGGESTED_SITES.some((s) => same({ kind: 'url', url: s.url, name: s.name }, i)));

  return (
    <Dialog open={open && !picking} onOpenChange={(next) => { if (!picking) onOpenChange(next); }}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-5xl">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-center gap-3">
            <TitleIconChip icon={QrCode} />
            <div className="min-w-0 text-left">
              <DialogTitle className="text-base">{preset ? '교실 세팅 고치기' : '새 교실 세팅'}</DialogTitle>
              <DialogDescription className="text-xs">QR 로 승인하면 화면 아래 독에 이 순서로 놓입니다. 누르면 열립니다.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
          {/* 기본 */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="space-y-2">
              <SectionLabel icon={Tag}>이름</SectionLabel>
              <Input value={title} maxLength={60} placeholder={suggestedTitle || '예: 1-3 정보 수업'}
                onChange={(e) => setTitle(e.target.value)} className="h-11 sm:h-9" aria-label="세팅 이름" />
            </div>
            <div className="space-y-2">
              <SectionLabel icon={Clock}>자동 정리</SectionLabel>
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap" role="radiogroup" aria-label="자동 정리">
                {[...new Set([...AUTO_END_CHOICES, minutes])].sort((a, b) => a - b).map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={minutes === m} onClick={() => setMinutes(m)}
                    className={cn(CHIP, chipOn(minutes === m))}>{m}분</button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <SectionLabel icon={Users}>수업(반)</SectionLabel>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap" role="radiogroup" aria-label="수업(반)">
              <button type="button" role="radio" aria-checked={section === null} onClick={() => setSection(null)}
                className={cn(CHIP, chipOn(section === null))}>반 없이(공통)</button>
              {sectionChoices.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={section === s} onClick={() => setSection(s)}
                  className={cn(CHIP, chipOn(section === s))}>{s}{!sections.includes(s) && ' (지난 학기)'}</button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">반을 고르면, 그 반 수업 시간에 QR 을 찍었을 때 이 세팅이 미리 골라집니다.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            {/* 더하기 — 휴대폰은 위(먼저 고르고 나서 순서를 본다) */}
            <section className="min-w-0 space-y-2 md:order-2">
              <SectionLabel icon={Plus}>더하기</SectionLabel>
              <Tabs value={tab} onValueChange={setTab} className="rounded-xl border bg-card p-2">
                <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-lg bg-slate-100/50 p-1">
                  {[['google', '구글 앱'], ['url', '웹사이트'], ['drive', '드라이브'], ['program', '프로그램'], ['space', '스페이스기전']].map(([v, label]) => (
                    <TabsTrigger key={v} value={v}
                      className="h-10 shrink-0 px-3 text-sm data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm sm:h-auto sm:py-1.5 sm:text-xs">
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <TabsContent value="google" className="mt-2 px-1">
                  <TileGrid>
                    {GOOGLE_APPS.map((a) => {
                      const item: PresetItem = { kind: 'url', url: a.url, name: a.label, app: a.key };
                      const [text, color] = googleLook(a.key);
                      return <PickTile key={a.key} label={a.label} on={has(item)} onClick={() => toggle(item)}
                        icon={<RealIcon src={googleIconUrl(a.key)} fallback={<Swatch text={text} color={color} />} />} />;
                    })}
                  </TileGrid>
                  <Hint>교실 독의 «구글»로 한 번 로그인하면(그 PC 에 보관) 구글 앱이 로그인된 채 열립니다. 특정 반의 클래스룸·설문지는 «웹사이트»에 주소를 넣으세요.</Hint>
                </TabsContent>

                <TabsContent value="url" className="mt-2 space-y-3 px-1">
                  <TileGrid>
                    {SUGGESTED_SITES.map((site) => {
                      const item: PresetItem = { kind: 'url', url: site.url, name: site.name, site: site.key };
                      return <PickTile key={site.url} label={site.name} on={has(item)} onClick={() => toggle(item)}
                        icon={<RealIcon src={siteIconUrl(site.key)} plate fallback={<Swatch text={<Globe className="h-4 w-4" />} color="#0891b2" />} />} />;
                    })}
                    {customSites.map((item) => item.kind === 'url' && (
                      <PickTile key={item.url} label={item.name} on onClick={() => toggle(item)} icon={<ItemIcon item={item} />} />
                    ))}
                  </TileGrid>
                  <div className="space-y-2 rounded-lg border border-dashed p-2.5">
                    <p className="text-xs font-medium text-slate-500">다른 사이트 넣기</p>
                    <Input value={url} placeholder="주소 (예: 클래스룸 반 주소, 학교 홈페이지)" inputMode="url"
                      onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addUrl(); }}
                      className="h-11 sm:h-9" aria-label="웹사이트 주소" />
                    <div className="flex gap-2">
                      <Input value={urlName} maxLength={120} placeholder="독에 보일 이름(선택)" onChange={(e) => setUrlName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') addUrl(); }} className="h-11 sm:h-9" aria-label="독에 보일 이름" />
                      <Button type="button" onClick={addUrl} className="h-11 shrink-0 gap-1.5 bg-blue-600 hover:bg-blue-700 sm:h-9 sm:text-xs">
                        <Plus className="h-4 w-4" />넣기
                      </Button>
                    </div>
                  </div>
                  <Hint>교실 PC 의 수업용 브라우저에서 열립니다. 구글 주소면 «구글» 로그인을 함께 씁니다.</Hint>
                </TabsContent>

                <TabsContent value="drive" className="mt-2 space-y-3 px-1">
                  <button type="button" onClick={pickDrive}
                    className="flex w-full items-center gap-3 rounded-xl border border-dashed p-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-900">
                    <FolderOpen className="h-8 w-8 shrink-0 text-amber-500" aria-hidden />
                    <span>
                      <span className="block text-sm font-medium">드라이브에서 폴더·파일 고르기</span>
                      <span className="block text-xs text-muted-foreground">여러 개를 한 번에 고를 수 있습니다.</span>
                    </span>
                  </button>
                  <Hint>
                    폴더 → 교실 프로그램의 드라이브 탐색기가 그 폴더로 열립니다. 파일 → 받아서 열고, 고쳐 저장하면 드라이브에 다시 올라갑니다.
                    독에는 이와 별개로 «내 드라이브»가 늘 있습니다.
                  </Hint>
                </TabsContent>

                <TabsContent value="program" className="mt-2 space-y-3 px-1">
                  <TileGrid>
                    {CLASSROOM_PROGRAMS.map((p) => {
                      const item: PresetItem = { kind: 'program', program: p.key, name: p.label };
                      const [text, color] = programLook(p.key);
                      return <PickTile key={p.key} label={p.label} on={has(item)} onClick={() => toggle(item)}
                        icon={<RealIcon src={programIconUrl(p.key)} fallback={<Swatch text={text} color={color} />} />} />;
                    })}
                  </TileGrid>
                  <div className="flex gap-2">
                    <Input value={otherProgram} maxLength={40} placeholder="기기에 등록한 다른 프로그램(영문 이름)"
                      onChange={(e) => setOtherProgram(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addOtherProgram(); }}
                      className="h-11 sm:h-9" aria-label="다른 프로그램 이름" />
                    <Button type="button" variant="outline" onClick={addOtherProgram} className="h-11 shrink-0 gap-1.5 sm:h-9 sm:text-xs">
                      <Monitor className="h-4 w-4" />넣기
                    </Button>
                  </div>
                  <Hint>교실 PC 에 설치된 것만 열립니다. 목록 밖 프로그램은 그 PC 관리자가 교실 프로그램 설정 파일에 등록한 이름으로 넣으세요.</Hint>
                </TabsContent>

                <TabsContent value="space" className="mt-2 px-1">
                  <TileGrid>
                    {SPACE_PAGES.map((p) => {
                      const item: PresetItem = { kind: 'space', path: p.path, name: p.label };
                      return <PickTile key={p.path} label={p.label} on={has(item)} onClick={() => toggle(item)}
                        icon={<RealIcon src="/logo_sm.png" plate fallback={<Swatch text={<LayoutGrid className="h-4 w-4" />} color="#4f46e5" />} />} />;
                    })}
                  </TileGrid>
                  <Hint>교실 PC 에서 선생님 계정으로 로그인된 채 열리고, 수업이 끝나면 서버가 그 로그인을 끊습니다.</Hint>
                </TabsContent>
              </Tabs>
            </section>

            {/* 독에 놓일 순서 */}
            <section className="min-w-0 space-y-2 md:order-1">
              <SectionLabel icon={ListOrdered} trailing={<span className="text-[11px] text-slate-400">{rows.length}/{MAX_ITEMS} · 끌어서 순서</span>}>
                독에 놓일 순서
              </SectionLabel>
              <div className="flex min-h-[10rem] flex-col rounded-xl border bg-slate-50/60 dark:bg-slate-900/40 md:min-h-[22rem]">
                {rows.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
                    <Plus className="h-6 w-6" aria-hidden />
                    수업에 쓸 것을 눌러 넣으세요.
                    <span className="text-xs text-slate-400">비워 두어도 됩니다 — 독에는 «구글»·«내 드라이브»가 늘 놓입니다.</span>
                  </div>
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                    <SortableContext items={rows.map((r) => r.uid)} strategy={verticalListSortingStrategy}>
                      <ul className="space-y-1.5 p-2">
                        {rows.map((row) => <SortableRow key={row.uid} row={row} onRemove={() => remove(row.uid)} />)}
                      </ul>
                    </SortableContext>
                  </DndContext>
                )}
              </div>
            </section>
          </div>

          {/* 교실 화면 독 미리 보기 */}
          <section className="space-y-2">
            <SectionLabel icon={Eye}>교실 화면 아래 독 미리 보기</SectionLabel>
            <div className="flex items-center gap-3 overflow-x-auto rounded-2xl border bg-slate-100 px-4 py-3 dark:bg-slate-900">
              <div className="min-w-[6rem] shrink-0">
                <p className="text-xs font-semibold">선생님</p>
                <p className="truncate text-[11px] text-muted-foreground">{title.trim() || suggestedTitle || '세팅 이름'}</p>
              </div>
              <span className="h-10 w-px shrink-0 bg-border" aria-hidden />
              <DockTile icon={<FixedDockIcon kind="google" />} label="구글" />
              <DockTile icon={<FixedDockIcon kind="drive" />} label="내 드라이브" />
              {items.map((item, i) => <DockTile key={i} icon={<ItemIcon item={item} />} label={itemLabel(item)} />)}
              <span className="h-10 w-px shrink-0 bg-border" aria-hidden />
              <span className="shrink-0 rounded-lg border bg-white px-2.5 py-1 text-center dark:bg-slate-800">
                <span className="block text-sm font-bold tabular-nums">{minutes}:00</span>
                <span className="block text-[10px] text-muted-foreground">+10분</span>
              </span>
              <span className="shrink-0 rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white">수업 끝</span>
            </div>
          </section>
        </div>

        <DialogFooter className={cn(DIALOG_FOOTER_CLASS, 'flex-row')}>
          <Button variant="ghost" className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS, 'h-11 flex-1 sm:h-8 sm:flex-none')}
            onClick={() => onOpenChange(false)} disabled={saving}>취소</Button>
          <Button className={cn(FOOTER_BUTTON_CLASS, 'h-11 flex-1 bg-blue-600 hover:bg-blue-700 sm:h-8 sm:flex-none')}
            onClick={submit} disabled={saving}>
            <Check className="h-3.5 w-3.5" />{saving ? '저장 중…' : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SortableRow({ row, onRemove }: { row: Row; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.uid });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('flex items-center gap-2.5 rounded-lg border bg-background px-2 py-1.5', isDragging && 'z-10 shadow-lg')}>
      <button type="button" className="flex h-10 w-8 cursor-grab touch-none items-center justify-center rounded text-slate-400 hover:bg-slate-100 active:cursor-grabbing sm:h-8 sm:w-6"
        aria-label={`${itemLabel(row.item)} 순서 옮기기`} {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4" />
      </button>
      <ItemIcon item={row.item} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{itemLabel(row.item)}</span>
        <span className="block text-[11px] text-muted-foreground">{kindLabel(row.item)}</span>
      </span>
      <button type="button" onClick={onRemove} aria-label={`${itemLabel(row.item)} 빼기`}
        className="flex h-10 w-10 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 sm:h-8 sm:w-8">
        <X className="h-4 w-4" />
      </button>
    </li>
  );
}

function TileGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-1.5 min-[420px]:grid-cols-4">{children}</div>;
}

function Swatch({ text, color }: { text: React.ReactNode; color: string }) {
  return <span className="grid h-10 w-10 place-items-center rounded-xl text-sm font-bold text-white shadow-sm" style={{ background: color }} aria-hidden>{text}</span>;
}

function PickTile({ label, icon, on, onClick }: { label: string; icon: React.ReactNode; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={cn('relative flex min-h-[5rem] flex-col items-center justify-center gap-1.5 rounded-xl border p-2 text-xs transition-colors',
        on ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/40' : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-900')}>
      {icon}
      <span className="max-w-full truncate">{label}</span>
      {on && (
        <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-blue-600 text-white">
          <Check className="h-3 w-3" aria-hidden />
        </span>
      )}
    </button>
  );
}

function DockTile({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="flex w-14 shrink-0 flex-col items-center gap-1">
      {icon}
      <span className="w-full truncate text-center text-[10px]">{label}</span>
    </span>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-xs leading-5 text-muted-foreground">{children}</p>;
}
