import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  applyDerivedScoring,
  checkAnswerCounts,
  matchRoster,
  parseAnswerCsv,
  parseQuestionCsv,
  type SchoolExamAnswerRecord,
  type SchoolExamQuestionRecord,
  type RosterMatchResult,
} from '../../utils/schoolExamCsv';
import { fetchRoster, upsertQuestions, upsertResults } from '../../services/schoolExamService';

type Stage = 'idle' | 'analyzing' | 'ready' | 'uploading' | 'done';

interface Analysis {
  questions: SchoolExamQuestionRecord[];
  answers: SchoolExamAnswerRecord[];
  match: RosterMatchResult;
  errors: string[];
  warnings: string[];
  derivedRows: number;
  paddedRows: number;
  disagreements: number;
  exams: string[];
}

function FilePicker({
  label,
  hint,
  file,
  onPick,
  disabled,
}: {
  label: string;
  hint: string;
  file: File | null;
  onPick: (file: File | null) => void;
  disabled: boolean;
}) {
  return (
    <label
      className={cn(
        'flex-1 min-w-0 rounded-xl border border-dashed px-3 py-3 cursor-pointer transition-colors',
        file ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-300 hover:bg-slate-50',
        disabled && 'opacity-60 pointer-events-none'
      )}
    >
      <input
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        disabled={disabled}
      />
      <div className="flex items-start gap-2 min-w-0">
        {file ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
        ) : (
          <FileUp className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
        )}
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-700">{label}</p>
          {/* 파일명은 밑줄만 있는 한 단어라 줄바꿈 기회가 없다 — truncate + title이 규약이다. */}
          <p className="text-[10px] text-slate-500 truncate" title={file?.name ?? hint}>
            {file?.name ?? hint}
          </p>
        </div>
      </div>
    </label>
  );
}

function Section({ title, tone, items, max = 8 }: {
  title: string;
  tone: 'error' | 'warn' | 'info';
  items: string[];
  max?: number;
}) {
  if (items.length === 0) return null;
  const palette = {
    error: 'border-red-200 bg-red-50/60 text-red-700',
    warn: 'border-amber-200 bg-amber-50/60 text-amber-800',
    info: 'border-slate-200 bg-slate-50 text-slate-600',
  }[tone];
  return (
    <div className={cn('rounded-xl border px-3 py-2', palette)}>
      <p className="text-[11px] font-semibold mb-1">
        {title} <span className="font-normal opacity-70">({items.length}건)</span>
      </p>
      <ul className="space-y-0.5">
        {items.slice(0, max).map((item, i) => (
          <li key={i} className="text-[11px] break-words leading-snug">· {item}</li>
        ))}
      </ul>
      {items.length > max && (
        <p className="text-[10px] opacity-70 mt-1">…외 {items.length - max}건</p>
      )}
    </div>
  );
}

/**
 * NEIS 지필평가 CSV 등록.
 *
 * 흐름은 **분석 → 확인 → 등록** 2단계다. 파일을 고르면 먼저 파싱·학생 매칭·무결성 점검
 * 결과를 보여주고, 사용자가 그 내용을 본 뒤에 등록을 누른다. 성적 데이터는 한 번 잘못
 * 들어가면 어느 학생 것이 틀렸는지 화면만 봐서는 알 수 없기 때문이다.
 */
export const SchoolExamImportTab: React.FC = () => {
  const [questionFile, setQuestionFile] = useState<File | null>(null);
  const [answerFile, setAnswerFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const busy = stage === 'analyzing' || stage === 'uploading';

  const analyze = async () => {
    if (!questionFile || !answerFile) return;
    setStage('analyzing');
    setAnalysis(null);
    try {
      const [questionText, answerText] = await Promise.all([questionFile.text(), answerFile.text()]);
      const q = parseQuestionCsv(questionText);
      const a = parseAnswerCsv(answerText);

      // 채점 보정은 매칭 전에 한다 — 잘려 온 답안을 복원해야 문항 인덱스가 맞는다.
      const scoring = applyDerivedScoring(a.records, q.records);
      const countProblems = checkAnswerCounts(a.records, q.records);

      const roster = await fetchRoster();
      const match = matchRoster(a.records, roster);

      const exams = Array.from(
        new Set(a.records.map((r) => `${r.academicYear}년 ${r.semester}학기 ${r.examName}`))
      ).sort();

      setAnalysis({
        questions: q.records,
        answers: a.records,
        match,
        errors: [...q.errors, ...a.errors, ...countProblems],
        warnings: [...q.warnings, ...a.warnings, ...scoring.warnings, ...scoring.missingQuestions],
        derivedRows: scoring.derivedRows,
        paddedRows: scoring.paddedRows,
        disagreements: scoring.disagreements,
        exams,
      });
      setStage('ready');
    } catch (err) {
      console.error('CSV 분석 실패:', err);
      toast.error(err instanceof Error ? err.message : 'CSV를 분석하지 못했습니다.');
      setStage('idle');
    }
  };

  const upload = async () => {
    if (!analysis) return;
    setStage('uploading');
    setProgress({ done: 0, total: analysis.questions.length + analysis.match.matched.length });
    try {
      let done = 0;
      const total = analysis.questions.length + analysis.match.matched.length;
      await upsertQuestions(analysis.questions, (chunkDone) => {
        setProgress({ done: chunkDone, total });
      });
      done = analysis.questions.length;
      await upsertResults(analysis.match.matched, (chunkDone) => {
        setProgress({ done: done + chunkDone, total });
      });
      setStage('done');
      toast.success(
        `문항 ${analysis.questions.length}건, 학생 결과 ${analysis.match.matched.length}건을 등록했습니다.`
      );
    } catch (err) {
      console.error('등록 실패:', err);
      // RLS(관리자 전용)에 막히면 오류가 아니라 조용한 실패로 보일 수 있어 메시지를 명시한다.
      toast.error(
        err instanceof Error
          ? `등록에 실패했습니다: ${err.message}`
          : '등록에 실패했습니다. 관리자 권한이 필요합니다.'
      );
      setStage('ready');
    } finally {
      setProgress(null);
    }
  };

  const blocked = (analysis?.errors.length ?? 0) > 0;

  const summaryLines = useMemo(() => {
    if (!analysis) return [];
    const lines = [
      `고사: ${analysis.exams.join(', ') || '—'}`,
      `문항 ${analysis.questions.length}건 · 학생 응시 ${analysis.answers.length}건`,
      `학생 매칭 ${analysis.match.matched.length}건`,
    ];
    if (analysis.derivedRows > 0) lines.push(`NEIS 미채점 ${analysis.derivedRows}건을 정답 대조로 채점`);
    if (analysis.paddedRows > 0) lines.push(`잘려 온 답안 ${analysis.paddedRows}건을 무응답으로 복원`);
    return lines;
  }, [analysis]);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
        <p className="text-xs text-slate-600 leading-relaxed">
          NEIS에서 내려받아 변환한 <span className="font-semibold">문항정보</span>·
          <span className="font-semibold">학생답안</span> CSV 두 개를 함께 올립니다.
          같은 고사를 다시 올리면 기존 데이터를 덮어씁니다(문항은 고사·과목·구분·문항번호,
          학생 결과는 학생·고사·과목 기준).
        </p>
      </div>

      <div className="flex gap-3 flex-col sm:flex-row">
        <FilePicker
          label="① 문항정보 CSV"
          hint="neis-question-info-YYYY.csv"
          file={questionFile}
          onPick={(f) => { setQuestionFile(f); setStage('idle'); setAnalysis(null); }}
          disabled={busy}
        />
        <FilePicker
          label="② 학생답안 CSV"
          hint="neis-student-answers-YYYY.csv"
          file={answerFile}
          onPick={(f) => { setAnswerFile(f); setStage('idle'); setAnalysis(null); }}
          disabled={busy}
        />
      </div>

      <div className="flex gap-2">
        <Button
          onClick={analyze}
          disabled={!questionFile || !answerFile || busy}
          variant="outline"
          className="flex-1"
        >
          {stage === 'analyzing' ? (
            <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />분석 중…</>
          ) : (
            '내용 확인'
          )}
        </Button>
        <Button
          onClick={upload}
          disabled={!analysis || blocked || busy || stage === 'done'}
          className="flex-1"
        >
          {stage === 'uploading' ? (
            <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              등록 중 {progress ? `${progress.done}/${progress.total}` : ''}
            </>
          ) : (
            <><Upload className="h-4 w-4 mr-1.5" />등록</>
          )}
        </Button>
      </div>

      {analysis && (
        <div className="space-y-2">
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
            <p className="text-[11px] font-semibold text-slate-500 mb-1">확인</p>
            <ul className="space-y-0.5">
              {summaryLines.map((line, i) => (
                <li key={i} className="text-xs text-slate-700">· {line}</li>
              ))}
            </ul>
          </div>

          <Section
            tone="error"
            title="등록을 막는 문제"
            items={analysis.errors}
          />

          {analysis.disagreements > 0 && (
            <Section
              tone="warn"
              title="NEIS 채점과 정답 대조 결과가 다른 문항"
              items={[
                `${analysis.disagreements}개 문항에서 어긋납니다. NEIS 채점을 그대로 등록하지만, ` +
                '정답 데이터나 복수정답 표기를 확인해 보세요.',
              ]}
            />
          )}

          <Section
            tone="warn"
            title="학적에서 찾지 못한 학생 (등록되지 않음)"
            items={analysis.match.unmatched.map(
              (r) => `${r.grade}학년 ${r.classLabel}반 ${r.studentNumber}번 ${r.studentName} — ${r.subjectSection}`
            )}
          />

          <Section
            tone="warn"
            title="자리는 맞지만 이름이 다른 학생"
            items={analysis.match.nameMismatches.map(
              ({ record, rosterName }) =>
                `${record.grade}학년 ${record.classLabel}반 ${record.studentNumber}번 — CSV '${record.studentName}' vs 학적 '${rosterName}'`
            )}
          />

          <Section
            tone="info"
            title="타교 위탁 수강생 (제외됨)"
            items={Array.from(
              new Set(analysis.match.external.map((r) => `${r.subjectSection} — ${r.classLabel}`))
            )}
          />

          <Section tone="info" title="기타 경고" items={analysis.warnings} />

          {blocked && (
            <div className="rounded-xl border border-red-200 bg-red-50/60 px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">
                위 문제를 먼저 해결해야 등록할 수 있습니다. 답안 개수가 문항 수와 맞지 않으면
                문항 인덱스가 밀려 엉뚱한 문항의 오답으로 집계됩니다.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
