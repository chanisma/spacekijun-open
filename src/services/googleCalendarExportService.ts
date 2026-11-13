import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import type { ExportOptions } from '@/components/schedule/GoogleCalendarExportDialog';
import { getValidGoogleToken } from './googleAuthService';
import { getTaskDeadlines } from '@/lib/taskDeadlines';

export interface ScheduleEvent {
  id: string;
  kind: 'schedule' | 'event' | 'duty' | 'training' | 'document_submission' | 'personal' | 'task';
  title: string;
  starts_at: string;
  ends_at: string;
  status?: string;
  created_by: string;
  description?: string;
  date_only?: boolean;
  meta?: Record<string, any>;
}

export class GoogleCalendarExportService {
  private static async getCurrentUserResourceId(): Promise<string | null> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', user.id)
        .single();

      if (!profile?.name) return null;

      const { data: resource } = await supabase
        .from('resource')
        .select('id')
        .eq('name', profile.name)
        .single();

      return resource?.id || null;
    } catch (error) {
      console.error('Error getting current user resource ID:', error);
      return null;
    }
  }

  private static async fetchMeetingEvents(
    startDate: Date,
    endDate: Date,
    selectedTypes: string[],
    currentUserResourceId: string | null
  ): Promise<ScheduleEvent[]> {
    try {
      // Build the query to fetch meetings within date range
      let query = supabase
        .from('meeting')
        .select(`
          id,
          kind,
          starts_at,
          ends_at,
          status,
          created_by,
          creator,
          meta
        `)
        .gte('starts_at', startDate.toISOString())
        .lte('starts_at', endDate.toISOString())
        .in('kind', selectedTypes);

      const { data: meetings, error } = await query;
      if (error) throw error;

      if (!meetings) return [];

      // Filter events based on user permissions
      const filteredMeetings = (meetings as any).filter((meeting: any) => {
        const meetingKind = meeting.kind as ScheduleEvent['kind'];

        // Schedule and event types are always exportable
        if (meetingKind === 'schedule' || meetingKind === 'event') {
          return true;
        }

        // For other types, user must be related (creator or in assignee)
        if (!currentUserResourceId) return false;

        // Check if user is creator
        if (meeting.created_by === currentUserResourceId || meeting.creator === currentUserResourceId) {
          return true;
        }

        // Check if user is in assignee (for events that have assignee in meta)
        if (meeting.meta?.assignee && typeof meeting.meta.assignee === 'object') {
          // Handle JSONB assignee structure
          const assigneeKeys = Object.keys(meeting.meta.assignee);
          if (assigneeKeys.some(key => key === currentUserResourceId)) {
            return true;
          }
        }

        return false;
      });

      // Transform to ScheduleEvent format
      return filteredMeetings.map((meeting: any) => ({
        id: meeting.id,
        kind: meeting.kind as ScheduleEvent['kind'],
        title: meeting.meta?.title || `${meeting.kind} 일정`,
        starts_at: meeting.starts_at,
        ends_at: meeting.ends_at,
        status: meeting.status,
        created_by: meeting.created_by || meeting.creator || '',
        description: meeting.meta?.description,
        date_only: meeting.meta?.date_only || false,
        meta: meeting.meta
      }));
    } catch (error) {
      console.error('Error fetching meeting events:', error);
      return [];
    }
  }

  private static async fetchTaskEvents(
    startDate: Date,
    endDate: Date,
    includeTaskEvents: boolean,
    currentUserResourceId: string | null
  ): Promise<ScheduleEvent[]> {
    if (!includeTaskEvents || !currentUserResourceId) return [];

    try {
      // Fetch tasks with due dates within the range
      const { data: tasks, error } = await (supabase as any)
        .from('task')
        .select(`
          *,
          event!inner(name, description)
        `)
        .not('due_date', 'is', null)
        // 다중 마감(meta.deadlines) task는 due_date(다음 마감)가 범위 밖이어도 회차가 범위에
        // 들 수 있어 함께 가져와 아래에서 회차 단위로 전개·필터링한다
        .or(`and(due_date.gte.${format(startDate, 'yyyy-MM-dd')},due_date.lte.${format(endDate, 'yyyy-MM-dd')}),meta->deadlines.not.is.null`);

      if (error) throw error;
      if (!tasks || tasks.length === 0) return [];

      // Filter tasks where current user is in assignees_jsonb
      const filteredTasks = (tasks as any).filter((task: any) => {
        if (!task.assignees_jsonb || !Array.isArray(task.assignees_jsonb)) {
          return false;
        }

        return task.assignees_jsonb.some((assignee: any) =>
          assignee.id === currentUserResourceId
        );
      });

      // Transform to ScheduleEvent format — 다중 마감은 회차마다 캘린더 이벤트 생성(범위 내만)
      const rangeStart = format(startDate, 'yyyy-MM-dd');
      const rangeEnd = format(endDate, 'yyyy-MM-dd');
      return filteredTasks.flatMap((task: any) => {
        const deadlines = getTaskDeadlines(task);
        return deadlines
          .filter((d) => d >= rangeStart && d <= rangeEnd)
          .map((dateOnly) => ({
            id: deadlines.length > 1 ? `task-${task.id}-${dateOnly}` : `task-${task.id}`,
            kind: 'task' as const,
            title: `📋 ${task.title}${deadlines.length > 1 ? ` (${deadlines.indexOf(dateOnly) + 1}/${deadlines.length}회)` : ''}`,
            starts_at: `${dateOnly}T09:00:00`,
            ends_at: `${dateOnly}T18:00:00`,
            status: task.status || 'pending',
            created_by: task.created_by || '',
            description: task.description,
            date_only: true,
            meta: {
              original_task_id: task.id,
              event_name: task.event?.name,
              event_description: task.event?.description,
              task_type: task.type,
              source: 'task'
            }
          }));
      });
    } catch (error) {
      console.error('Error fetching task events:', error);
      return [];
    }
  }

  private static generateICSContent(events: ScheduleEvent[]): string {
    const now = new Date();
    const timestamp = format(now, "yyyyMMdd'T'HHmmss'Z'");

    let icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TMS//Schedule Export//KO',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH'
    ];

    events.forEach(event => {
      // Validate dates before processing
      if (!event.starts_at || !event.ends_at) {
        console.warn('Skipping event with invalid dates:', event);
        return;
      }

      const startDate = new Date(event.starts_at);
      const endDate = new Date(event.ends_at);

      // Check if dates are valid
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        console.warn('Skipping event with invalid date format:', event);
        return;
      }

      // Format dates for ICS
      const dtStart = event.date_only
        ? format(startDate, 'yyyyMMdd')
        : format(startDate, "yyyyMMdd'T'HHmmss'Z'");
      const dtEnd = event.date_only
        ? format(endDate, 'yyyyMMdd')
        : format(endDate, "yyyyMMdd'T'HHmmss'Z'");

      // Generate unique UID
      const uid = `${event.id}@tms.school`;

      // Escape special characters in text fields
      const escapeText = (text: string) => {
        return text
          .replace(/\\/g, '\\\\')
          .replace(/;/g, '\\;')
          .replace(/,/g, '\\,')
          .replace(/\n/g, '\\n');
      };

      const summary = escapeText(event.title);
      const description = event.description ? escapeText(event.description) : '';

      // Determine event category based on kind
      const categoryMap = {
        schedule: '학사일정',
        event: '출장',
        duty: '근무',
        training: '연수',
        document_submission: '서류제출',
        personal: '개인일정',
        task: '업무'
      };

      const category = categoryMap[event.kind] || event.kind;

      icsContent.push(
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${timestamp}`,
        event.date_only ? `DTSTART;VALUE=DATE:${dtStart}` : `DTSTART:${dtStart}`,
        event.date_only ? `DTEND;VALUE=DATE:${dtEnd}` : `DTEND:${dtEnd}`,
        `SUMMARY:${summary}`,
        description ? `DESCRIPTION:${description}` : '',
        `CATEGORIES:${category}`,
        `STATUS:${event.status?.toUpperCase() || 'CONFIRMED'}`,
        'END:VEVENT'
      );
    });

    icsContent.push('END:VCALENDAR');

    return icsContent.filter(line => line.length > 0).join('\r\n');
  }

  private static downloadICSFile(content: string, filename: string): void {
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  public static async exportToGoogleCalendar(options: ExportOptions): Promise<boolean> {
    try {
      const { startDate, endDate, eventTypes } = options;

      // Get current user resource ID
      const currentUserResourceId = await this.getCurrentUserResourceId();

      // Get selected event types
      const selectedMeetingTypes = Object.entries(eventTypes)
        .filter(([key, selected]) => selected && key !== 'task')
        .map(([key]) => key);

      const includeTaskEvents = eventTypes.task;

      // Fetch events
      const [meetingEvents, taskEvents] = await Promise.all([
        this.fetchMeetingEvents(startDate, endDate, selectedMeetingTypes, currentUserResourceId),
        this.fetchTaskEvents(startDate, endDate, includeTaskEvents, currentUserResourceId)
      ]);

      // Combine and sort events
      const allEvents = [...meetingEvents, ...taskEvents].sort((a, b) =>
        new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
      );

      if (allEvents.length === 0) {
        throw new Error('선택한 기간에 내보낼 일정이 없습니다.');
      }

      // Debug: Log event data for troubleshooting
      console.log('Events to export:', allEvents.map(e => ({
        id: e.id,
        title: e.title,
        kind: e.kind,
        starts_at: e.starts_at,
        ends_at: e.ends_at,
        date_only: e.date_only
      })));

      // Generate ICS content
      const icsContent = this.generateICSContent(allEvents);

      // Create filename
      const startDateStr = format(startDate, 'yyyy-MM-dd');
      const endDateStr = format(endDate, 'yyyy-MM-dd');
      const filename = `TMS_일정_${startDateStr}_${endDateStr}.ics`;

      // Download file
      this.downloadICSFile(icsContent, filename);

      return true;
    } catch (error) {
      console.error('Error exporting to Google Calendar:', error);
      throw error;
    }
  }
}