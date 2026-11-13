import { supabase } from '@/integrations/supabase/client';
import type { ParsedMockExamRow } from '../utils/excelParsers/mockExam';
import type { ParsedMarkingStudent } from '../utils/excelParsers/mockMarking';

interface DetailedActivityPayload {
    student_id: string;
    category: string;
    subject_name: string;
    content: string;
    grade: number;
    semester?: number;
    source?: string;
    data?: any;
}

/**
 * 과목별 세부능력및특기사항을 student_basic_info.academic_development에 동기화
 * - AcademicGrades.tsx에서 표시하기 위해 필요
 * - student_detailed_activities의 content를 academic_development[].content에 반영
 */
const syncActivitiesToAcademicDevelopment = async (
    activities: DetailedActivityPayload[]
): Promise<void> => {
    if (activities.length === 0) return;

    // 1. 학생 ID 목록 추출
    const studentIds = [...new Set(activities.map(a => a.student_id))];

    // 2. 해당 학생들의 academic_development 조회
    const { data: students, error: fetchError } = await supabase
        .from('student_basic_info' as any)
        .select('id, academic_development')
        .in('id', studentIds);

    if (fetchError) {
        console.error('[SyncToAcademic] Failed to fetch students:', fetchError);
        return;
    }

    if (!students || students.length === 0) {
        console.log('[SyncToAcademic] No students found for syncing');
        return;
    }

    // 3. 각 학생별로 academic_development 업데이트
    const updates: { id: string; academic_development: any[] }[] = [];

    for (const student of students) {
        const studentActivities = activities.filter(a => a.student_id === student.id);
        if (studentActivities.length === 0) continue;

        let academicDev = student.academic_development || [];
        let modified = false;

        for (const activity of studentActivities) {
            // 과목명과 학년, 학기가 일치하는 레코드 찾기
            const targetIndex = academicDev.findIndex((rec: any) =>
                rec.subject === activity.subject_name &&
                rec.grade === activity.grade &&
                (activity.semester == null || rec.semester === activity.semester)
            );

            if (targetIndex !== -1) {
                // 기존 레코드의 content 업데이트
                if (academicDev[targetIndex].content !== activity.content) {
                    academicDev[targetIndex].content = activity.content;
                    modified = true;
                }
            }
            // 일치하는 레코드가 없으면 무시 (academic_development에 해당 과목이 없는 경우)
        }

        if (modified) {
            updates.push({ id: student.id, academic_development: academicDev });
        }
    }

    // 4. 변경된 학생들 업데이트
    if (updates.length > 0) {
        console.log(`[SyncToAcademic] Updating ${updates.length} students' academic_development`);
        for (const update of updates) {
            const { error } = await supabase
                .from('student_basic_info' as any)
                .update({ academic_development: update.academic_development })
                .eq('id', update.id);

            if (error) {
                console.error(`[SyncToAcademic] Failed to update student ${update.id}:`, error);
            }
        }
    } else {
        console.log('[SyncToAcademic] No changes to sync');
    }
};

/**
 * 스마트 업서트: 변경된 내용만 수정하고, 없는 데이터는 추가
 * - 기존 데이터와 비교하여 content가 변경된 경우에만 업데이트
 * - 새로운 레코드는 추가
 */
const smartUpsertDetailedActivities = async (
    initialPayload: DetailedActivityPayload[],
    onProgress?: (current: number, total: number) => void
): Promise<{ inserted: number; updated: number; unchanged: number; skipped: number }> => {
    const stats = { inserted: 0, updated: 0, unchanged: 0, skipped: 0 };
    let payload = initialPayload;

    if (payload.length === 0) return stats;

    // 키 생성 헬퍼 (null/undefined를 일관되게 처리)
    const makeKey = (studentId: string, grade: number, semester: number | null | undefined, category: string, subjectName: string) => {
        const semesterStr = semester == null ? 'null' : String(semester);
        const subjectStr = subjectName || 'null';
        return `${studentId}|${grade}|${semesterStr}|${category}|${subjectStr}`;
    };

    // 1. 학생 ID 목록 추출
    const studentIds = [...new Set(payload.map(p => p.student_id))];

    // 1.5. student_basic_info에 존재하는 학생만 필터링 (FK 제약 위반 방지)
    const { data: existingStudents, error: studentFetchError } = await supabase
        .from('student_basic_info' as any)
        .select('id')
        .in('id', studentIds);

    if (studentFetchError) throw studentFetchError;

    const validStudentIds = new Set((existingStudents || []).map((s: any) => s.id));
    const invalidIds = studentIds.filter(id => !validStudentIds.has(id));

    if (invalidIds.length > 0) {
        console.warn(`[SmartUpsert] ${invalidIds.length} student_id(s) not found in student_basic_info, skipping:`, invalidIds);
        const beforeCount = payload.length;
        payload = payload.filter(p => validStudentIds.has(p.student_id));
        stats.skipped = beforeCount - payload.length;
        if (payload.length === 0) {
            console.log('[SmartUpsert] No valid records to upsert after filtering');
            return stats;
        }
    }

    // 2. 기존 데이터 조회
    const { data: existingRecords, error: fetchError } = await supabase
        .from('student_detailed_activities' as any)
        .select('id, student_id, grade, semester, category, subject_name, content')
        .in('student_id', [...validStudentIds]);

    if (fetchError) throw fetchError;

    // 3. 기존 데이터를 키로 매핑 (student_id|grade|semester|category|subject_name)
    const existingMap = new Map<string, { id: string; content: string }>();
    (existingRecords || []).forEach((rec: any) => {
        const key = makeKey(rec.student_id, rec.grade, rec.semester, rec.category, rec.subject_name);
        existingMap.set(key, { id: rec.id, content: rec.content });
    });

    // 4. 분류: 삽입할 것, 업데이트할 것, 변경 없는 것
    const toInsert: DetailedActivityPayload[] = [];
    const toUpdate: { id: string; content: string; data?: any; source?: string }[] = [];

    for (const item of payload) {
        const key = makeKey(item.student_id, item.grade, item.semester, item.category, item.subject_name);
        const existing = existingMap.get(key);

        if (!existing) {
            // 새로운 레코드
            toInsert.push(item);
        } else if (existing.content !== item.content) {
            // 내용이 변경됨
            toUpdate.push({
                id: existing.id,
                content: item.content,
                data: item.data,
                source: item.source
            });
        } else {
            // 변경 없음
            stats.unchanged++;
        }
    }

    // 5. 삽입 실행 (upsert 사용하여 충돌 방지)
    if (toInsert.length > 0) {
        // 삽입할 데이터도 중복 제거
        const insertMap = new Map<string, DetailedActivityPayload>();
        for (const item of toInsert) {
            const key = makeKey(item.student_id, item.grade, item.semester, item.category, item.subject_name);
            insertMap.set(key, item);
        }
        const dedupedInsert = Array.from(insertMap.values());

        const CHUNK_SIZE = 50;
        for (let i = 0; i < dedupedInsert.length; i += CHUNK_SIZE) {
            const chunk = dedupedInsert.slice(i, i + CHUNK_SIZE);
            const { error } = await supabase
                .from('student_detailed_activities' as any)
                .upsert(chunk, {
                    onConflict: 'student_id, grade, semester, category, subject_name'
                });

            if (error) throw error;
            onProgress?.(i + chunk.length, dedupedInsert.length + toUpdate.length);
        }
        stats.inserted = dedupedInsert.length;
    }

    // 6. 업데이트 실행 (개별 업데이트)
    for (let i = 0; i < toUpdate.length; i++) {
        const item = toUpdate[i];
        const { error } = await supabase
            .from('student_detailed_activities' as any)
            .update({
                content: item.content,
                data: item.data,
                source: item.source,
                updated_at: new Date().toISOString()
            })
            .eq('id', item.id);

        if (error) throw error;
        onProgress?.(toInsert.length + i + 1, toInsert.length + toUpdate.length);
    }
    stats.updated = toUpdate.length;

    console.log(`[SmartUpsert] Inserted: ${stats.inserted}, Updated: ${stats.updated}, Unchanged: ${stats.unchanged}, Skipped (no basic_info): ${stats.skipped}`);
    return stats;
};

export const uploadStudentData = async (
    data: { basicInfo: any[], detailedActivities: any[] },
    onProgress?: (progress: number) => void
) => {
    // Helper for chunking
    const chunkArray = <T>(array: T[], size: number): T[][] => {
        const chunked: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
            chunked.push(array.slice(i, i + size));
        }
        return chunked;
    };

    const CHUNK_SIZE = 50;

    // 1. Prepare Basic Info Payload
    const basicInfoPayload = data.basicInfo.map(item => ({
        id: item.id,
        student_id: item.studentId, // Ensure compatibility
        name: item.name,
        // Format student_no as full string if needed, or keep provided? 
        // item.student_no seems to be just the number part in some contexts?
        // Let's rely on item.studentId or reconstruct? The type says student_no is string.
        // But usually we want the full string e.g. "10101". 
        // Let's use the logic: Grade + Class(pad2) + No(pad2)
        student_no: `${item.grade}${String(item.classNum).padStart(2, '0')}${String(item.student_no).padStart(2, '0')}`,
        grade: item.grade,
        class_num: item.classNum,
        number: parseInt(item.student_no || '0'),
        section1_personal_info: item.section1_personal_info || {},
        grade_info: item.gradeInfo || [],
        attendance: item.attendance || {},
        volunteer: item.volunteer || {},
        reading: item.reading || [],
        academic_development: item.academic_development || [],
        source: item.source
    }));

    // 2. Prepare Detailed Activities Payload
    const detailedPayloadRaw = data.detailedActivities.map(item => ({
        student_id: item.id, // item.id here is the Student ID (EntryYear-ID) because we updated it in parser
        category: item.category,
        subject_name: item.subject_name,
        content: item.content || JSON.stringify(item.data),
        grade: item.grade,
        semester: item.semester,
        source: item.source,
        data: item.data
    }));

    // Deduplicate by unique key (student_id, grade, semester, category, subject_name)
    // to prevent "ON CONFLICT DO UPDATE command cannot affect row a second time" error
    const deduplicatedMap = new Map<string, typeof detailedPayloadRaw[0]>();
    for (const item of detailedPayloadRaw) {
        const key = `${item.student_id}|${item.grade}|${item.semester}|${item.category}|${item.subject_name}`;
        deduplicatedMap.set(key, item); // Last occurrence wins
    }
    const detailedPayload = Array.from(deduplicatedMap.values());

    // Calculate total chunks for progress tracking
    const basicChunks = chunkArray(basicInfoPayload, CHUNK_SIZE);
    const detailedChunks = chunkArray(detailedPayload, CHUNK_SIZE);
    const totalChunks = basicChunks.length + detailedChunks.length;
    let completedChunks = 0;

    const updateProgress = () => {
        if (onProgress && totalChunks > 0) {
            const percentage = Math.min(Math.round((completedChunks / totalChunks) * 100), 100);
            onProgress(percentage);
        }
    };

    // Initial progress
    updateProgress();

    // 3. Upload Basic Info
    if (basicChunks.length > 0) {
        for (const chunk of basicChunks) {
            // 1. Upsert Basic Info (Update if exists, Insert if new)
            const { error } = await supabase
                .from('student_basic_info' as any)
                .upsert(chunk, { onConflict: 'id' });

            if (error) throw error;
            completedChunks++;
            updateProgress();
        }
    }

    // 4. Upload Detailed Activities (스마트 업서트: 변경된 내용만 수정, 없는 데이터 추가)
    if (detailedPayload.length > 0) {
        console.log(`[Upload] Using smart upsert for all grades: ${detailedPayload.length} activities`);
        const smartStats = await smartUpsertDetailedActivities(
            detailedPayload as DetailedActivityPayload[],
            (current, total) => {
                const baseProgress = (completedChunks / totalChunks) * 100;
                const smartProgress = (current / total) * 50;
                onProgress?.(Math.min(baseProgress + smartProgress, 99));
            }
        );
        console.log(`[Upload] Smart upsert result: inserted=${smartStats.inserted}, updated=${smartStats.updated}, unchanged=${smartStats.unchanged}, skipped=${smartStats.skipped}`);

        // 5. 과목별 세부능력및특기사항(regular)을 student_basic_info.academic_development에도 반영
        // 이를 통해 AcademicGrades.tsx에서 해당 데이터를 표시할 수 있음
        const regularActivities = detailedPayload.filter(item => item.category === 'regular');
        if (regularActivities.length > 0) {
            console.log(`[Upload] Syncing ${regularActivities.length} regular activities to academic_development`);
            await syncActivitiesToAcademicDevelopment(regularActivities as DetailedActivityPayload[]);
        }
    }

    // Final 100% just in case
    onProgress?.(100);
};

export const fetchStudents = async (grade?: number, classNum?: number) => {
    let query = supabase
        .from('student_basic_info' as any)
        .select('*, student_detailed_activities(*)')
        .order('student_no', { ascending: true }); // Order by student number

    if (grade) {
        query = query.eq('grade', grade);
    }
    if (classNum) {
        query = query.eq('class_num', classNum);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
};

export const fetchStudentCountsByClass = async (grade: number): Promise<{ classNum: number; count: number }[]> => {
    const { data, error } = await supabase
        .from('student_basic_info' as any)
        .select('class_num')
        .eq('grade', grade);

    if (error) throw error;

    const countMap = new Map<number, number>();
    (data || []).forEach((row: any) => {
        const c = row.class_num;
        countMap.set(c, (countMap.get(c) || 0) + 1);
    });

    return Array.from(countMap.entries())
        .map(([classNum, count]) => ({ classNum, count }))
        .sort((a, b) => a.classNum - b.classNum);
};

// ── 선택과목별 학생 추가 ──
// student_enrollment(수강 명단)의 최신 학기 기준으로 학년별 과목 목록과 수강생을 조회한다.
// student_enrollment.student_resource_id(resource.id) → resource.meta.id(=student_basic_info.id)로
// 학적 코드를 얻은 뒤 student_basic_info를 조회 (fetchStudents와 동일한 Student 변환 경로 사용).

/** student_enrollment에 존재하는 가장 최근 (academic_year, semester) 학기를 반환 */
const fetchLatestEnrollmentTerm = async (): Promise<{ academicYear: number; semester: number } | null> => {
    const { data, error } = await supabase
        .from('student_enrollment')
        .select('academic_year, semester')
        .order('academic_year', { ascending: false })
        .order('semester', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return { academicYear: data.academic_year, semester: data.semester };
};

export interface SubjectClassroomOption {
    classroom: string;
    studentCount: number;
}

export interface SubjectOption {
    subjectName: string;
    /** 분반(classroom) 목록. 1개면 분반 선택 없이 바로 전체 로드, 2개 이상이면 분반 선택 UI 노출 */
    classrooms: SubjectClassroomOption[];
}

/** 특정 학년이 최신 학기에 수강 중인 과목 목록(분반별 인원 포함), 이름순 정렬 */
export const fetchSubjectsByGrade = async (grade: number): Promise<SubjectOption[]> => {
    const term = await fetchLatestEnrollmentTerm();
    if (!term) return [];

    const { data, error } = await supabase
        .from('student_enrollment')
        .select('subject_name, classroom, student_resource_id')
        .eq('academic_year', term.academicYear)
        .eq('semester', term.semester)
        .eq('student_grade', grade);

    if (error) throw error;

    // subject_name -> classroom(빈 값은 '기본'으로 묶음) -> 수강생 id Set
    const bySubject = new Map<string, Map<string, Set<string>>>();
    (data || []).forEach((row) => {
        if (!row.subject_name || !row.student_resource_id) return;
        const classroom = row.classroom || '기본';
        const classroomMap = bySubject.get(row.subject_name) ?? new Map<string, Set<string>>();
        const idSet = classroomMap.get(classroom) ?? new Set<string>();
        idSet.add(row.student_resource_id);
        classroomMap.set(classroom, idSet);
        bySubject.set(row.subject_name, classroomMap);
    });

    return Array.from(bySubject.entries())
        .map(([subjectName, classroomMap]) => ({
            subjectName,
            classrooms: Array.from(classroomMap.entries())
                .map(([classroom, ids]) => ({ classroom, studentCount: ids.size }))
                .sort((a, b) => a.classroom.localeCompare(b.classroom, 'ko')),
        }))
        .sort((a, b) => a.subjectName.localeCompare(b.subjectName, 'ko'));
};

/**
 * 특정 학년 + 과목(+ 분반)의 수강생을 student_basic_info 기준 Student[]로 조회 (최신 학기).
 * classroom을 생략하면 해당 과목의 전체 분반 수강생을 모두 불러온다.
 * student_enrollment → resource.meta.id → student_basic_info 순으로 학적 코드를 연결한다.
 */
export const fetchStudentsBySubject = async (
    grade: number,
    subjectName: string,
    classroom?: string
): Promise<unknown[]> => {
    const term = await fetchLatestEnrollmentTerm();
    if (!term) return [];

    let query = supabase
        .from('student_enrollment')
        .select('student_resource_id')
        .eq('academic_year', term.academicYear)
        .eq('semester', term.semester)
        .eq('student_grade', grade)
        .eq('subject_name', subjectName);

    // classroom이 빈 값(NULL)인 행은 fetchSubjectsByGrade에서 '기본'으로 묶어 보여주므로 동일하게 처리
    if (classroom && classroom !== '기본') {
        query = query.eq('classroom', classroom);
    } else if (classroom === '기본') {
        query = query.is('classroom', null);
    }

    const { data: enrollments, error: enrollError } = await query;

    if (enrollError) throw enrollError;

    const resourceIds = [...new Set((enrollments || []).map((r) => r.student_resource_id).filter(Boolean))] as string[];
    if (resourceIds.length === 0) return [];

    const { data: resources, error: resError } = await supabase
        .from('resource')
        .select('id, meta')
        .in('id', resourceIds);

    if (resError) throw resError;

    const studentCodes = [...new Set(
        (resources || [])
            .map((r) => (r.meta as { id?: string } | null)?.id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )];
    if (studentCodes.length === 0) return [];

    const { data, error } = await supabase
        .from('student_basic_info' as any)
        .select('*, student_detailed_activities(*)')
        .in('id', studentCodes)
        .order('student_no', { ascending: true });

    if (error) throw error;
    return data || [];
};

// ── Graduated Students ──

const fetchGraduatedStudentIds = async (): Promise<string[]> => {
    const { data, error } = await supabase
        .from('resource')
        .select('meta')
        .eq('type', 'student')
        .eq('status', 'graduated');

    if (error) throw error;

    return (data || [])
        .map((r: any) => r.meta?.id)
        .filter(Boolean);
};

const parseAdmissionYear = (value: unknown): number | null => {
    if (value == null || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
};

/**
 * 졸업생 목록 조회
 * - resource(type='student', status='graduated').meta.id 기반으로 학생 ID 확보 후 student_basic_info 조회
 * - admissionYear: undefined → 전체, number → 해당 입학년도, null → admissionYear 미상만
 */
export const fetchGraduatedStudents = async (
    admissionYear?: number | null
): Promise<any[]> => {
    const ids = await fetchGraduatedStudentIds();
    if (ids.length === 0) return [];

    const { data, error } = await supabase
        .from('student_basic_info' as any)
        .select('*, student_detailed_activities(*)')
        .in('id', ids)
        .order('student_no', { ascending: true });

    if (error) throw error;

    if (admissionYear === undefined) return data || [];

    return (data || []).filter((s: any) =>
        parseAdmissionYear(s.section1_personal_info?.admissionYear) === admissionYear
    );
};

/**
 * 졸업생 입학년도별 인원 집계
 * - admissionYear가 비어있는 학생은 null 키에 묶임 ("미상")
 * - 정렬: 최근 입학년도 → 과거 → 미상
 */
export const fetchGraduatedCountsByAdmissionYear = async (): Promise<{ admissionYear: number | null; count: number }[]> => {
    const ids = await fetchGraduatedStudentIds();
    if (ids.length === 0) return [];

    const { data, error } = await supabase
        .from('student_basic_info' as any)
        .select('id, section1_personal_info')
        .in('id', ids);

    if (error) throw error;

    const countMap = new Map<number | null, number>();
    (data || []).forEach((row: any) => {
        const key = parseAdmissionYear(row.section1_personal_info?.admissionYear);
        countMap.set(key, (countMap.get(key) || 0) + 1);
    });

    return Array.from(countMap.entries())
        .map(([admissionYear, count]) => ({ admissionYear, count }))
        .sort((a, b) => {
            if (a.admissionYear === null) return 1;
            if (b.admissionYear === null) return -1;
            return b.admissionYear - a.admissionYear;
        });
};

export const deleteStudent = async (studentId: string) => {
    const { error } = await supabase.from('student_basic_info' as any).delete().eq('id', studentId);
    if (error) throw error;
};

export const createStudent = async (student: {
    id: string;
    name: string;
    grade: number;
    class_num: number;
    number: number;
    student_no: string;
}) => {
    const { error } = await supabase
        .from('student_basic_info' as any)
        .insert({
            id: student.id,
            name: student.name,
            grade: student.grade,
            class_num: student.class_num,
            number: student.number,
            student_no: student.student_no,
            section1_personal_info: {},
            grade_info: [],
            attendance: {},
            volunteer: {},
            reading: [],
            academic_development: [],
        });
    if (error) throw error;
};

// Map database 'student_basic_info' + 'student_detailed_activities' to app 'Student' type
export const convertBasicInfoToStudent = (info: any): import('../types').Student => {
    // Basic Info Mapping
    const gradeInfo = info.grade_info || [];

    // Detailed Activities Mapping
    const activities = info.student_detailed_activities || [];

    // 1. Creative Activities (Section 5)
    // Categories: '자율활동', '동아리활동', '진로활동'
    const creativeActivities = activities
        .filter((a: any) => ['자율활동', '동아리활동', '진로활동'].includes(a.category))
        .map((a: any) => ({
            grade: a.grade,
            type: a.category,
            hours: a.data?.시간 ? parseInt(a.data.시간) : null,
            field: a.data?.희망분야 || null,
            content: a.content,
        }))
        .sort((a: any, b: any) => a.grade - b.grade);

    // 2. Behavioral Characteristics (Section 8)
    const behavioral = activities
        .filter((a: any) => a.category && a.category.includes('행동특성'))
        .map((a: any) => ({
            grade: a.grade,
            content: a.content
        }))
        .sort((a: any, b: any) => a.grade - b.grade);

    // 3. Header Construction
    const header = {
        documentTitle: "학교생활세부사항기록부(학교생활기록부II)",
        gradeInfo: gradeInfo
    };

    return {
        id: info.id || crypto.randomUUID(),
        studentId: info.student_id,
        studentNo: info.student_no, // e.g. "30105"
        name: info.name,
        grade: info.grade || undefined,
        classNum: info.class_num || undefined,
        number: info.number || undefined,
        status: '미평가', // Default status
        totalScore: null,
        majorScore: null,
        attendance: '대기중',
        profileImage: null,

        // Detailed Sections - Hydrated from DB
        header: header,
        section1_personal_info: info.section1_personal_info,
        section2_attendance: info.attendance, // Ensure DB column name matches expected type or map it
        section5_creative_activities: creativeActivities,
        section6_academic_development: info.academic_development || [], // Grades from basic_info
        section8_behavior_characteristics: behavioral,
        volunteer_activities: info.volunteer, // Volunteer from basic_info
        mock_result: info.mock_result || [], // 모의고사 성적
        reading: info.reading || [], // 독서활동

        uploadedAt: info.created_at || new Date().toISOString()
    };
};

// ============================================================
// Mock Exam (모의고사) Upload
// ============================================================

/**
 * 학생 조회 헬퍼: admissionYear 필터 결과와 resource(현재 학년) 필터 결과를 합집합으로 반환
 * - admissionYear가 미등록/오등록된 학생이 섞여 있어도 resource.meta.grade 기준 현재 학년 학생을 항상 함께 조회
 *   (과거에는 admissionYear 결과가 하나라도 있으면 resource fallback을 건너뛰어, admissionYear가
 *   잘못 저장된 학생이 있으면 신입생 등 student_basic_info 미등록 학생이 후보 풀에서 누락되는 문제가 있었음)
 */
const fetchStudentsByEnrollment = async (
    enrollmentYear: number,
    examGrade: number,
    selectColumns: string
): Promise<any[]> => {
    const { data: students, error } = await supabase
        .from('student_basic_info' as any)
        .select(selectColumns)
        .filter('section1_personal_info->>admissionYear', 'eq', String(enrollmentYear));

    if (error) throw error;

    // resource 테이블에서 현재 해당 학년인 학생의 meta.id를 조회 (현재 학년의 권위 있는 출처)
    const { data: resources, error: resError } = await supabase
        .from('resource')
        .select('meta')
        .eq('type', 'student')
        .filter('meta->>grade', 'eq', String(examGrade));

    if (resError) throw resError;

    const studentIds = (resources || [])
        .map((r: any) => r.meta?.id)
        .filter(Boolean);

    const merged = new Map<string, any>();
    for (const s of students || []) merged.set((s as any).id, s);

    if (studentIds.length > 0) {
        const missingIds = studentIds.filter((id: string) => !merged.has(id));
        if (missingIds.length > 0) {
            const { data: fallbackStudents, error: fallbackError } = await supabase
                .from('student_basic_info' as any)
                .select(selectColumns)
                .in('id', missingIds);

            if (fallbackError) throw fallbackError;
            for (const s of fallbackStudents || []) merged.set((s as any).id, s);
        }
    }

    return [...merged.values()];
};

/**
 * resource 테이블 기준 "현재 학년"의 반-번호 → student_basic_info.id 매핑
 * - grade_info는 과거 학년 이력까지 포함하고 있어 반-번호가 연도별로 재사용되면 충돌할 수 있음
 * - resource.meta(class, number, grade)는 이 프로젝트에서 "현재" 학년/반의 권위 있는 출처로 사용됨
 */
const fetchCurrentSeatMap = async (examGrade: number): Promise<Map<string, string>> => {
    const { data: resources, error } = await supabase
        .from('resource')
        .select('meta')
        .eq('type', 'student')
        .filter('meta->>grade', 'eq', String(examGrade));

    if (error) throw error;

    const seatMap = new Map<string, string>();
    for (const r of resources || []) {
        const meta = (r as any).meta;
        const studentId = meta?.id;
        const classNum = meta?.class;
        const number = meta?.number;
        if (!studentId || classNum == null || number == null) continue;
        seatMap.set(`${classNum}-${number}`, studentId);
    }
    return seatMap;
};

export interface MockExamMatchResult {
    row: ParsedMockExamRow;
    student: { id: string; name: string } | null;
    matchMethod: 'grade_info' | 'name' | null;
}

/**
 * 모의고사 파싱 결과와 학생 매칭 미리보기
 * - 입학년도로 대상 학생 필터
 * - resource.meta(현재 학년 반-번호)로 매칭 (권위 있는 출처)
 * - grade_info는 resource에 없는 학생(졸업생 등)에 한해 보조 매칭
 * - 이름으로 최종 보조 매칭
 */
export const previewMockExamMatching = async (
    parsedData: ParsedMockExamRow[],
    academicYear: number,
    examGrade: number
): Promise<MockExamMatchResult[]> => {
    const enrollmentYear = academicYear - examGrade + 1;
    const students = await fetchStudentsByEnrollment(enrollmentYear, examGrade, 'id, name, grade_info, section1_personal_info');
    const currentSeatMap = await fetchCurrentSeatMap(examGrade);

    const byId = new Map<string, { id: string; name: string }>();
    for (const student of (students || [])) {
        byId.set(student.id, { id: student.id, name: student.name });
    }

    // Build lookup maps
    const classNumMap = new Map<string, { id: string; name: string }>();
    const nameMap = new Map<string, { id: string; name: string }>();

    // 1순위: resource.meta 기준 현재 반-번호
    for (const [key, studentId] of currentSeatMap.entries()) {
        const student = byId.get(studentId);
        if (student) classNumMap.set(key, student);
    }

    for (const student of (students || [])) {
        const gradeInfo = student.grade_info || [];
        for (const gi of gradeInfo) {
            if (parseInt(String(gi.grade)) === examGrade) {
                const key = `${gi.class}-${gi.number}`;
                // resource 기준 매칭이 이미 있으면 우선하고, 없을 때만 grade_info로 보조 채움
                if (!classNumMap.has(key)) {
                    classNumMap.set(key, { id: student.id, name: student.name });
                }
            }
        }
        nameMap.set(student.name, { id: student.id, name: student.name });
    }

    return parsedData.map(row => {
        const key = `${row.classNum}-${row.number}`;
        const byClassNum = classNumMap.get(key);
        if (byClassNum) {
            return { row, student: byClassNum, matchMethod: 'grade_info' as const };
        }
        const byName = nameMap.get(row.name);
        if (byName) {
            return { row, student: byName, matchMethod: 'name' as const };
        }
        return { row, student: null, matchMethod: null };
    });
};

/**
 * 모의고사 데이터 업로드 (student_basic_info.mock_result에 저장)
 * - Smart upsert: 동일 (academic_year, exam_grade, exam_month) 엔트리는 업데이트
 */
export const uploadMockExamData = async (
    parsedData: ParsedMockExamRow[],
    academicYear: number,
    examGrade: number,
    examMonth: number,
    onProgress?: (progress: number) => void,
    manualMatches?: Map<string, string> // key: "classNum-number", value: student_basic_info.id
): Promise<{ matched: number; unmatched: number; inserted: number; updated: number; skipped: number }> => {
    const stats = { matched: 0, unmatched: 0, inserted: 0, updated: 0, skipped: 0 };
    const enrollmentYear = academicYear - examGrade + 1;

    // 1. Fetch students (admissionYear ∪ resource.meta 현재 학년)
    const students = await fetchStudentsByEnrollment(enrollmentYear, examGrade, 'id, name, grade_info, mock_result, section1_personal_info');
    const currentSeatMap = await fetchCurrentSeatMap(examGrade);

    // 1.5. 수동 매칭된 학생도 조회 (admissionYear 필터에 걸리지 않는 학생 포함)
    let manualStudents: any[] = [];
    if (manualMatches && manualMatches.size > 0) {
        const manualIds = [...new Set(manualMatches.values())];
        const { data: manualData } = await supabase
            .from('student_basic_info' as any)
            .select('id, name, grade_info, mock_result, section1_personal_info')
            .in('id', manualIds);
        manualStudents = manualData || [];
    }

    const allStudents = [...(students || [])];
    // 수동 매칭 학생 중 기존 목록에 없는 학생 추가
    const existingIds = new Set(allStudents.map((s: any) => s.id));
    for (const ms of manualStudents) {
        if (!existingIds.has(ms.id)) {
            allStudents.push(ms);
        }
    }

    if (allStudents.length === 0) {
        throw new Error(`입학년도 ${enrollmentYear}에 해당하는 학생을 찾을 수 없습니다.`);
    }

    // 2. Build lookup maps
    const classNumMap = new Map<string, any>();
    const nameMap = new Map<string, any>();
    const idMap = new Map<string, any>();

    for (const student of allStudents) {
        idMap.set(student.id, student);
        nameMap.set(student.name, student);
    }

    // 1순위: resource.meta 기준 현재 반-번호
    for (const [key, studentId] of currentSeatMap.entries()) {
        const student = idMap.get(studentId);
        if (student) classNumMap.set(key, student);
    }

    // 2순위: resource에 없는 학생(졸업생 등)만 grade_info로 보조 매칭
    for (const student of allStudents) {
        const gradeInfo = student.grade_info || [];
        for (const gi of gradeInfo) {
            if (parseInt(String(gi.grade)) === examGrade) {
                const key = `${gi.class}-${gi.number}`;
                if (!classNumMap.has(key)) {
                    classNumMap.set(key, student);
                }
            }
        }
    }

    // 3. Match and upsert
    const matchedUpdates: { student: any; row: ParsedMockExamRow }[] = [];

    for (const row of parsedData) {
        const key = `${row.classNum}-${row.number}`;

        // 수동 매칭 우선
        const manualId = manualMatches?.get(key);
        let student = manualId ? idMap.get(manualId) : undefined;

        if (!student) student = classNumMap.get(key);
        if (!student) student = nameMap.get(row.name);

        if (student) {
            matchedUpdates.push({ student, row });
            stats.matched++;
        } else {
            stats.unmatched++;
        }
    }

    // 4. Chunked DB updates
    const CHUNK_SIZE = 50;
    const totalUpdates = matchedUpdates.length;

    for (let i = 0; i < totalUpdates; i += CHUNK_SIZE) {
        const chunk = matchedUpdates.slice(i, i + CHUNK_SIZE);

        for (const { student, row } of chunk) {
            const mockResult: any[] = [...(student.mock_result || [])];
            const newEntry = {
                academic_year: academicYear,
                exam_grade: examGrade,
                exam_month: examMonth,
                subjects: row.subjects,
            };

            const existingIdx = mockResult.findIndex(
                (m: any) => m.academic_year === academicYear && m.exam_grade === examGrade && m.exam_month === examMonth
            );

            if (existingIdx !== -1) {
                if (JSON.stringify(mockResult[existingIdx].subjects) !== JSON.stringify(newEntry.subjects)) {
                    mockResult[existingIdx] = newEntry;
                    stats.updated++;
                } else {
                    stats.skipped++;
                    continue;
                }
            } else {
                mockResult.push(newEntry);
                stats.inserted++;
            }

            const { error: updateError } = await supabase
                .from('student_basic_info' as any)
                .update({ mock_result: mockResult })
                .eq('id', student.id);

            if (updateError) {
                console.error(`[MockExam] Failed to update student ${student.id}:`, updateError);
            }
        }

        onProgress?.(Math.min(Math.round(((i + chunk.length) / totalUpdates) * 100), 100));
    }

    onProgress?.(100);
    console.log(`[MockExam] Upload result: matched=${stats.matched}, unmatched=${stats.unmatched}, inserted=${stats.inserted}, updated=${stats.updated}, skipped=${stats.skipped}`);
    return stats;
};

// ============================================================
// Mock Marking (모의고사 마킹) Upload
// ============================================================

export interface MockMarkingMatchResult {
    student: { classNum: number; number: number; name: string };
    matched: { id: string; name: string } | null;
    matchMethod: 'grade_info' | 'name' | null;
}

/**
 * 모의고사 마킹 파싱 결과와 학생 매칭 미리보기
 */
export const previewMockMarkingMatching = async (
    parsedData: ParsedMarkingStudent[],
    academicYear: number,
    examGrade: number
): Promise<MockMarkingMatchResult[]> => {
    const enrollmentYear = academicYear - examGrade + 1;
    const students = await fetchStudentsByEnrollment(enrollmentYear, examGrade, 'id, name, grade_info, section1_personal_info');
    const currentSeatMap = await fetchCurrentSeatMap(examGrade);

    const byId = new Map<string, { id: string; name: string }>();
    for (const student of (students || [])) {
        byId.set(student.id, { id: student.id, name: student.name });
    }

    const classNumMap = new Map<string, { id: string; name: string }>();
    const nameMap = new Map<string, { id: string; name: string }>();

    // 1순위: resource.meta 기준 현재 반-번호
    for (const [key, studentId] of currentSeatMap.entries()) {
        const student = byId.get(studentId);
        if (student) classNumMap.set(key, student);
    }

    // 2순위: resource에 없는 학생(졸업생 등)만 grade_info로 보조 매칭
    for (const student of (students || [])) {
        const gradeInfo = student.grade_info || [];
        for (const gi of gradeInfo) {
            if (parseInt(String(gi.grade)) === examGrade) {
                const key = `${gi.class}-${gi.number}`;
                if (!classNumMap.has(key)) {
                    classNumMap.set(key, { id: student.id, name: student.name });
                }
            }
        }
        nameMap.set(student.name, { id: student.id, name: student.name });
    }

    return parsedData.map(row => {
        const key = `${row.classNum}-${row.number}`;
        const byClassNum = classNumMap.get(key);
        if (byClassNum) {
            return { student: { classNum: row.classNum, number: row.number, name: row.name }, matched: byClassNum, matchMethod: 'grade_info' as const };
        }
        const byName = nameMap.get(row.name);
        if (byName) {
            return { student: { classNum: row.classNum, number: row.number, name: row.name }, matched: byName, matchMethod: 'name' as const };
        }
        return { student: { classNum: row.classNum, number: row.number, name: row.name }, matched: null, matchMethod: null };
    });
};

/**
 * 모의고사 마킹 데이터 업로드 (student_basic_info.mock_marking에 저장)
 * - Smart upsert: 동일 (academic_year, exam_grade, exam_month) 엔트리는 업데이트
 */
export const uploadMockMarkingData = async (
    parsedData: ParsedMarkingStudent[],
    academicYear: number,
    examGrade: number,
    examMonth: number,
    onProgress?: (progress: number) => void,
    manualMatches?: Map<string, string>
): Promise<{ matched: number; unmatched: number; inserted: number; updated: number; skipped: number }> => {
    const stats = { matched: 0, unmatched: 0, inserted: 0, updated: 0, skipped: 0 };
    const enrollmentYear = academicYear - examGrade + 1;

    // 1. Fetch students (admissionYear ∪ resource.meta 현재 학년)
    const students = await fetchStudentsByEnrollment(enrollmentYear, examGrade, 'id, name, grade_info, mock_marking, section1_personal_info');
    const currentSeatMap = await fetchCurrentSeatMap(examGrade);

    // 수동 매칭된 학생도 조회
    let manualStudents: any[] = [];
    if (manualMatches && manualMatches.size > 0) {
        const manualIds = [...new Set(manualMatches.values())];
        const { data: manualData } = await supabase
            .from('student_basic_info' as any)
            .select('id, name, grade_info, mock_marking, section1_personal_info')
            .in('id', manualIds);
        manualStudents = manualData || [];
    }

    const allStudents = [...(students || [])];
    const existingIds = new Set(allStudents.map((s: any) => s.id));
    for (const ms of manualStudents) {
        if (!existingIds.has(ms.id)) allStudents.push(ms);
    }

    if (allStudents.length === 0) {
        throw new Error(`입학년도 ${enrollmentYear}에 해당하는 학생을 찾을 수 없습니다.`);
    }

    // 2. Build lookup maps
    const classNumMap = new Map<string, any>();
    const nameMap = new Map<string, any>();
    const idMap = new Map<string, any>();

    for (const student of allStudents) {
        idMap.set(student.id, student);
        nameMap.set(student.name, student);
    }

    // 1순위: resource.meta 기준 현재 반-번호
    for (const [key, studentId] of currentSeatMap.entries()) {
        const student = idMap.get(studentId);
        if (student) classNumMap.set(key, student);
    }

    // 2순위: resource에 없는 학생(졸업생 등)만 grade_info로 보조 매칭
    for (const student of allStudents) {
        const gradeInfo = student.grade_info || [];
        for (const gi of gradeInfo) {
            if (parseInt(String(gi.grade)) === examGrade) {
                const key = `${gi.class}-${gi.number}`;
                if (!classNumMap.has(key)) {
                    classNumMap.set(key, student);
                }
            }
        }
    }

    // 3. Match and upsert
    const matchedUpdates: { student: any; row: ParsedMarkingStudent }[] = [];

    for (const row of parsedData) {
        const key = `${row.classNum}-${row.number}`;
        const manualId = manualMatches?.get(key);
        let student = manualId ? idMap.get(manualId) : undefined;

        if (!student) student = classNumMap.get(key);
        if (!student) student = nameMap.get(row.name);

        if (student) {
            matchedUpdates.push({ student, row });
            stats.matched++;
        } else {
            stats.unmatched++;
        }
    }

    // 4. Chunked DB updates
    const CHUNK_SIZE = 50;
    const totalUpdates = matchedUpdates.length;

    for (let i = 0; i < totalUpdates; i += CHUNK_SIZE) {
        const chunk = matchedUpdates.slice(i, i + CHUNK_SIZE);

        for (const { student, row } of chunk) {
            const mockMarking: any[] = [...(student.mock_marking || [])];
            let changeKind: 'inserted' | 'updated';
            const newEntry = {
                academic_year: academicYear,
                exam_grade: examGrade,
                exam_month: examMonth,
                subjects: row.subjects,
            };

            const existingIdx = mockMarking.findIndex(
                (m: any) => m.academic_year === academicYear && m.exam_grade === examGrade && m.exam_month === examMonth
            );

            if (existingIdx !== -1) {
                if (JSON.stringify(mockMarking[existingIdx].subjects) !== JSON.stringify(newEntry.subjects)) {
                    mockMarking[existingIdx] = newEntry;
                    changeKind = 'updated';
                } else {
                    stats.skipped++;
                    continue;
                }
            } else {
                mockMarking.push(newEntry);
                changeKind = 'inserted';
            }

            const { error: updateError } = await supabase
                .from('student_basic_info' as any)
                .update({ mock_marking: mockMarking } as any)
                .eq('id', student.id);

            if (updateError) {
                console.error(`[MockMarking] Failed to update student ${student.id}:`, updateError);
                throw new Error(
                    `학생 ${student.name || student.id}의 모의고사 데이터를 저장하지 못했습니다: ${updateError.message}`
                );
            }

            stats[changeKind]++;
        }

        onProgress?.(Math.min(Math.round(((i + chunk.length) / totalUpdates) * 100), 100));
    }

    onProgress?.(100);
    console.log(`[MockMarking] Upload result: matched=${stats.matched}, unmatched=${stats.unmatched}, inserted=${stats.inserted}, updated=${stats.updated}, skipped=${stats.skipped}`);
    return stats;
};

// ============================================================
// 독서 추출 (Book Extraction from Detailed Activities)
// ============================================================

interface ExtractedBook {
    title: string;
    author: string;
}

/**
 * content 문자열에서 "도서명(저자명)" 또는 '도서명(저자명)' 패턴을 추출
 * - 큰따옴표: "제목(저자)"
 * - 작은따옴표: '제목(저자)'
 * - 겹낫표/홑낫표: 「제목」(저자), 『제목』(저자)
 * - 꺾쇠: <제목>(저자), 〈제목〉(저자)
 */
const extractBooksFromContent = (content: string): ExtractedBook[] => {
    const books: ExtractedBook[] = [];
    if (!content) return books;

    // Pattern: 따옴표/괄호로 감싼 제목 뒤에 (저자명)
    // "제목(저자)" or '제목(저자)'
    const patterns = [
        /["\u201C\u201D]([^"\u201C\u201D]+?)\(([^)]+)\)["\u201C\u201D]/g,   // "제목(저자)" (직선/곡선 큰따옴표)
        /[''\u2018\u2019]([^''\u2018\u2019]+?)\(([^)]+)\)[''\u2018\u2019]/g, // '제목(저자)' (직선/곡선 작은따옴표)
        /「([^」]+?)」\s*\(([^)]+)\)/g,   // 「제목」(저자)
        /『([^』]+?)』\s*\(([^)]+)\)/g,   // 『제목』(저자)
        /<([^>]+?)>\s*\(([^)]+)\)/g,      // <제목>(저자)
        /〈([^〉]+?)〉\s*\(([^)]+)\)/g,   // 〈제목〉(저자)
    ];

    const seen = new Set<string>();

    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
            const title = match[1].trim();
            const author = match[2].trim();
            if (title && author) {
                // 저자명이 날짜 패턴이면 도서가 아님 (예: 2024.03.15, 2024.03.15.-2024.06.20.)
                if (/^\d{4}\.\d{1,2}\.\d{1,2}\.?(\s*-\s*\d{4}\.\d{1,2}\.\d{1,2}\.?)?$/.test(author)) continue;
                const key = `${title}|${author}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    books.push({ title, author });
                }
            }
        }
    }

    return books;
};

/**
 * 모든 학생의 student_detailed_activities.content에서 도서 정보를 추출하여
 * student_basic_info.reading에 저장
 */
export const extractAndSaveBooks = async (
    onProgress?: (progress: number, message: string) => void
): Promise<{ totalStudents: number; totalBooks: number; updatedStudents: number }> => {
    onProgress?.(0, '학생 목록 조회 중...');

    // 1. 모든 학생 ID 조회 (academic_development 포함하여 학기 정보 매핑)
    const { data: students, error: studentsError } = await supabase
        .from('student_basic_info' as any)
        .select('id, name, reading, academic_development');

    if (studentsError) throw studentsError;
    if (!students || students.length === 0) {
        return { totalStudents: 0, totalBooks: 0, updatedStudents: 0 };
    }

    onProgress?.(5, `${students.length}명 학생의 세부활동 조회 중...`);

    // 2. 모든 student_detailed_activities 조회 (페이지네이션으로 전체 조회)
    const PAGE_SIZE = 1000;
    const allActivities: any[] = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
        const { data: page, error: pageError } = await supabase
            .from('student_detailed_activities' as any)
            .select('student_id, category, subject_name, content, grade, semester')
            .range(from, from + PAGE_SIZE - 1);

        if (pageError) throw pageError;

        if (page && page.length > 0) {
            allActivities.push(...page);
            from += page.length;
            onProgress?.(5 + Math.round((from / (from + PAGE_SIZE)) * 10), `세부활동 ${allActivities.length}건 조회 중...`);
        }

        if (!page || page.length < PAGE_SIZE) {
            hasMore = false;
        }
    }

    console.log(`[BookExtract] Total activities loaded: ${allActivities.length}`);

    // 학생별로 그룹화
    const activitiesByStudent = new Map<string, any[]>();
    allActivities.forEach((act: any) => {
        const list = activitiesByStudent.get(act.student_id) || [];
        list.push(act);
        activitiesByStudent.set(act.student_id, list);
    });

    onProgress?.(15, '도서 정보 추출 중...');

    let totalBooks = 0;
    let updatedStudents = 0;
    const updates: { id: string; reading: any[] }[] = [];

    for (let i = 0; i < students.length; i++) {
        const student = students[i] as any;
        const activities = activitiesByStudent.get(student.id) || [];

        // 기존 reading 데이터 유지
        const existingReading: any[] = Array.isArray(student.reading) ? [...student.reading] : [];

        // 기존 reading에서 추출된 도서 목록 (source가 'extracted'인 것)
        // 새로 추출하므로 기존 extracted 항목은 제거하고 다시 추가
        const manualReading = existingReading.filter((r: any) => r.source !== 'extracted');

        // academic_development에서 (학년, 과목) → 학기 매핑 생성
        const semesterLookup = new Map<string, number>();
        const adEntries: any[] = Array.isArray(student.academic_development) ? student.academic_development : [];
        for (const ad of adEntries) {
            if (!ad.semester || !ad.content) continue;
            const key = `${ad.grade}|${ad.subject}`;
            // content가 있는 항목만 매핑 (빈 문자열은 무시)
            if (ad.content.trim()) {
                semesterLookup.set(key, Number(ad.semester));
            }
        }

        // content에서 도서 추출
        const extractedBooks: any[] = [];
        const seenBooks = new Set<string>();

        for (const act of activities) {
            if (!act.content) continue;
            const books = extractBooksFromContent(act.content);

            // 학기 결정: 1) DB semester 사용 2) academic_development에서 매핑 3) 기본값 0
            let semester = act.semester || 0;
            if (!semester) {
                const subjectName = act.subject_name || '';
                const lookupKey = `${act.grade}|${subjectName}`;
                semester = semesterLookup.get(lookupKey) || 0;

                // academic_development에서 못 찾은 경우, 도서명으로 content 검색하여 학기 결정
                if (!semester && books.length > 0) {
                    for (const ad of adEntries) {
                        if (Number(ad.grade) !== Number(act.grade) || !ad.content?.trim()) continue;
                        const bookTitle = books[0].title;
                        if (ad.content.includes(bookTitle)) {
                            semester = Number(ad.semester) || 0;
                            break;
                        }
                    }
                }
            }

            for (const book of books) {
                const key = `${book.title}|${book.author}`;
                if (seenBooks.has(key)) continue;
                seenBooks.add(key);

                extractedBooks.push({
                    grade: act.grade || 0,
                    semester,
                    related: act.subject_name || act.category || '',
                    content: `${book.title}(${book.author})`,
                    source: 'extracted',
                    title: book.title,
                    author: book.author,
                });
            }
        }

        if (extractedBooks.length > 0) {
            const merged = [...manualReading, ...extractedBooks];
            updates.push({ id: student.id, reading: merged });
            totalBooks += extractedBooks.length;
            updatedStudents++;
        }

        if ((i + 1) % 10 === 0 || i === students.length - 1) {
            onProgress?.(
                15 + Math.round(((i + 1) / students.length) * 60),
                `${i + 1}/${students.length}명 처리 중... (${totalBooks}권 발견)`
            );
        }
    }

    onProgress?.(80, `${updates.length}명 학생 데이터 업데이트 중...`);

    // 3. 배치 업데이트
    const BATCH_SIZE = 50;
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const batch = updates.slice(i, i + BATCH_SIZE);
        for (const item of batch) {
            const { error } = await supabase
                .from('student_basic_info' as any)
                .update({ reading: item.reading })
                .eq('id', item.id);
            if (error) {
                console.error(`[BookExtract] Failed to update ${item.id}:`, error);
            }
        }
        onProgress?.(
            80 + Math.round(((i + batch.length) / updates.length) * 18),
            `업데이트 중... ${Math.min(i + BATCH_SIZE, updates.length)}/${updates.length}`
        );
    }

    onProgress?.(100, '완료');
    console.log(`[BookExtract] Result: ${totalBooks} books from ${updatedStudents} students`);
    return { totalStudents: students.length, totalBooks, updatedStudents };
};
