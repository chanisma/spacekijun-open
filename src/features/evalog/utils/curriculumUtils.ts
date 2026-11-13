import { SchoolCurriculum } from '../types/curriculum';

// Dynamically import all curriculum files matching the pattern
// This uses Vite's glob import feature to automatically load matching files
const curriculumModules = import.meta.glob('../data/curriculum/jeonju_gijeon_girls_*.ts', { eager: true });

/**
 * 학교명과 입학년도로 교육과정 매핑
 * 기본값: 샘플고등학교 2025
 */
export function getSchoolCurriculum(schoolName: string = '샘플고등학교', admissionYear: number | null | undefined): SchoolCurriculum {
    // 학교명 확인 (현재는 샘플고만 지원하지만 확장 가능성 고려)
    const isGijeonGirls = schoolName.includes('샘플고등학교') || schoolName.includes('샘플고');

    // 기본적으로 사용할 최신 교육과정 연도
    const DEFAULT_YEAR = 2025;
    const MIN_SUPPORTED_YEAR = 2022;

    // Helper to find curriculum by year from loaded modules
    const findCurriculum = (year: number): SchoolCurriculum | null => {
        // Find file path containing the year (e.g., ..._2023.ts)
        const matchingPath = Object.keys(curriculumModules).find(path => path.includes(`_${year}.ts`));

        if (!matchingPath) return null;

        const module = curriculumModules[matchingPath] as any;

        // 1. Try named export matching the year pattern (jeonjuGijeonGirls2023)
        const expectedExportName = `jeonjuGijeonGirls${year}`;
        if (module[expectedExportName]) {
            return module[expectedExportName];
        }

        // 2. Fallback: Return the first exported object found in the module
        const firstExport = Object.values(module)[0];
        if (firstExport) {
            return firstExport as SchoolCurriculum;
        }

        return null;
    };

    // Default fallback curriculum (safeguard)
    const defaultCurriculum = findCurriculum(DEFAULT_YEAR);
    if (!defaultCurriculum) {
        console.error(`Default curriculum for year ${DEFAULT_YEAR} not found!`);
        // This should theoretically not happen if files exist
        throw new Error('Critical: Default curriculum not found');
    }

    if (isGijeonGirls) {
        // 입학년도가 없는 경우 (null/undefined) -> 기본값
        if (!admissionYear) {
            return defaultCurriculum;
        }

        // 지원하는 최소 연도보다 이전인 경우 -> 최소 연도 데이터 사용 (2022)
        if (admissionYear < MIN_SUPPORTED_YEAR) {
            const minCurriculum = findCurriculum(MIN_SUPPORTED_YEAR);
            return minCurriculum || defaultCurriculum;
        }

        // 해당 연도의 교육과정 찾기 (2022, 2023, 2024, 2025 ...)
        const specificCurriculum = findCurriculum(admissionYear);
        if (specificCurriculum) {
            return specificCurriculum;
        }

        // 해당 연도를 못 찾은 경우 (예: 미래의 2026년 데이터가 아직 없는 경우) -> 기본값(2025)
        return defaultCurriculum;
    }

    // 학교명이 일치하지 않는 경우 -> 기본값
    return defaultCurriculum;
}
