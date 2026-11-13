import { CheckCircle2, AlertCircle, Info, XCircle, Check, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./button"
import { Badge } from "./badge"

type NotificationType = "success" | "error" | "warning" | "info"

interface NotificationCardProps {
  type?: NotificationType
  title: string
  message: string
  /** 답장 알림의 원문 인용 — 무엇에 대한 답인지 본문 위에 한 줄로 보여 준다 */
  quote?: string
  timestamp: string
  isRead?: boolean
  className?: string

  // Action callbacks
  onMarkAsRead?: () => void
  onDelete?: () => void

  // Primary action (appears in footer)
  primaryAction?: {
    label: string
    onClick: () => void
    loading?: boolean
    variant?: 'default' | 'success' | 'destructive'
  }

  // Optional badge
  badge?: {
    label: string
    variant?: 'default' | 'secondary' | 'outline' | 'destructive'
  }

  // Loading states
  isActionLoading?: boolean
}

const notificationConfig = {
  success: {
    icon: CheckCircle2,
    bgColor: "bg-emerald-50 dark:bg-emerald-950/30",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    borderColor: "border-emerald-200 dark:border-emerald-800",
  },
  error: {
    icon: XCircle,
    bgColor: "bg-red-50 dark:bg-red-950/30",
    iconColor: "text-red-600 dark:text-red-400",
    borderColor: "border-red-200 dark:border-red-800",
  },
  warning: {
    icon: AlertCircle,
    bgColor: "bg-amber-50 dark:bg-amber-950/30",
    iconColor: "text-amber-600 dark:text-amber-400",
    borderColor: "border-amber-200 dark:border-amber-800",
  },
  info: {
    icon: Info,
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
    iconColor: "text-blue-600 dark:text-blue-400",
    borderColor: "border-blue-200 dark:border-blue-800",
  },
}

export function NotificationCard({
  type = "info",
  title,
  message,
  quote,
  timestamp,
  isRead = false,
  className,
  onMarkAsRead,
  onDelete,
  primaryAction,
  badge,
  isActionLoading,
}: NotificationCardProps) {
  const config = notificationConfig[type]
  const Icon = config.icon

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-card p-4 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5",
        !isRead && "border-l-4",
        !isRead && config.borderColor,
        isRead && "border-border opacity-75",
        className,
      )}
    >
      {/* Unread indicator dot */}
      {!isRead && (
        <div className="absolute right-3 top-3">
          <div className={cn("h-2 w-2 rounded-full", config.iconColor.replace("text-", "bg-"))} />
        </div>
      )}

      {/* Header: Icon + Title + Badge + Actions */}
      <div className="flex items-start gap-3 mb-3">
        {/* Icon */}
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
            config.bgColor,
          )}
        >
          <Icon className={cn("h-5 w-5", config.iconColor)} />
        </div>

        {/* Title + Badge */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-card-foreground leading-tight break-words">
              {title}
            </h3>
            {badge && (
              <Badge variant={badge.variant || "outline"} className="text-xs">
                {badge.label}
              </Badge>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {onMarkAsRead && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onMarkAsRead}
              className="h-7 w-7 p-0 hover:bg-white/80"
              disabled={isRead || isActionLoading}
              title={isRead ? "읽음" : "읽음 표시"}
            >
              <Check className={cn(
                "h-3.5 w-3.5",
                isRead ? "text-green-600" : "text-green-500 hover:text-green-600"
              )} />
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
              disabled={isActionLoading}
              title="삭제"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Message */}
      <div className="mb-3">
        {quote && (
          <p
            className="mb-1.5 line-clamp-2 break-words border-l-2 border-slate-200 pl-2 text-xs text-muted-foreground/70"
            title={quote}
          >
            {quote}
          </p>
        )}
        <p className="text-sm text-muted-foreground leading-relaxed break-words whitespace-pre-line">
          {message}
        </p>
      </div>

      {/* Footer: Timestamp + Primary Action */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground/70">{timestamp}</p>

        {primaryAction && (
          <Button
            size="sm"
            onClick={primaryAction.onClick}
            disabled={primaryAction.loading}
            variant={primaryAction.variant === 'success' ? 'default' : primaryAction.variant}
            className={cn(
              primaryAction.variant === 'success' && "bg-green-600 hover:bg-green-700"
            )}
          >
            {primaryAction.label}
          </Button>
        )}
      </div>

      {/* Hover effect gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/0 to-primary/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-events-none" />
    </div>
  )
}
