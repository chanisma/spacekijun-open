import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/AuthProvider';
import { unifiedAuth } from '@/services/unifiedAuth';
import {
  addCodeProjectFiles,
  createCodeProject,
  deleteCodeProject,
  deleteCodeProjectFile,
  forkCodeProject,
  getCodeProject,
  getCodeProjectForkCount,
  listCodeProjectFiles,
  listCodeProjects,
  saveCodeProjectTextFile,
  updateCodeProject,
  type CodeFileUpload,
  type CodeProject,
  type CodeProjectFile,
  type CodeProjectInput,
} from '../services/codeShareService';
import type { CodeProjectVisibility } from '@/lib/codeShare';

export const codeShareKeys = {
  all: ['code-projects'] as const,
  list: (scope: 'all' | 'mine', resourceId: string | null) => ['code-projects', 'list', scope, resourceId] as const,
  detail: (id: string) => ['code-projects', 'detail', id] as const,
  files: (id: string) => ['code-projects', 'files', id] as const,
  forks: (id: string) => ['code-projects', 'forks', id] as const,
};

/** 내 resource id — 학생은 user_resource 가 없으므로 unifiedAuth 가 이메일 prefix 로 푼다 */
export function useMyResourceId() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-resource-id', user?.id ?? null],
    queryFn: () => unifiedAuth.getCurrentResourceId(),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCodeProjects(scope: 'all' | 'mine') {
  const { data: myResourceId = null } = useMyResourceId();
  return useQuery({
    queryKey: codeShareKeys.list(scope, myResourceId),
    queryFn: () => listCodeProjects({ scope, myResourceId }),
    enabled: scope === 'all' || !!myResourceId,
  });
}

export function useCodeProject(id: string | undefined) {
  return useQuery({
    queryKey: codeShareKeys.detail(id ?? ''),
    queryFn: () => getCodeProject(id!),
    enabled: !!id,
  });
}

export function useCodeProjectFiles(id: string | undefined) {
  return useQuery({
    queryKey: codeShareKeys.files(id ?? ''),
    queryFn: () => listCodeProjectFiles(id!),
    enabled: !!id,
  });
}

export function useCodeProjectForkCount(id: string | undefined) {
  return useQuery({
    queryKey: codeShareKeys.forks(id ?? ''),
    queryFn: () => getCodeProjectForkCount(id!),
    enabled: !!id,
  });
}

async function requireResourceId(): Promise<string> {
  const id = await unifiedAuth.getCurrentResourceId();
  if (!id) throw new Error('내 리소스를 찾을 수 없습니다. 프로필에서 이름 등록을 먼저 완료해 주세요.');
  return id;
}

export function useCreateCodeProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ input, files }: { input: CodeProjectInput; files: CodeFileUpload[] }) => {
      const owner = await requireResourceId();
      return createCodeProject(owner, input, files);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: codeShareKeys.all }),
  });
}

export function useUpdateCodeProject(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Parameters<typeof updateCodeProject>[1]) => updateCodeProject(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: codeShareKeys.all }),
  });
}

export function useDeleteCodeProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCodeProject(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: codeShareKeys.all }),
  });
}

export function useForkCodeProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ source, files, title, visibility }: {
      source: CodeProject; files: CodeProjectFile[]; title: string; visibility: CodeProjectVisibility;
    }) => {
      const owner = await requireResourceId();
      return forkCodeProject(owner, source, files, { title, visibility });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: codeShareKeys.all }),
  });
}

export function useSaveCodeProjectTextFile(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) => saveCodeProjectTextFile(projectId, path, content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: codeShareKeys.files(projectId) });
      qc.invalidateQueries({ queryKey: codeShareKeys.detail(projectId) });
    },
  });
}

export function useDeleteCodeProjectFile(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: CodeProjectFile) => deleteCodeProjectFile(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: codeShareKeys.files(projectId) });
      qc.invalidateQueries({ queryKey: codeShareKeys.detail(projectId) });
    },
  });
}

export function useAddCodeProjectFiles(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (files: CodeFileUpload[]) => addCodeProjectFiles(projectId, files),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: codeShareKeys.files(projectId) });
      qc.invalidateQueries({ queryKey: codeShareKeys.detail(projectId) });
    },
  });
}
