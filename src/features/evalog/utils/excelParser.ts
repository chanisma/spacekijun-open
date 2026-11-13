
import * as XLSX from 'xlsx';
import { ParsedData, StudentBasicInfo, StudentActivity, ParserMeta } from '../types/excelTypes';
import { readFile } from './excelParsers/utils';
import { mergeToStudents } from './excelParsers/merger';
import { parseBasicInfoSheet } from './excelParsers/basicInfo';
import { parseClassHistorySheet } from './excelParsers/classHistory';
import { parseAttendanceSheet } from './excelParsers/attendance';
import { parseVolunteerSheet } from './excelParsers/volunteer';
import { parseReadingSheet } from './excelParsers/reading';
import { parseAcademicSheet } from './excelParsers/academic';
import { parseCreativeActivitiesSheet } from './excelParsers/creativeActivities';
import { parseSeTeukSheet } from './excelParsers/seTeuk';
import { parseBehavioralSheet } from './excelParsers/behavioral';
import { parseDetailedActivitiesSheet } from './excelParsers/detailedActivities';
import { parsePreprocessedDetailedActivities, isPreprocessedFile } from './excelParsers/preprocessedDetailedActivities';

/**
 * 파일명에 "모의고사"가 포함되어 있으면 모의고사 파일로 판별
 * 모의고사 파일은 parseStudentExcel에서 처리하지 않고 MockExamImportTab에서 별도 처리
 */
export const isMockExamFile = (fileName: string): boolean => {
    return fileName.replace(/\s+/g, '').includes('모의고사');
};

export const parseStudentExcel = async (files: File[]): Promise<ParsedData> => {
    const studentsMap = new Map<string, StudentBasicInfo>();
    const activities: StudentActivity[] = [];
    const studentSubjects = new Map<string, Map<string, { grade: number, category: string }>>(); // ID -> Subject Name -> { grade, category }
    const parserMeta: ParserMeta[] = [];

    // Sort files:
    // 1. Grade Descending (to capture latest student info for BasicInfo)
    // 2. Academic Development first (within same grade, or generally) to extract subjects
    const sortedFiles = [...files].sort((a, b) => {
        // Extract Grade
        const getGrade = (name: string) => {
            const match = name.match(/Grade(\d+)/);
            return match ? parseInt(match[1]) : 0;
        };
        const gradeA = getGrade(a.name);
        const gradeB = getGrade(b.name);

        if (gradeA !== gradeB) {
            return gradeB - gradeA; // Descending
        }

        const isAcademicA = a.name.replace(/\s+/g, '').includes('교과학습발달상황');
        const isAcademicB = b.name.replace(/\s+/g, '').includes('교과학습발달상황');
        if (isAcademicA && !isAcademicB) return -1;
        if (!isAcademicA && isAcademicB) return 1;
        return 0;
    });

    for (const file of sortedFiles) {
        const data = await readFile(file);
        if (!data) continue;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const json = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' }) as any[];

        const fileName = file.name;
        // Normalize filename for checking
        const cleanName = fileName.replace(/\s+/g, '');

        if (fileName.includes('학적사항')) {
            const parsed = parseBasicInfoSheet(json, fileName);
            mergeToStudents(studentsMap, parsed, 'section1_personal_info');
            parserMeta.push({ fileName, parserType: 'basicInfo', recordCount: parsed.length, studentCount: new Set(parsed.map(p => p.id)).size });
            const history = parseClassHistorySheet(json, fileName);
            if (history.length > 0) {
                mergeToStudents(studentsMap, history, 'gradeInfo');
                parserMeta.push({ fileName, parserType: 'classHistory', recordCount: history.length, studentCount: new Set(history.map(h => h.id)).size });
            }
        } else if (fileName.includes('학년반이력')) {
            const parsed = parseClassHistorySheet(json, fileName);
            mergeToStudents(studentsMap, parsed, 'gradeInfo');
            parserMeta.push({ fileName, parserType: 'classHistory', recordCount: parsed.length, studentCount: new Set(parsed.map(p => p.id)).size });
        } else if (fileName.includes('출결상황')) {
            const parsed = parseAttendanceSheet(json, fileName);
            mergeToStudents(studentsMap, parsed, 'attendance');
            parserMeta.push({ fileName, parserType: 'attendance', recordCount: parsed.length, studentCount: new Set(parsed.map(p => p.id)).size });
        } else if (fileName.includes('봉사활동상황')) {
            const parsed = parseVolunteerSheet(json, fileName);
            mergeToStudents(studentsMap, parsed, 'volunteer');
            parserMeta.push({ fileName, parserType: 'volunteer', recordCount: parsed.length, studentCount: new Set(parsed.map(p => p.id)).size });
        } else if (cleanName.includes('독서활동상황')) {
            const parsed = parseReadingSheet(json, fileName);
            mergeToStudents(studentsMap, parsed, 'reading');
            parserMeta.push({ fileName, parserType: 'reading', recordCount: parsed.length, studentCount: new Set(parsed.map(p => p.id)).size });
        } else if (cleanName.includes('교과학습발달상황')) {
            const parsed = parseAcademicSheet(json, fileName);
            mergeToStudents(studentsMap, parsed, 'academic_development');
            parserMeta.push({ fileName, parserType: 'academic', recordCount: parsed.length, studentCount: new Set(parsed.map(p => p.id)).size });

            // Extract subjects for SeTeuk delimiters and grade info
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            parsed.forEach((item: any) => {
                if (!studentSubjects.has(item.id)) studentSubjects.set(item.id, new Map());
                const subjMap = studentSubjects.get(item.id)!;
                if (item.data && Array.isArray(item.data)) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    item.data.forEach((rec: any) => {
                        if (rec.subject) {
                            // Store subject -> { grade, category } mapping
                            // rec.grade is number, rec.category is string ('regular', 'career', etc.)
                            subjMap.set(rec.subject, {
                                grade: rec.grade,
                                category: rec.category
                            });
                        }
                    });
                }
            });
        } else if (cleanName.includes('창의적체험활동')) {
            const parsed = parseCreativeActivitiesSheet(json, fileName);
            activities.push(...parsed);
            parserMeta.push({ fileName, parserType: 'creativeActivities', recordCount: parsed.length, studentCount: new Set(parsed.map(p => p.id)).size });
        } else if (cleanName.includes('세부능력및특기사항')) {
            // 전처리된 파일인지 확인 (_preprocessed 포함 여부)
            if (isPreprocessedFile(fileName)) {
                // 전처리된 파일: 간단한 형식 (반, 학년, 학기, 번호, 성명, 과목, 내용)
                const parsed = parsePreprocessedDetailedActivities(json, fileName);
                activities.push(...parsed);
                parserMeta.push({ fileName, parserType: 'preprocessedSeTeuk', recordCount: parsed.length, studentCount: new Set(parsed.map(p => p.id)).size });
                console.log(`[ExcelParser] Used preprocessed parser for ${fileName}: ${parsed.length} activities`);
            } else {
                // 기존 SeTeuk parser: updates studentsMap directly AND returns activities
                const parsed = parseSeTeukSheet(json, fileName, studentsMap, studentSubjects);
                activities.push(...parsed);
                parserMeta.push({ fileName, parserType: 'seTeuk', recordCount: parsed.length, studentCount: new Set(parsed.map(p => p.id)).size });
            }

            // No need to call mergeToStudents for SeTeuk anymore
            // as it modifies the academic_development records in-place.

        } else if (cleanName.includes('행동특성및종합의견')) {
            const parsed = parseBehavioralSheet(json, fileName);
            activities.push(...parsed);
            parserMeta.push({ fileName, parserType: 'behavioral', recordCount: parsed.length, studentCount: new Set(parsed.map(p => p.id)).size });
        } else {
            const parsed = parseDetailedActivitiesSheet(json, fileName);
            activities.push(...parsed);
            parserMeta.push({ fileName, parserType: 'detailedActivities', recordCount: parsed.length, studentCount: new Set(parsed.map(p => p.id)).size });
        }
    }

    // Debug: Log detected subjects per student
    if (studentSubjects.size > 0) {
        const allSubjects = new Set<string>();
        studentSubjects.forEach(subjMap => {
            subjMap.forEach((info, subject) => allSubjects.add(`${subject} (${info.category}, ${info.grade}학년)`));
        });
        console.log(`[ExcelParser] 학생 수: ${studentSubjects.size}명`);
        console.log(`[ExcelParser] 과목 목록 (${allSubjects.size}개):`, [...allSubjects].sort().join(', '));
    }

    // Calculate StudentID (EntryYear-ID)
    // 1. Determine base year (max year found or current year)
    const currentYear = new Date().getFullYear();
    const maxYear = activities.reduce((max, item) => Math.max(max, item.year || 0), currentYear);

    // 2. Update Basic Info
    studentsMap.forEach((student, originalKey) => {
        // Entry Year: Try to get from Academic Record (section1_personal_info.admissionYear)
        // Fallback: (BaseYear - Grade + 1) % 100
        let entryYear = (maxYear - student.grade + 1) % 100;
        if (student.section1_personal_info && student.section1_personal_info.admissionYear) {
            entryYear = student.section1_personal_info.admissionYear % 100;
        }

        // Student ID Body: Try to get from Grade 1 History
        // Format: 1 + Class(2) + Number(2) -> 1CCNN
        // Fallback: Use current ID's Class/Number (assuming current grade structure matches, which might be wrong but is a fallback)
        let idBody = '';

        // Find Grade 1 info
        const grade1Info = student.gradeInfo?.find(g => String(g.grade) === '1');

        if (grade1Info) {
            const c = String(grade1Info.class).replace(/[^0-9]/g, '').padStart(2, '0');
            const n = String(grade1Info.number).replace(/[^0-9]/g, '').padStart(2, '0');
            idBody = `1${c}${n}`;
        } else {
            // Fallback: Use current info but we don't know if it was 1st grade. 
            // If current grade is 1, use it. If not, we might not have 1st grade info.
            // For now, if no Grade 1 info, we might fallback to current ID part but warn?
            // User requested "1st Grade Class, Number". If missing, maybe just use current ID part as before?
            // Let's stick to the previous fallback of using the raw ID part if Grade 1 info is missing, 
            // but maybe try to format it as 1CCNN if we can infer it? 
            // Actually, if we don't have Grade 1 info, we can't invent it. 
            // Let's use the raw ID part from the file (which is Grade-Class-Number usually)
            // But wait, the raw ID is `Grade-Class-Number`. 
            // If we want `YY-1CCNN`, we need to be sure.
            // Let's use the raw ID part if Grade 1 info is missing.
            const rawId = student.id.includes('-') ? student.id.split('-')[1] : student.id;
            idBody = rawId;
        }

        const correctId = `${entryYear}-${idBody}`;

        student.id = correctId;
        student.studentId = correctId;

        // 2025 Credit System Logic: Refine Categories based on Admission Year
        if (student.section1_personal_info && student.section1_personal_info.admissionYear) {
            const admYear = parseInt(String(student.section1_personal_info.admissionYear));
            if (!isNaN(admYear) && admYear >= 2025) {
                if (student.academic_development) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    student.academic_development = student.academic_development.map((rec: any) => {
                        const subjName = rec.subject || '';
                        const subjGroup = rec.subject_group || '';

                        let newCategory = rec.category;
                        if (subjGroup.includes('체육') || subjGroup.includes('예술') || subjName.includes('과학탐구실험')) {
                            newCategory = 'pe_arts_experiment';
                        } else if (subjGroup.includes('교양')) {
                            newCategory = 'general';
                        }

                        if (newCategory !== rec.category) {
                            // Sync studentSubjects category
                            const subjMap = studentSubjects.get(originalKey);
                            if (subjMap && subjMap.has(subjName)) {
                                const entry = subjMap.get(subjName)!;
                                subjMap.set(subjName, { ...entry, category: newCategory });
                            }
                            return { ...rec, category: newCategory };
                        }
                        return rec;
                    });
                }
            }
        }
    });

    // 3. Update Activities — match each activity to its correct student ID
    // Build comprehensive lookup maps for robust matching
    const rawIdToCorrectId = new Map<string, string>();
    const nameNumberToCorrectId = new Map<string, string>();

    studentsMap.forEach((student, originalKey) => {
        const correctedId = student.id;

        // Map original studentsMap key → corrected ID
        rawIdToCorrectId.set(originalKey, correctedId);

        // Map all grade history entries as possible raw IDs → corrected ID
        const prefix = new Date().getFullYear().toString().slice(2);
        if (student.gradeInfo) {
            for (const g of student.gradeInfo) {
                const gStr = String(g.grade).replace(/[^0-9]/g, '');
                const c = String(g.class).replace(/[^0-9]/g, '').padStart(2, '0');
                const n = String(g.number).replace(/[^0-9]/g, '').padStart(2, '0');
                rawIdToCorrectId.set(`${prefix}-${gStr}${c}${n}`, correctedId);
            }
        }

        // Map corrected ID itself (for preprocessed parser which computes its own entryYear format)
        rawIdToCorrectId.set(correctedId, correctedId);

        // Name + studentNo lookup (for fallback when IDs don't match)
        if (student.name) {
            // Use name alone (last resort, may collide with 동명이인)
            nameNumberToCorrectId.set(student.name, correctedId);
            // Use name + each grade's number for disambiguation
            if (student.gradeInfo) {
                for (const g of student.gradeInfo) {
                    const n = String(g.number).replace(/[^0-9]/g, '');
                    nameNumberToCorrectId.set(`${student.name}_${n}`, correctedId);
                }
            }
        }
    });

    activities.forEach(activity => {
        // Strategy 1: Direct match by original raw ID in studentsMap
        if (studentsMap.has(activity.id)) {
            const student = studentsMap.get(activity.id)!;
            activity.id = student.id;
            activity.studentId = student.studentId;
            return;
        }

        // Strategy 2: Match via comprehensive rawId lookup (handles grade history variants)
        const fromRawLookup = rawIdToCorrectId.get(activity.id);
        if (fromRawLookup) {
            activity.id = fromRawLookup;
            activity.studentId = fromRawLookup;
            return;
        }

        // Strategy 3: Match by name + studentNo
        if (activity.name && activity.studentNo) {
            const num = String(activity.studentNo).replace(/[^0-9]/g, '');
            const byNameNum = nameNumberToCorrectId.get(`${activity.name}_${num}`);
            if (byNameNum) {
                activity.id = byNameNum;
                activity.studentId = byNameNum;
                return;
            }
        }

        // Strategy 4: Match by name alone (last resort)
        if (activity.name) {
            const byName = nameNumberToCorrectId.get(activity.name);
            if (byName) {
                activity.id = byName;
                activity.studentId = byName;
                return;
            }
        }

        // Strategy 5: Fallback calculation (no match found)
        const rawId = activity.id.includes('-') ? activity.id.split('-')[1] : activity.id;
        const activityGrade = parseInt(rawId.substring(0, 1));
        const year = activity.year || maxYear;
        const entryYear = (year - activityGrade + 1) % 100;
        const correctId = `${entryYear}-${rawId}`;

        activity.id = correctId;
        activity.studentId = correctId;
    });

    return {
        basicInfo: Array.from(studentsMap.values()),
        detailedActivities: activities,
        parserMeta
    };
};
