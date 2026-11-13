// Google Calendar API service using Supabase provider tokens

import { getValidGoogleToken, getGoogleTokensFromSupabase } from './googleAuthService';

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

export interface GoogleCalendarConfig {
  clientId: string;
}

export interface CalendarEvent {
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
}

export interface CalendarInfo {
  id: string;
  summary: string;
  description?: string;
  timeZone?: string;
}

export interface MeetingData {
  id: string;
  kind: string;
  starts_at: string;
  ends_at: string;
  meta?: {
    title?: string;
    section_name?: string;
    date_only?: boolean;
    description?: string;
    location?: string;
  };
}

export class GoogleCalendarService {
  private static instance: GoogleCalendarService | null = null;
  private isInitialized = false;
  private config: GoogleCalendarConfig;

  private constructor(config: GoogleCalendarConfig) {
    this.config = config;
  }

  public static getInstance(config?: GoogleCalendarConfig): GoogleCalendarService {
    if (!GoogleCalendarService.instance && config) {
      GoogleCalendarService.instance = new GoogleCalendarService(config);
    }
    return GoogleCalendarService.instance!;
  }

  /**
   * Get current access token from Supabase session
   * Throws error if token is expired or missing
   */
  private async getAccessToken(): Promise<string> {
    try {
      return await getValidGoogleToken();
    } catch (error: any) {
      if (error.message === 'GOOGLE_TOKEN_EXPIRED' || error.message === 'GOOGLE_TOKEN_MISSING') {
        window.dispatchEvent(new CustomEvent('google-auth-expired'));
      }
      throw error;
    }
  }

  /**
   * Initialize Google API with Calendar support
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.loadScript('https://apis.google.com/js/api.js');

      await this.waitForGapi();
      await this.initializeGapi();

      const token = await this.getAccessToken();
      if (token) {
        window.gapi.client.setToken({
          access_token: token
        });
        console.log('Google Calendar token from Supabase set in GAPI client');
      }

      this.isInitialized = true;
      console.log('Google Calendar API initialized successfully');
    } catch (error) {
      console.error('Google Calendar API initialization error:', error);
      throw new Error('Google Calendar API 초기화에 실패했습니다.');
    }
  }

  private loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  }

  private async waitForGapi(): Promise<void> {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 50;

      const checkGapi = () => {
        if (window.gapi) {
          resolve();
          return;
        }

        attempts++;
        if (attempts >= maxAttempts) {
          reject(new Error('Timeout waiting for gapi to load'));
          return;
        }

        setTimeout(checkGapi, 100);
      };

      checkGapi();
    });
  }

  private async initializeGapi(): Promise<void> {
    return new Promise((resolve, reject) => {
      window.gapi.load('client', {
        callback: async () => {
          try {
            await window.gapi.client.init({
              discoveryDocs: [
                'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
                'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'
              ]
            });
            resolve();
          } catch (error) {
            reject(error);
          }
        },
        onerror: () => reject(new Error('Failed to load GAPI client'))
      });
    });
  }

  /**
   * Sign in - Now uses Supabase token automatically
   */
  public async signIn(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('Supabase 로그인이 필요합니다. Google 권한이 없습니다.');
    }

    if (window.gapi && window.gapi.client) {
      window.gapi.client.setToken({
        access_token: token
      });
    }

    console.log('Google Calendar authentication successful using Supabase token');
  }

  /**
   * Sign out - Clear gapi token only
   */
  public async signOut(): Promise<void> {
    if (window.gapi && window.gapi.client) {
      window.gapi.client.setToken(null);
    }

    console.log('Google Calendar token cleared');
  }

  /**
   * Check if user is authenticated (has valid Supabase token)
   */
  public async isAuthenticated(): Promise<boolean> {
    const tokens = await getGoogleTokensFromSupabase();
    return tokens !== null && tokens.accessToken !== null;
  }

  /**
   * Create a new calendar
   */
  public async createCalendar(name: string, description?: string): Promise<CalendarInfo> {
    if (!(await this.isAuthenticated())) {
      throw new Error('Google Calendar 인증이 필요합니다.');
    }

    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('유효한 Google Calendar 토큰이 없습니다.');
    }

    if (window.gapi && window.gapi.client) {
      window.gapi.client.setToken({ access_token: token });
    }

    try {
      const response = await window.gapi.client.calendar.calendars.insert({
        resource: {
          summary: name,
          description: description || `${name} - Spacekijun에서 생성됨`,
          timeZone: 'Asia/Seoul'
        }
      });

      const calendar = response.result;
      console.log('Calendar created:', calendar.id);

      return {
        id: calendar.id,
        summary: calendar.summary,
        description: calendar.description,
        timeZone: calendar.timeZone
      };
    } catch (error: any) {
      console.error('Error creating calendar:', error);
      if (error.status === 403 || error.result?.error?.code === 403) {
        throw new Error(
          'Google Calendar API 접근이 거부되었습니다.\n\n' +
          '해결 방법:\n' +
          '1. Google Cloud Console에서 Calendar API를 활성화해주세요\n' +
          '2. OAuth 동의 화면에서 Calendar 권한을 추가해주세요\n' +
          '3. 다시 로그인하여 Calendar 권한을 승인해주세요'
        );
      }
      throw new Error(`캘린더 생성 실패: ${error.message || error.result?.error?.message || '알 수 없는 오류'}`);
    }
  }

  /**
   * List all calendars
   */
  public async listCalendars(): Promise<CalendarInfo[]> {
    if (!(await this.isAuthenticated())) {
      throw new Error('Google Calendar 인증이 필요합니다.');
    }

    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('유효한 Google Calendar 토큰이 없습니다.');
    }

    if (window.gapi && window.gapi.client) {
      window.gapi.client.setToken({ access_token: token });
    }

    try {
      const response = await window.gapi.client.calendar.calendarList.list();

      return response.result.items.map((calendar: any) => ({
        id: calendar.id,
        summary: calendar.summary,
        description: calendar.description,
        timeZone: calendar.timeZone
      }));
    } catch (error: any) {
      console.error('Error listing calendars:', error);
      throw new Error(`캘린더 목록 조회 실패: ${error.message || error.result?.error?.message || '알 수 없는 오류'}`);
    }
  }

  /**
   * Find calendar by name or create if not exists
   */
  public async findOrCreateCalendar(name: string): Promise<CalendarInfo> {
    const calendars = await this.listCalendars();
    const existingCalendar = calendars.find(cal => cal.summary === name);

    if (existingCalendar) {
      console.log('Calendar found:', existingCalendar.id);
      return existingCalendar;
    }

    return await this.createCalendar(name);
  }

  /**
   * Convert Meeting data to Calendar Event
   */
  public convertMeetingToCalendarEvent(meeting: MeetingData): CalendarEvent {
    const title = meeting.meta?.title || '(제목 없음)';
    const kindLabels: Record<string, string> = {
      class: '수업',
      schedule: '학사일정',
      duty: '근무',
      training: '연수',
      event: '출장',
      document_submission: '문서제출',
      personal: '개인일정'
    };

    const kindLabel = kindLabels[meeting.kind] || meeting.kind;
    const summary = `[${kindLabel}] ${title}`;

    const isDateOnly = meeting.meta?.date_only || false;

    const event: CalendarEvent = {
      summary,
      description: meeting.meta?.description,
      location: meeting.meta?.location,
      start: {},
      end: {}
    };

    if (isDateOnly) {
      event.start.date = meeting.starts_at.split('T')[0];
      event.end.date = meeting.ends_at.split('T')[0];
    } else {
      event.start.dateTime = meeting.starts_at;
      event.start.timeZone = 'Asia/Seoul';
      event.end.dateTime = meeting.ends_at;
      event.end.timeZone = 'Asia/Seoul';
    }

    return event;
  }

  /**
   * Create event in specific calendar
   */
  public async createEvent(calendarId: string, event: CalendarEvent): Promise<any> {
    if (!(await this.isAuthenticated())) {
      throw new Error('Google Calendar 인증이 필요합니다.');
    }

    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('유효한 Google Calendar 토큰이 없습니다.');
    }

    if (window.gapi && window.gapi.client) {
      window.gapi.client.setToken({ access_token: token });
    }

    try {
      const response = await window.gapi.client.calendar.events.insert({
        calendarId: calendarId,
        resource: event
      });

      return response.result;
    } catch (error: any) {
      console.error('Error creating event:', error);
      throw new Error(`이벤트 생성 실패: ${error.message || error.result?.error?.message || '알 수 없는 오류'}`);
    }
  }

  /**
   * Create events from meetings in a specific calendar
   */
  public async createEventsFromMeetings(
    calendarName: string,
    meetings: MeetingData[]
  ): Promise<{ success: any[], failed: any[] }> {
    // Find or create calendar
    const calendar = await this.findOrCreateCalendar(calendarName);

    const results = {
      success: [] as any[],
      failed: [] as any[]
    };

    for (const meeting of meetings) {
      try {
        const calendarEvent = this.convertMeetingToCalendarEvent(meeting);
        const createdEvent = await this.createEvent(calendar.id, calendarEvent);
        results.success.push({
          meeting,
          event: createdEvent
        });
      } catch (error: any) {
        results.failed.push({
          meeting,
          error: error.message
        });
      }
    }

    return results;
  }
}

// Configuration helper
export const getGoogleCalendarConfig = (): GoogleCalendarConfig => {
  return {
    clientId: import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID || ''
  };
};

// Default instance
let defaultInstance: GoogleCalendarService | null = null;

export const getGoogleCalendarService = (): GoogleCalendarService => {
  if (!defaultInstance) {
    const config = getGoogleCalendarConfig();
    if (!config.clientId) {
      throw new Error('VITE_GOOGLE_DRIVE_CLIENT_ID 환경변수가 설정되지 않았습니다.');
    }
    defaultInstance = GoogleCalendarService.getInstance(config);
  }
  return defaultInstance;
};
