import { supabase } from '@/integrations/supabase/client';

// NEIS API 인증키
const NEIS_API_KEY = '919a9db3b60e45bab80796e2464f3b99';
const NEIS_BASE_URL = 'https://open.neis.go.kr/hub';

// 시도교육청코드 (Z99)
const OFFICE_CODE = 'Z99';
// 시도교육청학교코드 (9999999)
const SCHOOL_CODE = '9999999';

export interface NeisScheduleEvent {
  SCHUL_NM: string;     // 학교명
  AY: string;           // 학년도
  EVENT_NM: string;     // 행사명 (실제 API에서는 DDDEP_NM이 아닌 EVENT_NM)
  AA_YMD: string;       // 학사일자
  LOAD_DTM: string;     // 수정일자
  ATPT_OFCDC_SC_CODE: string; // 행정표준코드
  ATPT_OFCDC_SC_NM: string;   // 교육청명
  SD_SCHUL_CODE: string;      // 학교코드
  EVENT_CNTNT?: string; // 행사내용
  ONE_GRADE_EVENT_YN?: string; // 1학년 해당여부
  TW_GRADE_EVENT_YN?: string;  // 2학년 해당여부
  THREE_GRADE_EVENT_YN?: string; // 3학년 해당여부
  SBTR_DD_SC_NM?: string; // 수업공제일명
}

export interface NeisApiResponse {
  SchoolSchedule?: Array<
    {
      // 메타데이터 섹션
      head: Array<{
        list_total_count?: number;
        RESULT?: {
          CODE: string;
          MESSAGE: string;
        };
      }>;
    } | {
      // 데이터 섹션
      row?: NeisScheduleEvent[];
    }
  >;
}

export class NeisApiService {
  /**
   * NEIS 학사일정 API를 호출하여 데이터를 가져옵니다
   * @param year 학년도 (기본값: 현재 년도)
   * @param month 월 (선택적: 지정시 해당 월만, 미지정시 전체 년도)
   * @returns 학사일정 데이터 배열
   */
  static async getSchoolSchedule(
    year?: number,
    month?: number
  ): Promise<NeisScheduleEvent[]> {
    try {
      const currentDate = new Date();
      const targetYear = year || currentDate.getFullYear();

      // 월이 지정된 경우 해당 월만 가져오기
      if (month) {
        return await this.getSchoolScheduleForMonth(targetYear, month);
      }

      // 월이 지정되지 않은 경우 전체 연도를 월별로 나누어 가져오기
      console.log(`🗓️ ${targetYear}년 전체 학사일정을 월별로 불러오는 중...`);

      const allEvents: NeisScheduleEvent[] = [];
      const monthsToFetch = Array.from({ length: 12 }, (_, i) => i + 1); // 1-12월

      // 월별로 순차적으로 데이터 가져오기 (API 부하 방지)
      for (const monthIndex of monthsToFetch) {
        try {
          console.log(`📅 ${targetYear}년 ${monthIndex}월 학사일정 불러오는 중...`);
          const monthEvents = await this.getSchoolScheduleForMonth(targetYear, monthIndex);
          allEvents.push(...monthEvents);

          // API 과부하 방지를 위한 짧은 지연
          if (monthIndex < 12) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (monthError) {
          console.error(`❌ ${targetYear}년 ${monthIndex}월 데이터 가져오기 실패:`, monthError);
          // 개별 월 실패 시에도 계속 진행
        }
      }

      console.log(`✅ ${targetYear}년 전체 학사일정 ${allEvents.length}개를 성공적으로 가져왔습니다.`);
      return allEvents;

    } catch (error) {
      console.error('❌ NEIS API 호출 오류:', error);
      if (error instanceof TypeError && error.message.includes('Cannot read properties of undefined')) {
        console.error('📋 NEIS API 응답 구조 문제 - 빈 배열을 반환합니다.');
        return [];
      }
      throw error;
    }
  }

  /**
   * 특정 월의 NEIS 학사일정 API를 호출하여 데이터를 가져옵니다
   * @param year 학년도
   * @param month 월 (1-12)
   * @returns 해당 월의 학사일정 데이터 배열
   */
  static async getSchoolScheduleForMonth(
    year: number,
    month: number
  ): Promise<NeisScheduleEvent[]> {
    try {
      // 해당 월의 시작일과 종료일 계산
      const startDate = `${year}${month.toString().padStart(2, '0')}01`;
      const lastDay = new Date(year, month, 0).getDate(); // 해당 월의 마지막 날
      const endDate = `${year}${month.toString().padStart(2, '0')}${lastDay.toString().padStart(2, '0')}`;

      const params = new URLSearchParams({
        KEY: NEIS_API_KEY,
        Type: 'json',
        pIndex: '1',
        pSize: '1000', // 월별로 가져오므로 1000개 제한은 충분함
        ATPT_OFCDC_SC_CODE: OFFICE_CODE,
        SD_SCHUL_CODE: SCHOOL_CODE,
        AA_FROM_YMD: startDate,
        AA_TO_YMD: endDate,
      });

      const url = `${NEIS_BASE_URL}/SchoolSchedule?${params.toString()}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`NEIS API 호출 실패: ${response.status} ${response.statusText}`);
      }

      const data: NeisApiResponse = await response.json();

      // API 응답 처리
      if (!data.SchoolSchedule || data.SchoolSchedule.length === 0) {
        console.log(`📭 ${year}년 ${month}월 학사일정이 없습니다.`);
        return [];
      }

      // NEIS API 응답 구조: [metadata, data] 형태
      const metadataSection = data.SchoolSchedule[0];
      const dataSection = data.SchoolSchedule[1];

      // 메타데이터 확인
      if (!(metadataSection as any)?.head || !(metadataSection as any).head[1]?.RESULT) {
        console.warn(`📭 ${year}년 ${month}월 NEIS API 응답 구조가 예상과 다릅니다:`, metadataSection);
        return [];
      }

      // 에러 체크
      const result = (metadataSection as any).head[1].RESULT;
      if (result.CODE !== 'INFO-000') {
        throw new Error(`NEIS API 오류: ${result.MESSAGE}`);
      }

      // 데이터 반환
      const scheduleData = (dataSection as any)?.row || [];
      console.log(`📅 ${year}년 ${month}월 학사일정 ${scheduleData.length}개를 가져왔습니다.`);

      return scheduleData;
    } catch (error) {
      console.error(`❌ ${year}년 ${month}월 NEIS API 호출 오류:`, error);
      throw error;
    }
  }

  /**
   * NEIS 학사일정 데이터를 meeting 테이블 형식으로 변환합니다 (시간 포함)
   * @param neisEvents NEIS 학사일정 데이터 배열
   * @param resourceId 생성자 resource ID
   * @returns meeting 테이블 형식의 데이터 배열
   */
  static transformToMeetingFormat(neisEvents: NeisScheduleEvent[], resourceId: string) {
    return neisEvents.map(event => {
      // 학사일자를 Date 객체로 변환 (YYYYMMDD -> YYYY-MM-DD)
      const dateStr = event.AA_YMD;
      const formattedDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;

      // 하루 종일 이벤트로 설정 (9:00 ~ 18:00)
      const startDateTime = `${formattedDate}T09:00:00+09:00`;
      const endDateTime = `${formattedDate}T18:00:00+09:00`;

      return {
        kind: 'schedule' as const,  // 학사일정은 schedule로 저장
        starts_at: startDateTime,
        ends_at: endDateTime,
        status: 'scheduled' as const,
        created_by: resourceId,
        meta: {
          title: event.EVENT_NM,           // 행사명
          school_name: event.SCHUL_NM,     // 학교명
          year: event.AY,                  // 학년도
          modified_date: event.LOAD_DTM,   // 수정일자
          admin_code: event.ATPT_OFCDC_SC_CODE, // 행정표준코드
          source: 'NEIS',                  // 데이터 출처 표시
          event_date: event.AA_YMD,        // 원본 학사일자
          content: event.EVENT_CNTNT,      // 행사내용
          sbtr_dd_sc_nm: event.SBTR_DD_SC_NM, // 수업공제일명
        }
      };
    });
  }

  /**
   * NEIS 학사일정 데이터를 meeting 테이블 형식으로 변환합니다 (날짜만, 시간 제거)
   * @param neisEvents NEIS 학사일정 데이터 배열
   * @param resourceId 생성자 resource ID
   * @returns meeting 테이블 형식의 데이터 배열
   */
  static transformToMeetingFormatDateOnly(neisEvents: NeisScheduleEvent[], resourceId: string) {
    return neisEvents.map(event => {
      // 학사일자를 Date 객체로 변환 (YYYYMMDD -> YYYY-MM-DD)
      const dateStr = event.AA_YMD;
      const formattedDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;

      // 날짜만 저장 (00:00:00 ~ 23:59:59)
      const startDateTime = `${formattedDate}T00:00:00+09:00`;
      const endDateTime = `${formattedDate}T23:59:59+09:00`;

      return {
        kind: 'schedule' as const,  // 학사일정은 schedule로 저장
        starts_at: startDateTime,
        ends_at: endDateTime,
        status: 'scheduled' as const,
        created_by: resourceId,
        meta: {
          title: event.EVENT_NM,           // 행사명
          school_name: event.SCHUL_NM,     // 학교명
          year: event.AY,                  // 학년도
          modified_date: event.LOAD_DTM,   // 수정일자
          admin_code: event.ATPT_OFCDC_SC_CODE, // 행정표준코드
          source: 'NEIS',                  // 데이터 출처 표시
          event_date: event.AA_YMD,        // 원본 학사일자
          content: event.EVENT_CNTNT,      // 행사내용
          sbtr_dd_sc_nm: event.SBTR_DD_SC_NM, // 수업공제일명
          date_only: true,                 // 날짜만 저장했음을 표시
        }
      };
    });
  }


  /**
   * NEIS 학사일정을 meeting 테이블에 삽입합니다
   * @param meetingEvents 삽입할 이벤트 배열
   * @returns 삽입 성공 여부
   */
  static async insertMeetings(
    meetingEvents: ReturnType<typeof NeisApiService.transformToMeetingFormat>
  ): Promise<boolean> {
    try {
      if (meetingEvents.length === 0) {
        console.log('📭 삽입할 학사일정이 없습니다.');
        return true;
      }

      console.log(`💾 ${meetingEvents.length}개의 새로운 학사일정을 저장합니다...`);
      const { error: insertError } = await supabase
        .from('meeting')
        .insert(meetingEvents);

      if (insertError) {
        console.error('❌ 학사일정 삽입 오류:', insertError);
        throw insertError;
      }

      console.log(`✅ 학사일정 삽입 완료! ${meetingEvents.length}개`);
      return true;
    } catch (error) {
      console.error('❌ 학사일정 삽입 실패:', error);
      throw error;
    }
  }

  /**
   * NEIS 학사일정을 meeting 테이블에 저장하고 업데이트합니다 (레거시 함수)
   * @param toInsert 새로 삽입할 이벤트 배열
   * @param toUpdate 업데이트할 이벤트 배열
   * @returns 저장 성공 여부
   */
  static async saveMeetings(
    toInsert: ReturnType<typeof NeisApiService.transformToMeetingFormat>,
    toUpdate: Array<{ id: string; data: ReturnType<typeof NeisApiService.transformToMeetingFormat>[0] }>
  ): Promise<boolean> {
    try {
      let insertCount = 0;
      let updateCount = 0;

      // 새로운 일정 삽입
      if (toInsert.length > 0) {
        console.log(`💾 ${toInsert.length}개의 새로운 학사일정을 저장합니다...`);
        const { error: insertError } = await supabase
          .from('meeting')
          .insert(toInsert);

        if (insertError) {
          console.error('❌ 학사일정 삽입 오류:', insertError);
          throw insertError;
        }
        insertCount = toInsert.length;
      }

      // 기존 일정 업데이트
      if (toUpdate.length > 0) {
        console.log(`🔄 ${toUpdate.length}개의 학사일정을 업데이트합니다...`);

        for (const update of toUpdate) {
          const { error: updateError } = await supabase
            .from('meeting')
            .update({
              starts_at: update.data.starts_at,
              ends_at: update.data.ends_at,
              meta: update.data.meta
            })
            .eq('id', update.id);

          if (updateError) {
            console.error('❌ 학사일정 업데이트 오류:', updateError);
            throw updateError;
          }
          updateCount++;
        }
      }

      if (insertCount === 0 && updateCount === 0) {
        console.log('📭 저장할 새로운 일정이나 업데이트할 일정이 없습니다.');
      } else {
        console.log(`✅ 학사일정 처리 완료! 신규: ${insertCount}개, 업데이트: ${updateCount}개`);
      }

      return true;
    } catch (error) {
      console.error('❌ 학사일정 저장 실패:', error);
      throw error;
    }
  }

  /**
   * 현재 학년도의 NEIS 학사일정을 가져와서 meeting 테이블에 저장하는 전체 프로세스
   * 모든 기존 NEIS 데이터를 삭제하고 현재 학년도 데이터를 새로 저장합니다
   * @param resourceId 생성자 resource ID
   * @returns 처리된 총 일정 개수
   */
  static async importCurrentSchoolYearSchedule(resourceId: string): Promise<number> {
    try {
      console.log('🚀 현재 학년도 NEIS 학사일정 가져오기 시작...');

      // 현재 날짜 기준으로 학년도 계산 (3월~다음해 2월)
      const today = new Date();
      const currentMonth = today.getMonth() + 1; // 1-12
      const currentYear = today.getFullYear();

      // 3월 이후면 현재 연도가 학년도, 그 이전이면 이전 연도가 학년도
      const schoolYear = currentMonth >= 3 ? currentYear : currentYear - 1;

      console.log(`📚 ${schoolYear}학년도 학사일정을 가져오는 중... (${schoolYear}년 3월 ~ ${schoolYear + 1}년 2월)`);

      // 학년도 기간에 해당하는 모든 데이터 가져오기
      const schoolYearEvents = await this.getSchoolYearSchedule(schoolYear);

      if (schoolYearEvents.length === 0) {
        console.log('📭 가져올 학사일정이 없습니다.');
        return 0;
      }

      // 1. 모든 NEIS 데이터 삭제
      const deletedCount = await this.deleteAllNeisEvents();

      // 2. meeting 테이블 형식으로 변환 (날짜만 저장, 시간 제거)
      const meetingEvents = this.transformToMeetingFormatDateOnly(schoolYearEvents, resourceId);

      // 3. 새로운 데이터 모두 삽입
      await this.insertMeetings(meetingEvents);

      console.log(`🎉 총 ${meetingEvents.length}개의 학사일정을 처리했습니다. (삭제: ${deletedCount}개, 신규 삽입: ${meetingEvents.length}개)`);
      return meetingEvents.length;

    } catch (error) {
      console.error('❌ NEIS 학사일정 가져오기 실패:', error);
      throw error;
    }
  }

  /**
   * 특정 학년도의 학사일정을 가져옵니다 (3월 ~ 다음해 2월)
   * @param schoolYear 학년도
   * @returns 학년도 기간의 학사일정 데이터
   */
  static async getSchoolYearSchedule(schoolYear: number): Promise<NeisScheduleEvent[]> {
    try {
      const allEvents: NeisScheduleEvent[] = [];

      // 학년도 기간: 3월 ~ 다음해 2월
      // 예: 2024학년도 = 2024.03 ~ 2025.02

      // 3월~12월 (현재 연도)
      for (let month = 3; month <= 12; month++) {
        const monthEvents = await this.getSchoolScheduleForMonth(schoolYear, month);
        allEvents.push(...monthEvents);

        if (month < 12) {
          await new Promise(resolve => setTimeout(resolve, 100)); // API 부하 방지
        }
      }

      // 1월~2월 (다음 연도)
      for (let month = 1; month <= 2; month++) {
        const monthEvents = await this.getSchoolScheduleForMonth(schoolYear + 1, month);
        allEvents.push(...monthEvents);

        if (month < 2) {
          await new Promise(resolve => setTimeout(resolve, 100)); // API 부하 방지
        }
      }

      console.log(`✅ ${schoolYear}학년도 전체 학사일정 ${allEvents.length}개를 성공적으로 가져왔습니다.`);
      return allEvents;

    } catch (error) {
      console.error(`❌ ${schoolYear}학년도 학사일정 가져오기 실패:`, error);
      throw error;
    }
  }

  /**
   * 특정 월의 NEIS 학사일정을 가져와서 기존 해당월 데이터와 병합합니다
   * @param resourceId 생성자 resource ID
   * @param year 연도
   * @param month 월 (1-12)
   * @returns 처리된 일정 개수
   */
  static async fetchAndMergeMonthSchedule(
    resourceId: string,
    year: number,
    month: number
  ): Promise<number> {
    try {
      console.log(`📅 ${year}년 ${month}월 NEIS 학사일정 가져오기 시작...`);

      // API에서 해당 월 데이터 가져오기
      const monthEvents = await this.getSchoolScheduleForMonth(year, month);

      if (monthEvents.length === 0) {
        console.log(`📭 ${year}년 ${month}월 학사일정이 없습니다.`);
        return 0;
      }

      // 해당 월의 기존 NEIS 데이터 삭제
      await this.deleteNeisEventsByMonth(year, month);

      // meeting 테이블 형식으로 변환 (날짜만 저장)
      const meetingEvents = this.transformToMeetingFormatDateOnly(monthEvents, resourceId);

      // 새로운 데이터 삽입
      await this.insertMeetings(meetingEvents);

      console.log(`✅ ${year}년 ${month}월 NEIS 학사일정 ${meetingEvents.length}개 처리 완료`);
      return meetingEvents.length;

    } catch (error) {
      console.error(`❌ ${year}년 ${month}월 NEIS 학사일정 가져오기 실패:`, error);
      throw error;
    }
  }

  /**
   * 모든 NEIS 학사일정 데이터를 삭제합니다
   * @returns 삭제된 일정 개수
   */
  static async deleteAllNeisEvents(): Promise<number> {
    try {
      console.log('🗑️ 모든 NEIS 학사일정 삭제 중...');

      const { data: deletedEvents, error } = await supabase
        .from('meeting')
        .delete()
        .eq('kind', 'schedule')
        .eq('meta->>source', 'NEIS')
        .select('id');

      if (error) {
        console.error('❌ NEIS 일정 삭제 오류:', error);
        throw error;
      }

      const deletedCount = deletedEvents?.length || 0;
      console.log(`✅ 모든 NEIS 학사일정 ${deletedCount}개 삭제 완료`);
      return deletedCount;
    } catch (error) {
      console.error('❌ NEIS 일정 삭제 실패:', error);
      throw error;
    }
  }

  /**
   * 특정 년월의 NEIS 학사일정 데이터를 삭제합니다
   * @param year 연도
   * @param month 월
   * @returns 삭제된 일정 개수
   */
  static async deleteNeisEventsByMonth(year: number, month: number): Promise<number> {
    try {
      console.log(`🗑️ ${year}년 ${month}월 NEIS 학사일정 삭제 중...`);

      // 해당 월의 시작과 끝 날짜 계산
      const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${month.toString().padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`;

      const { data: deletedEvents, error } = await supabase
        .from('meeting')
        .delete()
        .eq('kind', 'schedule')
        .eq('meta->>source', 'NEIS')
        .gte('starts_at', `${startDate}T00:00:00`)
        .lt('starts_at', `${year}-${(month + 1).toString().padStart(2, '0')}-01T00:00:00`)
        .select('id');

      if (error) {
        console.error('❌ NEIS 일정 삭제 오류:', error);
        throw error;
      }

      const deletedCount = deletedEvents?.length || 0;
      console.log(`✅ ${year}년 ${month}월 NEIS 학사일정 ${deletedCount}개 삭제 완료`);
      return deletedCount;
    } catch (error) {
      console.error('❌ NEIS 일정 삭제 실패:', error);
      throw error;
    }
  }
}

export default NeisApiService;