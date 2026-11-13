// ========================================
// 실물 제출 — 매니저가 붙이는 「제출 양식」 (2026-10-01, 할 일 편집 창의 제출 받기 설정)
//
// 이미 올라간 양식(`forms`)과 이번에 고른 파일(`pending`, 저장 때 올린다)을 한 목록에 보인다.
// 새 할 일은 id 가 없어 지금 올릴 수 없으므로 고르기만 하고, 업로드는 편집 창의 저장 단계가 한다.
// 저장 위치는 **구글 공용 드라이브**(파일 제출과 같은 폴더 맥락 — uploadSubmissionFormToDrive).
// 크기 제한·드라이브 연결은 고를 때 먼저 말한다 — 저장을 누른 뒤에 실패하면 무엇이 문제인지 늦게 안다.
// ========================================

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Clock3, FileText, Paperclip, X } from 'lucide-react';
import { DEFAULT_MAX_FILE_SIZE } from '@/components/ui/file-upload-utils';
import { getGoogleDriveService } from '@/services/googleDriveServiceNew';
import { DriveConnectButton } from '@/components/auth/DriveConnectButton';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { TaskFile } from '@/types/tasks';

// 파일 제출(MultiFileUpload)과 같은 상한
const MAX_FORM_BYTES = DEFAULT_MAX_FILE_SIZE;
const MAX_FORM_MB = Math.round(MAX_FORM_BYTES / (1024 * 1024));

interface PhysicalFormFilesFieldProps {
  forms: TaskFile[];
  pending: File[];
  onRemoveForm: (id: string) => void;
  onPendingChange: (files: File[]) => void;
  unitMode: boolean;
  /**
   * 주면 연결이 끊겼을 때 [드라이브 연결] 버튼을 보인다(구글 팝업 — 화면·고른 파일이 남는다).
   * 팝업이 안 되면 페이지 이동으로 연결하는데, 그때 돌아올 주소다.
   */
  driveReturnPath?: string;
}

export function PhysicalFormFilesField({
  forms, pending, onRemoveForm, onPendingChange, unitMode, driveReturnPath,
}: PhysicalFormFilesFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // 드라이브 연결: null=확인 중 / false=연결 안 됨. 저장 때 실패하면 고른 파일은 남고 창도 닫히지 않지만,
  // 미리 알려야 매니저가 헛걸음하지 않는다. «유효한가»까지 본다 — 토큰이 있기만 한지(isAuthenticated)로
  // 보면 로그인 한 시간 뒤 만료된 토큰도 «연결됨»으로 보인다
  const [driveReady, setDriveReady] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    getGoogleDriveService().hasValidToken()
      .then(ok => { if (!cancelled) setDriveReady(ok); })
      .catch(() => { if (!cancelled) setDriveReady(false); });
    return () => { cancelled = true; };
  }, []);

  const add = (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list);
    const tooBig = picked.filter(f => f.size > MAX_FORM_BYTES);
    if (tooBig.length > 0) {
      toast.error(`${MAX_FORM_MB}MB를 넘는 파일은 올릴 수 없습니다: ${tooBig.map(f => f.name).join(', ')}`);
    }
    onPendingChange([...pending, ...picked.filter(f => f.size <= MAX_FORM_BYTES)]);
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">제출 양식 (선택)</Label>
      {(forms.length > 0 || pending.length > 0) && (
        <ul className="space-y-1">
          {forms.map(form => (
            <li key={form.id} className="flex min-w-0 items-center gap-2 rounded-md border bg-white px-2 py-1.5">
              <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 truncate text-xs text-slate-700" title={form.name}>{form.name}</span>
              <button
                type="button"
                onClick={() => onRemoveForm(form.id)}
                className="shrink-0 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                aria-label={`${form.name} 빼기`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {pending.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex min-w-0 items-center gap-2 rounded-md border border-dashed bg-slate-50 px-2 py-1.5">
              <Clock3 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 truncate text-xs text-slate-700" title={file.name}>{file.name}</span>
              <span className="shrink-0 text-[10px] text-slate-400">저장 때 올림</span>
              <button
                type="button"
                onClick={() => onPendingChange(pending.filter((_, i) => i !== index))}
                className="shrink-0 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                aria-label={`${file.name} 빼기`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={e => {
          add(e.target.files);
          e.target.value = ''; // 같은 파일을 다시 고를 수 있게
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 w-full gap-1.5 border-dashed text-xs text-slate-600"
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip className="h-3.5 w-3.5" />
        양식 파일 첨부
      </Button>
      {driveReady === false && (
        <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {driveReturnPath ? (
            <span className="min-w-0 flex-1">
              구글 드라이브 연결이 끊겨 양식을 올릴 수 없습니다. 구글 창에서 다시 연결해 주세요.
              <DriveConnectButton className="mt-1 flex" returnPath={driveReturnPath} onConnected={() => setDriveReady(true)} />
            </span>
          ) : (
            <span className="min-w-0">
              구글 드라이브에 연결돼 있지 않습니다. 저장할 때 연결 창이 뜨면 연결한 뒤 다시 저장해 주세요 — 고른 파일은 남아 있습니다.
            </span>
          )}
        </p>
      )}
      <p className="text-[11px] leading-snug text-slate-500">
        양식은 구글 공용 드라이브에 올라갑니다. 대상자는 제출 화면에서 양식을 열어 작성한 뒤 실물로 냅니다. 받았는지는 제출 화면에서 책임자가 [받음]으로
        체크하며, 그때 그 담당자가 완료됩니다.
      </p>
      {unitMode && (
        <p className="text-[11px] text-rose-600">과제 단위 할 일에는 실물로 받기를 쓸 수 없습니다.</p>
      )}
    </div>
  );
}
