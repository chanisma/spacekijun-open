import { useState, useCallback } from 'react';
import { ScheduleEvent } from '@/hooks/useSchedule';

export interface EditingEventData {
  title: string;
  kind: string;
  starts_at: string;
  ends_at: string;
  scope?: string;
  assignee?: string;
  exchangeable?: boolean;
  date_only?: boolean;
}

export const useScheduleEdit = () => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EditingEventData | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  // 편집 상태 초기화
  const initializeEdit = useCallback((event: ScheduleEvent) => {
    setEditingEvent({
      title: event.title,
      kind: event.kind,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      scope: (event as any).scope,
      assignee: event.assignee,
      exchangeable: event.exchangeable,
      date_only: event.date_only
    });
    setSelectedDate(new Date(event.starts_at));
    setIsEditing(false);
  }, []);

  // 편집 모드 시작
  const startEdit = useCallback(() => {
    setIsEditing(true);
  }, []);

  // 편집 취소
  const cancelEdit = useCallback((originalEvent: ScheduleEvent) => {
    setEditingEvent({
      title: originalEvent.title,
      kind: originalEvent.kind,
      starts_at: originalEvent.starts_at,
      ends_at: originalEvent.ends_at,
      scope: (originalEvent as any).scope,
      assignee: originalEvent.assignee,
      exchangeable: originalEvent.exchangeable,
      date_only: originalEvent.date_only
    });
    setSelectedDate(new Date(originalEvent.starts_at));
    setIsEditing(false);
  }, []);

  // 편집 완료
  const finishEdit = useCallback(() => {
    setIsEditing(false);
  }, []);

  // 안전한 시간 추출 함수
  const extractTime = useCallback((isoString: string | undefined, defaultTime: string): string => {
    if (!isoString) return defaultTime;
    try {
      const timePart = isoString.split('T')[1];
      if (!timePart) return defaultTime;
      const timeOnly = timePart.split(':').slice(0, 2).join(':');
      return timeOnly || defaultTime;
    } catch (error) {
      console.warn('Time extraction error:', error);
      return defaultTime;
    }
  }, []);

  // 시간 값 가져오기 (UI 표시용) - DB 저장된 값 우선 표시
  const getTimeValue = useCallback((isoString: string | undefined, defaultTime: string): string => {
    try {
      if (!isoString) return defaultTime;
      const timePart = isoString.split('T')[1];
      if (!timePart) return defaultTime;
      const timeOnly = timePart.split(':').slice(0, 2).join(':');
      // DB에 저장된 값이 있으면 그대로 사용, 없으면 기본값
      return timeOnly || defaultTime;
    } catch {
      return defaultTime;
    }
  }, []);

  // 시간 변경 처리
  const handleTimeChange = useCallback((time: string, field: 'starts_at' | 'ends_at') => {
    if (selectedDate && time && editingEvent) {
      const dateTime = new Date(selectedDate);
      const [hour, minute] = time.split(':').map(Number);
      if (!isNaN(hour) && !isNaN(minute)) {
        dateTime.setHours(hour, minute, 0, 0);
        setEditingEvent(prev => prev ? { ...prev, [field]: dateTime.toISOString() } : null);
      }
    }
  }, [selectedDate, editingEvent]);

  // 업데이트 데이터 생성
  const createUpdateData = useCallback((originalEvent: ScheduleEvent) => {
    if (!editingEvent || !selectedDate) return null;

    const startTime = extractTime(editingEvent.starts_at, '09:00');
    const endTime = extractTime(editingEvent.ends_at, '09:50');

    try {
      const startDateTime = new Date(selectedDate);
      const [startHour, startMinute] = startTime.split(':').map(Number);
      if (isNaN(startHour) || isNaN(startMinute)) {
        throw new Error('Invalid start time format');
      }
      startDateTime.setHours(startHour, startMinute, 0, 0);

      const endDateTime = new Date(selectedDate);
      const [endHour, endMinute] = endTime.split(':').map(Number);
      if (isNaN(endHour) || isNaN(endMinute)) {
        throw new Error('Invalid end time format');
      }
      endDateTime.setHours(endHour, endMinute, 0, 0);

      // 날짜가 변경되었는지 확인
      const originalDate = new Date(originalEvent.starts_at);
      const newDate = new Date(selectedDate);
      const dateChanged = originalDate.toDateString() !== newDate.toDateString();

      const updateData: any = {
        title: editingEvent.title,
        kind: editingEvent.kind,
        starts_at: startDateTime.toISOString(),
        ends_at: endDateTime.toISOString(),
        scope: editingEvent.scope,
        assignee: editingEvent.assignee,
        exchangeable: editingEvent.exchangeable,
        date_only: editingEvent.date_only
      };

      // 날짜가 변경되면 meeting.meta.event_date도 업데이트
      if (dateChanged) {
        updateData.event_date = startDateTime.toISOString().split('T')[0]; // YYYY-MM-DD 형식
      }

      return updateData;
    } catch (error) {
      console.error('Error creating update data:', error);
      return null;
    }
  }, [editingEvent, selectedDate, extractTime]);

  return {
    // 상태
    isEditing,
    editingEvent,
    selectedDate,

    // 상태 설정자
    setEditingEvent,
    setSelectedDate,

    // 편집 제어 함수
    initializeEdit,
    startEdit,
    cancelEdit,
    finishEdit,

    // 유틸리티 함수
    extractTime,
    getTimeValue,
    handleTimeChange,
    createUpdateData
  };
};