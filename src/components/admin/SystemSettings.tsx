import { useState, useEffect } from 'react';
import { CalendarDays, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/components/auth/AuthProvider';
import { useQueryClient } from '@tanstack/react-query';
import { parseAcademicTerm, parseTermDate } from '@/hooks/useAcademicTerm';

/**
 * 시스템 설정 — 학사력(현재 학년도·학기) 지정.
 *
 * 2026-07-28 정리:
 *  - 환영 알림 편집은 **알림 관리** 탭의 해당 이벤트 카드로 이관됐다
 *    (알림이 나열된 곳에서 바로 문구를 고치는 흐름이 자연스럽다).
 *  - `system_settings` 전 행을 나열하고 날 JSON 을 편집·삭제하던 범용 표는 제거했다.
 *    두 전용 UI(학사력·환영 알림)가 실제 키를 모두 덮고 있어 중복이었고, 표 쪽은 검증이
 *    없어 학사력에 잘못된 값을 넣거나 행을 지워 기능을 조용히 죽일 수 있었다.
 *    임의 키가 필요하면 SQL/Supabase 로 처리한다.
 *  - `system_settings` 테이블 구조는 그대로 유지된다(학사력·환영 알림이 계속 사용).
 */

/** 학사력 값이 바뀌면 학기 기준으로 동작하는 모든 쿼리를 무효화해야 한다. */
const TERM_DEPENDENT_QUERY_KEYS = [
  ['academic-term'],
  ['timetable-latest-term'],
  ['timetable-data'],
  ['today-timetable'],
  ['student-timetable'],
  ['section-students'],
  ['swap-candidates'],
  ['availableTeachers'],
];

export const SystemSettings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);

  // 학사력(현재 학년도·학기 + 선택적 학기 기간) — system_settings 'academic_term'
  // 미설정이면 빈 값. 시간표·수업 명단·교체 후보·수업 그룹 검색이 이 값을 기준으로 동작한다.
  // 기간(시작일~종료일)은 업무 타임라인의 학기 범위·대시보드 주차 표시가 사용한다.
  const [academicTerm, setAcademicTerm] = useState<{
    year: string;
    semester: string;
    startDate: string;
    endDate: string;
  }>({
    year: '',
    semester: '1',
    startDate: '',
    endDate: '',
  });
  const [academicTermLoading, setAcademicTermLoading] = useState(false);
  const [savedTerm, setSavedTerm] = useState<{
    year: number;
    semester: number;
    startDate: string;
    endDate: string;
  } | null>(null);

  useEffect(() => {
    fetchAcademicTerm();
  }, []);

  const fetchAcademicTerm = async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'academic_term')
        .maybeSingle();

      if (!error && data?.setting_value) {
        const parsed = parseAcademicTerm(data.setting_value);
        if (parsed) {
          const loaded = {
            year: parsed.year,
            semester: parsed.semester,
            startDate: parsed.startDate ?? '',
            endDate: parsed.endDate ?? '',
          };
          setAcademicTerm({
            year: String(loaded.year),
            semester: String(loaded.semester),
            startDate: loaded.startDate,
            endDate: loaded.endDate,
          });
          setSavedTerm(loaded);
        }
      }
    } catch (error) {
      // 미설정은 정상 (빈 값 유지)
      console.log('학사력 설정 조회:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveAcademicTerm = async () => {
    if (!user) return;

    const yearNum = Number(academicTerm.year);
    const semesterNum = Number(academicTerm.semester);
    if (!Number.isInteger(yearNum) || yearNum < 2000 || yearNum > 2100) {
      toast({
        title: '입력 오류',
        description: '학년도를 올바르게 입력하세요. (예: 2026)',
        variant: 'destructive',
      });
      return;
    }
    if (semesterNum !== 1 && semesterNum !== 2) {
      toast({ title: '입력 오류', description: '학기는 1 또는 2여야 합니다.', variant: 'destructive' });
      return;
    }

    // 기간은 선택 사항이지만, 넣는다면 시작·종료가 쌍으로 있고 순서·학년도가 맞아야 한다.
    const startDate = academicTerm.startDate.trim();
    const endDate = academicTerm.endDate.trim();
    if (!!startDate !== !!endDate) {
      toast({
        title: '입력 오류',
        description: '학기 기간은 시작일과 종료일을 모두 입력하거나 모두 비워야 합니다.',
        variant: 'destructive',
      });
      return;
    }
    if (startDate && endDate) {
      const start = parseTermDate(startDate);
      const end = parseTermDate(endDate);
      if (!start || !end) {
        toast({ title: '입력 오류', description: '학기 기간 날짜 형식이 올바르지 않습니다.', variant: 'destructive' });
        return;
      }
      if (start.getTime() > end.getTime()) {
        toast({ title: '입력 오류', description: '학기 종료일이 시작일보다 앞설 수 없습니다.', variant: 'destructive' });
        return;
      }
      // 2학기는 익년 2월에 끝날 수 있으므로 시작일 연도만 학년도±0~1로 검사한다(오타 방지).
      if (start.getFullYear() < yearNum || start.getFullYear() > yearNum + 1) {
        toast({
          title: '입력 오류',
          description: `학기 시작일(${start.getFullYear()}년)이 학년도(${yearNum})와 맞지 않습니다.`,
          variant: 'destructive',
        });
        return;
      }
    }

    setAcademicTermLoading(true);
    try {
      const settingValue = {
        year: yearNum,
        semester: semesterNum,
        ...(startDate && endDate ? { start_date: startDate, end_date: endDate } : {}),
      };
      const { data: existing } = await supabase
        .from('system_settings')
        .select('id')
        .eq('setting_key', 'academic_term')
        .maybeSingle();

      if (existing) {
        const { data, error } = await supabase
          .from('system_settings')
          .update({ setting_value: settingValue, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select('id');
        if (error) throw error;
        // RLS 가 막으면 오류가 아니라 0행이 온다 — '저장됨'으로 오인하지 않도록 확인.
        if (!data || data.length === 0) {
          throw new Error('저장 권한이 없습니다. (관리자만 수정할 수 있습니다)');
        }
      } else {
        const { data, error } = await supabase
          .from('system_settings')
          .insert([{
            setting_key: 'academic_term',
            setting_value: settingValue,
            description: '현재 학년도·학기. 시간표·수업 명단·수업 그룹 검색 등 학기 기준 기능이 참조합니다.',
            created_by: user.id,
          }])
          .select('id');
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error('저장 권한이 없습니다. (관리자만 수정할 수 있습니다)');
        }
      }

      setSavedTerm({ year: yearNum, semester: semesterNum, startDate, endDate });
      // 학기 기준으로 동작하는 화면들이 즉시 새 학기를 반영하도록 캐시를 비운다.
      TERM_DEPENDENT_QUERY_KEYS.forEach((queryKey) => {
        queryClient.invalidateQueries({ queryKey });
      });

      toast({
        title: '성공',
        description: `학사력이 ${yearNum}학년도 ${semesterNum}학기로 저장되었습니다.`,
      });
    } catch (error) {
      console.error('학사력 저장 오류:', error);
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '학사력 설정을 저장하는데 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setAcademicTermLoading(false);
    }
  };

  const isDirty =
    !savedTerm ||
    savedTerm.year !== Number(academicTerm.year) ||
    savedTerm.semester !== Number(academicTerm.semester) ||
    savedTerm.startDate !== academicTerm.startDate.trim() ||
    savedTerm.endDate !== academicTerm.endDate.trim();

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <CalendarDays className="h-5 w-5" />
            <span>학사력 설정</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">시스템 설정</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          학교 전체에 적용되는 기준값입니다. 알림 문구는 <strong>알림 관리</strong> 탭에서 편집합니다.
        </p>
      </div>

      {/* 학사력 설정 (현재 학년도·학기) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <CalendarDays className="h-5 w-5" />
            <span>학사력 설정</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            현재 학년도·학기를 지정합니다. <strong>시간표는 학기 단위로 운영</strong>되며, 이 값이
            어느 학기를 표시할지 결정합니다.
          </p>

          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">이 값을 사용하는 기능</p>
            <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
              <li>교사·학생 시간표 화면 (오늘의 시간표 포함)</li>
              <li>수업 학생 명단 · 대체 교사 조회 · 수업 교체 후보</li>
              <li>시간표 관리·업로드의 기본 학년도·학기</li>
              <li>협업보드 멤버 선택의 수업(과목) 그룹 검색</li>
              <li>시간표 메모의 학년도</li>
              <li>업무 관리 타임라인의 기본 학년도·학기 범위 보기 (학기 기간 설정 시)</li>
              <li>대시보드 브리핑의 학기 주차 표시 (학기 기간 설정 시)</li>
            </ul>
          </div>

          {!savedTerm && (
            <Alert>
              <AlertDescription className="text-sm">
                아직 지정되지 않았습니다. 시간표는 데이터에 존재하는 <strong>최신 학기</strong>로
                자동 폴백하지만, 학기 전환을 제어하려면 값을 지정하세요.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label htmlFor="academic-year">학년도</Label>
              <Input
                id="academic-year"
                type="number"
                inputMode="numeric"
                min={2000}
                max={2100}
                value={academicTerm.year}
                onChange={(e) => setAcademicTerm((prev) => ({ ...prev, year: e.target.value }))}
                placeholder="예: 2026"
                className="w-32"
              />
            </div>
            <div className="space-y-2">
              <Label>학기</Label>
              <div className="flex overflow-hidden rounded-md border w-fit">
                {(['1', '2'] as const).map((sem) => (
                  <button
                    key={sem}
                    type="button"
                    onClick={() => setAcademicTerm((prev) => ({ ...prev, semester: sem }))}
                    className={
                      'px-4 py-2 text-sm font-medium transition-colors ' +
                      (academicTerm.semester === sem
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background hover:bg-accent')
                    }
                  >
                    {sem}학기
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="term-start-date">학기 시작일</Label>
              <Input
                id="term-start-date"
                type="date"
                value={academicTerm.startDate}
                onChange={(e) => setAcademicTerm((prev) => ({ ...prev, startDate: e.target.value }))}
                className="w-40"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="term-end-date">학기 종료일</Label>
              <Input
                id="term-end-date"
                type="date"
                value={academicTerm.endDate}
                onChange={(e) => setAcademicTerm((prev) => ({ ...prev, endDate: e.target.value }))}
                className="w-40"
              />
            </div>
            <Button onClick={saveAcademicTerm} disabled={academicTermLoading || !isDirty}>
              <Save className="h-4 w-4 mr-2" />
              {academicTermLoading ? '저장 중...' : '저장'}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            학기 기간은 선택 사항입니다. 설정하면 업무 타임라인의 <strong>학기 범위 보기</strong>와
            대시보드의 <strong>학기 주차 표시</strong>가 활성화됩니다.
          </p>

          {savedTerm && !isDirty && (
            <p className="text-xs text-muted-foreground">
              현재 적용 중: <strong>{savedTerm.year}학년도 {savedTerm.semester}학기</strong>
              {savedTerm.startDate && savedTerm.endDate && (
                <> · 기간 <strong>{savedTerm.startDate} ~ {savedTerm.endDate}</strong></>
              )}
            </p>
          )}

          {isDirty && savedTerm && (
            <Alert>
              <AlertDescription className="text-sm">
                저장하면 학기가 <strong>{savedTerm.year}학년도 {savedTerm.semester}학기</strong> →{' '}
                <strong>{academicTerm.year}학년도 {academicTerm.semester}학기</strong>로 전환되고,
                모든 사용자의 시간표가 새 학기 데이터로 바뀝니다. 해당 학기 시간표를 먼저
                업로드했는지 확인하세요.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
