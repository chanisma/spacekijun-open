import { norm, constructStudentId } from './utils';

export const parseVolunteerSheet = (data: any[], fileName: string): any[] => {
    let nameIdx = -1;
    let numIdx = -1;
    let currentName = '';
    let currentNo = '';

    // 1. Find Header Row
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(20, data.length); i++) {
        const row = data[i] as any[];
        if (!row || !Array.isArray(row)) continue;
        const rowStr = row.map(norm);
        if (rowStr.some(s => s.includes('성명')) && rowStr.some(s => s.includes('번호'))) {
            headerRowIndex = i;
            const findCol = (r: string[], keywords: string[]) => {
                let idx = r.findIndex(c => keywords.includes(norm(c)));
                if (idx !== -1) return idx;
                return r.findIndex(c => keywords.some(k => norm(c).includes(k)));
            };
            const headerRow = data[i] as string[];
            nameIdx = findCol(headerRow, ["성명", "이름"]);
            numIdx = findCol(headerRow, ["번호"]);
            break;
        }
    }

    if (headerRowIndex === -1) return [];

    // 2. Detect Columns
    let cols = {
        grade: -1,
        date: -1,
        place: -1,
        content: -1,
        time: -1,
        accum: -1
    };

    const headerRow = data[headerRowIndex] as any[];

    // Helper to find col index in a row
    const findInRow = (row: any[]) => {
        for (let c = 0; c < row.length; c++) {
            const cell = norm(row[c]);
            if (!cell) continue;
            // Relaxed keyword matching for robustness
            if (cols.grade === -1 && cell.includes('학년')) cols.grade = c;
            if (cols.date === -1 && (cell.includes('일자') || cell.includes('기간'))) cols.date = c;
            if (cols.place === -1 && (cell.includes('장소') || cell.includes('주관') || cell.includes('기관'))) cols.place = c;
            if (cols.content === -1 && (cell.includes('내용') || cell.includes('봉사활동'))) cols.content = c;
            // "Time" check: includes '시간' but not '누계' (to avoid '누계시간')
            if (cols.time === -1 && cell.includes('시간') && !cell.includes('누계')) cols.time = c;
            if (cell.includes('누계')) {
                if (cols.accum === -1) cols.accum = c;
                // Prefer "전체" if found later or now
                if (cell.includes('전체')) cols.accum = c;
            }
        }
    };

    findInRow(headerRow);
    if (data[headerRowIndex + 1]) findInRow(data[headerRowIndex + 1] as any[]);

    let fileGrade = '3';
    let fileClass = '5';
    const filenameMatch = fileName.match(/Grade(\d+)_Class(\d+)/);
    if (filenameMatch) {
        fileGrade = filenameMatch[1];
        fileClass = filenameMatch[2];
    }

    let currentGrade = 0; // Track grade across rows for the same student

    // Map to group records by student ID
    const studentRecords = new Map<string, { info: any, records: any[] }>();

    for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i] as any[];
        if (!row || row.length === 0) continue;

        const rowNorm = row.map(norm);
        if (rowNorm.some(s => s.includes('성명')) && rowNorm.some(s => s.includes('번호'))) continue;
        if (rowNorm.some(s => s.includes('봉사활동상황'))) continue;


        let rowName = row[nameIdx] ? String(row[nameIdx]).trim() : '';
        let rowNo = row[numIdx] ? String(row[numIdx]).trim() : '';

        if (rowName) currentName = rowName;
        // If rowNo is present, it's potentially a new student block, reset currentGrade?
        if (rowNo) {
            currentNo = rowNo;
            currentGrade = 0; // Reset grade for new student block start
        }

        if (!currentNo) continue;

        const num = parseInt(currentNo.replace(/[^0-9]/g, ''));
        if (isNaN(num) || num === 0) continue;

        const id = constructStudentId(fileGrade, fileClass, currentNo);

        const val = (idx: number) => {
            if (idx === -1) return null;
            const v = row[idx];
            if (v === undefined || v === null || v === '') return null;
            return v;
        };

        let gradeVal = cols.grade !== -1 ? parseInt(String(val(cols.grade) || '0').replace(/[^0-9]/g, '')) : 0;

        // Update currentGrade if found
        if (gradeVal > 0) currentGrade = gradeVal;

        // Use currentGrade if valid, otherwise fallback to fileGrade
        const finalGrade = currentGrade > 0 ? currentGrade : parseInt(fileGrade);

        const dateVal = val(cols.date);
        const placeVal = val(cols.place);
        const contentVal = val(cols.content);
        const timeVal = val(cols.time);
        const accumVal = val(cols.accum);

        if (!contentVal && !dateVal) continue;

        const record = {
            grade: finalGrade,
            dateOrPeriod: dateVal ? String(dateVal) : '',
            institution: placeVal ? String(placeVal) : '',
            activity: contentVal ? String(contentVal) : '',
            hours: timeVal ? parseInt(String(timeVal)) : null,
            cumulativeHours: accumVal ? parseInt(String(accumVal)) : null
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
