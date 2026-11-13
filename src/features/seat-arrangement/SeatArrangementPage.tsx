import { useEffect, useMemo, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Card } from '@/components/ui/card';
import { toast } from '@/lib/toast';
import { ClassSelector } from './components/ClassSelector';
import { LayoutPresets } from './components/LayoutPresets';
import { ConstraintsPanel } from './components/ConstraintsPanel';
import { SeatBoard } from './components/SeatBoard';
import { SeatNotes } from './components/SeatNotes';
import { HeaderActions, ResultBanners } from './components/ResultActions';
import { FixedAssignDialog } from './components/FixedAssignDialog';
import { PrintStyles } from './components/PrintStyles';
import { useClassStudents } from './hooks/useClassStudents';
import { useSeatLayouts } from './hooks/useSeatLayouts';
import { useConstraints } from './hooks/useConstraints';
import { useArrangementState } from './hooks/useArrangementState';
import { useSeatNotes } from './hooks/useSeatNotes';
import { extractSeats, resizeCells } from './utils/seatGeometry';
import { loadCurrent } from './utils/seatStorage';
import type { CellState, SeatLayout } from './types';
import { Armchair } from 'lucide-react';

export function SeatArrangementPage() {
  const initialCurrent = useMemo(() => loadCurrent(), []);
  const initialClassKey = initialCurrent.classKey;
  const [grade, classNum] = (() => {
    if (!initialClassKey) return [null, null] as [number | null, number | null];
    const parts = initialClassKey.split('-');
    const g = parseInt(parts[0], 10);
    const c = parseInt(parts[1], 10);
    return [Number.isFinite(g) ? g : null, Number.isFinite(c) ? c : null] as [
      number | null,
      number | null,
    ];
  })();
  const [classGrade, setClassGrade] = useState<number | null>(grade);
  const [classNumState, setClassNumState] = useState<number | null>(classNum);

  const classKey = classGrade != null && classNumState != null ? `${classGrade}-${classNumState}` : null;

  const studentsQuery = useClassStudents(classGrade, classNumState);
  const students = studentsQuery.data ?? [];

  const { layouts, createLayout, updateLayout, getLayout } = useSeatLayouts();
  const [currentLayoutId, setCurrentLayoutId] = useState<string | null>(initialCurrent.layoutId ?? null);
  const currentLayout: SeatLayout | undefined = currentLayoutId ? getLayout(currentLayoutId) : undefined;

  // 첫 진입 시 layout 자동 선택
  useEffect(() => {
    if (!currentLayoutId && layouts.length > 0) {
      setCurrentLayoutId(layouts[0].id);
    }
  }, [currentLayoutId, layouts]);

  const {
    constraints,
    addConstraint,
    removeConstraint,
    clearConstraints,
    setFixed,
    removeFixed,
  } = useConstraints(classKey);

  const { arrangement, regenerate, swap, reset } = useArrangementState({
    layout: currentLayout,
    students,
    constraints,
    classKey,
  });

  const { notes, setNotes } = useSeatNotes(classKey);

  const seats = useMemo(
    () => (currentLayout ? extractSeats(currentLayout) : []),
    [currentLayout]
  );
  const availableSeats = useMemo(() => {
    const fixedSeats = new Set(
      constraints.flatMap((c) => (c.kind === 'fixed' ? [c.seat] : []))
    );
    return seats.filter((s) => !fixedSeats.has(s));
  }, [seats, constraints]);

  // 페인트 도구 (null = 배치 모드, 0/1/2 = 페인트 모드)
  const [paintTool, setPaintTool] = useState<CellState | null>(null);

  // 고정 배치 다이얼로그
  const [fixedDialogOpen, setFixedDialogOpen] = useState(false);
  const [fixedDialogSeat, setFixedDialogSeat] = useState<string | null>(null);
  const [fixedDialogResourceId, setFixedDialogResourceId] = useState<string | null>(null);

  const handleSeatClick = (seat: string, currentResourceId: string | null) => {
    setFixedDialogSeat(seat);
    setFixedDialogResourceId(currentResourceId);
    setFixedDialogOpen(true);
  };

  const applyPreset = (input: {
    rows: number;
    columns: number;
    cells: CellState[][];
    pairing: 'single' | 'pair';
    name: string;
  }) => {
    const layout = createLayout({
      name: input.name,
      rows: input.rows,
      columns: input.columns,
      cells: input.cells,
      pairing: input.pairing,
    });
    setCurrentLayoutId(layout.id);
    setPaintTool(null); // 프리셋 적용 후 자동 배치 모드로
    toast.success(`레이아웃 "${input.name}" 적용`);
  };

  const handleResize = (rows: number, columns: number) => {
    if (!currentLayout) return;
    const newCells = resizeCells(currentLayout.cells, rows, columns, 0);
    updateLayout(currentLayout.id, {
      totalRows: rows,
      totalColumns: columns,
      cells: newCells,
    });
  };

  const handlePaint = (row: number, col: number, state: CellState) => {
    if (!currentLayout) return;
    const cell = currentLayout.cells[row]?.[col];
    if (cell === state) return;
    const next = currentLayout.cells.map((rowCells, r) =>
      r === row ? rowCells.map((v, c) => (c === col ? state : v)) : rowCells
    );
    updateLayout(currentLayout.id, { cells: next });
  };

  const handleShuffle = () => {
    if (!currentLayout) {
      toast.error('먼저 좌석 배치도를 생성하세요');
      return;
    }
    if (students.length === 0) {
      toast.error('학년·반을 선택하고 학생을 불러오세요');
      return;
    }
    const seatCount = extractSeats(currentLayout).length;
    if (students.length > seatCount) {
      toast.warning(
        `학생(${students.length}) > 좌석(${seatCount}). 일부 학생은 배치되지 않습니다. 행/열을 늘리거나 X 좌석을 좌석으로 바꾸세요.`
      );
    } else if (seatCount > students.length) {
      toast.message(
        `좌석(${seatCount}) > 학생(${students.length}). 빈 좌석 ${seatCount - students.length}개. 좌석을 줄이려면 빈 칸을 통로/사용불가로 변경하세요.`
      );
    }
    regenerate();
  };

  const handlePrint = () => window.print();

  const handleClassChange = (g: number | null, c: number | null) => {
    setClassGrade(g);
    setClassNumState(c);
  };

  const totalSeats = seats.length;

  return (
    <Layout>
      <PrintStyles />
      <div className="seat-print-page max-w-7xl mx-auto space-y-4">
        {/* 헤더: 타이틀 + 우측 액션 버튼 */}
        <div className="seat-print-hide flex items-center justify-between gap-4 px-1 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Armchair className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">자리 배치</h1>
              <p className="text-xs text-slate-500">
                학급의 학생들을 좌석에 자동 배치하고 제약을 적용합니다.
              </p>
            </div>
          </div>
          <HeaderActions
            onShuffle={handleShuffle}
            onPrint={handlePrint}
            onReset={reset}
            canShuffle={!!currentLayout && students.length > 0}
            canPrint={!!arrangement}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* 좌측: 학급 → 프리셋 → 제약 */}
          <div className="lg:col-span-4 space-y-4 seat-print-hide">
            <Card className="p-4">
              <div className="text-sm font-medium text-slate-700 mb-3">학급 선택</div>
              <ClassSelector
                grade={classGrade}
                classNum={classNumState}
                onChange={handleClassChange}
                studentCount={studentsQuery.isLoading ? undefined : students.length}
              />
            </Card>
            <LayoutPresets studentCount={students.length} onApply={applyPreset} />
            <ConstraintsPanel
              constraints={constraints}
              students={students}
              availableSeats={availableSeats}
              onAdd={addConstraint}
              onRemove={removeConstraint}
              onClear={clearConstraints}
            />
          </div>

          {/* 우측: 통합 좌석판 + 메모 */}
          <div className="lg:col-span-8 space-y-4">
            <ResultBanners
              warnings={arrangement?.warnings}
              unassignedCount={arrangement?.unassigned.length ?? 0}
              emptySeatCount={Math.max(0, totalSeats - students.length)}
            />

            {currentLayout ? (
              <>
                <SeatBoard
                  layout={currentLayout}
                  arrangement={arrangement}
                  students={students}
                  constraints={constraints}
                  paintTool={paintTool}
                  onPaintToolChange={setPaintTool}
                  onResize={handleResize}
                  onPaint={handlePaint}
                  onSwap={swap}
                  onSeatClick={handleSeatClick}
                />
                <SeatNotes
                  value={notes}
                  onChange={setNotes}
                  disabled={!classKey}
                />
              </>
            ) : (
              <Card className="p-12 text-center text-sm text-slate-500">
                좌측 프리셋에서 좌석 배치도를 선택하면 여기에 표시됩니다.
              </Card>
            )}
          </div>
        </div>

        <FixedAssignDialog
          open={fixedDialogOpen}
          onOpenChange={setFixedDialogOpen}
          seat={fixedDialogSeat}
          currentResourceId={fixedDialogResourceId}
          students={students}
          onConfirm={(rid) => {
            if (!fixedDialogSeat) return;
            setFixed(rid, fixedDialogSeat);
            toast.success(`좌석 ${fixedDialogSeat} 고정 적용`);
          }}
          onClear={() => {
            if (fixedDialogResourceId) {
              removeFixed(fixedDialogResourceId);
              toast.success('고정 해제');
            }
          }}
        />
      </div>
    </Layout>
  );
}

export default SeatArrangementPage;
