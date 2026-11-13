import { norm, constructStudentId } from './utils';

export const parseAcademicSheet = (data: any[], fileName: string): any[] => {
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
        // Updated detection: '학점' or '단위수' or '학점수'
        if (rowStr.some(s => s.includes('교과')) && rowStr.some(s => s.includes('과목')) &&
            (rowStr.some(s => s.includes('단위수') || s.includes('학점수') || s.includes('학점')))) {
            headerRowIndex = i;

            // Find Name/No in this row or prev row
            const findCol = (r: any[], keywords: string[]) => {
                let idx = r.findIndex(c => keywords.includes(norm(c)));
                if (idx !== -1) return idx;
                return r.findIndex(c => keywords.some(k => norm(c).includes(k)));
            };
            const headerRow = data[i] as any[];
            nameIdx = findCol(headerRow, ["성명", "이름"]);
            numIdx = findCol(headerRow, ["번호"]);

            if (nameIdx === -1 && i > 0) {
                const prev = data[i - 1] as any[];
                if (prev) {
                    nameIdx = findCol(prev, ["성명", "이름"]);
                    numIdx = findCol(prev, ["번호"]);
                }
            }
            break;
        }
    }

    if (headerRowIndex === -1) return [];

    const headerRow = data[headerRowIndex] as any[];

    let currentCategoryType: 'regular' | 'career' | 'pe_arts' = 'regular';

    const getCols = (row: any[]) => {
        const find = (keywords: string[]) => {
            let idx = row.findIndex(c => keywords.includes(norm(c)));
            if (idx !== -1) return idx;
            return row.findIndex(c => keywords.some(k => norm(c).includes(k)));
        };
        return {
            category: find(["교과"]),
            subject: find(["과목"]),
            units: find(["단위수", "학점수", "학점"]), // Added '학점'
            score: find(["원점수", "과목평균", "원점수/과목평균"]), // Added combined header
            achievement: find(["성취도", "수강자수"]),
            rank: find(["석차등급"]),
            distribution: find(["성취도별분포비율"]),
            semester: find(["학기"]),
            grade: find(["학년"])
        };
    };

    let cols = getCols(headerRow);

    // Initial Category Type Detection based on columns
    // Initial Category Type Detection based on columns
    // 2025 Format (Credit System) often has '학점' and '원점수/과목평균'
    const isCreditSystem = cols.units !== -1 && String(headerRow[cols.units]).includes('학점');

    let fileGrade = '3';
    let fileClass = '5';
    const filenameMatch = fileName.match(/Grade(\d+)_Class(\d+)/);
    if (filenameMatch) {
        fileGrade = filenameMatch[1];
        fileClass = filenameMatch[2];
    }

    // State tracking
    let currentGrade = parseInt(fileGrade); // Default to file grade if implicit
    let currentSemester = 1;

    const studentRecords = new Map<string, { info: any, records: any[] }>();

    for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i] as any[];
        if (!row || row.length === 0) continue;

        const rowNorm = row.map(norm);

        // 0. Dynamic Header Detection
        if (rowNorm.some(s => s.includes('교과')) && rowNorm.some(s => s.includes('과목'))) {
            // New header detected! Switch mode.
            cols = getCols(row);

            // Determine Category Type from headers
            if (rowNorm.some(s => s.includes('석차등급'))) {
                currentCategoryType = 'regular';
            } else if (rowNorm.some(s => s.includes('성취도별분포비율'))) {
                // Credit system might have distribution but still be 'regular' in nature?
                // But typically career electives use 'Three-level grading' w/ distribution
                currentCategoryType = 'career';
            } else if (rowNorm.some(s => s.includes('성취도'))) {
                currentCategoryType = 'pe_arts';
            }

            // Re-eval Credit System flag if header format changes
            // (e.g. mixed transcript)
            continue;
        }

        if (rowNorm.some(s => s.includes('샘플고등학교'))) continue;

        let rowName = '';
        let rowNo = '';
        if (nameIdx !== -1 && row[nameIdx]) rowName = String(row[nameIdx]).trim();
        if (numIdx !== -1 && row[numIdx]) rowNo = String(row[numIdx]).trim();

        if (rowName) currentName = rowName;
        if (rowNo) currentNo = rowNo;

        if (!currentNo) continue;
        const num = parseInt(currentNo.replace(/[^0-9]/g, ''));
        if (isNaN(num) || num === 0) continue;

        const id = constructStudentId(fileGrade, fileClass, currentNo);

        const val = (idx: number) => (idx !== -1 && row[idx] !== undefined && row[idx] !== null) ? row[idx] : null;

        // Grade/Semester Logic (Sticky)
        if (cols.grade !== -1) {
            const gVal = val(cols.grade);
            if (gVal) {
                const g = parseInt(String(gVal).replace(/[^0-9]/g, ''));
                if (!isNaN(g) && g > 0) currentGrade = g;
            }
        }
        if (cols.semester !== -1) {
            const sVal = val(cols.semester);
            if (sVal) {
                const s = parseInt(String(sVal).replace(/[^0-9]/g, ''));
                if (!isNaN(s) && s > 0) currentSemester = s;
            }
        }

        // Subject Info
        const subject = val(cols.subject);
        const category = val(cols.category); // Subject group

        const units = val(cols.units);
        if (!units && !subject) continue; // Skip empty rows

        let rawScore: number | null = null;
        let avgScore: number | null = null;
        let stdDev: number | null = null;
        let achievement = '';
        let totalStudents = 0;
        let rank: number | null = null;
        let distribution: any = null; // Unused in output but extracted?

        // Extraction Logic
        const extractScore = () => {
            // Supports "97/74.8" or "97/74.8(15.2)" or separate columns handling in future if needed
            // If cols.score points to combined column:
            const cellVal = String(val(cols.score) || '');
            if (cellVal.includes('/')) {
                const parts = cellVal.split('/');
                if (parts.length >= 2) {
                    rawScore = parseFloat(parts[0]);
                    // Check for (StdDev) in average part: "74.8(15.2)"
                    const avgPart = parts[1];
                    const stdMatch = avgPart.match(/([\d\.]+)\(([\d\.]+)\)/);
                    if (stdMatch) {
                        avgScore = parseFloat(stdMatch[1]);
                        stdDev = parseFloat(stdMatch[2]);
                    } else {
                        avgScore = parseFloat(avgPart);
                    }
                }
            } else {
                // Fallback Old Format separate cols or Regex
                const scoreMatch = cellVal.match(/([\d\.]+)\/([\d\.]+)\(([\d\.]+)\)/);
                if (scoreMatch) {
                    rawScore = parseFloat(scoreMatch[1]);
                    avgScore = parseFloat(scoreMatch[2]);
                    stdDev = parseFloat(scoreMatch[3]);
                } else if (!isNaN(parseFloat(cellVal))) {
                    rawScore = parseFloat(cellVal);
                }
            }
        };

        const extractAchievement = () => {
            const cellVal = String(val(cols.achievement) || '');
            // "A(231)" or just "A"
            const match = cellVal.match(/([A-Z])(?:\(([\d]+)\))?/);
            if (match) {
                achievement = match[1];
                if (match[2]) totalStudents = parseInt(match[2]);
            } else {
                achievement = cellVal;
            }
        };

        // 2025 Credit System Logic vs Old System
        extractScore();
        extractAchievement();

        let determinedCategory: any = currentCategoryType || 'regular';

        // Explicit Rank check
        if (cols.rank !== -1) {
            const r = val(cols.rank);
            if (r) rank = parseInt(String(r).replace(/[^0-9]/g, ''));
        }

        const record = {
            grade: currentGrade,
            semester: currentSemester,
            category: determinedCategory,
            subject_group: category ? String(category) : '',
            subject: subject ? String(subject) : (category ? String(category) : ''),
            units: units ? parseInt(String(units)) : 0,
            score: rawScore,
            average: avgScore,
            stdDev: stdDev, // Might be null/0 if not present
            achievement: achievement,
            students: totalStudents,
            rank: rank,
            distribution: null,
            content: ''
        };

        // Separate Students Col Check (Quick Fix logic within block)
        // If totalStudents is 0, scan row for a number that might be students? risky.
        // Better: Rely on `A(231)` which is standard NEIS export format.

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
