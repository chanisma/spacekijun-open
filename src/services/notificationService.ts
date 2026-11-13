import { supabase } from '@/integrations/supabase/client';

export interface NotificationData {
  type: 'schedule_created' | 'schedule_updated' | 'schedule_cancelled' | 'duty_assigned' | 'training_scheduled' | 'user_connection_completed' | 'class_swap_requested' | 'class_swap_approved' | 'class_swap_rejected' | 'class_swap_cancelled';
  title: string;
  message: string;
  resource_id: string;
  related_id?: string; // meeting_id or other related entity ID
  priority?: 'low' | 'medium' | 'high';
  meta?: Record<string, any>; // Additional metadata
}

export class NotificationService {
  /**
   * 알림 생성 (즉시 또는 예약)
   */
  static async createNotification(data: NotificationData): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('notification_events')
        .insert([{
          type: data.type,
          title: data.title,
          message: data.message,
          resource_id: data.resource_id,
          related_meeting_id: data.related_id,
          meta: data.meta || {},
          is_read: false
        }]);

      if (error) {
        console.error('알림 생성 오류:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('알림 생성 중 오류:', error);
      return false;
    }
  }

  /**
   * 스케줄 생성 시 알림
   */
  static async notifyScheduleCreated(
    meetingId: string,
    title: string,
    kind: string,
    startDateTime: string,
    creatorResourceId: string,
    participantResourceIds?: string[]
  ): Promise<void> {
    const startDate = new Date(startDateTime);
    const formattedDate = startDate.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });
    const formattedTime = startDate.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    // 일정 유형별 메시지 생성
    const getTypeLabel = (kind: string) => {
      switch (kind) {
        case 'schedule': return '학사일정';
        case 'event': return '출장';
        case 'duty': return '근무';
        case 'training': return '연수';
        case 'document_submission': return '서류제출';
        case 'personal': return '개인일정';
        default: return '일정';
      }
    };

    const typeLabel = getTypeLabel(kind);
    const notificationTitle = `새로운 ${typeLabel} 등록`;
    const notificationMessage = `${title}\n📅 ${formattedDate}\n⏰ ${formattedTime}`;

    // 생성자에게 확인 알림
    await this.createNotification({
      type: 'schedule_created',
      title: notificationTitle,
      message: `${typeLabel}이 성공적으로 등록되었습니다.\n\n${notificationMessage}`,
      resource_id: creatorResourceId,
      related_id: meetingId,
      priority: ['duty', 'training', 'document_submission'].includes(kind) ? 'high' : 'medium'
    });

    // 참여자들에게 알림 (참여자가 있는 경우)
    if (participantResourceIds && participantResourceIds.length > 0) {
      const participantPromises = participantResourceIds.map(resourceId =>
        this.createNotification({
          type: 'schedule_created',
          title: notificationTitle,
          message: `새로운 ${typeLabel}에 참여하게 되었습니다.\n\n${notificationMessage}`,
          resource_id: resourceId,
          related_id: meetingId,
          priority: ['duty', 'training', 'document_submission'].includes(kind) ? 'high' : 'medium'
        })
      );
      await Promise.all(participantPromises);
    }
  }

  /**
   * 교사 이름으로 리소스 ID 찾기
   */
  static async findResourceIdsByTeacherNames(teacherNames: string[]): Promise<string[]> {
    try {
      const { data: resources, error } = await supabase
        .from('resource')
        .select('id')
        .in('name', teacherNames)
        .eq('type', 'teacher');

      if (error) {
        console.error('교사 리소스 ID 조회 오류:', error);
        return [];
      }

      return resources?.map(r => r.id) || [];
    } catch (error) {
      console.error('교사 리소스 ID 조회 중 오류:', error);
      return [];
    }
  }

  /**
   * 스케줄 수정 시 알림
   */
  static async notifyScheduleUpdated(
    meetingId: string,
    title: string,
    kind: string,
    startDateTime: string,
    updaterResourceIds: string[]
  ): Promise<void> {
    const getTypeLabel = (kind: string) => {
      switch (kind) {
        case 'schedule': return '학사일정';
        case 'event': return '출장';
        case 'duty': return '근무';
        case 'training': return '연수';
        case 'document_submission': return '서류제출';
        case 'personal': return '개인일정';
        default: return '일정';
      }
    };

    const typeLabel = getTypeLabel(kind);

    const promises = updaterResourceIds.map(resourceId =>
      this.createNotification({
        type: 'schedule_updated',
        title: `${typeLabel} 변경 알림`,
        message: `${title} 일정이 수정되었습니다.\n새로운 시간을 확인해주세요.`,
        resource_id: resourceId,
        related_id: meetingId,
        priority: 'medium'
      })
    );

    await Promise.all(promises);
  }

  /**
   * 스케줄 취소 시 알림
   */
  static async notifyScheduleCancelled(
    meetingId: string,
    title: string,
    kind: string,
    participantResourceIds: string[]
  ): Promise<void> {
    const getTypeLabel = (kind: string) => {
      switch (kind) {
        case 'schedule': return '학사일정';
        case 'event': return '출장';
        case 'duty': return '근무';
        case 'training': return '연수';
        case 'document_submission': return '서류제출';
        case 'personal': return '개인일정';
        default: return '일정';
      }
    };

    const typeLabel = getTypeLabel(kind);

    const promises = participantResourceIds.map(resourceId =>
      this.createNotification({
        type: 'schedule_cancelled',
        title: `${typeLabel} 취소 알림`,
        message: `${title} 일정이 취소되었습니다.`,
        resource_id: resourceId,
        related_id: meetingId,
        priority: 'high'
      })
    );

    await Promise.all(promises);
  }

  /**
   * 알림 읽음 처리
   */
  static async markAsRead(notificationId: string, resourceId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('notification_events')
        .update({ is_read: true })
        .eq('id', notificationId)
        .eq('resource_id', resourceId);

      return !error;
    } catch (error) {
      console.error('알림 읽음 처리 오류:', error);
      return false;
    }
  }

  /**
   * 리소스의 읽지 않은 알림 수 조회
   */
  static async getUnreadCount(resourceId: string): Promise<number> {
    try {
      const { count, error } = await supabase
        .from('notification_events')
        .select('*', { count: 'exact', head: true })
        .eq('resource_id', resourceId)
        .eq('is_read', false);

      return error ? 0 : (count || 0);
    } catch (error) {
      console.error('읽지 않은 알림 수 조회 오류:', error);
      return 0;
    }
  }

  /**
   * 사용자 연결 완료 시 알림
   */
  static async notifyUserConnectionCompleted(resourceId: string, userName: string): Promise<void> {
    // 시스템 설정에서 환영 메시지 가져오기
    const welcomeConfig = await this.getWelcomeNotificationConfig();

    // {userName} 플레이스홀더 치환
    const message = welcomeConfig.message.replace(/{userName}/g, userName);

    await this.createNotification({
      type: 'user_connection_completed',
      title: welcomeConfig.title,
      message: message,
      resource_id: resourceId,
      priority: 'high'
    });
  }

  /**
   * 환영 알림 설정 조회 (system_settings 테이블에서)
   */
  private static async getWelcomeNotificationConfig(): Promise<{ title: string; message: string }> {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'welcome_notification')
        .single();

      if (!error && data?.setting_value) {
        return {
          title: (data.setting_value as any).title || this.getDefaultWelcomeConfig().title,
          message: (data.setting_value as any).message || this.getDefaultWelcomeConfig().message
        };
      }
    } catch (error) {
      console.warn('환영 알림 설정 조회 실패, 기본값 사용:', error);
    }

    // 설정이 없거나 오류 발생 시 기본값 반환
    return this.getDefaultWelcomeConfig();
  }

  /**
   * 기본 환영 알림 설정
   */
  private static getDefaultWelcomeConfig(): { title: string; message: string } {
    return {
      title: 'SPACEKIJUN 사용 환영합니다! 🎉',
      message: '{userName}님, 사용자 연결이 완료되었습니다.\n\nSPACEKIJUN의 모든 기능을 이용하실 수 있습니다.\n\n📚 사용 안내: https://docs.google.com/presentation/d/1k6Z77FlullY7dTXFEXR3n6U2Zyr29Y94F5854MFhyyA/'
    };
  }


  /**
   * 수업 교체 요청 알림
   */
  static async notifyClassSwapRequested(
    swapId: string,
    requesterName: string,
    requesterSection: string,
    approverResourceId: string,
    approverSection: string,
    swapDate: string,
    requesterWeekday: number,
    requesterPeriod: number,
    approverWeekday: number,
    approverPeriod: number
  ): Promise<void> {
    const weekdayLabels = ['', '월', '화', '수', '목', '금', '토', '일'];
    const formattedDate = new Date(swapDate).toLocaleDateString('ko-KR', {
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });

    await this.createNotification({
      type: 'class_swap_requested',
      title: '수업 교체 요청',
      message: `${requesterName} 선생님이 수업 교체를 요청했습니다.\n\n📅 교체 날짜: ${formattedDate}\n\n내 수업: ${approverSection} (${weekdayLabels[approverWeekday]}${approverPeriod}교시)\n↕ 교체\n요청 수업: ${requesterSection} (${weekdayLabels[requesterWeekday]}${requesterPeriod}교시)`,
      resource_id: approverResourceId,
      priority: 'high',
      meta: {
        swap_id: swapId,
        requester_name: requesterName,
        swap_date: swapDate
      }
    });
  }

  /**
   * 수업 교체 승인 알림
   */
  static async notifyClassSwapApproved(
    swapId: string,
    requesterResourceId: string,
    approverName: string,
    requesterSection: string,
    approverSection: string,
    swapDate: string
  ): Promise<boolean> {
    const formattedDate = new Date(swapDate).toLocaleDateString('ko-KR', {
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });

    await this.createNotification({
      type: 'class_swap_approved',
      title: '수업 교체 승인됨 ✅',
      message: `${approverName} 선생님이 수업 교체를 승인했습니다.\n\n📅 ${formattedDate}\n\n교체 내용:\n내 수업: ${requesterSection}\n상대 수업: ${approverSection}\n\n시간표가 자동으로 변경되었습니다.`,
      resource_id: requesterResourceId,
      priority: 'high',
      meta: {
        swap_id: swapId,
        approver_name: approverName,
        swap_date: swapDate
      }
    });

    return true;
  }

  /**
   * 수업 교체 거절 알림
   */
  static async notifyClassSwapRejected(
    swapId: string,
    requesterResourceId: string,
    approverName: string,
    requesterSection: string,
    approverSection: string,
    swapDate: string,
    rejectionReason?: string
  ): Promise<boolean> {
    const formattedDate = new Date(swapDate).toLocaleDateString('ko-KR', {
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });

    const reasonText = rejectionReason ? `\n\n사유: ${rejectionReason}` : '';

    await this.createNotification({
      type: 'class_swap_rejected',
      title: '수업 교체 거절됨',
      message: `${approverName} 선생님이 수업 교체를 거절했습니다.\n\n📅 ${formattedDate}\n교체 요청: ${requesterSection} ↔ ${approverSection}${reasonText}`,
      resource_id: requesterResourceId,
      priority: 'medium',
      meta: {
        swap_id: swapId,
        approver_name: approverName,
        swap_date: swapDate,
        rejection_reason: rejectionReason
      }
    });

    return true;
  }

  /**
   * 수업 교체 취소 알림
   */
  static async notifyClassSwapCancelled(
    swapId: string,
    approverResourceId: string,
    requesterName: string,
    requesterSection: string,
    approverSection: string,
    swapDate: string
  ): Promise<void> {
    const formattedDate = new Date(swapDate).toLocaleDateString('ko-KR', {
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });

    await this.createNotification({
      type: 'class_swap_cancelled',
      title: '수업 교체 취소됨',
      message: `${requesterName} 선생님이 수업 교체 요청을 취소했습니다.\n\n📅 ${formattedDate}\n교체 요청: ${requesterSection} ↔ ${approverSection}`,
      resource_id: approverResourceId,
      priority: 'low',
      meta: {
        swap_id: swapId,
        requester_name: requesterName,
        swap_date: swapDate
      }
    });
  }
}