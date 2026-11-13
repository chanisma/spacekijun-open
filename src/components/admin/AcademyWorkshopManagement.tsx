import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { fetchWorkshopOrders, removeUnusedWorkshopImage, uploadWorkshopImage, validateWorkshopImage, writeWorkshopOrder, type WorkshopOrder } from '@/features/academy/game/workshopService';
import { workshopPrompt, workshopReference, workshopSlots, workshopStatuses } from '@/features/academy/game/workshopModel';

export function AcademyWorkshopManagement() {
  const [params, setParams] = useSearchParams();
  const orderId = params.get('order');
  const [status, setStatus] = useState(''); const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = useQuery({ queryKey: ['academy-workshop', 'admin', status, offset, orderId], queryFn: () => fetchWorkshopOrders({ status: status || null, offset, orderId }), refetchInterval: 30_000, retry: 1 });
  const selected = query.data?.orders.find(o => o.id === selectedId) ?? (orderId ? query.data?.orders[0] : undefined);
  return <section aria-label="공방 주문 관리" className="space-y-5">
    <header><h1 className="text-2xl font-semibold">아카데미 공방 주문</h1><p className="mt-2 text-sm text-muted-foreground">학생의 주문서를 확인하고 참고 원화로 이미지를 제작한 뒤, 완성본을 등록하여 배송합니다.</p></header>
    <div className="flex flex-wrap items-center gap-3"><label className="text-sm">주문 상태 <select className="rounded border bg-background p-2" value={status} disabled={!!orderId} onChange={e => { setStatus(e.target.value); setOffset(0); setSelectedId(null); }}><option value="">전체</option>{Object.entries(workshopStatuses).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label><Button variant="outline" onClick={() => void query.refetch()}>새로고침</Button>{orderId && <Button onClick={() => { setSelectedId(null); setParams(previous => { const next = new URLSearchParams(previous); next.delete('order'); return next; }); }}>전체 주문으로</Button>}</div>
    {query.isPending ? <p role="status">주문을 불러오는 중…</p> : query.isError ? <p role="alert">{query.error.message}</p> : <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside aria-label="공방 주문 목록" className="space-y-2">
        {!query.data?.orders.length && <p>이 조건의 주문이 없습니다.</p>}
        {query.data?.orders.map(o => <button key={o.id} className={`w-full rounded-lg border p-4 text-left ${selected?.id === o.id ? 'border-purple-500 bg-purple-50 text-slate-900' : 'bg-card'}`} onClick={() => setSelectedId(o.id)}><small>{workshopStatuses[o.status]} · {workshopSlots[o.slot]}</small><strong className="my-1 block">{o.title}</strong><span className="block text-xs">{o.student_name || '학생'} {o.student_code || ''} · {new Date(o.created_at).toLocaleDateString('ko-KR')}</span></button>)}
        {!orderId && <div className="flex gap-2"><Button variant="outline" disabled={!offset} onClick={() => { setOffset(Math.max(0, offset - 50)); setSelectedId(null); }}>이전</Button><Button variant="outline" disabled={offset + 50 >= (query.data?.total ?? 0)} onClick={() => { setOffset(offset + 50); setSelectedId(null); }}>다음</Button></div>}
      </aside>
      {selected ? <WorkshopProduction key={selected.id} order={selected} /> : <p className="rounded-lg border bg-card p-6 text-muted-foreground">제작할 주문서를 선택하세요.</p>}
    </div>}
  </section>;
}

function WorkshopProduction({ order }: { order: WorkshopOrder }) {
  const cache = useQueryClient();
  const [note, setNote] = useState(order.admin_note);
  const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState('');
  const [checked, setChecked] = useState(false); const [confirm, setConfirm] = useState<'deliver' | 'decline' | null>(null);
  const [busy, setBusy] = useState(false); const lock = useRef(false); const uploaded = useRef<string | null>(null);
  const selection = useRef(0);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const editable = order.status === 'submitted' || order.status === 'crafting';
  const prompt = workshopPrompt(order.slot, order.prompt);
  useEffect(() => { if (!file) { setPreview(''); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  useEffect(() => () => { selection.current++; if (uploaded.current) void removeUnusedWorkshopImage(uploaded.current).catch(() => undefined); }, []);
  async function selectFile(next?: File) {
    const attempt = ++selection.current;
    setError(''); setChecked(false); setConfirm(null);
    if (!next) return;
    try {
      await validateWorkshopImage(next, order.slot);
      if (attempt !== selection.current) return;
      if (uploaded.current) { await removeUnusedWorkshopImage(uploaded.current); uploaded.current = null; }
      setFile(next);
    } catch (e) { if (attempt === selection.current) { setFile(null); setError(e instanceof Error ? e.message : '이미지를 확인하지 못했습니다.'); } }
  }
  async function act(action: 'start' | 'deliver' | 'decline') {
    if (lock.current || !editable) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      if (action === 'deliver') {
        if (!file || !checked) throw new Error('완성 이미지와 검수 항목을 확인해 주세요.');
        if (!uploaded.current) uploaded.current = await uploadWorkshopImage(order.id, file);
      }
      await writeWorkshopOrder(action, { id: order.id, note, image_path: uploaded.current });
      if (action === 'deliver') uploaded.current = null;
      setConfirm(null); setMessage(action === 'deliver' ? '학생의 배송함에 선물 상자를 보냈습니다.' : action === 'decline' ? '학생에게 공방의 답장을 보냈습니다.' : '제작을 시작했습니다.');
      await Promise.all([cache.invalidateQueries({ queryKey: ['academy-workshop'] }), cache.invalidateQueries({ queryKey: ['notifications'] })]);
    } catch (e) { setError(e instanceof Error ? e.message : '처리하지 못했습니다.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section aria-label="공방 제작과 배송" className="min-w-0 space-y-5 rounded-lg border bg-card p-5">
    <header><small>{workshopStatuses[order.status]} · {workshopSlots[order.slot]}</small><h2 className="mt-1 text-xl font-semibold">{order.title}</h2><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">{order.prompt}</p></header>
    <div className="grid gap-4 md:grid-cols-2">
      <figure><img className="h-56 w-full rounded border bg-slate-100 object-contain" src={`/images/academy-game/${workshopReference[order.slot]}.png`} alt="제작 기준 원화" /><figcaption className="mt-2 text-sm"><a className="underline" href={`/images/academy-game/${workshopReference[order.slot]}.png`} download>참고 원화 내려받기</a></figcaption></figure>
      <div className="space-y-3"><label className="block text-sm">제작용 프롬프트<textarea className="mt-2 h-48 w-full rounded border bg-background p-3 text-xs leading-5" value={prompt} readOnly /></label><Button variant="outline" onClick={() => void navigator.clipboard.writeText(prompt).then(() => setMessage('제작용 프롬프트를 복사했습니다.'), () => setError('복사하지 못했습니다. 프롬프트를 직접 선택해 복사해 주세요.'))}>프롬프트 복사</Button></div>
    </div>
    {editable ? <>
      {order.status === 'submitted' && <Button disabled={busy} onClick={() => void act('start')}>제작 시작 표시</Button>}
      <label className="block text-sm">완성 PNG 등록<input className="mt-2 block w-full rounded border p-3" type="file" accept="image/png" disabled={busy} onChange={e => void selectFile(e.target.files?.[0])} /></label>
      <p className="text-xs text-muted-foreground">최대 10MB · {order.slot === 'room' ? '가로 3:2 (권장 1536×1024)' : '세로 2:3 (권장 1024×1536), 실제 투명 배경'}. 등록한 이미지를 확인한 뒤 배송을 확정합니다.</p>
      {preview && <img className="h-80 w-full rounded border bg-gradient-to-br from-purple-100 to-slate-300 object-contain" src={preview} alt="배송할 완성 이미지 미리보기" />}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={busy || !file} checked={checked} onChange={e => { setChecked(e.target.checked); setConfirm(null); }} />{order.slot === 'room' ? '기존 방의 구도와 가구 위치, 로판 화풍을 유지했는지 확인했습니다.' : '기준 원화의 얼굴·체형과 인물의 정체성을 유지하고, 의상·헤어스타일은 주문 요청에 맞으며, 손발과 머리가 잘리지 않고 배경이 투명한지 확인했습니다.'}</label>
      <label className="block text-sm">학생에게 보낼 편지<textarea className="mt-2 min-h-24 w-full rounded border bg-background p-3" value={note} maxLength={1000} disabled={busy} onChange={e => setNote(e.target.value)} /></label>
      <div className="flex flex-wrap gap-3"><Button disabled={busy || !file || !checked} onClick={() => setConfirm('deliver')}>배송 준비</Button><Button variant="outline" disabled={busy || note.trim().length < 2} onClick={() => setConfirm('decline')}>제작 불가 답장</Button></div>
      {confirm && <div className="space-y-3 rounded border border-purple-300 bg-purple-50 p-4 text-slate-900"><p className="text-sm">{confirm === 'deliver' ? `이 작품을 배송하고 진열대에 ${order.sale_price ?? 35}코인으로 공개할까요? 의뢰자는 무료로 수령하고, 다른 학생이 구매할 때마다 의뢰자에게 10코인이 지급됩니다.` : '이유를 담은 편지를 보내고 주문을 마감할까요? 결제한 제작비는 전액 환불됩니다.'}</p><Button disabled={busy} onClick={() => void act(confirm)}>{busy ? '전달 중…' : confirm === 'deliver' ? '학생에게 배송 확정' : '답장 보내기 확정'}</Button><Button className="ml-2" variant="outline" disabled={busy} onClick={() => setConfirm(null)}>더 살펴보기</Button></div>}
    </> : <>{order.image_url && <img className="h-80 w-full rounded border bg-slate-100 object-contain" src={order.image_url} alt="배송 완료 이미지" />}<p className="whitespace-pre-wrap text-sm">{order.admin_note}</p></>}
    {(error || message) && <p role={error ? 'alert' : 'status'} className={`rounded border p-3 text-sm ${error ? 'border-red-300 text-red-700' : 'border-green-300 text-green-700'}`}>{error || message}</p>}
  </section>;
}
