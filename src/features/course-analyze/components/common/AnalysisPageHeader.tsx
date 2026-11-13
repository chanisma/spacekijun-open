import React, { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AnalysisPageHeaderProps {
    icon: LucideIcon;
    title: string;
    description: string;
    rightContent?: ReactNode;
    iconColor?: string;
    iconBgColor?: string;
}

export function AnalysisPageHeader({
    icon: Icon,
    title,
    description,
    rightContent,
    iconColor = "text-brand-600",
    iconBgColor = "bg-brand-50"
}: AnalysisPageHeaderProps) {
    return (
        <div className="flex flex-wrap md:flex-nowrap items-start gap-3 mb-4 md:mb-6 pb-4 border-b border-slate-100/50">
            <div className={cn("p-2 rounded-xl shrink-0", iconBgColor, iconColor)}>
                <Icon size={20} />
            </div>
            <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-slate-800 tracking-tight">{title}</h3>
                <p className="text-sm text-slate-500 font-medium mt-0.5">
                    {description}
                </p>
            </div>
            {rightContent && (
                <div className="flex flex-wrap items-center gap-2 md:gap-3 w-full md:w-auto md:shrink-0">
                    {rightContent}
                </div>
            )}
        </div>
    );
}
