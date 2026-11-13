import { supabase } from '@/integrations/supabase/client';

interface SyncProgress {
    phase: string;
    current: number;
    total: number;
    percent: number;
}

interface SyncResult {
    totalResources: number;
    activeUpdated: number;
    activeSkipped: number;
    inactiveUpdated: number;
    errors: string[];
}

/**
 * resource 테이블 기준으로 student_basic_info 학년/반/번호 최신화
 *
 * 1) resource(type='student', status='active') → student_basic_info 매칭 → grade, class_num, number, student_no 업데이트
 * 2) resource(type='student', status!='active') (졸업/전출/자퇴) → student_basic_info grade/class_num/number → null 처리
 */
export const syncStudentData = async (
    onProgress?: (progress: SyncProgress) => void
): Promise<SyncResult> => {
    const result: SyncResult = {
        totalResources: 0,
        activeUpdated: 0,
        activeSkipped: 0,
        inactiveUpdated: 0,
        errors: [],
    };

    const report = (phase: string, current: number, total: number) => {
        onProgress?.({
            phase,
            current,
            total,
            percent: total > 0 ? Math.round((current / total) * 100) : 0,
        });
    };

    // ── 1. Fetch resources ──
    report('리소스 조회 중...', 0, 1);

    const { data: resources, error: resError } = await supabase
        .from('resource')
        .select('id, name, type, status, meta')
        .eq('type', 'student');

    if (resError) {
        result.errors.push(`리소스 조회 실패: ${resError.message}`);
        return result;
    }
    if (!resources || resources.length === 0) {
        result.errors.push('학생 리소스가 없습니다.');
        return result;
    }

    result.totalResources = resources.length;

    const activeResources = resources.filter((r: any) => r.status === 'active');
    const inactiveResources = resources.filter((r: any) => r.status !== 'active');

    // ── 2. Fetch student_basic_info ──
    report('학생 기본정보 조회 중...', 0, 1);

    const { data: basicInfos, error: biError } = await supabase
        .from('student_basic_info' as any)
        .select('id, grade, class_num, number, student_no');

    if (biError) {
        result.errors.push(`학생 기본정보 조회 실패: ${biError.message}`);
        return result;
    }

    const basicInfoMap = new Map<string, any>();
    (basicInfos || []).forEach((bi: any) => basicInfoMap.set(bi.id, bi));

    // ── 3. Active students: update grade/class/number ──
    const CHUNK_SIZE = 50;
    const totalActive = activeResources.length;

    for (let i = 0; i < totalActive; i += CHUNK_SIZE) {
        const chunk = activeResources.slice(i, i + CHUNK_SIZE);
        report('활성 학생 최신화 중...', Math.min(i + CHUNK_SIZE, totalActive), totalActive);

        for (const res of chunk) {
            const meta = res.meta as any;
            if (!meta?.id) {
                result.activeSkipped++;
                continue;
            }

            const studentId = meta.id as string;
            const existing = basicInfoMap.get(studentId);
            if (!existing) {
                result.activeSkipped++;
                continue;
            }

            // Parse meta for grade/class/number (meta uses "class" not "class_number")
            const newGrade = meta.grade ? Number(meta.grade) : null;
            const newClassNum = meta.class ? Number(meta.class) : null;
            const newNumber = meta.number ? Number(meta.number) : null;

            if (!newGrade || !newClassNum || !newNumber) {
                result.activeSkipped++;
                continue;
            }

            const newStudentNo = `${newGrade}${String(newClassNum).padStart(2, '0')}${String(newNumber).padStart(2, '0')}`;

            // Check if update needed
            if (
                existing.grade === newGrade &&
                existing.class_num === newClassNum &&
                existing.number === newNumber &&
                existing.student_no === newStudentNo
            ) {
                result.activeSkipped++;
                continue;
            }

            // Update student_basic_info
            const { error: updateError } = await supabase
                .from('student_basic_info' as any)
                .update({
                    grade: newGrade,
                    class_num: newClassNum,
                    number: newNumber,
                    student_no: newStudentNo,
                })
                .eq('id', studentId);

            if (updateError) {
                result.errors.push(`[${studentId}] basic_info 업데이트 실패: ${updateError.message}`);
                continue;
            }

            result.activeUpdated++;
        }
    }

    // ── 4. Inactive students (졸업/전출/자퇴): grade/class_num/number → null ──
    // 학년 무관 처리 — 졸업은 3학년이 대부분이지만 전출/자퇴는 1·2학년에서도 발생
    if (inactiveResources.length > 0) {
        report('비활성 학생 처리 중...', 0, inactiveResources.length);

        // Collect inactive student IDs from resource meta
        const inactiveStudentIds: string[] = [];
        for (const res of inactiveResources) {
            const meta = res.meta as any;
            if (meta?.id) {
                inactiveStudentIds.push(meta.id as string);
            }
        }

        if (inactiveStudentIds.length > 0) {
            // Update student_basic_info: grade/class_num/number → null
            for (let i = 0; i < inactiveStudentIds.length; i += CHUNK_SIZE) {
                const chunk = inactiveStudentIds.slice(i, i + CHUNK_SIZE);
                report('비활성 학생 처리 중...', Math.min(i + CHUNK_SIZE, inactiveStudentIds.length), inactiveStudentIds.length);

                const { error: inactiveBiError, count: inactiveBiCount } = await supabase
                    .from('student_basic_info' as any)
                    .update({
                        grade: null,
                        class_num: null,
                        number: null,
                    })
                    .in('id', chunk);

                if (inactiveBiError) {
                    result.errors.push(`비활성 학생 basic_info 업데이트 실패: ${inactiveBiError.message}`);
                } else {
                    result.inactiveUpdated += inactiveBiCount || 0;
                }
            }
        }
    }

    report('완료', 1, 1);
    return result;
};
