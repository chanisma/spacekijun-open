/**
 * 서류함 TanStack Query 훅 — 구 useDocuments(수동 state, 컴포넌트별 중복 fetch)를 대체.
 * 목록은 ['documents', filters] 한 키로 캐시되어 탭·트리·리스트가 한 번의
 * 네트워크 호출을 공유하고, mutation은 invalidate로 갱신한다(refreshKey 재마운트 제거).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/components/auth/AuthProvider';
import type { Document, DocumentFilters, DocumentUploadMetadata } from '../types';
import {
  createFolder,
  deleteDocument,
  downloadDocument,
  fetchDocuments,
  fetchFolderPaths,
  moveFolder,
  openDocumentInNewTab,
  updateDocument,
  uploadDocument,
} from '../services/documentService';

const DOCUMENTS_KEY = 'documents';
const FOLDERS_KEY = 'document-folders';

function filtersKey(filters: DocumentFilters) {
  return {
    q: filters.q ?? '',
    department: filters.department ?? '',
    dateFrom: filters.dateFrom ? filters.dateFrom.toISOString().slice(0, 10) : '',
    dateTo: filters.dateTo ? filters.dateTo.toISOString().slice(0, 10) : '',
  };
}

/** 문서 목록 (교사/admin 전용 — RLS 강제). filters는 서버 사이드 적용 */
export function useDocumentsList(filters: DocumentFilters = {}) {
  const query = useQuery({
    queryKey: [DOCUMENTS_KEY, filtersKey(filters)],
    queryFn: () => fetchDocuments(filters),
    staleTime: 30_000,
  });

  return {
    documents: query.data?.documents ?? [],
    totalCount: query.data?.totalCount ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/** 폴더 registry (빈 폴더 포함 트리 합성용) */
export function useFolderPaths() {
  const query = useQuery({
    queryKey: [FOLDERS_KEY],
    queryFn: fetchFolderPaths,
    staleTime: 60_000,
  });
  return { folderPaths: query.data ?? [], isLoading: query.isLoading };
}

function useInvalidateDocuments() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: [DOCUMENTS_KEY] });
    queryClient.invalidateQueries({ queryKey: [FOLDERS_KEY] });
  };
}

export function useUploadDocument() {
  const { user } = useAuth();
  const { toast } = useToast();
  const invalidate = useInvalidateDocuments();

  return useMutation({
    mutationFn: ({
      file,
      metadata,
      directoryPath,
    }: {
      file: File;
      metadata: DocumentUploadMetadata;
      directoryPath?: string | null;
    }) => {
      if (!user) throw new Error('로그인이 필요합니다.');
      return uploadDocument(file, user.id, metadata, directoryPath);
    },
    onSuccess: () => {
      invalidate();
    },
    onError: (error) => {
      console.error('문서 업로드 오류:', error);
      toast({ title: '오류', description: '문서 업로드에 실패했습니다.', variant: 'destructive' });
    },
  });
}

export function useUpdateDocument() {
  const { toast } = useToast();
  const invalidate = useInvalidateDocuments();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof updateDocument>[1] }) =>
      updateDocument(id, updates),
    onSuccess: () => {
      invalidate();
      toast({ title: '성공', description: '문서가 수정되었습니다.' });
    },
    onError: (error) => {
      console.error('문서 수정 오류:', error);
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '문서 수정에 실패했습니다.',
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteDocument() {
  const { toast } = useToast();
  const invalidate = useInvalidateDocuments();

  return useMutation({
    mutationFn: (doc: Document) => deleteDocument(doc),
    onSuccess: (result) => {
      invalidate();
      if (result.driveDeleted === false) {
        toast({
          title: '경고',
          description: 'Google Drive 원본 삭제에 실패해 시스템 레코드만 삭제되었습니다.',
          variant: 'destructive',
        });
      } else {
        toast({ title: '성공', description: '문서가 삭제되었습니다.' });
      }
    },
    onError: (error) => {
      console.error('문서 삭제 오류:', error);
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '문서 삭제에 실패했습니다.',
        variant: 'destructive',
      });
    },
  });
}

export function useCreateFolder() {
  const { toast } = useToast();
  const invalidate = useInvalidateDocuments();

  return useMutation({
    mutationFn: (path: string) => createFolder(path),
    onSuccess: () => {
      invalidate();
      toast({ title: '완료', description: '폴더가 생성되었습니다.' });
    },
    onError: (error) => {
      console.error('폴더 생성 오류:', error);
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '폴더 생성에 실패했습니다.',
        variant: 'destructive',
      });
    },
  });
}

export function useMoveFolder() {
  const { toast } = useToast();
  const invalidate = useInvalidateDocuments();

  return useMutation({
    mutationFn: ({ oldPath, newPath }: { oldPath: string; newPath: string }) => moveFolder(oldPath, newPath),
    onSuccess: (movedCount, { newPath }) => {
      invalidate();
      toast({ title: '완료', description: `폴더가 "${newPath}"(으)로 이동되었습니다. (문서 ${movedCount}개 갱신)` });
    },
    onError: (error) => {
      console.error('폴더 이동 오류:', error);
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '폴더 이동에 실패했습니다.',
        variant: 'destructive',
      });
    },
  });
}

/** 열람(새 창)·다운로드 — 캐시 무관 액션이라 mutation 없이 헬퍼로 노출 */
export function useDocumentActions() {
  const { toast } = useToast();

  const open = async (doc: Document) => {
    try {
      await openDocumentInNewTab(doc);
    } catch (error) {
      console.error('파일 열람 오류:', error);
      toast({ title: '오류', description: '파일을 열 수 없습니다.', variant: 'destructive' });
    }
  };

  const download = async (doc: Document) => {
    try {
      await downloadDocument(doc);
    } catch (error) {
      console.error('파일 다운로드 오류:', error);
      toast({ title: '오류', description: '파일 다운로드에 실패했습니다.', variant: 'destructive' });
    }
  };

  return { open, download };
}
