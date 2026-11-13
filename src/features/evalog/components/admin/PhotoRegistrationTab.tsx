import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Upload, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { toast } from '@/lib/toast';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';

interface PhotoData {
    rowId: number;
    className: string;
    name: string;
    studentId: string;
    imageUrl: string;
    status: 'pending' | 'matched' | 'unmatched' | 'updated' | 'error';
    matchedDetails?: {
        id: string;
        currentSnum: string;
        name: string;
    };
    originalMeta?: any;
}

interface PhotoRegistrationTabProps {
    onBack?: () => void;
}

export const PhotoRegistrationTab: React.FC<PhotoRegistrationTabProps> = ({ onBack }) => {
    const [uploading, setUploading] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const [parsedData, setParsedData] = useState<PhotoData[]>([]);
    const [progress, setProgress] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 30;

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length) return;
        const file = e.target.files[0];

        setAnalyzing(true);
        try {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

            // Expect headers: Class | Name | Student ID | Image URL
            // Find header row
            let headerRowIndex = -1;
            for (let i = 0; i < Math.min(jsonData.length, 10); i++) {
                const row = jsonData[i].map(c => String(c).toLowerCase().trim());
                if (row.includes('student id') && row.includes('image url')) {
                    headerRowIndex = i;
                    break;
                }
            }

            if (headerRowIndex === -1) {
                toast.error('올바른 헤더를 찾을 수 없습니다. (Class, Name, Student ID, Image URL)');
                setAnalyzing(false);
                return;
            }

            const headers = jsonData[headerRowIndex].map(h => String(h).trim().toLowerCase());
            const colMap = {
                class: headers.findIndex(h => h.includes('class') || h === '반'),
                name: headers.findIndex(h => h.includes('name') || h === '이름'),
                studentId: headers.findIndex(h => h.includes('student id') || h === '학번'),
                imageUrl: headers.findIndex(h => h.includes('image url') || h === '사진' || h === 'url')
            };

            if (colMap.studentId === -1 || colMap.imageUrl === -1) {
                toast.error('필수 컬럼(Student ID, Image URL)이 누락되었습니다.');
                setAnalyzing(false);
                return;
            }

            const rows: PhotoData[] = [];
            for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (!row || row.length === 0) continue;

                const studentId = row[colMap.studentId] ? String(row[colMap.studentId]).trim() : '';
                const imageUrl = row[colMap.imageUrl] ? String(row[colMap.imageUrl]).trim() : '';

                if (studentId && imageUrl) {
                    rows.push({
                        rowId: i,
                        className: colMap.class !== -1 ? String(row[colMap.class]) : '',
                        name: colMap.name !== -1 ? String(row[colMap.name]) : '',
                        studentId,
                        imageUrl,
                        status: 'pending'
                    });
                }
            }

            setParsedData(rows);
            setCurrentPage(1);
            await analyzeMatches(rows);

        } catch (error) {
            console.error(error);
            toast.error('파일 파싱 중 오류가 발생했습니다.');
        } finally {
            setAnalyzing(false);
            e.target.value = ''; // Reset input
        }
    };

    const analyzeMatches = async (rows: PhotoData[]) => {
        try {
            // Fetch all students from resource table
            const { data: resources, error } = await supabase
                .from('resource')
                .select('id, name, meta')
                .eq('type', 'student');

            if (error) throw error;
            if (!resources) return;

            const updatedRows = rows.map(row => {
                // Logic: Compare row.studentId with highest snum in meta
                // meta.snum3 > meta.snum2 > meta.snum1 > meta.snum
                const match = resources.find(r => {
                    const meta = r.meta as any || {};
                    const snum3 = meta.snum3 ? String(meta.snum3).trim() : null;
                    const snum2 = meta.snum2 ? String(meta.snum2).trim() : null;
                    const snum1 = meta.snum1 ? String(meta.snum1).trim() : null;
                    const snum = meta.snum ? String(meta.snum).trim() : null;

                    // Determine highest snum
                    let highestSnum = snum3 || snum2 || snum1 || snum;

                    if (!highestSnum) return false;

                    return highestSnum === row.studentId;
                });

                if (match) {
                    const meta = match.meta as any;
                    return {
                        ...row,
                        status: 'matched' as const,
                        matchedDetails: {
                            id: match.id,
                            currentSnum: row.studentId, // basically the matched one
                            name: (match as any).name || meta.name || '이름 없음'
                        },
                        originalMeta: meta
                    };
                } else {
                    return {
                        ...row,
                        status: 'unmatched' as const
                    };
                }
            });

            setParsedData(updatedRows);
            const matchedCount = updatedRows.filter(r => r.status === 'matched').length;
            toast.info(`${rows.length}개 중 ${matchedCount}개 매칭 성공`);

        } catch (error) {
            console.error(error);
            toast.error('매칭 분석 중 오류가 발생했습니다.');
        }
    };

    const handleUpload = async () => {
        const matchedRows = parsedData.filter(r => r.status === 'matched');
        if (matchedRows.length === 0) {
            toast.warning('매칭된 데이터가 없습니다.');
            return;
        }

        if (!confirm(`${matchedRows.length}명의 학생 사진 정보를 업데이트하시겠습니까?`)) return;

        setUploading(true);
        setProgress(0);
        let successCount = 0;
        let failCount = 0;

        try {
            const total = matchedRows.length;

            // Process in chunks to avoid overwhelming the network
            const CHUNK_SIZE = 10;
            for (let i = 0; i < total; i += CHUNK_SIZE) {
                const chunk = matchedRows.slice(i, i + CHUNK_SIZE);
                await Promise.all(chunk.map(async (row) => {
                    try {
                        if (!row.matchedDetails || !row.originalMeta) return;

                        const newMeta = {
                            ...row.originalMeta,
                            picture: row.imageUrl
                        };

                        const { error } = await supabase
                            .from('resource')
                            .update({ meta: newMeta })
                            .eq('id', row.matchedDetails.id);

                        if (error) throw error;

                        // Update local status
                        setParsedData(prev => prev.map(p =>
                            p.rowId === row.rowId ? { ...p, status: 'updated' } : p
                        ));
                        successCount++;
                    } catch (err) {
                        console.error(`Failed to update ${row.studentId}`, err);
                        setParsedData(prev => prev.map(p =>
                            p.rowId === row.rowId ? { ...p, status: 'error' } : p
                        ));
                        failCount++;
                    }
                }));
                setProgress(Math.round(((i + chunk.length) / total) * 100));
            }

            // 사진 저장 후 MV 갱신
            if (successCount > 0) {
                try {
                    await supabase.rpc('refresh_student_timetable_flat' as any);
                } catch (err) {
                    console.warn('student_timetable_flat MV 갱신 실패:', err);
                }
            }

            toast.success(`완료: 성공 ${successCount}건, 실패 ${failCount}건`);

        } catch (error) {
            console.error(error);
            toast.error('업로드 중 오류가 발생했습니다.');
        } finally {
            setUploading(false);
            setProgress(0);
        }
    };

    const matchedCount = parsedData.filter(r => r.status === 'matched' || r.status === 'updated').length;
    const unmatchedCount = parsedData.filter(r => r.status === 'unmatched').length;

    return (
        <div className="flex flex-col h-full space-y-4">
            <div className="flex justify-between items-center p-4 bg-slate-50 border rounded-lg">
                <div className="space-y-1">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                        {onBack && (
                            <Button variant="ghost" size="sm" onClick={onBack} className="mr-2">
                                ←
                            </Button>
                        )}
                        학생 사진 일괄 등록
                    </h3>
                    <p className="text-sm text-slate-500">
                        Class | Name | Student ID | Image URL 컬럼이 포함된 엑셀 또는 CSV 파일을 업로드하세요.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button disabled={analyzing || uploading} variant="outline" asChild>
                        <label className="cursor-pointer">
                            {analyzing ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Upload className="mr-2 h-4 w-4" />}
                            파일 선택
                            <Input
                                type="file"
                                className="hidden"
                                accept=".xlsx,.xls,.csv"
                                onChange={handleFileSelect}
                                disabled={analyzing || uploading}
                            />
                        </label>
                    </Button>
                    {parsedData.length > 0 && (
                        <Button
                            onClick={handleUpload}
                            disabled={uploading || matchedCount === 0}
                            className="bg-blue-600 hover:bg-blue-700"
                        >
                            {uploading ? (
                                <>
                                    <Loader2 className="animate-spin mr-2 h-4 w-4" />
                                    업데이트 중 ({progress}%)
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    매칭 데이터 업데이트 ({matchedCount}건)
                                </>
                            )}
                        </Button>
                    )}
                </div>
            </div>

            {parsedData.length > 0 && (
                <div className="flex-1 border rounded-md overflow-hidden flex flex-col">
                    <div className="bg-slate-100 p-2 text-xs font-medium flex gap-4 border-b">
                        <span className="text-blue-600">매칭 성공: {matchedCount}건</span>
                        <span className="text-red-500">매칭 실패: {unmatchedCount}건</span>
                    </div>
                    <div className="flex-1 overflow-auto bg-white">
                        <table className="w-full text-sm text-left">
                            <thead className="sticky top-0 bg-slate-50 z-10 text-xs text-slate-500 uppercase">
                                <tr>
                                    <th className="p-3 border-b text-center w-16">상태</th>
                                    <th className="p-3 border-b">ID (Excel)</th>
                                    <th className="p-3 border-b">이름 (Excel)</th>
                                    <th className="p-3 border-b">매칭된 학생</th>
                                    <th className="p-3 border-b">사진 URL</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {parsedData.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE).map((row) => (
                                    <tr key={row.rowId} className={`hover:bg-slate-50 ${row.status === 'unmatched' ? 'bg-red-50/30' : ''}`}>
                                        <td className="p-3 text-center">
                                            {row.status === 'matched' && <CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" />}
                                            {row.status === 'updated' && <CheckCircle2 className="w-5 h-5 text-blue-500 mx-auto" />}
                                            {row.status === 'unmatched' && <AlertCircle className="w-5 h-5 text-red-500 mx-auto" />}
                                            {row.status === 'error' && <AlertCircle className="w-5 h-5 text-orange-500 mx-auto" />}
                                            {row.status === 'pending' && <Loader2 className="w-5 h-5 animate-spin text-slate-400 mx-auto" />}
                                        </td>
                                        <td className="p-3 font-mono text-slate-700">{row.studentId}</td>
                                        <td className="p-3">{row.name}</td>
                                        <td className="p-3 text-slate-600">
                                            {row.matchedDetails ? (
                                                <span className="flex flex-col">
                                                    <span className="font-medium text-slate-800">{row.matchedDetails.name}</span>
                                                    <span className="text-xs text-slate-400">ID: {row.matchedDetails.currentSnum}</span>
                                                </span>
                                            ) : (
                                                <span className="text-slate-400">-</span>
                                            )}
                                        </td>
                                        <td className="p-3 max-w-[300px] truncate text-xs text-slate-500" title={row.imageUrl}>
                                            {row.imageUrl}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination Controls */}
                    {parsedData.length > ITEMS_PER_PAGE && (
                        <div className="flex items-center justify-center space-x-2 p-2 bg-slate-50 border-t">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(1)}
                                disabled={currentPage === 1}
                            >
                                {'<<'}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                            >
                                {'<'}
                            </Button>
                            <span className="text-sm text-slate-600 min-w-[100px] text-center">
                                {currentPage} / {Math.ceil(parsedData.length / ITEMS_PER_PAGE)} page
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(prev => Math.min(Math.ceil(parsedData.length / ITEMS_PER_PAGE), prev + 1))}
                                disabled={currentPage >= Math.ceil(parsedData.length / ITEMS_PER_PAGE)}
                            >
                                {'>'}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(Math.ceil(parsedData.length / ITEMS_PER_PAGE))}
                                disabled={currentPage >= Math.ceil(parsedData.length / ITEMS_PER_PAGE)}
                            >
                                {'>>'}
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
