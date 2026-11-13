import { useState } from 'react';
import { Pencil, Trash2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  type CurriculumRow,
  useUpdateCurriculumRow,
  useDeleteCurriculumRow,
} from '../hooks/useCurriculum';

interface Props {
  category: string;
  semesterLabel: string;
  rows: CurriculumRow[];
  admissionYear: number;
  onClose: () => void;
}

export function CurriculumCellPanel({ category, semesterLabel, rows, admissionYear, onClose }: Props) {
  const { toast } = useToast();
  const updateMut = useUpdateCurriculumRow();
  const deleteMut = useDeleteCurriculumRow();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ subject: string; credits: string; hours: string; grading_type: string }>({
    subject: '', credits: '', hours: '', grading_type: '',
  });

  const startEdit = (row: CurriculumRow) => {
    setEditingId(row.id);
    setDraft({
      subject: row.subject,
      credits: String(row.credits),
      hours: row.hours != null ? String(row.hours) : '',
      grading_type: row.grading_type ?? '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (row: CurriculumRow) => {
    const credits = parseInt(draft.credits, 10);
    if (!Number.isFinite(credits)) {
      toast({ title: '학점은 숫자여야 합니다', variant: 'destructive' });
      return;
    }
    const hours = draft.hours.trim() === '' ? null : parseInt(draft.hours, 10);
    if (hours !== null && !Number.isFinite(hours)) {
      toast({ title: '시수는 숫자여야 합니다', variant: 'destructive' });
      return;
    }
    if (!draft.subject.trim()) {
      toast({ title: '과목명은 비울 수 없습니다', variant: 'destructive' });
      return;
    }
    try {
      await updateMut.mutateAsync({
        id: row.id,
        patch: {
          subject: draft.subject.trim(),
          credits,
          hours,
          grading_type: draft.grading_type.trim() || null,
        },
      });
      setEditingId(null);
    } catch (e) {
      toast({ title: '수정 실패', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  const handleDelete = async (row: CurriculumRow) => {
    if (!confirm(`"${row.subject}" 행을 삭제하시겠습니까?`)) return;
    try {
      await deleteMut.mutateAsync({ id: row.id, admissionYear });
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  return (
    <div className="border rounded-lg bg-card shadow-sm">
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h3 className="font-semibold text-base">
            {category} <span className="text-muted-foreground mx-1">·</span> {semesterLabel}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {rows.length}개 과목 · 합계 {rows.reduce((s, r) => s + r.credits, 0)}학점
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[28%]">과목명</TableHead>
            <TableHead className="w-[10%] text-right">시수</TableHead>
            <TableHead className="w-[10%] text-right">학점</TableHead>
            <TableHead className="w-[28%]">성적처리유형</TableHead>
            <TableHead className="w-[12%]">분류</TableHead>
            <TableHead className="w-[12%] text-right">작업</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const isEditing = editingId === row.id;
            return (
              <TableRow key={row.id}>
                <TableCell>
                  {isEditing ? (
                    <Input
                      value={draft.subject}
                      onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                      className="h-8"
                    />
                  ) : (
                    <span className="font-medium">{row.subject}</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {isEditing ? (
                    <Input
                      value={draft.hours}
                      onChange={(e) => setDraft({ ...draft, hours: e.target.value })}
                      className="h-8 text-right"
                      inputMode="numeric"
                    />
                  ) : (
                    row.hours ?? '—'
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {isEditing ? (
                    <Input
                      value={draft.credits}
                      onChange={(e) => setDraft({ ...draft, credits: e.target.value })}
                      className="h-8 text-right"
                      inputMode="numeric"
                    />
                  ) : (
                    row.credits
                  )}
                </TableCell>
                <TableCell>
                  {isEditing ? (
                    <Input
                      value={draft.grading_type}
                      onChange={(e) => setDraft({ ...draft, grading_type: e.target.value })}
                      className="h-8 text-xs"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">{row.grading_type ?? '—'}</span>
                  )}
                </TableCell>
                <TableCell>
                  {row.subject_type ? (
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {row.subject_type}
                    </Badge>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-right">
                  {isEditing ? (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => saveEdit(row)} disabled={updateMut.isPending}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={cancelEdit}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => startEdit(row)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(row)} disabled={deleteMut.isPending}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
