import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, Users, MapPin, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { ScheduleEvent } from '@/hooks/useSchedule';
import { getEventTypeColor, getEventFullLabel, getEventIconName } from '@/lib/scheduleUtils';
import { getAssigneeDisplayText } from '@/lib/assigneeUtils';

interface ScheduleEventCardProps {
  event: ScheduleEvent;
  onEventClick?: (event: ScheduleEvent) => void;
}

export const ScheduleEventCard: React.FC<ScheduleEventCardProps> = ({
  event,
  onEventClick
}) => {
  const iconMap = {
    calendar: Calendar,
    clock: Clock,
    users: Users,
    mapPin: MapPin,
    fileText: FileText,
  };

  const getEventIcon = (kind: string) => {
    const iconName = getEventIconName(kind);
    const IconComponent = iconMap[iconName as keyof typeof iconMap] || Calendar;
    return <IconComponent className="h-4 w-4" />;
  };

  const startTime = new Date(event.starts_at);
  const endTime = new Date(event.ends_at);

  return (
    <Card
      className="hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onEventClick?.(event)}
    >
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <Badge className={getEventTypeColor(event.kind, 'solid', event.meta)}>
                {getEventIcon(event.kind)}
                {getEventFullLabel(event.kind)}
              </Badge>
              {(event as any).priority === 'high' && (
                <Badge variant="destructive" className="text-xs">
                  긴급
                </Badge>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              {format(startTime, 'HH:mm', { locale: ko })} - {format(endTime, 'HH:mm', { locale: ko })}
            </div>
          </div>

          <h3 className="font-semibold mb-2">{event.title}</h3>
          
          <div className="space-y-1 text-sm text-muted-foreground">
            {event.section_name && (
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                {event.section_name}
              </div>
            )}
            {event.room_name && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                {event.room_name}
              </div>
            )}
            {event.assignee && (
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                담당: {getAssigneeDisplayText(event.assignee)}
              </div>
            )}
          </div>

        </CardContent>
      </Card>
  );
};