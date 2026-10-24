import { Skeleton } from "@/components/ui/Primitives";

/**
 * Skeletons that match the real layout.
 *
 * A spinner says "something is happening"; a block shaped like the content that
 * is about to appear says "you are already here", which is why app shells use
 * them and prototypes do not.
 */

export function SearchBoxSkeleton() {
  return <Skeleton className="h-14 w-full rounded-full" />;
}

export function CardSkeleton({ className = "" }: { className?: string }) {
  return <div className={`shimmer rounded-3xl ${className}`} />;
}

export function RailSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="rail">
      {Array.from({ length: count }).map((_, index) => (
        <CardSkeleton key={index} className="h-44" />
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-cream-200">
      {Array.from({ length: rows }).map((_, index) => (
        <li key={index} className="flex items-center gap-3 py-3.5">
          <span className="shimmer h-12 w-12 shrink-0 rounded-2xl" />
          <span className="min-w-0 flex-1 space-y-2">
            <span className="shimmer block h-3.5 w-2/3 rounded-full" />
            <span className="shimmer block h-3 w-1/3 rounded-full" />
          </span>
          <span className="shimmer h-8 w-20 rounded-full" />
        </li>
      ))}
    </ul>
  );
}
