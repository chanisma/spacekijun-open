import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, GitMerge, Check } from 'lucide-react';
import { mergeStudentData } from '../../utils/pdf/mergeStudents';
import { parseUpstageJson } from '../../utils/pdf/parsers/upstageParser';
import { Student } from '../../types/student';
import { toast } from '@/lib/toast';

interface MergeDebugDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onAddStudent?: (student: Student) => void;
}

export function MergeDebugDialog({ open, onOpenChange, onAddStudent }: MergeDebugDialogProps) {
    const [legacyData, setLegacyData] = useState<Student | null>(null);
    const [upstageRaw, setUpstageRaw] = useState<any | null>(null);
    const [mergedResult, setMergedResult] = useState<Student | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleLegacyUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const json = JSON.parse(text);
            // Handle stale legacy data structure if needed (adapter logic)
            if (json.subjectGrades && !json.section6_academic_development) {
                json.section6_academic_development = json.subjectGrades;
            }
            if (json.extracurricularActivities && !json.section5_creative_activities) {
                json.section5_creative_activities = json.extracurricularActivities;
            }
            setLegacyData(json);
            setError(null);
        } catch (err) {
            console.error('Legacy JSON parse error:', err);
            setError('Failed to parse Legacy JSON');
        }
    };

    const handleUpstageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const json = JSON.parse(text);
            setUpstageRaw(json);
            setError(null);
        } catch (err) {
            console.error('Upstage JSON parse error:', err);
            setError('Failed to parse Upstage JSON');
        }
    };

    const handleMerge = () => {
        if (!legacyData || !upstageRaw) {
            setError('Both files are required');
            return;
        }

        try {
            // Parse Upstage Raw -> Student
            const upstageStudent = parseUpstageJson(upstageRaw);

            // Merge
            const merged = mergeStudentData(legacyData, upstageStudent);
            setMergedResult(merged);
            setError(null);
        } catch (err) {
            console.error('Merge error:', err);
            setError(err instanceof Error ? err.message : 'Merge failed');
        }
    };

    const handleApply = () => {
        if (!mergedResult || !onAddStudent) return;
        onAddStudent(mergedResult);
        toast.success(`Merged student "${mergedResult.name}" added to list`);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Evaluate Merge Logic (Legacy + Upstage)</DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-hidden flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-4">
                        {/* Legacy Upload */}
                        <div className="flex flex-col gap-2 p-4 bg-muted/30 rounded-lg border border-muted-foreground/25">
                            <h3 className="text-sm font-medium">1. Legacy Result (current_student.json)</h3>
                            <div className="relative">
                                <input
                                    type="file"
                                    accept=".json"
                                    onChange={handleLegacyUpload}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                                <Button variant={legacyData ? "default" : "secondary"} className="w-full pointer-events-none">
                                    <Upload className="w-4 h-4 mr-2" />
                                    {legacyData ? "Legacy Loaded" : "Select Legacy JSON"}
                                </Button>
                            </div>
                        </div>

                        {/* Upstage Upload */}
                        <div className="flex flex-col gap-2 p-4 bg-muted/30 rounded-lg border border-muted-foreground/25">
                            <h3 className="text-sm font-medium">2. Upstage Result (Raw JSON)</h3>
                            <div className="relative">
                                <input
                                    type="file"
                                    accept=".json"
                                    onChange={handleUpstageUpload}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                                <Button variant={upstageRaw ? "default" : "secondary"} className="w-full pointer-events-none">
                                    <Upload className="w-4 h-4 mr-2" />
                                    {upstageRaw ? "Upstage Loaded" : "Select Upstage JSON"}
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <Button
                            onClick={handleMerge}
                            disabled={!legacyData || !upstageRaw}
                            className="bg-indigo-600 hover:bg-indigo-700 flex-1"
                        >
                            <GitMerge className="w-4 h-4 mr-2" />
                            Run Merge
                        </Button>

                        {mergedResult && onAddStudent && (
                            <Button
                                onClick={handleApply}
                                className="bg-emerald-600 hover:bg-emerald-700 flex-1"
                            >
                                <Check className="w-4 h-4 mr-2" />
                                Apply Result
                            </Button>
                        )}
                    </div>

                    {error && (
                        <div className="p-4 bg-destructive/10 text-destructive text-sm rounded-md">
                            Error: {error}
                        </div>
                    )}

                    {mergedResult && (
                        <div className="flex-1 overflow-auto bg-slate-950 text-slate-50 p-4 rounded-md font-mono text-xs">
                            <pre>{JSON.stringify(mergedResult, null, 2)}</pre>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
