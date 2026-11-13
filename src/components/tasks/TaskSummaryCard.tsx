// ========================================
// Task Summary Card Component
// Reusable card for displaying task statistics
// ========================================

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface TaskSummaryCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  description?: string;
  variant?: 'default' | 'urgent' | 'success' | 'warning';
  onClick?: () => void;
}

export function TaskSummaryCard({
  title,
  value,
  icon,
  description,
  variant = 'default',
  onClick
}: TaskSummaryCardProps) {
  const variantStyles = {
    default: 'border-border',
    urgent: 'border-red-200 bg-red-50',
    success: 'border-green-200 bg-green-50',
    warning: 'border-orange-200 bg-orange-50'
  };

  const iconStyles = {
    default: 'text-muted-foreground',
    urgent: 'text-red-600',
    success: 'text-green-600',
    warning: 'text-orange-600'
  };


  return (
    <Card 
      className={cn(
        'transition-all duration-200 hover:shadow-md',
        variantStyles[variant],
        onClick && 'cursor-pointer hover:scale-105'
      )}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className={cn('shrink-0', iconStyles[variant])}>
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}