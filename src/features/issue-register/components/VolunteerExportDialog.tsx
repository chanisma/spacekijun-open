import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { FileDown } from 'lucide-react';
import { toast } from '@/lib/toast';
import { isClubFormData, type DocumentIssue } from '../types';
import { downloadVolunteerHwpx, downloadVolunteerHwpxMultiClass, type ClassFilter } from '../hwpx/generateVolunteerHwpx';
import { groupByClass } from './IssueLedger';
import { useHomeroomTeachers } from '../hooks/useHomeroomTeachers';

/** 'YYYY-MM-DD' → 'YYYY.M.D' (빈/잘못된 값은 빈 문자열) */
function fmtDot(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <span className="w-24 shrink-0 text-slate-400">{label}</span>
      <span className="min-w-0 flex-1 text-slate-700">{value || <span className="text-slate-300">—</span>}</span>
    </div>
  );
}

/**
 * 확인서 다운로드 전 내용 확인 모달. 발급 정보를 요약하고, 확인자(담임) 성명을
 * 편집할 수 있게 한 뒤 다운로드 버튼으로 HWPX를 생성한다.
 * filter가 있으면 그 반만 대상으로 한다(반별 출력).
 */
export function VolunteerExportDialog({
  open, issue, filter, onClose,
}: {
  open: boolean;
  issue: DocumentIssue;
  filter?: ClassFilter;
  onClose: () => void;
}) {
  const { homeroomOf } = useHomeroomTeachers();
  const [confirmerName, setConfirmerName] = useState('');
  const [busy, setBusy] = useState(false);

  // 대상 학생(반별이면 그 반만)
  const roster = useMemo(
    () => filter
      ? issue.students.filter(s => s.grade === filter.grade && s.class === filter.cls)
      : issue.students,
    [issue.students, filter],
  );

  // 통합 출력(filter 없음)이고 여러 반에 걸치면 → 반별 페이지 분리
  const classGroups = useMemo(() => groupByClass(issue.students), [issue.students]);
  const isMultiClass = !filter && classGroups.length >= 2;

  // 확인자 기본값 = 담임명. 모달이 열릴 때 1회만 자동 채우고, 이후 사용자가
  // 자유롭게 수정 가능(재seed로 덮어쓰지 않음). 담임 데이터가 늦게 로드돼도
  // 입력이 비어 있을 때만 보충한다.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!open) { seededRef.current = false; return; }
    if (seededRef.current) return;
    const g = filter?.grade ?? issue.grade ?? undefined;
    const c = filter?.cls ?? issue.class_number ?? undefined;
    const homeroom = homeroomOf(g, c);
    if (homeroom) { setConfirmerName(homeroom); seededRef.current = true; }
  }, [open, filter, issue.grade, issue.class_number, homeroomOf]);

  // 이 모달은 단체(반) 봉사 전용 — 동아리 form_data면 무시
  const fd = isClubFormData(issue.form_data) ? null : issue.form_data;
  const periodStart = fmtDot(fd?.period_start || issue.issued_on);
  const periodEnd = fmtDot(fd?.period_end || fd?.period_start || issue.issued_on);
  const scopeLabel = filter
    ? `${filter.grade}학년 ${filter.cls}반`
    : isMultiClass
      ? `${classGroups.map(g => `${g.grade}학년 ${g.cls}반`).join(', ')} (${classGroups.length}개 반)`
      : issue.grade ? `${issue.grade}학년${issue.class_number ? ` ${issue.class_number}반` : ''}` : (issue.remarks ?? '');

  const handleDownload = async () => {
    setBusy(true);
    try {
      if (isMultiClass) {
        // 통합 출력: 반별로 페이지 분리, 각 반 담임을 확인자로
        await downloadVolunteerHwpxMultiClass(issue, classGroups, (g, c) => homeroomOf(g, c));
      } else {
        await downloadVolunteerHwpx(issue, filter, { confirmerName: confirmerName.trim() || undefined });
      }
      toast.success('확인서를 내려받았습니다');
      onClose();
    } catch (e) {
      console.error(e);
      toast.error('양식을 생성하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>확인서 내용 확인</DialogTitle>
        </DialogHeader>

        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200/70 bg-slate-50/40 px-3">
          <Row label="발급번호" value={<span className="font-mono tabular-nums">{issue.issue_no}</span>} />
          <Row label="학년·반" value={scopeLabel} />
          <Row label="봉사 기간" value={periodStart ? `${periodStart}${periodEnd && periodEnd !== periodStart ? ` ~ ${periodEnd}` : ''}` : ''} />
          <Row label="봉사 기관" value={fd?.org} />
          <Row label="활동 내용" value={issue.title} />
          <Row label="참여 인원" value={<span className="tabular-nums">{roster.length}명</span>} />
          <Row
            label="참여자"
            value={roster.length
              ? `${roster.slice(0, 6).map(s => s.name).join(', ')}${roster.length > 6 ? ` 외 ${roster.length - 6}명` : ''}`
              : ''}
          />
        </div>

        {isMultiClass ? (
          <p className="rounded-lg bg-brand-50/70 px-3 py-2 text-xs text-brand-700 ring-1 ring-inset ring-brand-100">
            반별로 페이지를 나눠 한 파일로 생성합니다. 각 페이지 확인자는 해당 반 담임으로 자동 기입됩니다(담임 미지정 반은 공백).
          </p>
        ) : (
          <div className="mt-1">
            <Label htmlFor="confirmer">확인자(담임교사) 성명</Label>
            <Input
              id="confirmer"
              value={confirmerName}
              onChange={e => setConfirmerName(e.target.value)}
              placeholder="담임교사 이름"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              확인서 하단 확인자 성명으로 들어갑니다. 담임을 찾지 못하면 직접 입력하세요.
            </p>
          </div>
        )}

        {roster.length === 0 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-inset ring-amber-100">
            참여자 명단이 없어 확인서를 생성할 수 없습니다.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={handleDownload} disabled={busy || roster.length === 0}>
            <FileDown className="mr-1.5 h-4 w-4" strokeWidth={1.75} />
            다운로드
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
