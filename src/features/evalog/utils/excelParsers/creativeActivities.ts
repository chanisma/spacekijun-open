import { norm, constructStudentId } from './utils';
import { StudentActivity } from '../../types/excelTypes';

export const parseCreativeActivitiesSheet = (data: any[], fileName: string): any[] => {
    // Helper to find header row index
    const findHeader = (startRow: number) => {
        for (let i = startRow; i < Math.min(startRow + 20, data.length); i++) {
            const row = data[i] as any[];
            if (!row || !Array.isArray(row)) continue;
            const rowNorm = row.map(norm);
            // Check for Row 2 keywords as they are more specific to data columns
            if (rowNorm.some(s => s.includes('영역')) && rowNorm.some(s => s.includes('시간')) && rowNorm.some(s => s.includes('특기사항'))) {
                return i;
            }
        }
        return -1;
    };

    let headerRowIndex = findHeader(0);
    if (headerRowIndex === -1) return [];

    // Detect Columns based on the found header row (Row 2 of the header block)
    let nameIdx = -1;
    let numIdx = -1;
    let gradeIdx = -1;
    let areaIdx = -1;
    let timeIdx = -1;
    let contentIdx = -1;

    const setCols = (headerRow: any[], prevRow: any[]) => {
        const find = (r: any[], keywords: string[]) => {
            let idx = r.findIndex(c => keywords.includes(norm(c)));
            if (idx !== -1) return idx;
            return r.findIndex(c => keywords.some(k => norm(c).includes(k)));
        };

        areaIdx = find(headerRow, ["영역"]);
        timeIdx = find(headerRow, ["시간"]);
        contentIdx = find(headerRow, ["특기사항"]);

        // Name/No/Grade usually in prevRow
        if (prevRow) {
            nameIdx = find(prevRow, ["성명", "이름"]);
            numIdx = find(prevRow, ["번호"]);
            gradeIdx = find(prevRow, ["학년"]);
        }

        // Fallback: sometimes they might be on the same row if not merged properly in parser view?
        if (nameIdx === -1) nameIdx = find(headerRow, ["성명", "이름"]);
        if (numIdx === -1) numIdx = find(headerRow, ["번호"]);
        if (gradeIdx === -1) gradeIdx = find(headerRow, ["학년"]);
    };

    setCols(data[headerRowIndex] as any[], data[headerRowIndex - 1] as any[]);

    let fileGrade = '3';
    let fileClass = '5';
    const filenameMatch = fileName.match(/Grade(\d+)_Class(\d+)/);
    if (filenameMatch) {
        fileGrade = filenameMatch[1];
        fileClass = filenameMatch[2];
    }

    let currentName = '';
    let currentNo = '';
    let currentGrade = parseInt(fileGrade);

    // Map: Key = `${id}_${grade}_${area}` -> { info, content, time }
    const studentActivities = new Map<string, { info: any, content: string, time: number, grade: number, area: string }>();

    // Track last area for current student to handle merged cells
    let lastAreaForStudent: { [studentId: string]: string } = {};

    for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i] as any[];
        if (!row || row.length === 0) continue;

        const rowNorm = row.map(norm);

        // Dynamic Header Detection (Page Breaks)
        if (rowNorm.some(s => s.includes('영역')) && rowNorm.some(s => s.includes('시간')) && rowNorm.some(s => s.includes('특기사항'))) {
            setCols(row, data[i - 1] as any[]);
            continue;
        }
        // Skip Row 1 of header if we encounter it (Name/No/Grade/CreativeActivity)
        if (rowNorm.some(s => s.includes('창의적체험활동')) && rowNorm.some(s => s.includes('학년'))) continue;
        if (rowNorm.some(s => s.includes('샘플고등학교'))) continue;

        // Identity
        let rowName = '';
        let rowNo = '';
        if (nameIdx !== -1 && row[nameIdx]) rowName = String(row[nameIdx]).trim();
        if (numIdx !== -1 && row[numIdx]) rowNo = String(row[numIdx]).trim();
        if (gradeIdx !== -1 && row[gradeIdx]) {
            const g = parseInt(String(row[gradeIdx]).replace(/[^0-9]/g, ''));
            if (!isNaN(g) && g > 0) currentGrade = g;
        }

        if (rowName) currentName = rowName;
        if (rowNo) currentNo = rowNo;

        if (!currentNo) continue;
        const num = parseInt(currentNo.replace(/[^0-9]/g, ''));
        if (isNaN(num) || num === 0) continue;

        const id = constructStudentId(fileGrade, fileClass, currentNo);

        const val = (idx: number) => (idx !== -1 && row[idx] !== undefined && row[idx] !== null) ? row[idx] : null;

        let area = val(areaIdx) ? String(val(areaIdx)).trim() : '';
        // Normalize area names (e.g., '자율·자치활동' → '자율활동')
        if (area.includes('자율') && area.includes('자치')) area = '자율활동';
        const timeVal = val(timeIdx);
        const time = timeVal ? parseInt(String(timeVal)) : 0;
        let content = val(contentIdx) ? String(val(contentIdx)).trim() : '';

        // User Request: Do not include "희망분야" in the content text
        if (content.includes('희망분야')) {
            content = content.replace(/희망분야/g, '').trim();
        }

        // Handle merged cells for 'area'
        if (!area && lastAreaForStudent[id]) {
            area = lastAreaForStudent[id];
        } else if (area) {
            lastAreaForStudent[id] = area; // Update last area for this student
        }

        if (!area && !content) continue; // If both are empty, skip

        const key = `${id}_${currentGrade}_${area}`;

        if (!studentActivities.has(key)) {
            studentActivities.set(key, {
                info: {
                    id,
                    name: currentName,
                    grade: currentGrade,
                    classNum: parseInt(fileClass),
                    studentNo: currentNo,
                    source: fileName
                },
                content: '',
                time: 0,
                grade: currentGrade,
                area: area
            });
        }

        const entry = studentActivities.get(key)!;

        if (content) {
            if (entry.content) {
                // Just merge with newline
                entry.content += '\n' + content;
            } else {
                entry.content = content;
            }
        }
        entry.time += time;
    }

    const results: any[] = [];
    studentActivities.forEach((data) => {
        results.push({
            ...data.info,
            category: data.area || '창의적체험활동',
            subject_name: data.area,
            content: data.content,
            grade: data.grade,
            data: { '영역': data.area, '시간': data.time }
        });
    });

    return results;
};
