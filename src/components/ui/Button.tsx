import { forwardRef } from "react";
import { cn } from "@/utils/cn";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger" | "subtle";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-white hover:bg-accent-hover active:bg-accent-lo shadow-[0_1px_0_0_rgba(255,255,255,0.08)_inset]",
  secondary: "bg-surface-3 text-ink hover:bg-line-2 border border-line",
  outline: "border border-line text-ink-2 hover:text-ink hover:border-line-2 hover:bg-surface-2",
  ghost: "text-muted hover:text-ink hover:bg-surface-2",
  subtle: "bg-surface-2 text-ink-2 hover:bg-surface-3 border border-line/60",
  danger: "bg-neg/90 text-white hover:bg-neg",
};

const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[12px] gap-1.5 rounded-[7px]",
  md: "h-9 px-3.5 text-[13px] gap-2 rounded-[9px]",
  lg: "h-10 px-4 text-[13.5px] gap-2 rounded-[10px]",
  icon: "h-8 w-8 justify-center rounded-[8px]",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "secondary", size = "md", loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center font-medium whitespace-nowrap transition-all duration-150",
        "disabled:pointer-events-none disabled:opacity-45",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && (
        <span className="mr-1 inline-block size-3 animate-spin rounded-full border border-current border-t-transparent" />
      )}
      {children}
    </button>
  ),
);
Button.displayName = "Button";

export const IconButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, ...props }, ref) => (
    <Button ref={ref} size="icon" variant="ghost" className={cn("text-muted", className)} {...props} />
  ),
);
IconButton.displayName = "IconButton";
