import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  archiveDocumentTemplate,
  createDocumentTemplate,
  createDocumentTemplateVersion,
  listDocumentTemplateVersions,
  listDocumentTemplates,
} from '../services/documentTemplateService';

export const documentTemplateKeys = {
  all: ['task-action', 'document-templates'] as const,
  versions: (familyId: string) =>
    ['task-action', 'document-templates', 'versions', familyId] as const,
};

export function useDocumentTemplates() {
  return useQuery({
    queryKey: documentTemplateKeys.all,
    queryFn: listDocumentTemplates,
  });
}

export function useDocumentTemplateVersions(familyId: string | null) {
  return useQuery({
    queryKey: documentTemplateKeys.versions(familyId ?? 'none'),
    queryFn: () => listDocumentTemplateVersions(familyId ?? ''),
    enabled: Boolean(familyId),
  });
}

export function useCreateDocumentTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createDocumentTemplate,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: documentTemplateKeys.all });
    },
  });
}

export function useCreateDocumentTemplateVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createDocumentTemplateVersion,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: documentTemplateKeys.all });
    },
  });
}

export function useArchiveDocumentTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: archiveDocumentTemplate,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: documentTemplateKeys.all });
    },
  });
}
