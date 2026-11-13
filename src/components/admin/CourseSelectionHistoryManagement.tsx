import { useMemo, useState } from 'react';
import { Vote, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import {
  useSelectionRounds,
  useSubmissionsByRound,
  useSubmissionItems,
  attachItems,
} from '@/features/course-selection/hooks/useCourseSelection';
import { SUBJECT_CATEGORIES, type CategoryCode } from '@/features/course-selection/constants/categories';
import { SUBJECT_PREREQUISITES } from '@/features/course-selection/constants/prerequisites';

const CATEGORY_COLOR: Record<string, string> = {
  KOR: 'bg-blue-50 text-blue-700 border-blue-200',
  ENG: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  MATH: 'bg-purple-50 text-purple-700 border-purple-200',
  HIS: 'bg-amber-50 text-amber-700 border-amber-200',
  SOC: 'bg-orange-50 text-orange-700 border-orange-200',
  PHY: 'bg-rose-50 text-rose-700 border-rose-200',
  CHE: 'bg-pink-50 text-pink-700 border-pink-200',
  BIO: 'bg-green-50 text-green-700 border-green-200',
  EARTH: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  ETC: 'bg-slate-100 text-slate-700 border-slate-200',
};

export function CourseSelectionHistoryManagement() {
  const { data: rounds = [], isLoading: loadingRounds } = useSelectionRounds();
  const [roundId, setRoundId] = useState<string | null>(null);
  const [classNum, setClassNum] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const effectiveRoundId = roundId ?? rounds[0]?.id ?? null;
  const currentRound = rounds.find((r) => r.id === effectiveRoundId);

  const { data: subs = [], isLoading: loadingSubs } = useSubmissionsByRound({
    roundId: effectiveRoundId, classNum, search,
  });

  const { data: items = [], isLoading: loadingItems } = useSubmissionItems(
    subs.map((s) => s.id)
  );

  const subsWithItems = useMemo(() => attachItems(subs, items), [subs, items]);

  const stats = useMemo(() => {
    const total = subs.length;
    const matched = subs.filter((s) => s.student_resource_id).length;
    return { total, matched };
  }, [subs]);

  if (loadingRounds) {
    return <div className="flex items-center justify-center h-48"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Vote className="h-6 w-6" />
          선택과목 신청 이력
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          학년·차수별 학생 신청 결과. data.json import 데이터 (1236건 × 6 라운드).
        </p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>차수 선택</CardTitle>
              <CardDescription className="mt-1">
                {currentRound
                  ? `${currentRound.title ?? `${currentRound.academic_year}학년도 ${currentRound.target_grade}학년 ${currentRound.round_number}차`} · 학생 ${stats.total}명`
                  : '차수 없음'}
              </CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={effectiveRoundId ?? ''} onValueChange={(v) => setRoundId(v)}>
                <SelectTrigger className="w-[280px]"><SelectValue placeholder="차수" /></SelectTrigger>
                <SelectContent>
                  {rounds.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.academic_year}학년도 {r.target_grade}학년 {r.round_number}차
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={classNum != null ? String(classNum) : 'all'} onValueChange={(v) => setClassNum(v === 'all' ? null : parseInt(v, 10))}>
                <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 반</SelectItem>
                  {[1,2,3,4,5,6,7,8,9].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}반</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input placeholder="이름·학번 검색" value={search} onChange={(e) => setSearch(e.target.value)} className="w-[180px]" />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="text-xs text-muted-foreground mb-3">
            {stats.total}명 표시 · resource 매칭 {stats.matched}/{stats.total}
          </div>

          {loadingSubs || loadingItems ? (
            <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : subsWithItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Vote className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>표시할 신청이 없습니다.</p>
            </div>
          ) : (
            <Accordion type="multiple" className="border rounded-lg px-2">
              {subsWithItems.map((sub) => {
                const allPicked = new Set([...sub.semester1, ...sub.semester2].map((i) => i.subject_name));
                const violations = [...allPicked].filter((name) => {
                  const req = SUBJECT_PREREQUISITES[name];
                  return req && req.some((p) => !allPicked.has(p));
                });
                return (
                  <AccordionItem key={sub.id} value={sub.id}>
                    <AccordionTrigger className="hover:no-underline py-2">
                      <div className="flex items-center gap-2 flex-1 text-left flex-wrap">
                        <Badge variant="outline" className="text-[10px] tabular-nums">
                          {sub.student_grade}-{sub.student_class}-{sub.student_no}
                        </Badge>
                        <span className="font-medium">{sub.student_name}</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">{sub.student_code}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {sub.semester1.length}+{sub.semester2.length}과목
                        </Badge>
                        {!sub.student_resource_id && (
                          <Badge variant="destructive" className="text-[10px]">학생 ✗</Badge>
                        )}
                        {violations.length > 0 && (
                          <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-700">
                            선수 미이수 {violations.length}
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        {[1, 2].map((sem) => {
                          const arr = sem === 1 ? sub.semester1 : sub.semester2;
                          return (
                            <div key={sem} className="border rounded p-2">
                              <div className="text-[10px] font-medium text-muted-foreground mb-1">{sem}학기</div>
                              <ul className="space-y-1">
                                {arr.map((it) => {
                                  const cc = (it.category_code as CategoryCode) ?? null;
                                  const cat = cc ? SUBJECT_CATEGORIES[cc] : null;
                                  const isViolation = violations.includes(it.subject_name);
                                  return (
                                    <li key={it.id} className="flex items-center gap-1.5">
                                      {cc && (
                                        <span className={cn('text-[9px] px-1 rounded border', CATEGORY_COLOR[cc] ?? '')}>
                                          {cc}
                                        </span>
                                      )}
                                      <span className={cn('flex-1', isViolation && 'text-amber-700')}>
                                        {it.subject_name}
                                      </span>
                                      {!it.selectable_subject_id && (
                                        <span className="text-[9px] text-red-600">✗</span>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
