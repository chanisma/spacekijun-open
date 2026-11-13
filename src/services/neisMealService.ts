// NEIS 급식 API 서비스
import { kstDateKey } from '@/lib/schoolDay';
const NEIS_API_KEY = '919a9db3b60e45bab80796e2464f3b99';
const NEIS_BASE_URL = 'https://open.neis.go.kr/hub';

// 시도교육청코드 (Z99)
const OFFICE_CODE = 'Z99';
// 시도교육청학교코드 (9999999)
const SCHOOL_CODE = '9999999';

export interface NeisMealEvent {
  SCHUL_NM: string;       // 학교명
  MMEAL_SC_NM: string;    // 식사구분명 (중식, 석식)
  MLSV_YMD: string;       // 급식일자
  DDISH_NM: string;       // 요리명
  ORPLC_INFO?: string;    // 원산지정보
  CAL_INFO?: string;      // 칼로리정보
  NTR_INFO?: string;      // 영양정보
  MLSV_FROM_YMD?: string; // 급식시작일자
  MLSV_TO_YMD?: string;   // 급식종료일자
}

export interface NeisMealApiResponse {
  mealServiceDietInfo?: Array<
    {
      head: Array<{
        list_total_count?: number;
        RESULT?: {
          CODE: string;
          MESSAGE: string;
        };
      }>;
    } | {
      row?: NeisMealEvent[];
    }
  >;
}

export interface MealData {
  date: string;
  lunch?: {
    menu: string[];
    calories?: string;
  };
  dinner?: {
    menu: string[];
    calories?: string;
  };
}

export class NeisMealService {
  /**
   * NEIS 급식 API를 호출하여 데이터를 가져옵니다
   * @param date 조회 날짜 (YYYY-MM-DD 형식, 기본값: 오늘)
   * @returns 급식 데이터
   */
  static async getMealData(date?: string): Promise<MealData | null> {
    try {
      // 한국 날짜 — toISOString 은 UTC 라 자정~오전 9시에 어제가 된다
      const targetDate = date || kstDateKey(Date.now());
      const formattedDate = targetDate.replace(/-/g, ''); // YYYYMMDD 형식으로 변환

      const params = new URLSearchParams({
        KEY: NEIS_API_KEY,
        Type: 'json',
        pIndex: '1',
        pSize: '100',
        ATPT_OFCDC_SC_CODE: OFFICE_CODE,
        SD_SCHUL_CODE: SCHOOL_CODE,
        MLSV_YMD: formattedDate,
      });

      const url = `${NEIS_BASE_URL}/mealServiceDietInfo?${params.toString()}`;
      console.log('🍽️ NEIS 급식 API 호출:', url);

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`NEIS 급식 API 호출 실패: ${response.status} ${response.statusText}`);
      }

      const data: NeisMealApiResponse = await response.json();

      // API 응답 처리
      if (!data.mealServiceDietInfo || data.mealServiceDietInfo.length === 0) {
        console.warn('📭 해당 날짜의 급식 정보가 없습니다.');
        return null;
      }

      // NEIS API 응답 구조: [metadata, data] 형태
      const metadataSection = data.mealServiceDietInfo[0];
      const dataSection = data.mealServiceDietInfo[1];

      // 메타데이터 확인
      if (!(metadataSection as any)?.head || !(metadataSection as any).head[1]?.RESULT) {
        console.warn('📭 NEIS 급식 API 응답 구조가 예상과 다릅니다:', metadataSection);
        return null;
      }

      // 에러 체크
      const result = (metadataSection as any).head[1].RESULT;
      if (result.CODE !== 'INFO-000') {
        console.warn(`⚠️ NEIS 급식 API: ${result.MESSAGE}`);
        return null;
      }

      // 데이터 반환
      const mealEvents = (dataSection as any)?.row || [];
      console.log(`🍽️ ${targetDate} 급식 정보 ${mealEvents.length}건을 가져왔습니다.`);

      return this.transformMealData(mealEvents, targetDate);
    } catch (error) {
      console.error('❌ NEIS 급식 API 호출 오류:', error);
      return null;
    }
  }

  /**
   * NEIS 급식 데이터를 UI 표시용 형식으로 변환합니다
   */
  private static transformMealData(mealEvents: NeisMealEvent[], date: string): MealData {
    const mealData: MealData = { date };

    mealEvents.forEach(event => {
      // 요리명을 개별 메뉴로 분리 (줄바꿈 기준)
      const menuItems = event.DDISH_NM
        .split('<br/>')
        .map(item => item.trim())
        .filter(item => item.length > 0)
        .map(item => item.replace(/\d+\./g, '').trim()) // 알레르기 정보 숫자 제거
        .filter(item => item.length > 0);

      // 칼로리 정보 추출
      const calories = event.CAL_INFO;

      if (event.MMEAL_SC_NM === '중식') {
        mealData.lunch = {
          menu: menuItems,
          calories
        };
      } else if (event.MMEAL_SC_NM === '석식') {
        mealData.dinner = {
          menu: menuItems,
          calories
        };
      }
    });

    return mealData;
  }

  /**
   * 주간 급식 정보를 가져옵니다 (월요일부터 금요일)
   */
  static async getWeeklyMealData(startDate?: string): Promise<MealData[]> {
    try {
      const baseDate = startDate ? new Date(startDate) : new Date();

      // 월요일 찾기
      const dayOfWeek = baseDate.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // 일요일인 경우 -6, 그 외에는 1 - dayOfWeek
      const monday = new Date(baseDate);
      monday.setDate(baseDate.getDate() + mondayOffset);

      const weeklyMeals: MealData[] = [];

      // 월요일부터 금요일까지 5일간 데이터 가져오기
      for (let i = 0; i < 5; i++) {
        const currentDate = new Date(monday);
        currentDate.setDate(monday.getDate() + i);
        const dateString = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;

        const mealData = await this.getMealData(dateString);
        if (mealData) {
          weeklyMeals.push(mealData);
        }
      }

      return weeklyMeals;
    } catch (error) {
      console.error('❌ 주간 급식 정보 조회 오류:', error);
      return [];
    }
  }
}

export default NeisMealService;