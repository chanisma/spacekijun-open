import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { trainingCertificateService } from '../services/trainingCertificateService';

const KEYS = {
  types: ['training-types'] as const,
  myCerts: (rid: string) => ['training-certificates', 'mine', rid] as const,
  allCerts: ['training-certificates', 'all'] as const,
  myProgress: (rid: string) => ['training-progress', 'mine', rid] as const,
  allProgress: ['training-progress', 'all'] as const,
};

export function useTrainingTypes() {
  return useQuery({
    queryKey: KEYS.types,
    queryFn: () => trainingCertificateService.listTrainingTypes(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useMyCertificates(resourceId: string | null) {
  return useQuery({
    queryKey: resourceId ? KEYS.myCerts(resourceId) : ['training-certificates', 'mine', 'none'],
    queryFn: () => trainingCertificateService.listMyCertificates(resourceId as string),
    enabled: !!resourceId,
  });
}

export function useAllCertificates() {
  return useQuery({
    queryKey: KEYS.allCerts,
    queryFn: () => trainingCertificateService.listAllCertificates(),
  });
}

export function useMyProgress(resourceId: string | null) {
  return useQuery({
    queryKey: resourceId ? KEYS.myProgress(resourceId) : ['training-progress', 'mine', 'none'],
    queryFn: () => trainingCertificateService.getMyProgress(resourceId as string),
    enabled: !!resourceId,
  });
}

export function useAllProgress() {
  return useQuery({
    queryKey: KEYS.allProgress,
    queryFn: () => trainingCertificateService.getAllProgress(),
  });
}

export function useCreateCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      resourceId: string;
      trainingTypeId: string;
      title: string;
      hours: number;
      completedAt: string;
      file: File;
    }) => {
      const uploaded = await trainingCertificateService.uploadFile(params.resourceId, params.file);
      return trainingCertificateService.createCertificate({
        resource_id: params.resourceId,
        training_type_id: params.trainingTypeId,
        title: params.title,
        organization: '',
        hours: params.hours,
        completed_at: params.completedAt,
        file_path: uploaded.path,
        file_name: params.file.name,
        file_size: uploaded.size,
        file_mime: uploaded.mime,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['training-certificates'] });
      qc.invalidateQueries({ queryKey: ['training-progress'] });
    },
  });
}

export function useDeleteCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { id: string; filePath?: string | null }) =>
      trainingCertificateService.deleteCertificate(p.id, p.filePath),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['training-certificates'] });
      qc.invalidateQueries({ queryKey: ['training-progress'] });
    },
  });
}

// ---------- Training type management ----------
export function useCreateTrainingType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: trainingCertificateService.createTrainingType.bind(trainingCertificateService),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['training-types'] });
      qc.invalidateQueries({ queryKey: ['training-progress'] });
    },
  });
}

export function useUpdateTrainingType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { id: string; patch: Parameters<typeof trainingCertificateService.updateTrainingType>[1] }) =>
      trainingCertificateService.updateTrainingType(p.id, p.patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['training-types'] });
      qc.invalidateQueries({ queryKey: ['training-progress'] });
    },
  });
}

export function useDeactivateTrainingType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => trainingCertificateService.deactivateTrainingType(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['training-types'] }),
  });
}

export function useDeleteTrainingType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => trainingCertificateService.deleteTrainingType(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['training-types'] });
      qc.invalidateQueries({ queryKey: ['training-progress'] });
    },
  });
}
