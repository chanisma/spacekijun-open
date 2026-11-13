import { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { IssueRegisterShell } from '../components/IssueRegisterShell';
import { IssueLedger } from '../components/IssueLedger';
import { IssueCreateDialog } from '../components/IssueCreateDialog';
import { useIssues } from '../hooks/useIssues';
import type { DocType, DocumentIssue } from '../types';

const GAJEONG_TYPES: DocType[] = ['gajeong'];

export function GajeongRegisterPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentIssue | null>(null);

  const { issues } = useIssues(GAJEONG_TYPES);

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const onEdit = (i: DocumentIssue) => { setEditing(i); setDialogOpen(true); };
  const onClose = () => { setDialogOpen(false); setEditing(null); };

  return (
    <Layout>
      <IssueRegisterShell
        count={issues.length}
        issueLabel="발급"
        onIssue={openCreate}
      >
        <IssueLedger docTypes={GAJEONG_TYPES} variant="gajeong" onEdit={onEdit} />
      </IssueRegisterShell>

      {dialogOpen && (
        <IssueCreateDialog
          open={dialogOpen}
          docType="gajeong"
          docTypesForList={GAJEONG_TYPES}
          editing={editing ?? undefined}
          onClose={onClose}
        />
      )}
    </Layout>
  );
}

export default GajeongRegisterPage;
