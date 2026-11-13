import { useRef, useState } from 'react';
import styles from './game.module.css';

export function ResearchDelete({ label, disabled, onDelete, onDeleted }: {
  label: string; disabled?: boolean; onDelete: () => Promise<unknown>; onDeleted: () => Promise<unknown>;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  async function remove() {
    if (disabled || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await onDelete(); await onDeleted(); setConfirm(false); }
    catch { setError('지우지 못했어요. 기록을 확인한 뒤 다시 시도해 주세요.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div>
    {confirm ? <div role="group" aria-label={`${label} 삭제 확인`}><p>이 {label}을 지울까요? 지운 내용은 되돌릴 수 없어요.{label === '탐구 기록' && ' 설계의 별도 지도에서 사라지며, 연결했던 실제 활동 기록은 남아요.'}</p><button className={styles.mapButton} disabled={disabled || busy} onClick={() => void remove()}>{busy ? '지우는 중…' : '삭제 확정'}</button><button className={styles.textButton} disabled={busy} onClick={() => { setConfirm(false); setError(''); }}>남겨 두기</button></div> : <button className={styles.textButton} disabled={disabled || busy} onClick={() => setConfirm(true)}>{label} 지우기</button>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
