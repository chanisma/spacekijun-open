
import { Student, SubjectGrade } from '../../types';

/**
 * Merges Legacy Parser accuracy (Text Content) into Upstage Parser structure (Grades/Scores).
 * 
 * Strategy:
 * 1. Base Structure: Upstage Student (Better Grades/Scores/Rank structure)
 * 2. Overrides from Legacy:
 *    - Basic Info (Name, StudentNo, Header)
 *    - Personal Info (Section 1)
 *    - Attendance (Section 2) - Legacy is trusted for structure
 *    - Creative Activities (Section 5) - Legacy has correct Content & Hours
 *    - Volunteer Activities - Legacy is trusted
 * 3. Section 6 (Academic):
 *    - Use Upstage records as the "Skeleton" (Correct Grades, Scores, Ranks)
 *    - Match Legacy records by [Grade, Semester, Subject]
 *    - Inject 'remarks' ( 세부능력 및 특기사항) from Legacy into Upstage records
 */
export function mergeStudentData(legacy: Student, upstage: Student): Student {

    // 1. Prepare Merged Section 6
    const mergedSection6 = upstage.section6_academic_development?.map(uRecord => {
        // Find matching legacy record
        // Matching Key: Grade + Semester + Subject
        // Note: Semester format might need normalization if different (e.g., '1-1' vs numeric)
        // In Student type, semester is '1-1' | '1-2' etc. assuming both follow this.

        const legacyMatch = legacy.section6_academic_development?.find(lRecord => {
            const lGrade = String(lRecord.grade);
            const uGrade = String(uRecord.grade);
            const lSem = String(lRecord.semester);
            const uSem = String(uRecord.semester);

            return (
                lGrade === uGrade &&
                lSem === uSem &&
                normalizeSubjectName(lRecord.subject) === normalizeSubjectName(uRecord.subject)
            );
        });

        if (legacyMatch) {
            const legacyText = legacyMatch.remarks || legacyMatch.content;
            return {
                ...uRecord,
                // remarks: legacyText || uRecord.remarks, // User requested to only keep one active field
                content: legacyText || uRecord.content
            };
        }

        return uRecord;
    }) || [];

    // 2. Construct Final Student Object
    const mergedStudent: Student = {
        ...upstage, // Start with Upstage ID, metadata, etc.

        // --- Overrides ---
        // Basic Info
        id: legacy.id || upstage.id,
        studentId: legacy.studentId || upstage.studentId,
        studentNo: legacy.studentNo,
        name: legacy.name,

        // Header (School Info, etc)
        header: legacy.header,

        // Section 1: Personal Info
        section1_personal_info: legacy.section1_personal_info,

        // Section 2: Attendance
        section2_attendance: legacy.section2_attendance,

        // Section 5: Creative Activities 
        // Legacy parser captures content/hours reliably
        section5_creative_activities: legacy.section5_creative_activities,

        // Volunteer Activities
        volunteer_activities: legacy.volunteer_activities,

        // Section 6: Academic Development (Merged)
        section6_academic_development: mergedSection6,

        // Section 8: Behavior
        // If Legacy has better text extraction, we might want to use it?
        // Upstage might have better structure? 
        // For now, let's stick to Upstage or Legacy?
        // User request didn't explicitly mention Section 8, but "section6.content" was mentioned.
        // Let's keep Upstage for Section 8 unless specified, as it's structure-heavy?
        // Actually, Section 8 is mostly text blocks. Legacy might be better for long text.
        // Let's use Legacy for Section 8 if available, to be safe on text.
        section8_behavior_characteristics: legacy.section8_behavior_characteristics || upstage.section8_behavior_characteristics
    };

    return mergedStudent;
}

/**
 * Normalizes subject names for matching.
 * Removes whitespace and case.
 */
function normalizeSubjectName(name: string): string {
    return name.replace(/\s+/g, '').replace(/\(.*\)/, '').replace(/[·.]/g, '').trim();
    // Basic normalization: remove spaces, remove parenthesized text (e.g. "Math(1)"), remove dots
}
