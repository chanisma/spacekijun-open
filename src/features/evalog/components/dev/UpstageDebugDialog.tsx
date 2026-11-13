import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, FileJson } from 'lucide-react';
import { parseUpstageJson } from '../../utils/pdf/parsers/upstageParser';
import { Student } from '../../types/student';

interface UpstageDebugDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function UpstageDebugDialog({ open, onOpenChange }: UpstageDebugDialogProps) {
    const [result, setResult] = useState<Student | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setError(null);
            const text = await file.text();
            const json = JSON.parse(text);
            const parsedStudent = parseUpstageJson(json);
            setResult(parsedStudent);
        } catch (err) {
            console.error('Upstage JSON parsing error:', err);
            setError(err instanceof Error ? err.message : 'Unknown error');
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Upstage JSON Parser Debug</DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-hidden flex flex-col gap-4">
                    <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg border border-dashed border-muted-foreground/25">
                        <div className="flex-1">
                            <h3 className="text-sm font-medium mb-1">Upload Upstage Result JSON</h3>
                            <p className="text-xs text-muted-foreground">Select 'upstage_parser_result.json' file</p>
                        </div>
                        <div className="relative">
                            <input
                                type="file"
                                accept=".json"
                                onChange={handleFileUpload}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <Button variant="secondary" className="pointer-events-none">
                                <Upload className="w-4 h-4 mr-2" />
                                Select File
                            </Button>
                        </div>
                    </div>

                    {error && (
                        <div className="p-4 bg-destructive/10 text-destructive text-sm rounded-md">
                            Error: {error}
                        </div>
                    )}

                    {result && (
                        <div className="flex-1 overflow-auto bg-slate-950 text-slate-50 p-4 rounded-md font-mono text-xs">
                            <pre>{JSON.stringify(result, null, 2)}</pre>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
