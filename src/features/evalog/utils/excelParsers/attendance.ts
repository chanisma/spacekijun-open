import { norm, constructStudentId } from './utils';

export const parseAttendanceSheet = (data: any[], fileName: string): any[] => {
    let result: any[] = [];
    let nameIdx = -1;
    let numIdx = -1;
    let currentName = '';
    let currentNo = '';

    // 1. Find Header Row (Name/No)
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(20, data.length); i++) {
        const row = data[i] as any[];
        if (!row || !Array.isArray(row)) continue;
        const rowStr = row.map(norm);
        if (rowStr.some(s => s.includes('성명')) && rowStr.some(s => s.includes('번호'))) {
            headerRowIndex = i;
            // Refined Header Detection
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

    // 2. Positional Grade Detection
    const schoolDaysIndices: number[] = [];
    // Map column index to Grade if explicitly found
    const colToGrade: Record<number, number> = {};

    for (let r = 0; r <= headerRowIndex + 2; r++) {
        if (!data[r] || !Array.isArray(data[r])) continue;
        const row = data[r] as any[];
        for (let c = 0; c < row.length; c++) {
            const val = norm(row[c]);
            if (val.includes('수업일수')) {
                if (!schoolDaysIndices.includes(c)) {
                    schoolDaysIndices.push(c);

                    // Look for Grade indicators in the same column or nearby (above)
                    // Check rows r-1, r-2 for "1학년", "2학년", "3학년" in this column or adjacent
                    for (let prevR = r; prevR >= Math.max(0, r - 3); prevR--) {
                        const prevRow = data[prevR] as any[];
                        if (!prevRow) continue;
                        // Check current column and wide range around it (since Grade header is often merged)
                        // Merged cells usually have value in top-left.
                        // But simple string check in the vicinity might work.
                        // Actually, strict column check is safer if unmerged, but for merged headers:
                        // "1학년" might be at col C, spanning C,D,E. "수업일수" at C.
                        // So checking matching column in previous rows is good.
                        const checkVal = norm(prevRow[c]);
                        if (checkVal.includes('1학년')) colToGrade[c] = 1;
                        else if (checkVal.includes('2학년')) colToGrade[c] = 2;
                        else if (checkVal.includes('3학년')) colToGrade[c] = 3;

                        if (colToGrade[c]) break;
                    }
                }
            }
        }
    }
    schoolDaysIndices.sort((a, b) => a - b);

    const gradeStartIndices: Record<number, number> = {};

    // Assign based on explicit detection if available
    schoolDaysIndices.forEach(idx => {
        if (colToGrade[idx]) {
            gradeStartIndices[colToGrade[idx]] = idx;
        }
    });

    // Fallback/Fill gaps: If 1,2,3 not strictly found, assign positional?
    // Only if explicit detection failed for some.
    const usedGrades = Object.keys(gradeStartIndices).map(Number);
    const unusedIndices = schoolDaysIndices.filter(idx => !Object.values(gradeStartIndices).includes(idx));

    // Simple positional fallback for remaining indices
    // If we found NO grades explicitly, assume Left=1, Mid=2, Right=3
    if (usedGrades.length === 0) {
        if (unusedIndices.length > 0) gradeStartIndices[1] = unusedIndices[0];
        if (unusedIndices.length > 1) gradeStartIndices[2] = unusedIndices[1];
        if (unusedIndices.length > 2) gradeStartIndices[3] = unusedIndices[2];
    } else {
        // Mixed case? e.g. found Grade 1, but others unknown. Assign remaining to 2, 3 in order?
        // This is complex. Let's just stick to "If explicit failed, try reasonable default".
        let nextGrade = 1;
        unusedIndices.forEach(idx => {
            while (gradeStartIndices[nextGrade]) nextGrade++;
            if (nextGrade <= 3) {
                gradeStartIndices[nextGrade] = idx;
                nextGrade++;
            }
        });
    }

    let fileGrade = '3';
    let fileClass = '5';
    const filenameMatch = fileName.match(/Grade(\d+)_Class(\d+)/);
    if (filenameMatch) {
        fileGrade = filenameMatch[1];
        fileClass = filenameMatch[2];
    }

    for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i] as any[];
        if (!row || row.length === 0) continue;

        const rowNorm = row.map(norm);
        if (rowNorm.some(s => s.includes('성명')) && rowNorm.some(s => s.includes('번호'))) continue;
        if (rowNorm.some(s => s.includes('출결상황'))) continue;
        if (row.some(c => String(c).includes("샘플고등학교"))) continue;

        let rowName = row[nameIdx] ? String(row[nameIdx]).trim() : '';
        let rowNo = row[numIdx] ? String(row[numIdx]).trim() : '';

        if (rowName) currentName = rowName;
        if (rowNo) currentNo = rowNo;

        if (!currentNo) continue;

        const num = parseInt(currentNo.replace(/[^0-9]/g, ''));
        if (isNaN(num) || num === 0) continue;

        const id = constructStudentId(fileGrade, fileClass, currentNo);

        const extractDetails = (gradeNum: number, startIdx: number) => {
            const val = (idx: number) => {
                const v = row[startIdx + idx];
                return v === undefined || v === null || v === '' ? 0 : parseInt(v);
            };
            const str = (idx: number) => {
                return row[startIdx + idx] || '';
            }

            const schoolDays = val(0);
            const absSum = val(1) + val(2) + val(3);
            const lateSum = val(4) + val(5) + val(6);
            const earlySum = val(7) + val(8) + val(9);
            const skipSum = val(10) + val(11) + val(12);

            if (schoolDays === 0 && absSum === 0 && lateSum === 0 && earlySum === 0 && skipSum === 0 && str(13) === '') return null;

            return {
                grade: gradeNum,
                schoolDays: schoolDays,
                absence: { disease: val(1), unapproved: val(2), other: val(3) },
                tardiness: { disease: val(4), unapproved: val(5), other: val(6) },
                earlyLeave: { disease: val(7), unapproved: val(8), other: val(9) },
                classSkip: { disease: val(10), unapproved: val(11), other: val(12) },
                notes: str(13)
            };
        };

        const attendanceRecords = [];

        // Check for Vertical Layout first: Is there a Grade column ("학 년")?
        const gradeColIdx = nameIdx + 1; // Usually next to Name (Name is col 1, Grade is col 2?)
        // Better: look for "학 년" header we identified or just scanning headers again?
        // Let's use nameIdx/numIdx logic to finding headers.
        // We need to implement finding 'gradeIdx' properly in step 1 detection if we want to rely on it.
        // But for now, let's assume if we see a column with 1, 2, 3 values, it's a Grade column.
        // Or check header row for "학 년".
        // Let's rely on detecting "학 년" in the header row.

        let rowGrade = 0;
        let gradeIdx = -1;
        // Search header row again or cache it? 
        // We have headerRowIndex.
        const headerRow = data[headerRowIndex] as any[];
        if (headerRow) {
            gradeIdx = headerRow.findIndex((c: any) => norm(c).includes('학년'));
        }

        if (gradeIdx !== -1) {
            const val = row[gradeIdx];
            if (val) {
                const parsed = parseInt(String(val).replace(/[^0-9]/g, ''));
                if (!isNaN(parsed) && parsed >= 1 && parsed <= 3) {
                    rowGrade = parsed;
                }
            }
        }

        if (rowGrade > 0 && schoolDaysIndices.length > 0) {
            // VERTICAL MODE: We found a specific grade for this row, and we have a SchoolDays column.
            // Use the first SchoolDays column as the start for this row's data.
            const rec = extractDetails(rowGrade, schoolDaysIndices[0]);
            if (rec) attendanceRecords.push(rec);
        } else {
            // HORIZONTAL MODE (Fallback): Checks for Grade 1, 2, 3 columns side-by-side
            if (gradeStartIndices[1] !== undefined) {
                const rec = extractDetails(1, gradeStartIndices[1]);
                if (rec) attendanceRecords.push(rec);
            }
            if (gradeStartIndices[2] !== undefined) {
                const rec = extractDetails(2, gradeStartIndices[2]);
                if (rec) attendanceRecords.push(rec);
            }
            if (gradeStartIndices[3] !== undefined) {
                const rec = extractDetails(3, gradeStartIndices[3]);
                if (rec) attendanceRecords.push(rec);
            }
        }

        if (attendanceRecords.length > 0) {
            result.push({
                id,
                name: currentName,
                grade: parseInt(fileGrade),
                classNum: parseInt(fileClass),
                studentNo: currentNo,
                source: fileName,
                data: attendanceRecords
            });
        }
    }
    return result;
}
