// ========================================
// File Deletion Preview Component
// Shows files marked for deletion with undo option
// ========================================

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { File, RotateCcw } from 'lucide-react';
import type { TaskFile } from '@/types/tasks';

interface FileDeletionPreviewProps {
  files: TaskFile[];
  onCancelDeletion: (fileId: string) => void;
}

export function FileDeletionPreview({
  files,
  onCancelDeletion,
}: FileDeletionPreviewProps): JSX.Element | null {
  if (files.length === 0) {
    return null;
  }

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-red-700">삭제 예정 파일</h4>
        <Badge variant="destructive">{files.length}개</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        저장 버튼을 누르면 아래 파일들이 삭제됩니다.
      </p>
      <div className="max-h-[200px] min-w-0 space-y-2 overflow-y-auto overflow-x-hidden">
        {files.map((file) => (
          <Card key={file.id} className="min-w-0 max-w-full overflow-hidden border-red-200 bg-red-50">
            <CardContent className="p-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded bg-red-100 flex items-center justify-center">
                    <File className="h-5 w-5 text-red-500" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" title={file.name}>
                    {file.name}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="destructive" className="text-xs">
                      삭제 예정
                    </Badge>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onCancelDeletion(file.id)}
                  className="flex-shrink-0"
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  취소
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
