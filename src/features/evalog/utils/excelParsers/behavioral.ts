import { norm, findHeaderRow, constructStudentId } from './utils';
import { StudentActivity } from '../../types/excelTypes';

export const parseBehavioralSheet = (data: any[], fileName: string): StudentActivity[] => {
    const result: StudentActivity[] = [];
    let mainHeaderIndex = findHeaderRow(data, ["성명", "번호"]);
    if (mainHeaderIndex === -1) return [];

    const mainHeader = data[mainHeaderIndex] as string[];
    const nameIdx = mainHeader.findIndex(c => norm(c).includes("성명"));
    const numIdx = mainHeader.findIndex(c => norm(c).includes("번호"));

    let subHeaderIndex = -1;
    let subHeader: string[] = [];

    // Strict header check for Behavioral Characteristics
    // Must have Name, Number, Grade, and Content
    for (let i = mainHeaderIndex; i < Math.min(mainHeaderIndex + 5, data.length); i++) {
        const row = data[i] as string[];
        if (!row) continue;

        if (row.some(c => norm(c).includes("성명")) &&
            row.some(c => norm(c).includes("번호")) &&
            row.some(c => norm(c).includes("학년")) &&
            row.some(c => norm(c).includes("행동특성"))) {
            subHeaderIndex = i;
            subHeader = row;
            break;
        }
    }

    if (subHeaderIndex === -1) {
        console.warn(`Sub-header not found in ${fileName}`);
        return [];
    }

    const contentIdx = subHeader.findIndex(c => norm(c).includes("행동특성") || norm(c).includes("종합의견"));
    const gradeIdx = subHeader.findIndex(c => norm(c).includes("학년"));

    let fileGrade = '3';
    let fileClass = '5';
    const filenameMatch = fileName.match(/Grade(\d+)_Class(\d+)/);
    if (filenameMatch) {
        fileGrade = filenameMatch[1];
        fileClass = filenameMatch[2];
    }

    let currentName = '';
    let currentNo = '';
    let lastRecord: any = null;

    for (let i = subHeaderIndex + 1; i < data.length; i++) {
        const row = data[i] as any[];
        if (!row || row.length === 0) continue;

        // Skip repeated headers
        if (row.some(c => norm(c) === "성명") &&
            row.some(c => norm(c) === "번호") &&
            row.some(c => norm(c) === "학년")) continue;

        if (norm(row[nameIdx]) === "성명") continue;
        if (row.some(c => String(c).includes("샘플고등학교"))) continue;

        if (row[nameIdx]) currentName = String(row[nameIdx]).trim();
        if (row[numIdx]) currentNo = String(row[numIdx]).trim();

        if (!currentName) continue;

        // Validate student number (must be > 0 and numeric)
        const num = parseInt(currentNo.replace(/[^0-9]/g, ''));
        if (isNaN(num) || num === 0) continue;

        const id = constructStudentId(fileGrade, fileClass, currentNo);

        const content = contentIdx !== -1 ? row[contentIdx] : null;
        const gradeVal = gradeIdx !== -1 ? row[gradeIdx] : null;

        if (!content && !gradeVal) continue;

        // Parse grade from row if available, otherwise use file grade
        // If grade is missing but ID is same as last record, inherit grade (handle split pages)
        const isSameStudentId = lastRecord && lastRecord.id === id;

        let rowGrade: number;
        if (gradeVal) {
            rowGrade = parseInt(String(gradeVal).replace(/[^0-9]/g, ''));
        } else if (isSameStudentId) {
            rowGrade = lastRecord.grade;
        } else {
            rowGrade = parseInt(fileGrade);
        }

        const isSameStudent = isSameStudentId && lastRecord.grade === rowGrade;

        // For Behavioral, we just merge content if it's the same student AND same grade
        if (isSameStudent) {
            if (content) {
                lastRecord.content += content;
            }
        } else {
            const category = '행동특성및종합의견';

            lastRecord = {
                id,
                name: currentName,
                category,
                subject_name: null,
                content: content || '',
                grade: rowGrade,
                source: fileName,
            };
            result.push(lastRecord);
        }
    }
    return result;
};
