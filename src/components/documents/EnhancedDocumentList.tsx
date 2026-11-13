import { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EnhancedFileList } from '@/components/ui/file-list';
import { useAuth } from '@/components/auth/AuthProvider';
import { isSubPath } from '@/lib/folderUtils';
import type { Document } from '@/features/documents/types';
import {
  useDeleteDocument,
  useDocumentActions,
  useUpdateDocument,
} from '@/features/documents/hooks/useDocumentsQuery';

/**
 * EnhancedDocumentList - 서류함 단일 문서 리스트 (2026-08-11 탭 제거).
 * 교사 전원이 전체 문서를 열람한다(구 "본인+우선표시" 필터 제거 — 사용자 결정).
 * 수정·삭제 버튼은 EnhancedFileList가 본인/admin 기준으로 게이트하고 RLS가 최종 차단.
 * 문서 데이터는 페이지 레벨 단일 쿼리에서 props로 받는다.
 */
interface EnhancedDocumentListProps {
  documents: Document[];
  loading: boolean;
  folderPath?: string | null;
  onFolderChange?: (folderPath: string) => void;
  /** 리스트 카드 툴바의 "문서 추가" 버튼 클릭 (사용자 피드백: 버튼을 리스트 카드 안에 배치) */
  onAddDocument?: () => void;
}

export const EnhancedDocumentList = ({ documents, loading, folderPath, onFolderChange, onAddDocument }: EnhancedDocumentListProps) => {
  const { isAdmin } = useAuth();
  const updateMutation = useUpdateDocument();
  const deleteMutation = useDeleteDocument();
  const { open, download } = useDocumentActions();

  // 폴더 경로 필터 (전체 문서 대상)
  const filteredDocuments = useMemo(() => {
    if (!folderPath) return documents;
    return documents.filter(doc => isSubPath(doc.meta?.directory_path || '', folderPath));
  }, [documents, folderPath]);

  // 현재 경로 표시용
  const currentPath = useMemo(() => {
    if (!folderPath) return ['전체 문서'];
    return ['전체 문서', ...folderPath.split('/').filter(p => p.trim())];
  }, [folderPath]);

  return (
    <EnhancedFileList
      documents={filteredDocuments}
      loading={loading}
      onDownload={download}
      onDelete={async (id) => {
        const doc = documents.find(d => d.id === id);
        if (doc) await deleteMutation.mutateAsync(doc);
      }}
      onUpdate={(id, data) => updateMutation.mutateAsync({ id, updates: data })}
      onPreview={open}
      onFolderChange={onFolderChange}
      headerActions={onAddDocument ? (
        <Button
          size="sm"
          onClick={onAddDocument}
          className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-3 flex items-center gap-1.5 flex-shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">문서 추가</span>
        </Button>
      ) : undefined}
      showSharedDocuments={false}
      enableBulkActions={true}
      enableSearch={true}
      enableViewModeToggle={true}
      defaultViewMode="list"
      showInfoColumn={true}
      isAdmin={isAdmin}
      currentPath={currentPath}
      showBreadcrumb={true}
      enableFolderView={true}
    />
  );
};
