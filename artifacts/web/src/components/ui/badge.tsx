import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors select-none",
  {
    variants: {
      variant: {
        default:
          "bg-white text-black",
        secondary:
          "bg-white/10 text-white/80 border border-white/10",
        destructive:
          "bg-destructive/15 text-destructive border border-destructive/20",
        outline:
          "border border-white/12 text-muted-foreground",
        ghost:
          "bg-white/[0.06] text-white/70",
        // stat / xp variant — bright white pill
        xp:
          "bg-white/[0.08] border border-white/12 text-white font-bold",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
