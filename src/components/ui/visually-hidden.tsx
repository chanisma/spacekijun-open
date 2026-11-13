import * as React from "react"

interface VisuallyHiddenProps extends React.HTMLAttributes<HTMLSpanElement> {}

const VisuallyHidden = React.forwardRef<HTMLSpanElement, VisuallyHiddenProps>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className="sr-only"
      {...props}
    />
  )
)
VisuallyHidden.displayName = "VisuallyHidden"

export { VisuallyHidden }