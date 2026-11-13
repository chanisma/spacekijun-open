import { useMemo } from 'react';
import { useTrainingTypes, useAllCertificates, useMyCertificates } from './useTrainingCertificates';
import { useAllTeachers, teacherLabel } from './useAllTeachers';
import type { TrainingCertificateWithType, TrainingType } from '../types';

export interface GridRow {
  resourceId: string;
  name: string;
  label: string;
  /** training_type_id → cert (등록된 것만) */
  byType: Record<string, TrainingCertificateWithType>;
}

/**
 * isManager=true  → 전체 교사 행 + 모든 cert
 * isManager=false → 본인 한 행 + 본인 cert
 */
export function useCertificateGrid(params: {
  isManager: boolean;
  myResourceId: string | null;
  myName: string;
}) {
  const { isManager, myResourceId, myName } = params;
  const { data: types = [] } = useTrainingTypes();
  const allCertsQ = useAllCertificates();
  const myCertsQ = useMyCertificates(isManager ? null : myResourceId);
  const { data: teacherMeta = [] } = useAllTeachers();

  const certs = isManager ? (allCertsQ.data ?? []) : (myCertsQ.data ?? []);

  const rows: GridRow[] = useMemo(() => {
    const map = new Map<string, GridRow>();
    if (isManager) {
      for (const t of teacherMeta) {
        map.set(t.id, { resourceId: t.id, name: t.name, label: teacherLabel(t), byType: {} });
      }
    } else if (myResourceId) {
      map.set(myResourceId, { resourceId: myResourceId, name: myName, label: '', byType: {} });
    }
    for (const c of certs) {
      const row = map.get(c.resource_id);
      if (row) row.byType[c.training_type_id] = c;
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [isManager, teacherMeta, myResourceId, myName, certs]);

  return {
    types: types as TrainingType[],
    rows,
    isLoading: isManager ? allCertsQ.isLoading : myCertsQ.isLoading,
  };
}
