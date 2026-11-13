import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { AcademicTerm } from '@/hooks/useAcademicTerm';

/**
 * 학사력이 미설정일 때만 표시되는 안내.
 *
 * 시간표 읽기 경로는 최신 학기로 폴백하지만, 그 사실을 관리자가 알아야 학기 전환
 * 시점에 값을 지정할 수 있다.
 */
export function AcademicTermNotice({
  academicTerm,
  fallbackLabel,
}: {
  academicTerm: AcademicTerm | null | undefined;
  fallbackLabel: string | null;
}) {
  if (academicTerm) return null;

  return (
    <Alert>
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>
        <strong>학사력(현재 학년도·학기)이 설정되지 않았습니다.</strong>{' '}
        {fallbackLabel
          ? `데이터에 존재하는 최신 학기(${fallbackLabel})를 자동 선택했습니다.`
          : '선택할 시간표 데이터가 없습니다.'}{' '}
        시간표·수업 명단·교체 후보가 모두 이 값을 기준으로 동작하므로{' '}
        <strong>시스템 설정 → 학사력 설정</strong>에서 지정하세요.
      </AlertDescription>
    </Alert>
  );
}
