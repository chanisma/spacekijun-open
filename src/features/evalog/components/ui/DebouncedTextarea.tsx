import React, { useState, useEffect, useCallback } from 'react';
import { Textarea } from '@/components/ui/textarea';

interface DebouncedTextareaProps extends Omit<React.ComponentProps<typeof Textarea>, 'onChange' | 'value'> {
    value: string;
    onChange: (value: string) => void;
    delay?: number;
}

/**
 * Textarea with debounced onChange to prevent lag from frequent store updates.
 * - Immediate local state update for responsive typing
 * - Debounced callback to parent/store (default 300ms)
 */
export const DebouncedTextarea: React.FC<DebouncedTextareaProps> = ({
    value,
    onChange,
    delay = 300,
    ...props
}) => {
    const [localValue, setLocalValue] = useState(value);

    // Sync from parent when value prop changes (e.g., student switch)
    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    // Debounced sync to parent
    useEffect(() => {
        // Skip if values are the same
        if (localValue === value) return;

        const timer = setTimeout(() => {
            onChange(localValue);
        }, delay);

        return () => clearTimeout(timer);
    }, [localValue, delay, onChange, value]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setLocalValue(e.target.value);
    }, []);

    return (
        <Textarea
            {...props}
            value={localValue}
            onChange={handleChange}
        />
    );
};

export default DebouncedTextarea;
