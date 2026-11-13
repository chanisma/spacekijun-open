/**
 * 휴대폰으로 결재 서명하기 — 공용 `SignQrCode` 의 얇은 래퍼.
 *
 * 구현은 전자서명과 완전히 같고 링크만 다르다(2026-09-03 공용화). 이 파일을 남겨 둔 이유는
 * 호출부가 이미 이 이름을 쓰고 있어서이고, 새 코드는 `SignQrCode` 를 직접 쓰면 된다.
 */
import React from 'react';
import { SignQrCode } from '@/components/signature/SignQrCode';

interface ApprovalSignQrProps {
  requestId: string;
  className?: string;
  size?: number;
}

export const ApprovalSignQr: React.FC<ApprovalSignQrProps> = ({ requestId, className, size }) => (
  <SignQrCode path={`/approval-sign/${requestId}`} className={className} size={size} />
);

export default ApprovalSignQr;
