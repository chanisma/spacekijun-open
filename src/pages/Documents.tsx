import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { DocumentHeader } from "@/components/documents/DocumentHeader";
import { EnhancedDocumentList } from "@/components/documents/EnhancedDocumentList";
import { AddDocumentDialog } from "@/components/documents/AddDocumentDialog";
import { FolderTree } from "@/components/documents/FolderTree";
import { AIDocumentAssistantDialog } from "@/components/documents/AIDocumentAssistantDialog";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  useCreateFolder,
  useDocumentsList,
  useFolderPaths,
  useMoveFolder,
} from "@/features/documents/hooks/useDocumentsQuery";
import type { DocumentFilters } from "@/features/documents/types";
import { DOCUMENT_FETCH_LIMIT } from "@/features/documents/services/documentService";
import { getParentPath, VirtualFolder } from "@/lib/folderUtils";

const EMPTY_FILTERS: DocumentFilters = { q: '', department: '', dateFrom: null, dateTo: null };

/**
 * 서류함 — 단일 뷰 (2026-08-11 사용자 결정으로 탭 제거).
 * 교사 전원이 전체 폴더 트리·문서를 열람하고(RLS가 교사/admin 전용을 보장),
 * 수정·삭제는 본인 문서 + admin만 가능(리스트 내 버튼 게이트 + RLS).
 * 구 진학자료 탭(경로 '진학' 필터)·admin 문서관리 탭은 이 뷰와 검색으로 대체.
 */
const Documents = () => {
  const { isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null);

  // 통합 검색·필터 — 검색어는 300ms 디바운스 후 서버 쿼리
  const [filters, setFilters] = useState<DocumentFilters>(EMPTY_FILTERS);
  const [debouncedFilters, setDebouncedFilters] = useState<DocumentFilters>(EMPTY_FILTERS);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedFilters(filters), 300);
    return () => clearTimeout(timer);
  }, [filters]);

  // 문서 목록은 페이지 레벨 단일 쿼리 — 트리와 리스트가 캐시를 공유한다
  const { documents, totalCount, isLoading, refetch } = useDocumentsList(debouncedFilters);
  const { folderPaths } = useFolderPaths();
  const moveFolderMutation = useMoveFolder();
  const createFolderMutation = useCreateFolder();
  const truncated = totalCount > DOCUMENT_FETCH_LIMIT;

  // URL 쿼리 파라미터에서 upload=true인 경우 문서 추가 다이얼로그 자동 열기
  useEffect(() => {
    if (searchParams.get('upload') === 'true') {
      setShowAddDialog(true);
      // URL에서 upload 파라미터 제거
      searchParams.delete('upload');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // 폴더 이동: RPC가 폴더·하위 문서 경로를 단일 트랜잭션으로 치환 (admin 전용)
  const handleMoveFolder = async (folder: VirtualFolder, newParentPath: string) => {
    const newPath = newParentPath ? `${newParentPath}/${folder.name}` : folder.name;
    if (newPath === folder.path) return;
    await moveFolderMutation.mutateAsync({ oldPath: folder.path, newPath });
  };

  // 폴더 이름변경: 같은 부모 아래 새 이름으로 이동
  const handleRenameFolder = async (folder: VirtualFolder, newName: string) => {
    const parent = getParentPath(folder.path);
    const newPath = parent ? `${parent}/${newName}` : newName;
    if (newPath === folder.path) return;
    await moveFolderMutation.mutateAsync({ oldPath: folder.path, newPath });
  };

  return (
    <Layout>
      <div className="space-y-6">
        <DocumentHeader
          filters={filters}
          onFiltersChange={setFilters}
          onRefresh={() => refetch()}
          onAIAssistant={() => setShowAIAssistant(true)}
          loading={isLoading}
        />

        {truncated && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            문서가 {totalCount}건이라 최근 {DOCUMENT_FETCH_LIMIT}건만 표시 중입니다. 검색·필터로 범위를 좁혀 주세요.
          </p>
        )}

        <div className="flex gap-4">
          {/* 폴더 사이드바 — 전체 디렉토리 (교사 전원 열람) */}
          <div className="w-64 flex-shrink-0 hidden lg:block">
            <div className="sticky top-4 border rounded-lg bg-card shadow-sm" style={{ height: 'calc(100vh - 200px)' }}>
              <FolderTree
                documents={documents}
                folderPaths={folderPaths}
                currentPath={selectedFolderPath}
                onFolderClick={setSelectedFolderPath}
                onMoveFolder={isAdmin ? handleMoveFolder : undefined}
                onRenameFolder={isAdmin ? handleRenameFolder : undefined}
                onCreateFolder={(path) => createFolderMutation.mutateAsync(path).then(() => undefined)}
                isAdmin={isAdmin}
              />
            </div>
          </div>

          {/* 문서 리스트 — 전체 문서 */}
          <div className="flex-1 min-w-0">
            <EnhancedDocumentList
              documents={documents}
              loading={isLoading}
              folderPath={selectedFolderPath}
              onFolderChange={setSelectedFolderPath}
              onAddDocument={() => setShowAddDialog(true)}
            />
          </div>
        </div>

        {/* AI 검색 도우미 다이얼로그 */}
        <AIDocumentAssistantDialog
          open={showAIAssistant}
          onOpenChange={setShowAIAssistant}
        />

        {showAddDialog && (
          <AddDocumentDialog
            isOpen={showAddDialog}
            onOpenChange={setShowAddDialog}
            onFileUploaded={() => refetch()}
            defaultDirectoryPath={selectedFolderPath}
            isAdmin={isAdmin}
          />
        )}
      </div>
    </Layout>
  );
};

export default Documents;
