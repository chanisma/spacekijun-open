import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StudentPicker } from './StudentPicker';
import type { Constraint, SeatStudent } from '../types';

interface ConstraintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: SeatStudent[];
  availableSeats: string[];
  onAdd: (input: Omit<Constraint, 'id'>) => void;
}

type Mode = 'apart' | 'together' | 'fixed';

export function ConstraintDialog({
  open,
  onOpenChange,
  students,
  availableSeats,
  onAdd,
}: ConstraintDialogProps) {
  const [mode, setMode] = useState<Mode>('apart');
  const [picked, setPicked] = useState<string[]>([]);
  const [seat, setSeat] = useState('');
  const [minDistance, setMinDistance] = useState(2);

  const reset = () => {
    setPicked([]);
    setSeat('');
    setMinDistance(2);
  };

  const close = () => {
    onOpenChange(false);
    reset();
  };

  const submit = () => {
    if (mode === 'apart') {
      if (picked.length < 2 || picked.length > 3) return;
      onAdd({
        kind: 'apart',
        resourceIds: picked.slice(),
        minDistance,
      });
    } else if (mode === 'together') {
      if (picked.length < 2) return;
      onAdd({ kind: 'together', resourceIds: picked });
    } else if (mode === 'fixed') {
      if (picked.length !== 1 || !seat) return;
      onAdd({ kind: 'fixed', resourceId: picked[0], seat });
    }
    close();
  };

  const submitDisabled =
    (mode === 'apart' && (picked.length < 2 || picked.length > 3)) ||
    (mode === 'together' && picked.length < 2) ||
    (mode === 'fixed' && (picked.length !== 1 || !seat));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>제약 추가</DialogTitle>
          <DialogDescription>
            자동 배치 시 반영할 조건을 추가합니다.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => { setMode(v as Mode); setPicked([]); }}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="apart">떨어뜨림</TabsTrigger>
            <TabsTrigger value="together">함께</TabsTrigger>
            <TabsTrigger value="fixed">고정 좌석</TabsTrigger>
          </TabsList>

          <TabsContent value="apart" className="space-y-3 pt-3">
            <p className="text-sm text-slate-500">
              두 명 또는 세 명의 학생을 선택하세요. 선택한 학생들끼리 모두 체비셰프 거리(행/열 차의 최댓값)가 지정 거리 이상이 되도록 배치합니다.
            </p>
            <StudentPicker
              students={students}
              selectedIds={picked}
              onChange={setPicked}
              max={3}
            />
            <div className="flex items-center gap-2">
              <Label className="text-sm">최소 거리</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={minDistance}
                onChange={(e) =>
                  setMinDistance(Math.min(Math.max(parseInt(e.target.value, 10) || 1, 1), 10))
                }
                className="w-20"
              />
              <span className="text-xs text-slate-500">(기본 2 = 한 칸 이상 띄움)</span>
            </div>
          </TabsContent>

          <TabsContent value="together" className="space-y-3 pt-3">
            <p className="text-sm text-slate-500">
              함께 인접 좌석에 배치할 학생들을 선택하세요. 모두가 그룹 멤버 중 누군가와 직접 인접하도록 배치합니다.
            </p>
            <StudentPicker
              students={students}
              selectedIds={picked}
              onChange={setPicked}
              max={6}
            />
          </TabsContent>

          <TabsContent value="fixed" className="space-y-3 pt-3">
            <p className="text-sm text-slate-500">
              학생 한 명을 특정 좌석에 고정합니다. (좌석 배치도에서 좌석 클릭으로도 가능)
            </p>
            <StudentPicker
              students={students}
              selectedIds={picked}
              onChange={setPicked}
              max={1}
              multi={false}
            />
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">좌석 번호</Label>
              <Select value={seat} onValueChange={setSeat}>
                <SelectTrigger>
                  <SelectValue placeholder="좌석 선택" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {availableSeats.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            취소
          </Button>
          <Button onClick={submit} disabled={submitDisabled}>
            추가
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
