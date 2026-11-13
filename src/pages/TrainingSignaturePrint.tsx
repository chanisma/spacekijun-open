import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { TrainingSignaturePrintView } from '@/components/schedule/TrainingSignaturePrintView';

export default function TrainingSignaturePrint() {
  const [searchParams] = useSearchParams();

  const meetingId = searchParams.get('meetingId') || '';
  const meetingTitle = searchParams.get('meetingTitle') || '';
  const meetingDate = searchParams.get('meetingDate') || '';
  const meetingTime = searchParams.get('meetingTime') || '09:00 - 17:00';

  if (!meetingId || !meetingTitle) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-red-600 mb-2">오류</h2>
          <p className="text-gray-600">필요한 정보가 누락되었습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <TrainingSignaturePrintView
      meetingId={meetingId}
      meetingTitle={meetingTitle}
      meetingDate={meetingDate}
      meetingTime={meetingTime}
    />
  );
}