import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OverviewTab } from './OverviewTab';
import { CounselingNotesTab } from './CounselingNotesTab';
import { ScholarshipTab } from './ScholarshipTab';
import { TimetableTab } from './TimetableTab';
import { useRescueNotes } from '../../hooks/useRescueNotes';
import { useRescueScholarships } from '../../hooks/useRescueScholarships';

interface Props {
  studentCode: string;
}

export function StudentDetail({ studentCode }: Props) {
  const [tab, setTab] = useState<'overview' | 'notes' | 'scholarship' | 'timetable'>('overview');
  const notesQ = useRescueNotes(studentCode);
  const noteCount = notesQ.data?.length ?? 0;
  const scholarshipsQ = useRescueScholarships(studentCode);
  const scholarshipCount = scholarshipsQ.data?.length ?? 0;

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="h-full flex flex-col">
      <div className="px-5 pt-4 shrink-0">
        <TabsList className="bg-white/50 backdrop-blur-sm border border-white/40 shadow-sm rounded-lg p-0.5 h-auto gap-0.5">
          <TabsTrigger
            value="overview"
            className="text-xs font-medium px-3 py-1.5 rounded-md data-[state=active]:bg-white data-[state=active]:text-brand-600 data-[state=active]:shadow-sm data-[state=inactive]:text-slate-500 data-[state=inactive]:hover:text-slate-700 transition-all"
          >
            개요
          </TabsTrigger>
          <TabsTrigger
            value="notes"
            className="text-xs font-medium px-3 py-1.5 rounded-md data-[state=active]:bg-white data-[state=active]:text-brand-600 data-[state=active]:shadow-sm data-[state=inactive]:text-slate-500 data-[state=inactive]:hover:text-slate-700 transition-all"
          >
            상담일지 ({noteCount})
          </TabsTrigger>
          <TabsTrigger
            value="scholarship"
            className="text-xs font-medium px-3 py-1.5 rounded-md data-[state=active]:bg-white data-[state=active]:text-brand-600 data-[state=active]:shadow-sm data-[state=inactive]:text-slate-500 data-[state=inactive]:hover:text-slate-700 transition-all"
          >
            장학금 ({scholarshipCount})
          </TabsTrigger>
          <TabsTrigger
            value="timetable"
            className="text-xs font-medium px-3 py-1.5 rounded-md data-[state=active]:bg-white data-[state=active]:text-brand-600 data-[state=active]:shadow-sm data-[state=inactive]:text-slate-500 data-[state=inactive]:hover:text-slate-700 transition-all"
          >
            시간표
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="overview" className="flex-1 overflow-y-auto custom-scrollbar mt-0">
        <OverviewTab studentCode={studentCode} />
      </TabsContent>
      <TabsContent value="notes" className="flex-1 overflow-y-auto custom-scrollbar mt-0">
        <CounselingNotesTab studentCode={studentCode} />
      </TabsContent>
      <TabsContent value="scholarship" className="flex-1 overflow-y-auto custom-scrollbar mt-0">
        <ScholarshipTab studentCode={studentCode} />
      </TabsContent>
      <TabsContent value="timetable" className="flex-1 overflow-y-auto custom-scrollbar mt-0">
        <TimetableTab studentCode={studentCode} />
      </TabsContent>
    </Tabs>
  );
}
