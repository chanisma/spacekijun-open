import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, Users, GitMerge, Check, Loader2, FileText, Settings, ArrowRight, ArrowLeft } from 'lucide-react';
import { parseUpstageMultipleJson } from '../../utils/pdf/parsers/upstageParser';
import { PDFParser } from '../../utils/pdf/pdfParser';
import { mergeStudentData } from '../../utils/pdf/mergeStudents';
import { Student } from '../../types/student';
import { toast } from '@/lib/toast';
import { Textarea } from '@/components/ui/textarea';

interface MultiParsingDebugDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

type Step = 1 | 2 | 3 | 4;

export function MultiParsingDebugDialog({ open, onOpenChange }: MultiParsingDebugDialogProps) {
    const [step, setStep] = useState<Step>(1);

    // Data States
    const [rawPdfText, setRawPdfText] = useState<string>('');
    const [legacyStudents, setLegacyStudents] = useState<Student[]>([]);
    const [upstageStudents, setUpstageStudents] = useState<Student[]>([]);
    const [mergedResults, setMergedResults] = useState<Student[]>([]);

    // UI States
    const [error, setError] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [separator, setSeparator] = useState("학교생활세부사항기록부(학교생활기록부II)");

    // Step 1: Extract Text
    const handlePdfExtract = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsProcessing(true);
        setError(null);
        setRawPdfText('');

        try {
            const parser = new PDFParser();
            const text = await parser.extractText(file);
            setRawPdfText(text);
            toast.success(`Extracted ${text.length} characters`);
        } catch (err) {
            console.error('Extraction failed:', err);
            setError(err instanceof Error ? err.message : 'Extraction failed');
        } finally {
            setIsProcessing(false);
        }
    };

    // Step 2: Parse Legacy
    const handleLegacyParse = () => {
        setIsProcessing(true);
        setError(null);

        try {
            const parser = new PDFParser();
            const result = parser.parseText(rawPdfText, { separator });

            if (result.students && result.students.length > 0) {
                setLegacyStudents(result.students as Student[]);
                toast.success(`Parsed ${result.students.length} students`);
                setStep(3);
            } else {
                throw new Error('No students found. Check separator.');
            }
        } catch (err) {
            console.error('Parsing failed:', err);
            setError(err instanceof Error ? err.message : 'Parsing failed');
        } finally {
            setIsProcessing(false);
        }
    };

    // Step 3: Upstage Upload
    const handleUpstageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            const json = JSON.parse(text);
            const parsedStudents = parseUpstageMultipleJson(json);
            setUpstageStudents(parsedStudents);
            toast.success(`Loaded ${parsedStudents.length} Upstage students`);
            setStep(4);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Upstage parsing failed');
        }
    };

    // Step 4: Merge
    const handleBatchMerge = () => {
        const merged: Student[] = [];
        let matchCount = 0;

        upstageStudents.forEach(upstage => {
            const legacyMatch = legacyStudents.find(l => l.name === upstage.name);
            if (legacyMatch) {
                merged.push(mergeStudentData(legacyMatch, upstage));
                matchCount++;
            } else {
                merged.push(upstage);
            }
        });

        setMergedResults(merged);
        toast.success(`Merged ${matchCount} students`);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Users className="w-5 h-5" />
                        Multi-Parsing Debugger (Step {step}/4)
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-hidden flex flex-col gap-4">
                    {/* Step Indicator */}
                    <div className="flex justify-between px-8 py-2 bg-muted/20 rounded-lg">
                        <div className={`flex items-center gap-2 ${step >= 1 ? 'text-primary font-bold' : 'text-muted-foreground'}`}>1. Extract</div>
                        <div className={`flex items-center gap-2 ${step >= 2 ? 'text-primary font-bold' : 'text-muted-foreground'}`}>2. Parse</div>
                        <div className={`flex items-center gap-2 ${step >= 3 ? 'text-primary font-bold' : 'text-muted-foreground'}`}>3. Upstage</div>
                        <div className={`flex items-center gap-2 ${step >= 4 ? 'text-primary font-bold' : 'text-muted-foreground'}`}>4. Merge</div>
                    </div>

                    {/* Step Content */}
                    <div className="flex-1 overflow-hidden flex flex-col">
                        {step === 1 && (
                            <div className="flex flex-col h-full gap-4">
                                <div className="flex items-center gap-4">
                                    <div className="relative">
                                        <input type="file" accept=".pdf" onChange={handlePdfExtract} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                                        <Button variant="outline">
                                            {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                                            Upload Legacy PDF
                                        </Button>
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                        {rawPdfText ? `${rawPdfText.length} chars extracted` : 'Upload a PDF to extract text'}
                                    </div>
                                </div>
                                <Textarea
                                    value={rawPdfText}
                                    onChange={(e) => setRawPdfText(e.target.value)}
                                    className="flex-1 font-mono text-xs"
                                    placeholder="Raw text will appear here..."
                                />
                                <div className="flex justify-end">
                                    <Button onClick={() => setStep(2)} disabled={!rawPdfText}>
                                        Next: Parse Students <ArrowRight className="w-4 h-4 ml-2" />
                                    </Button>
                                </div>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="flex flex-col h-full gap-4">
                                <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg">
                                    <Settings className="w-4 h-4 text-muted-foreground" />
                                    <span className="text-sm font-medium">Separator:</span>
                                    <Input
                                        value={separator}
                                        onChange={(e) => setSeparator(e.target.value)}
                                        className="flex-1 font-mono text-xs"
                                    />
                                </div>
                                <div className="flex-1 overflow-auto bg-slate-50 p-4 rounded border">
                                    {legacyStudents.length > 0 ? (
                                        <div className="grid grid-cols-2 gap-2">
                                            {legacyStudents.map((s, i) => (
                                                <div key={i} className="p-2 bg-white border rounded text-xs">
                                                    {i + 1}. {s.name} ({s.studentNo})
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-muted-foreground">
                                            Click Parse to process raw text
                                        </div>
                                    )}
                                </div>
                                <div className="flex justify-between">
                                    <Button variant="ghost" onClick={() => setStep(1)}>
                                        <ArrowLeft className="w-4 h-4 mr-2" /> Back
                                    </Button>
                                    <Button onClick={handleLegacyParse}>
                                        Parse Students
                                    </Button>
                                    {legacyStudents.length > 0 && (
                                        <Button onClick={() => setStep(3)}>
                                            Next: Upload Upstage <ArrowRight className="w-4 h-4 ml-2" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )}

                        {step === 3 && (
                            <div className="flex flex-col h-full gap-4">
                                <div className="flex items-center justify-center h-40 border-2 border-dashed rounded-lg">
                                    <div className="text-center relative">
                                        <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                                        <p className="text-sm text-muted-foreground mb-2">Upload Upstage JSON</p>
                                        <input type="file" accept=".json" onChange={handleUpstageUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                                        <Button variant="secondary">Select File</Button>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-auto">
                                    {upstageStudents.length > 0 && (
                                        <div className="grid grid-cols-3 gap-2">
                                            {upstageStudents.map((s, i) => (
                                                <div key={i} className="p-2 bg-muted rounded text-xs">
                                                    {s.name}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="flex justify-between">
                                    <Button variant="ghost" onClick={() => setStep(2)}>
                                        <ArrowLeft className="w-4 h-4 mr-2" /> Back
                                    </Button>
                                    <Button onClick={() => setStep(4)} disabled={upstageStudents.length === 0}>
                                        Next: Merge <ArrowRight className="w-4 h-4 ml-2" />
                                    </Button>
                                </div>
                            </div>
                        )}

                        {step === 4 && (
                            <div className="flex flex-col h-full gap-4">
                                <div className="flex justify-center py-4">
                                    <Button onClick={handleBatchMerge} className="w-full max-w-md">
                                        <GitMerge className="w-4 h-4 mr-2" /> Run Batch Merge
                                    </Button>
                                </div>
                                <div className="flex-1 overflow-auto bg-slate-950 text-slate-50 p-4 rounded-lg font-mono text-xs">
                                    {mergedResults.length > 0 ? (
                                        <pre>{JSON.stringify(mergedResults, null, 2)}</pre>
                                    ) : (
                                        <div className="text-center text-muted-foreground mt-10">
                                            Ready to merge {legacyStudents.length} Legacy + {upstageStudents.length} Upstage students.
                                        </div>
                                    )}
                                </div>
                                <div className="flex justify-start">
                                    <Button variant="ghost" onClick={() => setStep(3)}>
                                        <ArrowLeft className="w-4 h-4 mr-2" /> Back
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>

                    {error && (
                        <div className="p-4 bg-destructive/10 text-destructive text-sm rounded-md">
                            Error: {error}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
