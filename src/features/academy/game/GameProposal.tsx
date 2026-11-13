import { useRef, useState } from 'react';
import { useAcademicTerm } from '@/hooks/useAcademicTerm';
import { ACTIVITY_AREA_GROUPS, areaForGroup, getAreaGroupLabel, type ActivityAreaGroup } from '@/features/creative-activities/utils/activityLabels';
import { parseCareerFields } from '@/features/creative-activities/utils/categories';
import type { ActivityProposalInput } from '@/features/creative-activities/types';
import { CharacterPanel } from './CharacterPanel';
import styles from './game.module.css';

export function GameProposal({ studentCode, onSubmit, onClose, reduced }: { studentCode: string | null; onSubmit: (input: ActivityProposalInput) => Promise<void>; onClose: () => void; reduced: boolean }) {
  const { data: term } = useAcademicTerm();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [area, setArea] = useState<ActivityAreaGroup>('club');
  const [careers, setCareers] = useState('');
  const [year, setYear] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const targetYear = year ?? String((term?.year ?? new Date().getFullYear()) + 1);
  return <CharacterPanel npc="librarian" title="도서관에 새 이야기 제안하기" onClose={() => { if (!saving.current) onClose(); }} reduced={reduced} className={styles.proposalScene}>
    <span className={styles.kicker}>ELIAN · A NEW CHAPTER</span>
    <h2>리아의 다음 이야기를 들려줘</h2>
    <p>해보고 싶은 활동과 그 이유를 적어 줘. 도서관의 제안함에 보관하고, 선생님이 함께 살펴볼 수 있도록 전할게.</p>
    <form onSubmit={async event => {
      event.preventDefault();
      if (saving.current || !studentCode || !title.trim() || !body.trim()) return;
      saving.current = true; setBusy(true); setError('');
      try {
        await onSubmit({ title: title.trim(), body: body.trim(), area: areaForGroup(area), career_fields: parseCareerFields(careers), target_year: targetYear ? Number(targetYear) : null, parent_activity_id: null, proposer_student_code: studentCode });
      } catch (reason) { setError(reason instanceof Error ? reason.message : '제안서를 보관하지 못했어. 다시 건네주겠니?'); }
      finally { saving.current = false; setBusy(false); }
    }}>
      <fieldset disabled={busy}>
        <label>새 이야기의 제목<input required maxLength={200} value={title} placeholder="예: 학교 숲의 새 소리 기록하기" onChange={e => setTitle(e.target.value)} /></label>
        <label>해보고 싶은 활동과 이유<textarea required rows={4} value={body} placeholder="무엇을 해 보고 싶은지, 왜 궁금해졌는지 적어 주세요." onChange={e => setBody(e.target.value)} /></label>
        <label>활동 영역<select value={area} onChange={e => setArea(e.target.value as ActivityAreaGroup)}>{ACTIVITY_AREA_GROUPS.map(group => <option key={group} value={group}>{getAreaGroupLabel(group)}</option>)}</select></label>
        <label>희망 학년도<input type="number" min={2000} max={2100} value={targetYear} onChange={e => setYear(e.target.value)} /></label>
        <label>진로와 분야 · 쉼표로 구분<input value={careers} placeholder="예: 생명과학, 환경공학" onChange={e => setCareers(e.target.value)} /></label>
        {/* 단추가 왜 눌리지 않는지 말한다 — 종전엔 흐린 단추만 있어 무엇이 빠졌는지 알 수 없었다(2026-10-03 UI 점검). */}
        {!busy && studentCode && (!title.trim() || !body.trim()) && <p className={styles.formHint}>제목과 «해보고 싶은 활동과 이유»를 적으면 건넬 수 있어.</p>}
        <button className={styles.goldButton} disabled={!studentCode || !title.trim() || !body.trim()} type="submit">{busy ? '제안함에 보관하는 중…' : '엘리안에게 제안서 건네기'}</button>
      </fieldset>
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </form>
  </CharacterPanel>;
}
