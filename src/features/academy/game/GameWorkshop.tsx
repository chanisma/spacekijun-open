import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchWorkshopOrders, writeWorkshopOrder } from './workshopService';
import { validWorkshopDraft, workshopEconomy, workshopSlots, workshopStatuses, type WorkshopSlot } from './workshopModel';
import css from './workshop.module.css';

export function GameWorkshop({ userId, studentId, readOnly, coins, orderId, onWardrobe, onAll }: { userId: string; studentId: string | null; readOnly: boolean; coins: number; orderId: string | null; onWardrobe: () => void; onAll: () => void }) {
  const cache = useQueryClient();
  const [offset, setOffset] = useState(0);
  const query = useQuery({ queryKey: ['academy-workshop', userId, readOnly, studentId, offset, orderId], queryFn: () => fetchWorkshopOrders({ own: !readOnly, offset, studentCode: readOnly ? studentId : null, orderId: readOnly ? null : orderId }), enabled: !!userId && (!readOnly || !!studentId), refetchInterval: 30_000, retry: 1 });
  const salePrice = workshopEconomy.salePrice;
  const [confirmOrder, setConfirmOrder] = useState(false);
  const [title, setTitle] = useState(''); const [prompt, setPrompt] = useState(''); const [slot, setSlot] = useState<WorkshopSlot>('ria');
  const [busy, setBusy] = useState(false); const lock = useRef(false); const token = useRef(crypto.randomUUID());
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [opened, setOpened] = useState<string | null>(null);
  const [cancel, setCancel] = useState<string | null>(null);
  async function write(action: string, payload: Record<string, unknown>) {
    if (readOnly || lock.current) return false;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const order = await writeWorkshopOrder(action, payload);
      if (action === 'submit') { setConfirmOrder(false); setTitle(''); setPrompt(''); token.current = crypto.randomUUID(); setMessage(`${workshopEconomy.orderCost}코인으로 주문서를 맡겼어요. 완성 작품은 진열대에도 올라가요.`); }
      if (action === 'receive') setOpened(order.id);
      await Promise.all([cache.invalidateQueries({ queryKey: ['academy-workshop'] }), cache.invalidateQueries({ queryKey: ['academy-dormitory', userId] })]);
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : '주문서를 전달하지 못했어요.'); return false; }
    finally { lock.current = false; setBusy(false); }
  }
  return <div className={css.student}>
    <form className={css.letter} onSubmit={e => { e.preventDefault(); if (validWorkshopDraft(title, prompt) && coins >= workshopEconomy.orderCost) setConfirmOrder(true); }}>
      <span className={css.eyebrow}>ROYAL ATELIER · 나만의 주문서</span><h3>상상한 모습을 들려주세요</h3>
      <p>원하는 의상, 머리 모양이나 방의 분위기를 글로 적으면 장인이 제작한 선물을 보내 드려요.</p>
      <label>어떤 선물을 만들까요?<select value={slot} disabled={readOnly || busy} onChange={e => { setSlot(e.target.value as WorkshopSlot); setConfirmOrder(false); }}>{Object.entries(workshopSlots).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>주문 이름<input value={title} onChange={e => { setTitle(e.target.value); setConfirmOrder(false); }} minLength={2} maxLength={100} required disabled={readOnly || busy} placeholder="달빛을 수놓은 산책복" /></label>
      <label>장인에게 전할 프롬프트<textarea value={prompt} onChange={e => { setPrompt(e.target.value); setConfirmOrder(false); }} minLength={20} maxLength={2000} required disabled={readOnly || busy} placeholder={slot === 'room' ? '침구는 짙은 남색으로 바꾸고, 커튼에는 은빛 별 자수를 넣어 주세요.' : '머리는 반묶음으로 바꾸고, 남색 벨벳 의상에 은빛 별 자수를 넣어 주세요.'} /></label>
      <small>{prompt.trim().length} / 2,000자 · 20자 이상</small>
      <p>{slot === 'room' ? '방의 기본 구조를 유지하며 침구와 장식의 분위기를 바꿔요.' : '캐릭터의 얼굴은 유지하면서 의상과 머리 모양을 바꿀 수 있어요. 원하는 머리 길이, 앞머리, 묶거나 땋는 방식도 적어 주세요.'}</p>
      <p>보유 코인 {coins} · 맞춤 제작 {workshopEconomy.orderCost}코인</p>
      <p>완성된 작품은 진열대에 {salePrice}코인으로 올라가요. 다른 학생이 구매하면 의뢰한 나에게 {workshopEconomy.commission}코인이 지급돼요. 내 작품은 배송함에서 추가 비용 없이 받을 수 있어요.</p>
      <small>제작 전 취소·제작 불가 시 제작비 전액 환불 · 대기 주문은 세 개까지</small>
      {coins < workshopEconomy.orderCost && <p>맞춤 제작에 필요한 코인이 {workshopEconomy.orderCost - coins}코인 부족해요.</p>}
      <button disabled={readOnly || busy || !validWorkshopDraft(title, prompt) || coins < workshopEconomy.orderCost}>{busy ? '공방에 전하는 중…' : '밀랍 인장을 찍어 제출'}</button>
      {confirmOrder && <div className={css.confirm} role="group" aria-label="맞춤 제작 비용 확인"><p>{workshopEconomy.orderCost}코인을 사용하여 이 주문을 맡길까요? 진열 가격은 {salePrice}코인이에요. 작품 이미지와 이름은 다른 학생에게 공개되며, 주문 프롬프트와 편지는 공개되지 않아요.</p><button type="button" disabled={readOnly || busy || coins < workshopEconomy.orderCost} onClick={() => void write('submit', { title, prompt, slot, client_token: token.current, confirm_cost: workshopEconomy.orderCost, publish_design: true, sale_price: salePrice })}>{workshopEconomy.orderCost}코인으로 의뢰 확정</button><button type="button" disabled={busy} onClick={() => setConfirmOrder(false)}>더 살펴보기</button></div>}
    </form>
    <section className={css.deliveries} aria-label="나의 맞춤 주문">
      <h3>공방에서 오는 소식</h3>{orderId && <button onClick={onAll}>전체 주문 보기</button>}
      {readOnly && !studentId ? <p>미리 볼 학생을 먼저 선택해 주세요.</p> : query.isPending ? <p role="status">주문서를 찾아오는 중…</p> : query.isError ? <div role="alert"><p>{query.error.message}</p><button onClick={() => void query.refetch()}>다시 불러오기</button></div> : <>
        {!query.data?.orders.length && <p>아직 도착한 소식이 없어요. 나만의 첫 주문서를 맡겨 보세요.</p>}
        {query.data?.orders.map(o => <article key={o.id} className={css.order} data-status={o.status}>
          <span>{workshopStatuses[o.status]} · {workshopSlots[o.slot]}</span><h4>{o.title}</h4><time>{new Date(o.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</time>
          <details><summary>내가 맡긴 주문서 펼치기</summary><p>{o.prompt}</p></details>
          <small>{o.charged_coins ?? 0}코인 결제{o.refunded_coins ? ` · ${o.refunded_coins}코인 환불 완료` : ''}</small>
          {o.item_id && <p>진열 가격 {o.sale_price ?? workshopEconomy.salePrice}코인 · 판매 {o.commission_count ?? 0}회 · 받은 커미션 {o.commission_coins ?? 0}코인</p>}
          {o.admin_note && <blockquote>공방의 편지<p>{o.admin_note}</p></blockquote>}
          {o.status === 'delivered' && <button className={css.parcel} disabled={busy || readOnly} onClick={() => void write('receive', { id: o.id })}><span aria-hidden="true">✦</span>선물 상자 열기</button>}
          {o.status === 'received' && <div className={opened === o.id ? css.reveal : undefined}>{o.image_url && <img src={o.image_url} alt={o.title} />}<p>당신만을 위한 작품이 옷장에 보관되어 있어요.</p><button onClick={onWardrobe}>옷장에서 적용하기</button></div>}
          {o.status === 'submitted' && (cancel === o.id ? <div><p>이 주문을 거두어들일까요? 결제한 제작비는 전액 돌려드려요.</p><button disabled={busy || readOnly} onClick={async () => { if (await write('cancel', { id: o.id })) setCancel(null); }}>주문 취소 확정</button><button disabled={busy} onClick={() => setCancel(null)}>남겨 두기</button></div> : <button disabled={busy || readOnly} onClick={() => setCancel(o.id)}>주문 취소</button>)}
        </article>)}
        {!orderId && <nav aria-label="주문 목록 페이지"><button disabled={!offset || busy} onClick={() => setOffset(Math.max(0, offset - 50))}>이전 주문</button><button disabled={offset + 50 >= (query.data?.total ?? 0) || busy} onClick={() => setOffset(offset + 50)}>다음 주문</button></nav>}
      </>}
    </section>
    {(error || message) && <p className={css.feedback} role={error ? 'alert' : 'status'}>{error || message}</p>}
  </div>;
}
