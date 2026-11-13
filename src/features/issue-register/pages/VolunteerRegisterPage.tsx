import { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { IssueRegisterShell } from '../components/IssueRegisterShell';
import { IssueLedger } from '../components/IssueLedger';
import { IssueCreateDialog } from '../components/IssueCreateDialog';
import { ClubActivityEditDialog } from '../components/ClubActivityEditDialog';
import { ClubExportPreviewDialog } from '../components/ClubExportPreviewDialog';
import { VolunteerExportDialog } from '../components/VolunteerExportDialog';
import { useIssues } from '../hooks/useIssues';
import { downloadClubHwpx } from '../hwpx/generateClubHwpx';
import { downloadPersonalHwpx, downloadPersonalHwpxBatch } from '../hwpx/generatePersonalHwpx';
import type { ClassFilter } from '../hwpx/generateVolunteerHwpx';
import type { PersonalBatch } from '../components/IssueLedger';
import type { DocType, DocumentIssue } from '../types';

// 발급 다이얼로그가 다루는 봉사 유형 (단체/동아리/개인). invalidate는 useIssues가 폭넓게 처리.
const VOLUNTEER_TYPES: DocType[] = ['volunteer_personal', 'volunteer_class', 'volunteer_club'];
// '전체'는 doc_type 구분 없이 세 유형을 한 목록에 합쳐 보여주는 가상 탭.
type VolunteerTab = 'all' | 'volunteer_class' | 'volunteer_club' | 'volunteer_personal';

const TABS: { value: VolunteerTab; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'volunteer_class', label: '단체' },
  { value: 'volunteer_club', label: '동아리' },
  { value: 'volunteer_personal', label: '개인' },
];

export function VolunteerRegisterPage() {
  const [tab, setTab] = useState<VolunteerTab>('volunteer_class');
  // 발급/수정 다이얼로그 (단체·동아리·개인 공통)
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentIssue | null>(null);
  const [classScope, setClassScope] = useState<{ grade: number; cls: number } | undefined>(undefined);
  // 동아리 활동 내용 작성 (대장 아코디언 행)
  const [clubActivityTarget, setClubActivityTarget] = useState<{ issue: DocumentIssue; clubId: string } | null>(null);
  // 동아리 확인서 다운로드 미리보기 (학생×일자 매트릭스 + 제외)
  const [clubExportTarget, setClubExportTarget] = useState<{ issue: DocumentIssue; clubId: string } | null>(null);
  // 단체 다운로드 미리보기 (filter 없으면 통합, 있으면 반별)
  const [exportTarget, setExportTarget] = useState<{ issue: DocumentIssue; filter?: ClassFilter } | null>(null);

  // 현재 탭이 다루는 doc_type 집합. '전체'는 세 유형을 한 목록에 합친다.
  const docTypes: DocType[] = tab === 'all' ? VOLUNTEER_TYPES : [tab];
  // 헤더 통계용 (동일 queryKey라 ledger와 캐시 공유)
  const { issues } = useIssues(docTypes);

  const isClubTab = tab === 'volunteer_club';
  // 행별 전개 핸들러 노출 범위 — 행은 doc_type으로 한 번 더 가드되므로 '전체'에선 둘 다 넘긴다.
  const showClass = tab !== 'volunteer_club';                  // 단체 행 전개
  const showClub = tab === 'volunteer_club' || tab === 'all';  // 동아리 행 전개
  const showPersonal = tab === 'volunteer_personal' || tab === 'all';  // 개인 배치 행 전개

  const openCreate = () => { setEditing(null); setClassScope(undefined); setDialogOpen(true); };
  const onEdit = (i: DocumentIssue) => { setEditing(i); setClassScope(undefined); setDialogOpen(true); };
  const onEditClass = (i: DocumentIssue, filter: { grade: number; cls: number }) => {
    setEditing(i); setClassScope(filter); setDialogOpen(true);
  };
  const onEditClub = (i: DocumentIssue, clubId: string) => setClubActivityTarget({ issue: i, clubId });
  const onClose = () => { setDialogOpen(false); setEditing(null); setClassScope(undefined); };

  // 단체는 미리보기 모달 경유, 동아리(통합)는 즉시 다운로드
  const onExport = (i: DocumentIssue, filter?: ClassFilter) => {
    if (i.doc_type === 'volunteer_club') { downloadClub(i); return; }
    setExportTarget({ issue: i, filter });
  };
  // 동아리 1개 다운로드 → 매트릭스 미리보기(참가 체크·제외) 모달 경유
  const onExportClub = (i: DocumentIssue, clubId: string) => setClubExportTarget({ issue: i, clubId });

  const downloadClub = (i: DocumentIssue, clubId?: string) => {
    downloadClubHwpx(i, clubId)
      .then(() => toast.success('확인서를 내려받았습니다'))
      .catch(e => {
        console.error(e);
        toast.error(e instanceof Error ? e.message : '양식을 생성하지 못했습니다. 다시 시도해 주세요.');
      });
  };

  // 개인봉사: 확인자 등 필요한 정보가 발급 시점에 이미 채워져 있어 미리보기 없이 즉시 다운로드
  const onExportPersonal = (i: DocumentIssue) => {
    downloadPersonalHwpx(i)
      .then(() => toast.success('확인서를 내려받았습니다'))
      .catch(e => {
        console.error(e);
        toast.error(e instanceof Error ? e.message : '양식을 생성하지 못했습니다. 다시 시도해 주세요.');
      });
  };
  const onExportPersonalBatch = (batch: PersonalBatch) => {
    downloadPersonalHwpxBatch(batch.issues[0].issue_no, batch.issues)
      .then(() => toast.success('확인서를 내려받았습니다'))
      .catch(e => {
        console.error(e);
        toast.error(e instanceof Error ? e.message : '양식을 생성하지 못했습니다. 다시 시도해 주세요.');
      });
  };

  const segment = (
    <div className="flex items-center gap-0.5 rounded-full border border-slate-200/60 bg-slate-100/80 p-0.5">
      {TABS.map(t => (
        <button
          key={t.value}
          type="button"
          onClick={() => setTab(t.value)}
          className={cn(
            'rounded-full px-3.5 py-1 text-xs font-medium transition-all',
            tab === t.value ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400 hover:text-slate-600',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  return (
    <Layout>
      <IssueRegisterShell
        hint={isClubTab ? '발급 후 각 동아리 행을 펼쳐 활동 내용을 작성합니다.' : undefined}
        count={issues.length}
        issueLabel="발급"
        onIssue={openCreate}
      >
        <IssueLedger
          docTypes={docTypes}
          variant="volunteer"
          onEdit={onEdit}
          onEditClass={showClass ? onEditClass : undefined}
          onExport={onExport}
          onEditClub={showClub ? onEditClub : undefined}
          onExportClub={showClub ? onExportClub : undefined}
          onExportPersonal={showPersonal ? onExportPersonal : undefined}
          onExportPersonalBatch={showPersonal ? onExportPersonalBatch : undefined}
          segment={segment}
        />
      </IssueRegisterShell>

      {dialogOpen && (
        <IssueCreateDialog
          open={dialogOpen}
          docType={editing ? editing.doc_type : (tab === 'all' ? 'volunteer_class' : tab)}
          docTypesForList={VOLUNTEER_TYPES}
          allowVolunteerTypeChoice
          editing={editing ?? undefined}
          classScope={classScope}
          onClose={onClose}
        />
      )}

      {clubActivityTarget && (
        <ClubActivityEditDialog
          open={!!clubActivityTarget}
          issue={clubActivityTarget.issue}
          clubId={clubActivityTarget.clubId}
          onClose={() => setClubActivityTarget(null)}
        />
      )}

      {clubExportTarget && (
        <ClubExportPreviewDialog
          open={!!clubExportTarget}
          issue={clubExportTarget.issue}
          clubId={clubExportTarget.clubId}
          onClose={() => setClubExportTarget(null)}
        />
      )}

      {exportTarget && (
        <VolunteerExportDialog
          open={!!exportTarget}
          issue={exportTarget.issue}
          filter={exportTarget.filter}
          onClose={() => setExportTarget(null)}
        />
      )}
    </Layout>
  );
}

export default VolunteerRegisterPage;
