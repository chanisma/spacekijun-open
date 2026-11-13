import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyProps {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  className?: string;
}

export function Empty({
  icon: Icon,
  title = '데이터가 없습니다',
  description,
  className
}: EmptyProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center py-12 text-center',
      className
    )}>
      {Icon && (
        <Icon className="h-12 w-12 text-muted-foreground/50 mb-4" />
      )}
      <h3 className="text-lg font-medium text-muted-foreground mb-2">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-md">
          {description}
        </p>
      )}
    </div>
  );
}