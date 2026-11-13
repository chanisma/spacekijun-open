import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/AuthProvider';
import { searchPreviewStudents } from './previewService';
import { GameModal } from './GameModal';
import styles from './game.module.css';

export function AdminPreviewControl() {
  const { profile } = useAuth();
  return profile?.role === 'admin' ? <PreviewSelector /> : null;
}
function PreviewSelector() {
  const { profile, user, viewAsStudentId, setViewAsStudentId, setViewAsStudent } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const students = useQuery({ queryKey: ['academy-preview-students', user?.id, search], queryFn: ({ signal }) => searchPreviewStudents(profile?.role, search, signal), enabled: open && profile?.role === 'admin' && search.length >= 2, retry: false });
  return <>
    <button className={styles.mapButton} onClick={() => setOpen(true)}>{viewAsStudentId ? `학생 미리보기 변경 · ${viewAsStudentId}` : '관리자 · 학생 시점 미리보기'}</button>
    {open && <GameModal title="학생 시점 미리보기" onClose={() => setOpen(false)} className={styles.adminPreview}>
      <span className={styles.kicker}>ADMIN · STUDENT PREVIEW</span><h2>학생 시점 미리보기</h2>
      <p>선택한 학생의 별자리와 연구 수첩을 읽기 전용으로 확인합니다. AI 요청과 실제 학생 기록 저장은 실행하지 않습니다.</p>
      {viewAsStudentId && <p>현재 학생: {viewAsStudentId} <button className={styles.textButton} onClick={() => { setViewAsStudentId(null); setViewAsStudent(false); setOpen(false); }}>미리보기 해제</button></p>}
      <form onSubmit={event => { event.preventDefault(); setSearch(input.trim()); }}><label>학생 이름 또는 학번<input value={input} maxLength={50} onChange={event => setInput(event.target.value)} placeholder="두 글자 이상 입력" /></label><button className={styles.goldButton} disabled={input.trim().length < 2}>학생 찾기</button></form>
      {search.length >= 2 && students.isPending && <p role="status">학생을 찾고 있습니다…</p>}
      {students.isError && <p role="alert">학생을 찾지 못했습니다. <button onClick={() => void students.refetch()}>다시 시도</button></p>}
      {students.data && !students.data.length && <p>일치하는 학생이 없습니다.</p>}
      <ul className={styles.previewResults}>{students.data?.map(student => <li key={student.id}><button onClick={() => { setViewAsStudentId(student.id); setViewAsStudent(true); setOpen(false); }}>{student.name} · {student.id}<small>{student.grade ?? '—'}학년 {student.class_num ?? '—'}반 · 이 학생으로 미리보기</small></button></li>)}</ul>
    </GameModal>}
  </>;
}
