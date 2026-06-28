import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  heading: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  heading,
  description,
  children,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed p-10 text-center",
        className
      )}
    >
      {Icon && (
        <div className="bg-muted mb-4 flex size-12 items-center justify-center rounded-full">
          <Icon className="text-muted-foreground size-6" aria-hidden="true" />
        </div>
      )}
      <h3 className="text-sm font-semibold">{heading}</h3>
      {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
