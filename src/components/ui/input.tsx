import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-11 w-full rounded-full border border-input bg-card px-4 text-base text-foreground sm:text-[15px] placeholder:text-muted-foreground/80 outline-none transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
