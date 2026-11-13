import { norm, constructStudentId } from './utils';

export const parseClassHistorySheet = (data: any[], fileName: string): any[] => {
    let nameIdx = -1;
    let numIdx = -1;
    let currentName = '';
    let currentNo = '';

    // 1. Find Header Row
    // 1. Find Header Row (The one with Grade/Class/Teacher etc)
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(20, data.length); i++) {
        const row = data[i] as any[];
        if (!row || !Array.isArray(row)) continue;
        const rowStr = row.map(norm);
        if (rowStr.some(s => s.includes('학년')) && rowStr.some(s => s.includes('반')) && (rowStr.some(s => s.includes('담임')) || rowStr.some(s => s.includes('이수')))) {
            headerRowIndex = i;
            break;
        }
    }

    if (headerRowIndex === -1) return [];

    const headerRow = data[headerRowIndex] as any[];
    // Check previous row for split headers (e.g. Name/Number might be on the row above)
    const prevRow = headerRowIndex > 0 ? (data[headerRowIndex - 1] as any[] || []) : [];

    // Detect columns
    let cols = {
        grade: -1,
        classNum: -1,
        studentNo: -1,
        teacher: -1,
        name: -1 // Student Name column if available in the same row
    };

    const findCol = (r: any[], keywords: string[]) => {
        let idx = r.findIndex(c => keywords.includes(norm(c)));
        if (idx !== -1) return idx;
        return r.findIndex(c => keywords.some(k => norm(c).includes(k)));
    };

    cols.grade = findCol(headerRow, ["학년"]);
    cols.classNum = findCol(headerRow, ["반"]);
    cols.teacher = findCol(headerRow, ["담임성명", "담임"]);

    // 'Number' (번호) might be 'Student No' in the class list (Row 2) OR List Index (Row 1)
    // We prioritize "번호" in the headerRow (class number), if not found, check prevRow (list index)
    // Wait, for Grade History, Row 2 'Number' is HISTORY Number. Row 1 'Number' is IDENTITY Number (List Index).
    // We need both.
    cols.studentNo = findCol(headerRow, ["번호"]); // History Number (in table)
    const listNoCol = findCol(prevRow, ["번호"]); // Identity Number (above table header)

    const findNameCol = (r: any[]) => {
        let idx = r.findIndex(c => ["성명", "이름"].includes(norm(c)));
        if (idx !== -1) return idx;
        return r.findIndex(c => {
            const n = norm(c);
            return (n.includes("성명") || n.includes("이름")) && !n.includes("담임");
        });
    };

    // Name is often in the row above for "History" tables or to the left
    cols.name = findNameCol(headerRow);
    if (cols.name === -1) cols.name = findNameCol(prevRow);

    // If ID is not in the row, we might need to rely on previously parsed context or upper rows (like standard sheets)
    // BUT parseStudentExcel structure is file-based.
    // If this is a sheet *per* student, we look for top-level Name/ID.
    // Use the standard top-level search if column not found.

    let topLevelNameIdx = -1;
    let topLevelNumIdx = -1;

    // Search for top level name/no if not found in table header
    if (cols.name === -1) {
        for (let i = 0; i < headerRowIndex; i++) {
            const row = data[i] as any[];
            if (!row || !Array.isArray(row)) continue;
            const rNorm = row.map(norm);
            if (rNorm.some(s => s.includes("성명")) && rNorm.some(s => s.includes("번호"))) {
                topLevelNameIdx = row.findIndex(c => norm(c).includes("성명"));
                topLevelNumIdx = row.findIndex(c => norm(c).includes("번호"));
                break;
            }
        }
    }

    let fileGrade = '3';
    let fileClass = '5';
    const filenameMatch = fileName.match(/Grade(\d+)_Class(\d+)/);
    if (filenameMatch) {
        fileGrade = filenameMatch[1];
        fileClass = filenameMatch[2];
    }

    const studentHistoryMap = new Map<string, { info: any, history: any[] }>();

    // State for streaming parsing
    let currentId = '';
    let currentInfo: any = null;

    for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i] as any[];
        if (!row || row.length === 0) continue;

        // Skip other headers or page breaks
        const rNorm = row.map(norm);
        if (rNorm.some(s => s.includes("학년")) && rNorm.some(s => s.includes("반"))) continue;
        if (rNorm.some(s => s.includes("상기본인은"))) continue; // Common footer text
        if (rNorm.some(s => s.includes("샘플고등학교"))) continue;

        // 1. Try to detect Student Identity Update (Name/ListNo)
        // If listNoCol or nameCol has data, we might be hitting a new student block.
        // HOWEVER, in some messy Excels, these might be merged cells appearing on the first row of history.
        let newNo = '';
        let newName = '';

        if (listNoCol !== -1 && row[listNoCol]) newNo = String(row[listNoCol]).trim();
        if (cols.name !== -1 && row[cols.name]) newName = String(row[cols.name]).trim();

        // If we found a valid new Identity, update state
        const noNum = parseInt(newNo.replace(/[^0-9]/g, ''));
        if (newNo && newName && norm(newNo) !== '번호' && norm(newName) !== '성명' && !isNaN(noNum) && noNum > 0) {
            currentNo = newNo;
            currentName = newName;

            // Generate ID for this new student
            const id = constructStudentId(fileGrade, fileClass, currentNo);
            currentId = id;

            if (!studentHistoryMap.has(id)) {
                studentHistoryMap.set(id, {
                    info: {
                        id,
                        name: currentName,
                        grade: parseInt(fileGrade),
                        classNum: parseInt(fileClass),
                        studentNo: currentNo,
                        source: fileName
                    },
                    history: []
                });
            }
        }

        // 2. Parse History Data (Grade/Class/No/Teacher)
        // This row might contain history data. It belongs to 'currentId'.
        if (!currentId) continue; // No student identified yet

        const rawGrade = cols.grade !== -1 ? row[cols.grade] : null;
        const rawClass = cols.classNum !== -1 ? row[cols.classNum] : null;
        const rawNum = cols.studentNo !== -1 ? row[cols.studentNo] : null;
        const rawTeacher = cols.teacher !== -1 ? row[cols.teacher] : null;

        const gradeVal = rawGrade ? parseInt(String(rawGrade).replace(/[^0-9]/g, '')) : 0;
        const classVal = rawClass ? parseInt(String(rawClass).replace(/[^0-9]/g, '')) : 0;
        const numVal = rawNum ? parseInt(String(rawNum).replace(/[^0-9]/g, '')) : 0;

        let teacherVal = '';
        if (rawTeacher && String(rawTeacher) !== 'undefined') {
            teacherVal = String(rawTeacher).trim();
        }

        // STRICT VALIDATION: Grade/Class must be valid numbers to be a history record
        if (!gradeVal || isNaN(gradeVal) || !classVal || isNaN(classVal)) {
            continue; // Not a valid history row (or just an identity header row with no history)
        }

        const historyItem = {
            grade: gradeVal,
            class: classVal,
            number: numVal,
            teacher: teacherVal
        };

        studentHistoryMap.get(currentId)!.history.push(historyItem);
    }

    return Array.from(studentHistoryMap.values()).map(entry => ({
        ...entry.info,
        data: entry.history
    }));
};
