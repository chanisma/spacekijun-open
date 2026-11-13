/**
 * 관리자 «다마고찌» 탭(2026-10-07 Phase 5) — 캐릭터 의뢰(공방과 같은 흐름) · 꾸미기 의뢰(2026-10-08, TamagotchiDecorOrders) · 펫 이벤트.
 *
 * 캐릭터 의뢰: 학생 글 → 제작 지시문 복사 → 바깥에서 그림(codex) → `process.py` · `make-sheet.py` 로 다섯 칸 시트 →
 *   여기서 올리면 검사(`checkCharacterSheet` — 학생 화면이 자를 때와 같은 규칙) → 배송. 거절은 답장 필수 + 코인 환불.
 *   앱은 그림 API 를 부르지 않는다(사용자 결정 — 관리자가 확인하고 만든다).
 * 펫 이벤트: 기간 · 이벤트 전용 물건 · 픽업. 픽업은 같은 등급 안에서 두 배(등급 확률은 그대로) — 서버 tama_private.gacha_pool 이 정본.
 * 통계(Phase 6 «측정» → 2026-10-14 개선): 계획 §10 의 두 지표 + 다시 온 사람·단계·가챠·참여자 목록 = TamagotchiAdminStats.tsx, 서버 tama_admin_metrics 하나.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { characterService, eventService, type CharacterOrder } from '@/features/tamagotchi/services/socialService';
import type { TamaEvent } from '@/features/tamagotchi/services/shopService';
import { checkCharacterSheet, characterProductionPrompt, readImageRgba, sliceCharacterSheet, CUSTOM_POSES, CUSTOM_POSE_LABEL } from '@/features/tamagotchi/color/customCharacter';
import { CATALOG, RARITY, SLOT_LABEL } from '@/features/tamagotchi/model/catalog';
import { DecorOrders } from './TamagotchiDecorOrders';
import { Metrics } from './TamagotchiAdminStats';

const STATUS_LABEL: Record<CharacterOrder['status'], string> = {
  submitted: '확인 기다림', crafting: '그리는 중', delivered: '배송함', declined: '거절함', cancelled: '학생이 거둠',
};

export function TamagotchiAdmin() {
  // 꾸미기 의뢰 알림에서 오면(?decor=) 그 탭으로
  const [params] = useSearchParams();
  const [section, setSection] = useState<'orders' | 'decor' | 'events' | 'metrics'>(params.get('decor') ? 'decor' : 'orders');
  return (
    <section aria-label="다마고찌 관리" className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Button variant={section === 'orders' ? 'default' : 'outline'} onClick={() => setSection('orders')}>캐릭터 의뢰</Button>
        <Button variant={section === 'decor' ? 'default' : 'outline'} onClick={() => setSection('decor')}>꾸미기 의뢰</Button>
        <Button variant={section === 'events' ? 'default' : 'outline'} onClick={() => setSection('events')}>펫 이벤트</Button>
        <Button variant={section === 'metrics' ? 'default' : 'outline'} onClick={() => setSection('metrics')}>통계</Button>
      </div>
      {section === 'orders' ? <CharacterOrders /> : section === 'decor' ? <DecorOrders /> : section === 'events' ? <PetEvents /> : <Metrics />}
    </section>
  );
}

// ── 캐릭터 의뢰 ──────────────────────────────────────────────────────

function CharacterOrders() {
  const [params] = useSearchParams();
  const deepId = params.get('order');
  const query = useQuery({ queryKey: ['tama-character', 'admin'], queryFn: characterService.all, refetchInterval: 30_000 });
  const [selectedId, setSelectedId] = useState<string | null>(deepId);
  const orders = query.data ?? [];
  const selected = orders.find((o) => o.id === selectedId) ?? orders.find((o) => o.status === 'submitted' || o.status === 'crafting');
  if (query.isPending) return <p role="status">의뢰를 불러오는 중…</p>;
  if (query.isError) return <p role="alert">{(query.error as Error).message}</p>;
  return (
    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside aria-label="캐릭터 의뢰 목록" className="space-y-2">
        {!orders.length && <p className="text-sm text-muted-foreground">아직 의뢰가 없습니다.</p>}
        {orders.map((o) => (
          <button key={o.id} type="button" onClick={() => setSelectedId(o.id)}
            className={cn('w-full min-w-0 rounded-lg border p-3 text-left', selected?.id === o.id ? 'border-purple-500 bg-purple-50 text-slate-900' : 'bg-card')}>
            <small className="text-xs">{STATUS_LABEL[o.status]} · {new Date(o.created_at).toLocaleDateString('ko-KR')}</small>
            <strong className="my-0.5 block truncate" title={o.title}>{o.title}</strong>
            <span className="block truncate text-xs">{o.owner_name ?? '학생'}</span>
          </button>
        ))}
      </aside>
      {selected ? <OrderProduction key={selected.id} order={selected} /> : <p className="rounded-lg border bg-card p-6 text-muted-foreground">의뢰를 고르세요.</p>}
    </div>
  );
}

function OrderProduction({ order }: { order: CharacterOrder }) {
  const qc = useQueryClient();
  const editable = order.status === 'submitted' || order.status === 'crafting';
  const prompt = characterProductionPrompt(order.title, order.prompt);
  const [note, setNote] = useState(order.admin_note ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [check, setCheck] = useState<string | null>(null);
  const [frames, setFrames] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const uploaded = useRef<string | null>(null);
  useEffect(() => () => { if (uploaded.current) void characterService.removeUnused(uploaded.current).catch(() => undefined); }, []);

  const pick = async (f?: File) => {
    setFile(null); setCheck(null); setFrames([]);
    if (!f) return;
    if (f.type !== 'image/png') { setCheck('PNG 파일만 올릴 수 있어요.'); return; }
    if (f.size > 2 * 1024 * 1024) { setCheck('2MB 이하여야 해요.'); return; }
    const url = URL.createObjectURL(f);
    try {
      const { width, height, rgba } = await readImageRgba(url);
      const r = checkCharacterSheet(width, height, rgba);
      if (!r.ok) { setCheck(r.reason); return; }
      const sliced = sliceCharacterSheet(width, height, rgba);
      setFrames(CUSTOM_POSES.map((p) => {
        const b = sliced[p];
        const c = document.createElement('canvas'); c.width = b.w; c.height = b.h;
        c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(b.data), b.w, b.h), 0, 0);
        return c.toDataURL('image/png');
      }));
      setFile(f);
      if (uploaded.current) { await characterService.removeUnused(uploaded.current).catch(() => undefined); uploaded.current = null; }
    } catch (e) { setCheck(e instanceof Error ? e.message : '그림을 읽지 못했어요.'); } finally { URL.revokeObjectURL(url); }
  };

  const act = async (action: 'start' | 'decline' | 'deliver') => {
    if (busy) return;
    if (action === 'decline' && !window.confirm('거절하고 코인을 돌려줄까요? 학생에게 답장이 알림으로 가요.')) return;
    if (action === 'deliver' && !window.confirm('이 그림으로 배송할까요? 학생에게 알림이 가요.')) return;
    setBusy(true);
    try {
      let image_path: string | null = null;
      if (action === 'deliver') {
        if (!file) throw new Error('검사를 통과한 시트를 먼저 골라 주세요.');
        if (!uploaded.current) uploaded.current = await characterService.upload(order.id, file);
        image_path = uploaded.current;
      }
      await characterService.write(action, { id: order.id, note, image_path });
      if (action === 'deliver') uploaded.current = null; // 이제 의뢰가 가리키므로 지우지 않는다
      toast.success(action === 'start' ? '그리는 중으로 표시했어요' : action === 'deliver' ? '배송했어요' : '거절하고 코인을 돌려줬어요');
      void qc.invalidateQueries({ queryKey: ['tama-character', 'admin'] });
    } catch (e) { toast.error(e instanceof Error ? e.message : '처리하지 못했어요.'); } finally { setBusy(false); }
  };

  return (
    <article className="space-y-4 rounded-lg border bg-card p-4" data-tama-admin-order={order.id}>
      <header>
        <p className="text-xs text-muted-foreground">{STATUS_LABEL[order.status]} · {order.owner_name ?? '학생'} · {order.charged_coins}코인{order.refunded_coins ? ` (환불 ${order.refunded_coins})` : ''}</p>
        <h2 className="text-lg font-semibold">{order.title}</h2>
        <p className="mt-1 whitespace-pre-wrap text-sm">{order.prompt}</p>
      </header>
      <div>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">제작 지시문</p>
          <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(prompt); toast.success('복사했어요'); }}>복사</Button>
        </div>
        <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">{prompt}</pre>
      </div>
      {editable && (
        <>
          <label className="block text-sm">
            완성 시트(PNG — 자세 다섯을 가로로: {CUSTOM_POSES.map((p) => CUSTOM_POSE_LABEL[p]).join(' · ')}, 칸 24~64px, 배경 투명)
            <input type="file" accept="image/png" className="mt-1 block text-sm" onChange={(e) => void pick(e.target.files?.[0])} />
          </label>
          {check && <p role="alert" className="text-sm text-rose-600">{check}</p>}
          {frames.length > 0 && (
            <div className="flex flex-wrap gap-2" aria-label="잘린 자세 미리보기">
              {frames.map((src, i) => (
                <figure key={i} className="text-center text-xs">
                  <img src={src} alt={CUSTOM_POSE_LABEL[CUSTOM_POSES[i]]} className="h-20 w-20 rounded bg-[repeating-conic-gradient(#eee_0_25%,#fff_0_50%)] [background-size:12px_12px] [image-rendering:pixelated]" />
                  <figcaption>{CUSTOM_POSE_LABEL[CUSTOM_POSES[i]]}</figcaption>
                </figure>
              ))}
            </div>
          )}
          <label className="block text-sm">
            학생에게 남길 말(거절은 필수)
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} className="mt-1 w-full rounded border bg-background p-2 text-sm" />
          </label>
          <div className="flex flex-wrap gap-2">
            {order.status === 'submitted' && <Button variant="outline" disabled={busy} onClick={() => void act('start')}>그리기 시작 표시</Button>}
            <Button disabled={busy || !file} onClick={() => void act('deliver')}>배송</Button>
            <Button variant="outline" className="text-rose-600" disabled={busy || note.trim().length < 2} onClick={() => void act('decline')}>거절(환불)</Button>
          </div>
        </>
      )}
      {!editable && order.admin_note && <p className="text-sm">남긴 말: {order.admin_note}</p>}
    </article>
  );
}

// ── 펫 이벤트 ────────────────────────────────────────────────────────

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function PetEvents() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['tama-event', 'admin'], queryFn: eventService.list });
  const [editing, setEditing] = useState<TamaEvent | 'new' | null>(null);
  const now = Date.now();
  if (query.isPending) return <p role="status">이벤트를 불러오는 중…</p>;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">기간 동안 이벤트 전용 물건이 가챠에 나오고, 픽업 물건은 같은 등급 안에서 두 배로 잘 나와요(등급 확률은 그대로).</p>
        <Button onClick={() => setEditing('new')}>새 이벤트</Button>
      </div>
      {editing && <EventForm initial={editing === 'new' ? null : editing} onDone={() => { setEditing(null); void qc.invalidateQueries({ queryKey: ['tama-event', 'admin'] }); }} />}
      <ul className="space-y-2">
        {(query.data ?? []).map((e) => {
          const live = now >= Date.parse(e.starts_at) && now < Date.parse(e.ends_at);
          return (
            <li key={e.id} className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', live ? 'bg-emerald-500 text-white' : Date.parse(e.ends_at) <= now ? 'bg-slate-200 text-slate-600' : 'bg-blue-100 text-blue-700')}>
                {live ? '진행 중' : Date.parse(e.ends_at) <= now ? '끝남' : '예정'}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block truncate">{e.title}</b>
                <span className="text-xs text-muted-foreground">{new Date(e.starts_at).toLocaleString('ko-KR')} ~ {new Date(e.ends_at).toLocaleString('ko-KR')} · 물건 {e.item_ids.length} · 픽업 {e.pickup_ids.length}</span>
              </span>
              <Button size="sm" variant="outline" onClick={() => setEditing(e)}>고치기</Button>
              <Button size="sm" variant="outline" className="text-rose-600" onClick={async () => {
                if (!window.confirm('이 이벤트를 지울까요? 이미 받은 물건은 학생에게 그대로 남아요.')) return;
                try { await eventService.remove(e.id); void qc.invalidateQueries({ queryKey: ['tama-event', 'admin'] }); } catch (err) { toast.error(err instanceof Error ? err.message : '지우지 못했어요.'); }
              }}>지우기</Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EventForm({ initial, onDone }: { initial: TamaEvent | null; onDone: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [starts, setStarts] = useState(initial ? toLocalInput(initial.starts_at) : toLocalInput(new Date().toISOString()));
  const [ends, setEnds] = useState(initial ? toLocalInput(initial.ends_at) : toLocalInput(new Date(Date.now() + 7 * 86_400_000).toISOString()));
  const [items, setItems] = useState<string[]>(initial?.item_ids ?? []);
  const [picks, setPicks] = useState<string[]>(initial?.pickup_ids ?? []);
  const [notify, setNotify] = useState(false);
  const [busy, setBusy] = useState(false);
  const eventItems = CATALOG.filter((i) => i.event);
  const pickable = useMemo(() => CATALOG.filter((i) => !i.event || items.includes(i.id)), [items]);
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const save = async () => {
    setBusy(true);
    try {
      const r = await eventService.save({
        id: initial?.id ?? null, title, body, starts_at: new Date(starts).toISOString(), ends_at: new Date(ends).toISOString(),
        item_ids: items, pickup_ids: picks.filter((p) => pickable.some((i) => i.id === p)), notify,
      });
      toast.success(notify ? `저장하고 ${r.notified ?? 0}명에게 알렸어요` : '저장했어요');
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : '저장하지 못했어요.'); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4" data-tama-event-form>
      <label className="block text-sm">이름 <input value={title} maxLength={30} onChange={(e) => setTitle(e.target.value)} className="mt-1 h-10 w-full rounded border bg-background px-2" /></label>
      <label className="block text-sm">설명(학생 화면·알림) <textarea value={body} maxLength={300} rows={2} onChange={(e) => setBody(e.target.value)} className="mt-1 w-full rounded border bg-background p-2" /></label>
      <div className="flex flex-wrap gap-3">
        <label className="text-sm">시작 <input type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} className="mt-1 block rounded border bg-background p-2" /></label>
        <label className="text-sm">끝 <input type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} className="mt-1 block rounded border bg-background p-2" /></label>
      </div>
      <fieldset>
        <legend className="text-sm font-semibold">이벤트 물건(이 기간에만 나와요)</legend>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {eventItems.map((i) => (
            <button key={i.id} type="button" aria-pressed={items.includes(i.id)} onClick={() => toggle(items, setItems, i.id)}
              className={cn('rounded-full border px-3 py-1 text-xs', items.includes(i.id) && 'border-purple-500 bg-purple-50 text-slate-900')}>
              {i.name} <span style={{ color: RARITY[i.rarity].color }}>{RARITY[i.rarity].label}</span> · {SLOT_LABEL[i.slot]}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-semibold">픽업(같은 등급 안에서 두 배)</legend>
        <div className="mt-1 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
          {pickable.map((i) => (
            <button key={i.id} type="button" aria-pressed={picks.includes(i.id)} onClick={() => toggle(picks, setPicks, i.id)}
              className={cn('rounded-full border px-3 py-1 text-xs', picks.includes(i.id) && 'border-pink-500 bg-pink-50 text-slate-900')}>
              {i.name} <span style={{ color: RARITY[i.rarity].color }}>{RARITY[i.rarity].label}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        저장하면서 펫을 키우는 모두에게 알림 보내기(앱을 닫아도 오는 알림은 하루 예산 안에서)
      </label>
      <div className="flex gap-2">
        <Button disabled={busy || title.trim().length < 2} onClick={() => void save()}>저장</Button>
        <Button variant="outline" onClick={onDone}>닫기</Button>
      </div>
    </div>
  );
}

