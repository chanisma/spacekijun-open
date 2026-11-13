import { useState } from 'react';
import { GameModal } from './GameModal';
import { gameAsset } from './gameAsset';
import type { CollectedIllustration } from './illustrationCollection';
import css from './illustrationGallery.module.css';

export function IllustrationGallery({ illustrations, loading, error, preview, reduced, onClose, onRetry }: {
  illustrations: CollectedIllustration[]; loading: boolean; error: boolean; preview: boolean; reduced: boolean; onClose: () => void; onRetry: () => void;
}) {
  const [group, setGroup] = useState('전체');
  const [selected, setSelected] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const visible = illustrations.filter(item => group === '전체' || item.group === group);
  const index = visible.findIndex(item => item.asset === selected), current = visible[index];
  function move(offset: number) {
    const next = visible[index + offset];
    if (next) { setSelected(next.asset); setFailed(null); }
  }
  return <GameModal title="수집한 삽화" onClose={onClose} reduced={reduced} className={css.gallery}>
    <div className={css.layout} onKeyDown={event => {
      if (!current || (event.target instanceof HTMLElement && event.target.tagName === 'SELECT')) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1); }
    }}>
      <header className={css.header}><small>RIA'S ILLUSTRATED MEMORIES</small><h2>{current ? current.title : '수집한 삽화'}</h2><p>{current ? `${current.group} · ${index + 1} / ${visible.length}` : `${illustrations.length}장의 추억이 모였어요.`}</p></header>
      {loading ? <p role="status">리아의 추억을 펼치고 있어요…</p> : error ? <div role="alert"><p>삽화 수집 기록을 불러오지 못했어요.</p><button className={css.control} onClick={onRetry}>다시 펼치기</button></div> : current ? <>
        <div className={css.art}>{failed === current.asset ? <div role="alert"><p>이 삽화를 불러오지 못했어요.</p><button className={css.control} onClick={() => setFailed(null)}>그림 다시 불러오기</button></div> : <img key={current.asset} src={gameAsset(current.asset)} alt={current.caption} onError={() => setFailed(current.asset)} />}</div>
        <footer className={css.viewerControls}><button className={css.control} onClick={() => setSelected(null)}>← 삽화 목록</button><nav aria-label="수집 삽화 넘기기"><button className={css.control} disabled={index <= 0} onClick={() => move(-1)}>← 이전 삽화</button><button className={css.control} disabled={index === visible.length - 1} onClick={() => move(1)}>다음 삽화 →</button></nav></footer>
      </> : <>
        {illustrations.length ? <><nav className={css.filters} aria-label="삽화 분류">{['전체', ...new Set(illustrations.map(item => item.group))].map(label => <button className={css.control} key={label} aria-pressed={group === label} onClick={() => setGroup(label)}>{label}</button>)}</nav><div className={css.grid}>{visible.map(item => <button className={css.card} key={item.asset} onClick={() => { setSelected(item.asset); setFailed(null); }}><img src={gameAsset(item.asset)} alt="" loading="lazy" /><span><small>{item.group}</small><strong>{item.title}</strong><em>삽화 펼치기 →</em></span></button>)}</div></> : <div className={css.empty}><span aria-hidden="true">✧</span><h3>아직 첫 삽화를 기다리고 있어요.</h3><p>이야기를 이어가면 만난 장면이 이곳에 모여요.</p></div>}
        <p className={css.note}>{preview ? '선택한 학생의 챕터 진행 기록으로 모은 삽화입니다.' : '프롤로그와 챕터 진행 기록으로 모은 장면을 다시 감상해 보세요.'}</p>
      </>}
    </div>
  </GameModal>;
}
