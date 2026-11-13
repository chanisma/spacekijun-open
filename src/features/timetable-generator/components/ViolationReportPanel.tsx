import { useMemo, useState } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { HARD_CONSTRAINT_LABELS } from '../constants';
import type { InfeasibilityCertificate } from '../types';
import { collectViolationReport, type ViolationEntry, type ViolationReport } from '../utils/violationReport';
import type { Placement, TimetableInput } from '../types';

interface ViolationReportPanelProps {
  input: TimetableInput;
  placements: Placement[];
  studentNames?: Map<string, string>;
  infeasibility?: InfeasibilityCertificate[];
  defaultOpen?: boolean;
}

function tierBadge(tier0: number, tier1: number): { text: string; className: string } {
  if (tier0 > 0) return { text: `기본 충돌 ${tier0}건`, className: 'bg-red-100 text-red-800 border-red-200' };
  if (tier1 > 0) return { text: `부하 위반 ${tier1}건`, className: 'bg-amber-100 text-amber-800 border-amber-200' };
  return { text: '제약 충족', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
}

function kindLabel(kind?: string): string {
  if (!kind) return '—';
  return HARD_CONSTRAINT_LABELS[kind] ?? kind;
}

/** 교사 부하 위반 — 집계 건수와 1:1 대응하는 전체 목록 */
function TeacherLoadViolationTable({ entries }: { entries: ViolationEntry[] }) {
  const byKind = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) m.set(e.kind ?? '?', (m.get(e.kind ?? '?') ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  if (entries.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-amber-900">
        교사 부하 위반 전체 <span className="font-normal text-muted-foreground">({entries.length}건)</span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {byKind.map(([kind, n]) => (
          <span key={kind} className="text-[10px] px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-800">
            {kindLabel(kind)} {n}
          </span>
        ))}
      </div>
      <div className="overflow-auto max-h-[min(70vh,36rem)] rounded border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent sticky top-0 bg-muted/95 z-10">
              <TableHead className="h-8 w-10 text-[10px]">#</TableHead>
              <TableHead className="h-8 w-[7.5rem] text-[10px]">유형</TableHead>
              <TableHead className="h-8 w-20 text-[10px]">교사</TableHead>
              <TableHead className="h-8 text-[10px]">근거 (교사·요일·교시·과목)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e, i) => (
              <TableRow key={`${e.kind}-${i}`} className="hover:bg-muted/30">
                <TableCell className="py-1 text-[11px] text-muted-foreground tabular-nums">{i + 1}</TableCell>
                <TableCell className="py-1 text-[10px] text-amber-800 leading-snug">{kindLabel(e.kind)}</TableCell>
                <TableCell className="py-1 text-[11px] whitespace-nowrap">{e.teacherName ?? '—'}</TableCell>
                <TableCell className="py-1 text-[11px] text-muted-foreground leading-relaxed">{e.summary}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Tier0ViolationTables({ report }: { report: ViolationReport }) {
  const tier0Sections = report.sections.filter((s) => s.tier === 'tier0');
  const defaultSections = tier0Sections.map((s) => s.id);
  if (tier0Sections.length === 0) {
    if (report.tier0 === 0) return null;
    return <p className="text-xs text-muted-foreground">기본 충돌 상세를 표시할 수 없습니다.</p>;
  }

  return (
    <Accordion type="multiple" defaultValue={defaultSections} className="w-full">
      {tier0Sections.map((sec) => (
        <AccordionItem key={sec.id} value={sec.id} className="border-b-0">
          <AccordionTrigger className="py-2 text-xs hover:no-underline">
            <span className="flex flex-wrap items-center gap-2 text-left">
              <span className="text-red-700 font-medium">{sec.label}</span>
              <span className="px-1.5 py-0.5 rounded border text-[10px] font-normal border-red-200 bg-red-50 text-red-700">
                {sec.count}건
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <ul className="space-y-1 pl-1 max-h-72 overflow-y-auto pr-1">
              {sec.entries.map((e, i) => (
                <li key={i} className="text-[11px] leading-relaxed text-muted-foreground border-l-2 border-muted pl-2 py-0.5">
                  {e.summary}
                </li>
              ))}
            </ul>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

export function ViolationReportPanel({
  input,
  placements,
  studentNames,
  infeasibility,
  defaultOpen = true,
}: ViolationReportPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const report = useMemo(
    () => collectViolationReport(input, placements, { studentNames }),
    [input, placements, studentNames],
  );
  const badge = tierBadge(report.tier0, report.tier1);

  if (report.total === 0 && (infeasibility?.length ?? 0) === 0) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-800">
        하드 제약 위반 없음 — 학생/교사 동시 수업·교사 부하 4종 모두 충족
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-card text-xs space-y-2">
      <button
        type="button"
        className="w-full flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/40 rounded-t-md"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="font-medium">
          제약 위반 상세
          {report.total > 0 && <span className="text-muted-foreground font-normal"> · 총 {report.total}건</span>}
        </span>
        <span className={`px-2 py-0.5 rounded border text-[10px] ${badge.className}`}>{badge.text}</span>
        <span className="text-muted-foreground text-[10px] w-full">{open ? '접기 ▲' : '펼치기 ▼ — 교사·학생·과목·칸별 내역'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-4 border-t">
          {report.tier0 > 0 && (
            <p className="text-[11px] text-red-700 pt-2">
              <b>기본 충돌 {report.tier0}건</b> — 학생/교사 동시 수업 등 절대 허용 불가. 확정 전 반드시 해소하세요.
            </p>
          )}
          {report.tier1 > 0 && (
            <p className="text-[11px] text-amber-800 pt-2">
              <b>교사 부하 위반 {report.tier1}건</b> — 아래 표에 위반 1건당 1행으로 전부 나열됩니다.
            </p>
          )}
          {report.tier1 > 0 && <TeacherLoadViolationTable entries={report.tier1Entries} />}
          {report.tier0 > 0 && <Tier0ViolationTables report={report} />}
          {(infeasibility?.length ?? 0) > 0 && (
            <div className="rounded border border-red-200 bg-red-50/80 p-2 space-y-1">
              <p className="font-medium text-red-800">구조적 불가능 진단 (수학적 증명)</p>
              <ul className="list-disc pl-4 space-y-0.5 text-red-700">
                {infeasibility!.map((c, i) => (
                  <li key={i}>{c.reason}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
