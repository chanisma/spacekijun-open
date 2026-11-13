"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface TooltipWrapperProps {
  children: React.ReactNode
  tooltip: string
  enabled?: boolean
}

export function TooltipWrapper({ children, tooltip, enabled = true }: TooltipWrapperProps) {
  const [isHovered, setIsHovered] = React.useState(false)
  const wrapperRef = React.useRef<HTMLDivElement>(null)
  const [tooltipPosition, setTooltipPosition] = React.useState({ top: 0, left: 0 })
  const [tooltipReady, setTooltipReady] = React.useState(false)

  React.useLayoutEffect(() => {
    if (isHovered && enabled && wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect()
      setTooltipPosition({
        top: rect.top + rect.height / 2 - 18, // Center vertically (18px = half of tooltip height)
        left: rect.right + 8 // 8px spacing from button
      })
      setTooltipReady(true)
    } else {
      setTooltipReady(false)
    }
  }, [isHovered, enabled])

  const handleMouseEnter = (e: React.MouseEvent) => {
    if (enabled) {
      setIsHovered(true)
    }
    // Forward the original onMouseEnter if it exists
    const originalOnMouseEnter = (e.currentTarget as any).onMouseEnter
    if (originalOnMouseEnter) {
      originalOnMouseEnter(e)
    }
  }

  const handleMouseLeave = (e: React.MouseEvent) => {
    if (enabled) {
      setIsHovered(false)
    }
    // Forward the original onMouseLeave if it exists
    const originalOnMouseLeave = (e.currentTarget as any).onMouseLeave
    if (originalOnMouseLeave) {
      originalOnMouseLeave(e)
    }
  }

  return (
    <>
      <div
        ref={wrapperRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="relative"
      >
        {children}
      </div>

      {/* Tooltip */}
      {enabled && tooltipReady && (
        <div
          className={cn(
            "fixed h-9 flex items-center px-3 bg-popover text-popover-foreground text-sm rounded-md shadow-md border whitespace-nowrap pointer-events-none transition-all duration-300 ease-out overflow-hidden z-50",
            isHovered ? "opacity-100 translate-x-0 w-auto" : "opacity-0 -translate-x-4 w-0",
          )}
          style={{
            top: tooltipPosition.top,
            left: tooltipPosition.left,
          }}
        >
          <span className={cn("transition-opacity duration-200 delay-100", isHovered ? "opacity-100" : "opacity-0")}>
            {tooltip}
          </span>
        </div>
      )}
    </>
  )
}