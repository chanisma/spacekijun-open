import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { issueService } from '../services/issueService';
import type { DocType, CreateIssueInput } from '../types';

export function useIssues(docTypes: DocType[]) {
  const qc = useQueryClient();
  const key = ['document-issue', ...docTypes];
  // 변경 시 모든 document-issue 목록(탭·유형 무관)을 무효화 — 공통 prefix로 폭넓게.
  // (탭별 queryKey가 docType 단건이라 다건 키로 무효화하면 prefix가 안 맞아 새로고침 누락)
  const invalidateAll = () => qc.invalidateQueries({ queryKey: ['document-issue'] });

  const { data: issues = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: () => issueService.listIssues(docTypes),
  });

  const create = useMutation({
    mutationFn: (input: CreateIssueInput) => issueService.createIssue(input),
    onSuccess: invalidateAll,
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<CreateIssueInput> }) =>
      issueService.updateIssue(id, patch),
    onSuccess: invalidateAll,
  });
  // 삭제 = 소프트 삭제(status='cancelled'). 행은 대장에 남고 발급번호만 표시된다.
  const cancel = useMutation({
    mutationFn: (id: string) => issueService.cancelIssue(id),
    onSuccess: invalidateAll,
  });
  // 개인봉사 배치 일괄 삭제 — 배치 안의 활성 행 전체를 한 번에 취소.
  const cancelBatch = useMutation({
    mutationFn: (ids: string[]) => issueService.cancelIssues(ids),
    onSuccess: invalidateAll,
  });
  // 반별 명단만 교체 (서버 RPC가 담임/작성자/admin 권한 판정 + 다른 반 보존)
  const updateClassRoster = useMutation({
    mutationFn: ({ issueId, grade, cls, students }: {
      issueId: string; grade: number; cls: number;
      students: Parameters<typeof issueService.updateClassRoster>[3];
    }) => issueService.updateClassRoster(issueId, grade, cls, students),
    onSuccess: invalidateAll,
  });
  // 동아리 1개 활동(날짜·시간·내용)만 교체 (서버 RPC가 작성자/admin/그 동아리 담당교사 권한 판정)
  const updateClubActivities = useMutation({
    mutationFn: ({ issueId, clubId, activities }: {
      issueId: string; clubId: string;
      activities: Parameters<typeof issueService.updateClubActivities>[2];
    }) => issueService.updateClubActivities(issueId, clubId, activities),
    onSuccess: invalidateAll,
  });

  // 동아리 1개 확인서 출력 설정(참가 매트릭스 + 제외) 저장 (서버 RPC가 권한 판정)
  const updateClubAttendance = useMutation({
    mutationFn: ({ issueId, clubId, attendance, excludedResourceIds }: {
      issueId: string; clubId: string;
      attendance: Record<string, Record<string, boolean>>;
      excludedResourceIds: string[];
    }) => issueService.updateClubAttendance(issueId, clubId, attendance, excludedResourceIds),
    onSuccess: invalidateAll,
  });

  return { issues, isLoading, create, update, cancel, cancelBatch, updateClassRoster, updateClubActivities, updateClubAttendance };
}
