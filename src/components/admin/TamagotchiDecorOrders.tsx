/**
 * 관리자 «다마고찌» 탭 — 꾸미기 의뢰(2026-10-08). 캐릭터 의뢰와 같은 흐름이지만 만드는 법이 자리에 따라 둘이다.
 *
 *   · 기기 디자인 · 벽지 · 러그 — 주 색 · 보조 색 · 무늬를 고른다. 나머지 색은 학생 화면과 같은 규칙(model/decorDesign)으로 유도되고
 *     미리보기도 그 규칙으로 그린다(서버에는 고른 값 셋만 간다).
 *   · 바닥 · 선반 · 벽 소품 — 제작 지시문을 복사해 바깥(codex)에서 투명 픽셀 PNG(8~24px)를 만들어 올린다. 검사(checkDecoImage)를
 *     통과해야 배송이 열린다. 미리보기는 실제 방(roomPreview)에 놓아 본다.
 *   · 기기 종류(2026-10-13, 300코인) — 새 3D 기기는 코드로만 만든다. [개발 요청서 복사] → 개발자가 three/dims.ts 에 모델을 더해
 *     배포 → 여기 «모델» 목록에 저절로 나타나면 골라 배송(design = {model}). 미리보기 = 그 기기 모양.
 * 미리보기는 클라이언트 목록에 임시 물건(c_preview)을 끼워 그린다 — 서버에는 아무것도 저장하지 않는다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { decorService, type DecorOrder } from '@/features/tamagotchi/services/decorService';
import { SLOT_LABEL, registerCustomItems } from '@/features/tamagotchi/model/catalog';
import {
  DEVICE_MODEL_KEYS, SHELL_PATTERNS, WALL_PATTERNS, checkDecoImage, customItemFromRow, decorProductionPrompt, deviceDevRequest, isDesignSlot, isModelSlot, type DecorDesign,
} from '@/features/tamagotchi/model/decorDesign';
import { decoImageToBuf, setCustomDecoSprite } from '@/features/tamagotchi/color/customDecor';
import { readImageRgba } from '@/features/tamagotchi/color/customCharacter';
import { PrizePreview } from '@/features/tamagotchi/components/PrizePreview';

const STATUS_LABEL: Record<DecorOrder['status'], string> = {
  submitted: '확인 기다림', crafting: '만드는 중', delivered: '배송함', declined: '거절함', cancelled: '학생이 거둠',
};
const PREVIEW_ID = 'c_preview';

export function DecorOrders() {
  const [params] = useSearchParams();
  const deepId = params.get('decor');
  const query = useQuery({ queryKey: ['tama-decor', 'admin'], queryFn: decorService.all, refetchInterval: 30_000 });
  const [selectedId, setSelectedId] = useState<string | null>(deepId && deepId !== '1' ? deepId : null);
  const orders = query.data ?? [];
  const selected = orders.find((o) => o.id === selectedId) ?? orders.find((o) => o.status === 'submitted' || o.status === 'crafting');
  if (query.isPending) return <p role="status">의뢰를 불러오는 중…</p>;
  if (query.isError) return <p role="alert">{(query.error as Error).message}</p>;
  return (
    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside aria-label="꾸미기 의뢰 목록" className="space-y-2">
        {!orders.length && <p className="text-sm text-muted-foreground">아직 의뢰가 없습니다.</p>}
        {orders.map((o) => (
          <button key={o.id} type="button" onClick={() => setSelectedId(o.id)}
            className={cn('w-full min-w-0 rounded-lg border p-3 text-left', selected?.id === o.id ? 'border-purple-500 bg-purple-50 text-slate-900' : 'bg-card')}>
            <small className="text-xs">{STATUS_LABEL[o.status]} · {SLOT_LABEL[o.slot]} · {new Date(o.created_at).toLocaleDateString('ko-KR')}</small>
            <strong className="my-0.5 block truncate" title={o.title}>{o.title}</strong>
            <span className="block truncate text-xs">{o.owner_name ?? '학생'}</span>
          </button>
        ))}
      </aside>
      {selected ? <DecorProduction key={selected.id} order={selected} /> : <p className="rounded-lg border bg-card p-6 text-muted-foreground">의뢰를 고르세요.</p>}
    </div>
  );
}

function DecorProduction({ order }: { order: DecorOrder }) {
  const qc = useQueryClient();
  const editable = order.status === 'submitted' || order.status === 'crafting';
  const design = isDesignSlot(order.slot);
  const modelSlot = isModelSlot(order.slot);
  const [model, setModel] = useState<string>(DEVICE_MODEL_KEYS[0] ?? '');
  const [note, setNote] = useState(order.admin_note ?? '');
  const [busy, setBusy] = useState(false);
  // 색·무늬
  const patterns = order.slot === 'shell' ? SHELL_PATTERNS : order.slot === 'wallpaper' ? WALL_PATTERNS : [];
  const [main, setMain] = useState('#8b6cff');
  const [accent, setAccent] = useState('#ffd34d');
  const [pattern, setPattern] = useState<string>(patterns[0]?.value ?? '');
  const values: DecorDesign = useMemo(() => ({ main, accent, ...(patterns.length ? { pattern } : {}) }), [main, accent, pattern, patterns.length]);
  // 소품 그림
  const [file, setFile] = useState<File | null>(null);
  const [check, setCheck] = useState<string | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const uploaded = useRef<string | null>(null);
  useEffect(() => () => {
    if (uploaded.current) void decorService.removeUnused(uploaded.current).catch(() => undefined);
    setCustomDecoSprite(PREVIEW_ID, null);
  }, []);

  // 미리보기 — 색·무늬는 고를 때마다 임시 물건을 바꿔 끼운다(판 번호가 올라 미리보기가 다시 그려진다)
  useEffect(() => {
    if (!design) return;
    const item = customItemFromRow({ id: PREVIEW_ID, slot: order.slot, name: order.title, design: values });
    if (item) { registerCustomItems([item]); setPreviewReady(true); }
  }, [design, order.slot, order.title, values]);
  // 기기 — 고른 모델의 모양
  useEffect(() => {
    if (!modelSlot || !model) return;
    const item = customItemFromRow({ id: PREVIEW_ID, slot: 'device', name: order.title, design: { model } });
    if (item) { registerCustomItems([item]); setPreviewReady(true); }
  }, [modelSlot, model, order.title]);

  const pick = async (f?: File) => {
    setFile(null); setCheck(null); setPreviewReady(false);
    if (!f) return;
    if (f.type !== 'image/png') { setCheck('PNG 파일만 올릴 수 있어요.'); return; }
    if (f.size > 256 * 1024) { setCheck('256KB 이하여야 해요.'); return; }
    const url = URL.createObjectURL(f);
    try {
      const { width, height, rgba } = await readImageRgba(url);
      const r = checkDecoImage(width, height, rgba);
      if (!r.ok) { setCheck(r.reason); return; }
      registerCustomItems([{ id: PREVIEW_ID, slot: order.slot, rarity: 'legendary', name: order.title, note: '', custom: true, imagePath: 'preview' }]);
      setCustomDecoSprite(PREVIEW_ID, decoImageToBuf(width, height, rgba));
      setFile(f);
      setPreviewReady(true);
      if (uploaded.current) { await decorService.removeUnused(uploaded.current).catch(() => undefined); uploaded.current = null; }
    } catch (e) { setCheck(e instanceof Error ? e.message : '그림을 읽지 못했어요.'); } finally { URL.revokeObjectURL(url); }
  };

  const act = async (action: 'start' | 'decline' | 'deliver') => {
    if (busy) return;
    if (action === 'decline' && !window.confirm('거절하고 코인을 돌려줄까요? 학생에게 답장이 알림으로 가요.')) return;
    if (action === 'deliver' && !window.confirm('이대로 배송할까요? 학생에게 «나만의 꾸미기»가 생기고 알림이 가요.')) return;
    setBusy(true);
    try {
      const payload: Record<string, unknown> = { id: order.id, note };
      if (action === 'deliver') {
        if (design) payload.design = values;
        else if (modelSlot) {
          if (!model) throw new Error('배송할 기기 모델을 골라 주세요.');
          payload.design = { model };
        } else {
          if (!file) throw new Error('검사를 통과한 그림을 먼저 골라 주세요.');
          if (!uploaded.current) uploaded.current = await decorService.upload(order.id, file);
          payload.image_path = uploaded.current;
        }
      }
      await decorService.write(action, payload);
      if (action === 'deliver') uploaded.current = null; // 이제 물건이 가리키므로 지우지 않는다
      toast.success(action === 'start' ? '만드는 중으로 표시했어요' : action === 'deliver' ? '배송했어요' : '거절하고 코인을 돌려줬어요');
      void qc.invalidateQueries({ queryKey: ['tama-decor', 'admin'] });
    } catch (e) { toast.error(e instanceof Error ? e.message : '처리하지 못했어요.'); } finally { setBusy(false); }
  };

  const prompt = design ? null : modelSlot ? deviceDevRequest(order.title, order.prompt) : decorProductionPrompt(order.slot, order.title, order.prompt);
  return (
    <article className="space-y-4 rounded-lg border bg-card p-4" data-tama-admin-decor={order.id}>
      <header>
        <p className="text-xs text-muted-foreground">{STATUS_LABEL[order.status]} · {SLOT_LABEL[order.slot]} · {order.owner_name ?? '학생'} · {order.charged_coins}코인{order.refunded_coins ? ` (환불 ${order.refunded_coins})` : ''}</p>
        <h2 className="text-lg font-semibold">{order.title}</h2>
        <p className="mt-1 whitespace-pre-wrap text-sm">{order.prompt}</p>
      </header>
      {editable && (
        <>
          {design ? (
            <div className="flex flex-wrap items-end gap-4" data-decor-designer>
              <label className="text-sm">주 색<input type="color" value={main} onChange={(e) => setMain(e.target.value)} className="mt-1 block h-10 w-16 cursor-pointer rounded border" /></label>
              <label className="text-sm">보조 색<input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="mt-1 block h-10 w-16 cursor-pointer rounded border" /></label>
              {patterns.length > 0 && (
                <label className="text-sm">무늬
                  <select value={pattern} onChange={(e) => setPattern(e.target.value)} className="mt-1 block h-10 rounded border bg-background px-2 text-sm">
                    {patterns.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </label>
              )}
              <p className="basis-full text-xs text-muted-foreground">나머지 색(밤 색 · 테 · 버튼)은 학생 화면과 같은 규칙으로 정해져요. 미리보기가 학생이 받을 모습이에요.</p>
            </div>
          ) : modelSlot ? (
            <div className="space-y-3" data-decor-device>
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">개발 요청서(새 3D 기기는 코드로 만들어요)</p>
                  <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(prompt!); toast.success('복사했어요'); }}>복사</Button>
                </div>
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">{prompt}</pre>
              </div>
              <label className="block text-sm">
                배송할 모델(배포된 기기만 나와요)
                <select value={model} onChange={(e) => setModel(e.target.value)} className="mt-1 block h-10 rounded border bg-background px-2 text-sm">
                  {DEVICE_MODEL_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
              <p className="text-xs text-muted-foreground">새 모델이 아직 목록에 없으면 «만들기 시작 표시»만 해 두고, 개발·배포 뒤에 배송하세요. 이미 있는 모델로 배송하면 학생은 그 기기를 이름만 다르게 받아요.</p>
            </div>
          ) : (
            <>
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">제작 지시문</p>
                  <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(prompt!); toast.success('복사했어요'); }}>복사</Button>
                </div>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">{prompt}</pre>
              </div>
              <label className="block text-sm">
                소품 그림(PNG · 8~24px · 배경 투명)
                <input type="file" accept="image/png" className="mt-1 block text-sm" onChange={(e) => void pick(e.target.files?.[0])} />
              </label>
              {check && <p role="alert" className="text-sm text-rose-600">{check}</p>}
            </>
          )}
          {previewReady && (
            <figure className="flex flex-col items-center gap-1" aria-label="받을 모습 미리보기">
              <PrizePreview itemId={PREVIEW_ID} className="h-48 w-auto" />
              <figcaption className="text-xs text-muted-foreground">받을 모습 미리보기</figcaption>
            </figure>
          )}
          <label className="block text-sm">
            학생에게 남길 말(거절은 필수)
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} className="mt-1 w-full rounded border bg-background p-2 text-sm" />
          </label>
          <div className="flex flex-wrap gap-2">
            {order.status === 'submitted' && <Button variant="outline" disabled={busy} onClick={() => void act('start')}>만들기 시작 표시</Button>}
            <Button disabled={busy || (!design && !modelSlot && !file) || (modelSlot && !model)} onClick={() => void act('deliver')}>배송</Button>
            <Button variant="outline" className="text-rose-600" disabled={busy || note.trim().length < 2} onClick={() => void act('decline')}>거절(환불)</Button>
          </div>
        </>
      )}
      {!editable && order.admin_note && <p className="text-sm">남긴 말: {order.admin_note}</p>}
    </article>
  );
}
