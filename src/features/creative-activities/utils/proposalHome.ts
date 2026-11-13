import type { ActivityProposalRow, ProposalStatus } from '../types';

export const proposalStatusLabels: Record<ProposalStatus, string> = {
  submitted: '접수',
  reviewing: '검토 중',
  accepted: '수락',
  declined: '보류',
};

export const proposalBoardUrl = (id?: string) =>
  `/activities?scope=proposals${id ? `&proposal=${encodeURIComponent(id)}` : ''}`;

export function summarizeHomeProposals(proposals: ActivityProposalRow[], studentCode: string | null) {
  const pending = proposals
    .filter(p => p.status === 'submitted' || p.status === 'reviewing')
    .sort((a, b) => Number(a.status === 'reviewing') - Number(b.status === 'reviewing')
      || a.created_at.localeCompare(b.created_at));
  const mine = studentCode
    ? proposals.filter(p => p.proposer_student_code === studentCode)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    : [];
  const discover = pending.filter(p => p.proposer_student_code !== studentCode)
    .sort((a, b) => Number(b.my_interest) - Number(a.my_interest)
      || b.created_at.localeCompare(a.created_at));
  return { pending, mine, discover };
}
