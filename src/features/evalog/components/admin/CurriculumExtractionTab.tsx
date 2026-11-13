import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, FileJson, Download } from 'lucide-react';
import { toast } from '@/lib/toast';
import * as XLSX from 'xlsx';

interface ExtractedSubject {
    category: string;
    subject: string;
    subject_type: string;
    semesters: Record<string, number>;
}

export const CurriculumExtractionTab: React.FC = () => {
    const [uploading, setUploading] = useState(false);
    const [extractedData, setExtractedData] = useState<ExtractedSubject[]>([]);
    const [tsContent, setTsContent] = useState<string>('');
    const [admissionYear, setAdmissionYear] = useState<number>(new Date().getFullYear());
    const [schoolName, setSchoolName] = useState<string>('샘플고등학교');

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length) return;

        const file = e.target.files[0];
        setUploading(true);

        try {
            const data = await readFile(file);
            const subjects = processExcel(data);
            setExtractedData(subjects);
            const ts = generateTypeScript(subjects, schoolName, admissionYear);
            setTsContent(ts);
            toast.success(`${subjects.length}개 과목을 추출했습니다.`);
        } catch (error) {
            console.error(error);
            toast.error('파일 파싱 실패');
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    const readFile = (file: File): Promise<ArrayBuffer> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                if (e.target?.result) resolve(e.target.result as ArrayBuffer);
                else reject(new Error("File read failed"));
            };
            reader.onerror = (e) => reject(e);
            reader.readAsArrayBuffer(file);
        });
    };

    const processExcel = (buffer: ArrayBuffer): ExtractedSubject[] => {
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // Use header: 1 to get array of arrays
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

        const subjects: ExtractedSubject[] = [];

        // Semester columns mapping (same as python script)
        // 1-1(8), 1-2(9), 2-1(10), 2-2(11), 3-1(12), 3-2(13)
        // Adjust for 0-based index if needed. Python openpyxl usually uses 1-based, 
        // effectively mapped to 0-based if accessing by list index. 
        // Let's verify python script: 
        // "semester_cols = {'1-1': 8 ...}" and "row[col_idx]"
        // In python openpyxl user used 'values_only=True', returning tuples.
        // If row[8] is accessed, it is the 9th element.
        // Let's assume the excel format is:
        // Col 0: Category
        // Col 1: ? (Script says: row[1] is Category, row[2] is Name)
        // Wait, script says:
        // "컬럼 0: 과목 영역" -> row[0]
        // "컬럼 1: 과목 유형" -> row[1] ?? Script comment says: "컬럼 0: 교과 영역, 컬럼 1: 교과(군) - 교과(군)을 사용" -> "category = str(row[1])"
        // Script code says:
        // row[2]: subject_name (Col C)
        // row[1]: category (Col B)
        // row[3]: subject_type (Col D)
        // credits at 8,9,10,11,12,13 (Col I onwards)

        const semesterCols: Record<string, number> = {
            '1-1': 8,
            '1-2': 9,
            '2-1': 10,
            '2-2': 11,
            '3-1': 12,
            '3-2': 13
        };

        // Start from row 5 (index 4)
        for (let i = 4; i < rows.length; i++) {
            const row = rows[i];
            // Safety check for row length
            if (!row || row.length < 3) continue;

            const name = row[2] ? String(row[2]).trim() : '';
            if (!name || ['합계', '계', '소계'].includes(name)) continue;

            // Extract credits
            const semesters: Record<string, number> = {};
            let hasCredits = false;

            Object.entries(semesterCols).forEach(([sem, colIdx]) => {
                if (row[colIdx]) {
                    const val = parseInt(row[colIdx]);
                    if (!isNaN(val) && val > 0) {
                        semesters[sem] = val;
                        hasCredits = true;
                    }
                }
            });

            if (hasCredits) {
                subjects.push({
                    category: row[1] ? String(row[1]).trim() : '기타',
                    subject: name,
                    subject_type: row[3] ? String(row[3]).trim() : '일반 선택',
                    semesters
                });
            }
        }

        return subjects;
    };

    const generateTypeScript = (subjects: ExtractedSubject[], school: string, year: number): string => {
        let content = `import { SchoolCurriculum } from '../../types';\n\n`;
        content += `// ${school} ${year}학년도 입학생 3개년 교육과정\n`;
        content += `export const jeonjuGijeonGirls${year}: SchoolCurriculum = {\n`;
        content += `  schoolName: '${school}',\n`;
        content += `  academicYear: ${year},\n`;
        content += `  subjects: [\n`;

        // Group by category
        const categorized: Record<string, ExtractedSubject[]> = {};
        subjects.forEach(s => {
            if (!categorized[s.category]) categorized[s.category] = [];
            categorized[s.category].push(s);
        });

        Object.keys(categorized).forEach(cat => {
            content += `    // ${cat}\n`;
            categorized[cat].forEach(subj => {
                const totalCredits = Object.values(subj.semesters).reduce((a, b) => a + b, 0);

                // Construct semesters string: { '1-1': 3, '1-2': 3 }
                const semStrParts = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2']
                    .filter(sem => subj.semesters[sem])
                    .map(sem => `'${sem}': ${subj.semesters[sem]}`);
                const semStr = `{ ${semStrParts.join(', ')} }`;

                content += `    {\n`;
                content += `      category: '${subj.category}',\n`;
                content += `      subject: '${subj.subject}',\n`;
                content += `      subjectType: '${subj.subject_type}',\n`;
                content += `      selectionGroup: '지정',\n`; // Defaulting to 지정 as per script
                content += `      credits: ${totalCredits},\n`;
                content += `      semesters: ${semStr},\n`;
                content += `      totalCredits: ${totalCredits},\n`;
                content += `      minCredits: ${totalCredits}\n`;
                content += `    },\n`;
            });
            content += `\n`;
        });

        content += `  ]\n};\n`;
        return content;
    };

    const handleDownload = () => {
        if (!tsContent) return;
        const blob = new Blob([tsContent], { type: 'text/typescript' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `jeonju_gijeon_girls_${admissionYear}.ts`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="flex flex-col h-full space-y-4">
            <div className="flex flex-col space-y-4 p-4 border rounded-md bg-slate-50">
                <h3 className="font-semibold text-lg">교육과정 추출 설정</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label>학교명</Label>
                        <Input value={schoolName} onChange={e => setSchoolName(e.target.value)} />
                    </div>
                    <div>
                        <Label>입학년도 (파일 생성용)</Label>
                        <Input
                            type="number"
                            value={admissionYear}
                            onChange={e => setAdmissionYear(parseInt(e.target.value))}
                        />
                    </div>
                </div>
            </div>

            <div className="p-8 border-2 border-dashed rounded-lg text-center space-y-4">
                <h3 className="text-lg font-semibold">교육과정 엑셀 선택</h3>
                <p className="text-sm text-slate-500">
                    교육과정 편제표가 포함된 엑셀 파일을 업로드하세요.<br />
                    (참고: extract_curriculum_2022.py 로직 기반)
                </p>
                <div className="flex justify-center">
                    <Button disabled={uploading} asChild>
                        <label>
                            {uploading ? <Loader2 className="animate-spin mr-2" /> : '엑셀 파일 선택'}
                            <Input
                                type="file"
                                accept=".xlsx,.xls"
                                className="hidden"
                                onChange={handleFileSelect}
                                disabled={uploading}
                            />
                        </label>
                    </Button>
                </div>
            </div>

            {extractedData.length > 0 && (
                <div className="flex-1 overflow-auto border rounded-md">
                    <div className="p-4 bg-slate-100 sticky top-0 flex justify-between items-center border-b">
                        <div className="font-semibold">추출 결과: {extractedData.length}과목</div>
                        <Button onClick={handleDownload} className="bg-green-600 hover:bg-green-700 text-white">
                            <Download className="mr-2 h-4 w-4" />
                            TypeScript 다운로드 ({admissionYear})
                        </Button>
                    </div>
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="p-2 border-b">분류</th>
                                <th className="p-2 border-b">과목명</th>
                                <th className="p-2 border-b">유형</th>
                                <th className="p-2 border-b">학점 합계</th>
                            </tr>
                        </thead>
                        <tbody>
                            {extractedData.map((subj, idx) => (
                                <tr key={idx} className="border-b hover:bg-slate-50">
                                    <td className="p-2">{subj.category}</td>
                                    <td className="p-2 font-medium">{subj.subject}</td>
                                    <td className="p-2 text-slate-500">{subj.subject_type}</td>
                                    <td className="p-2">{Object.values(subj.semesters).reduce((a, b) => a + b, 0)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
