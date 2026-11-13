import { norm, findHeaderRow, constructStudentId } from './utils';
import { ReadingRecord } from '../../types/pdfTypes';

export const parseReadingSheet = (data: any[], fileName: string): any[] => {
    let headerRowIndex = findHeaderRow(data, ["독서활동 상황", "과목 또는 영역"]);
    if (headerRowIndex === -1) {
        // Try alternate header if first fails
        headerRowIndex = findHeaderRow(data, ["독서활동상황"]);
    }
    if (headerRowIndex === -1) return [];

    const headerRow = data[headerRowIndex] as any[];

    // Identifiers Helper
    const getIdx = (row: any[]) => {
        const find = (keywords: string[]) => {
            let idx = row.findIndex((c: any) => keywords.includes(norm(c)));
            if (idx !== -1) return idx;
            return row.findIndex((c: any) => keywords.some(k => norm(c).includes(k)));
        };
        return {
            name: find(["성명", "이름"]),
            num: find(["번호"]),
            grade: find(["학년"]),
            semester: find(["학기"]),
            related: find(["과목", "영역", "과목 또는 영역"]),
            content: find(["독서활동", "내용", "독서활동 상황"])
        };
    };

    let idx = getIdx(headerRow);

    // Name/Num might be in prev row
    if (idx.name === -1 && headerRowIndex > 0) {
        const prev = data[headerRowIndex - 1] as any[];
        if (prev) {
            const n = prev.findIndex((c: any) => ["성명", "이름"].includes(norm(c)));
            const num = prev.findIndex((c: any) => ["번호"].includes(norm(c)));
            if (n !== -1) idx.name = n;
            if (num !== -1) idx.num = num;
        }
    }

    let fileGrade = '3';
    let fileClass = '5';
    const filenameMatch = fileName.match(/Grade(\d+)_Class(\d+)/);
    if (filenameMatch) {
        fileGrade = filenameMatch[1];
        fileClass = filenameMatch[2];
    }

    let currentName = '';
    let currentNo = '';
    let currentGrade = 1;
    let currentSemester = 1;

    const studentRecords = new Map<string, { info: any, records: ReadingRecord[] }>();

    for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i] as any[];
        if (!row || row.length === 0) continue;

        const rowNorm = row.map(norm);

        // Dynamic Header Detection: If row looks like a header, update mapping
        if (rowNorm.some(s => s.includes('독서활동') && s.includes('상황'))) {
            idx = getIdx(row);
            continue; // Skip the header row itself
        }

        if (rowNorm.some(s => s.includes('샘플고등학교'))) continue;

        // Identity
        let rowName = '';
        let rowNo = '';
        if (idx.name !== -1 && row[idx.name]) rowName = String(row[idx.name]).trim();
        if (idx.num !== -1 && row[idx.num]) rowNo = String(row[idx.num]).trim();

        if (rowName) currentName = rowName;
        if (rowNo) currentNo = rowNo;

        if (!currentNo) continue;
        const num = parseInt(currentNo.replace(/[^0-9]/g, ''));
        if (isNaN(num) || num === 0) continue;

        const id = constructStudentId(fileGrade, fileClass, currentNo);

        const val = (idx: number) => (idx !== -1 && row[idx] !== undefined && row[idx] !== null) ? row[idx] : null;

        // Grade/Semester
        const gVal = val(idx.grade);
        if (gVal) {
            const g = parseInt(String(gVal).replace(/[^0-9]/g, ''));
            if (!isNaN(g) && g > 0) currentGrade = g;
        }

        const sVal = val(idx.semester);
        if (sVal) {
            const s = parseInt(String(sVal).replace(/[^0-9]/g, ''));
            if (!isNaN(s) && s > 0) currentSemester = s;
        }

        const related = val(idx.related) ? String(val(idx.related)).trim() : '';
        const content = val(idx.content) ? String(val(idx.content)).trim() : '';

        if (!content) continue;

        if (content === '없음' || content === '-') continue;

        const record: ReadingRecord = {
            grade: currentGrade,
            semester: currentSemester,
            related: related,
            content: content
        };

        if (!studentRecords.has(id)) {
            studentRecords.set(id, {
                info: {
                    id,
                    name: currentName,
                    grade: parseInt(fileGrade),
                    classNum: parseInt(fileClass),
                    studentNo: currentNo,
                    source: fileName
                },
                records: []
            });
        }
        studentRecords.get(id)!.records.push(record);
    }

    return Array.from(studentRecords.values()).map(entry => ({
        ...entry.info,
        data: entry.records
    }));
};
