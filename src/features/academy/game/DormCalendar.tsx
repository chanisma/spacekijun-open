import { offsetDay } from './dormitoryModel';
import css from './dormitory.module.css';

export function DormCalendar({ day, disabled, onChange }: { day: string; disabled: boolean; onChange: (day: string) => void }) {
  const first = `${day.slice(0, 7)}-01`;
  const start = offsetDay(first, -new Date(`${first}T12:00:00Z`).getUTCDay());
  function month(delta: number) {
    const next = new Date(`${first}T12:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + delta);
    onChange(next.toISOString().slice(0, 10));
  }
  return <section className={css.calendar} aria-label="월간 달력">
    <div className={css.month}><button aria-label="이전 달" disabled={disabled} onClick={() => month(-1)}>‹</button><h3>{Number(day.slice(0, 4))}년 {Number(day.slice(5, 7))}월</h3><button aria-label="다음 달" disabled={disabled} onClick={() => month(1)}>›</button></div>
    <div className={css.days}>{['일', '월', '화', '수', '목', '금', '토'].map(d => <small key={d}>{d}</small>)}{Array.from({ length: 42 }, (_, i) => offsetDay(start, i)).map(date => <button key={date} aria-label={`${date} 선택`} aria-pressed={date === day} data-outside={date.slice(0, 7) !== day.slice(0, 7)} disabled={disabled} onClick={() => onChange(date)}>{Number(date.slice(-2))}</button>)}</div>
    <label className={css.dateInput}>계획 날짜<input aria-label="계획 날짜" type="date" value={day} disabled={disabled} onChange={e => onChange(e.target.value)} /></label>
  </section>;
}
