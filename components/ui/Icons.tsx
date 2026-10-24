import type { SVGProps } from "react";

/**
 * One icon set for the whole app.
 *
 * Stroke icons at a single weight and size read as an interface; a mix of emoji
 * and SVG in the chrome reads as a prototype. Emoji stay where they are content
 * (product glyphs, store marks), never where they are navigation.
 */

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

function Svg({ className = "h-5 w-5", children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 10.6 12 4l8 6.6" />
      <path d="M6 9.6V19a1 1 0 0 0 1 1h3.2v-5.1h3.6V20H17a1 1 0 0 0 1-1V9.6" />
    </Svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="6.6" />
      <path d="m16 16 4 4" />
    </Svg>
  );
}

export function BasketIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.6 8.5h16.8l-1.5 9.7a2 2 0 0 1-2 1.7H7.1a2 2 0 0 1-2-1.7L3.6 8.5Z" />
      <path d="M8.6 8.5V6.8a3.4 3.4 0 0 1 6.8 0v1.7" />
      <path d="M9.6 12.4v3.4M14.4 12.4v3.4" />
    </Svg>
  );
}

export function StoreIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 9.4 5.3 5h13.4L20 9.4" />
      <path d="M4 9.4a2.6 2.6 0 0 0 5.3.6 2.6 2.6 0 0 0 5.4 0 2.6 2.6 0 0 0 5.3-.6" />
      <path d="M5.4 11.6V19a1 1 0 0 0 1 1h11.2a1 1 0 0 0 1-1v-7.4" />
      <path d="M9.8 20v-4.6h4.4V20" />
    </Svg>
  );
}

export function ScanIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 8.4V6a2 2 0 0 1 2-2h2.4M20 8.4V6a2 2 0 0 0-2-2h-2.4M4 15.6V18a2 2 0 0 0 2 2h2.4M20 15.6V18a2 2 0 0 1-2 2h-2.4" />
      <path d="M4 12h16" />
    </Svg>
  );
}

export function ReceiptIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 3.6h12v16.8l-2.4-1.4-2.4 1.4-2.4-1.4-2.4 1.4L6 20.4V3.6Z" />
      <path d="M9 8h6M9 11.6h6M9 15.2h3.4" />
    </Svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg strokeWidth={2.2} {...props}>
      <path d="m5 12.6 4.4 4.4L19 7.4" />
    </Svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Svg strokeWidth={2} {...props}>
      <path d="M12 5.6v12.8M5.6 12h12.8" />
    </Svg>
  );
}

export function MinusIcon(props: IconProps) {
  return (
    <Svg strokeWidth={2} {...props}>
      <path d="M5.6 12h12.8" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg strokeWidth={1.9} {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
    </Svg>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M19 12H5.4" />
      <path d="m11 5.5-5.6 6.5 5.6 6.5" />
    </Svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.6V12l3 1.8" />
    </Svg>
  );
}

export function TruckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 7.4h9.6v8.2H3z" />
      <path d="M12.6 10.4h3.9l2.5 2.7v2.5h-6.4z" />
      <circle cx="7" cy="17.6" r="1.7" />
      <circle cx="16.4" cy="17.6" r="1.7" />
    </Svg>
  );
}

export function PinIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 20.5s6.2-5.4 6.2-10a6.2 6.2 0 1 0-12.4 0c0 4.6 6.2 10 6.2 10Z" />
      <circle cx="12" cy="10.2" r="2.3" />
    </Svg>
  );
}

export function CardIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="5.8" width="18" height="12.4" rx="2.4" />
      <path d="M3 10h18" />
      <path d="M6.6 14.4h3.2" />
    </Svg>
  );
}

export function CashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="6.4" width="18" height="11.2" rx="2.2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6.4 12h.01M17.6 12h.01" />
    </Svg>
  );
}

export function SparkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4.2 13.6 9l4.8 1.6-4.8 1.6L12 17l-1.6-4.8L5.6 10.6 10.4 9 12 4.2Z" />
      <path d="M18.4 16.2l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" />
    </Svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.8 7.2h14.4" />
      <path d="M9.4 7.2V5.6a1.2 1.2 0 0 1 1.2-1.2h2.8a1.2 1.2 0 0 1 1.2 1.2v1.6" />
      <path d="M6.6 7.2 7.6 19a1.4 1.4 0 0 0 1.4 1.3h6a1.4 1.4 0 0 0 1.4-1.3l1-11.8" />
      <path d="M10.4 10.6v6M13.6 10.6v6" />
    </Svg>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 11v5.2M12 7.9h.01" />
    </Svg>
  );
}

export function SlidersIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 8h9M18 8h1M5 16h3M12 16h7" />
      <circle cx="16" cy="8" r="2" />
      <circle cx="10" cy="16" r="2" />
    </Svg>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.6 5.4 6v5.4c0 4 2.8 7.4 6.6 9 3.8-1.6 6.6-5 6.6-9V6L12 3.6Z" />
      <path d="m9.4 12 1.9 1.9 3.5-3.7" />
    </Svg>
  );
}

export function PackageIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.8 4.6 7.6v8.8L12 20.2l7.4-3.8V7.6L12 3.8Z" />
      <path d="M4.6 7.6 12 11.4l7.4-3.8M12 11.4v8.8" />
    </Svg>
  );
}

export function ChefIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.6 12.6h10.8v5.2a1.6 1.6 0 0 1-1.6 1.6H8.2a1.6 1.6 0 0 1-1.6-1.6z" />
      <path d="M6.6 12.6a3.1 3.1 0 0 1-.6-6.1 3.3 3.3 0 0 1 6-1.4 3.3 3.3 0 0 1 6 1.4 3.1 3.1 0 0 1-.6 6.1" />
      <path d="M9.6 15.4v2M12 15.4v2M14.4 15.4v2" />
    </Svg>
  );
}

export function PhoneIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.2 4.6h3l1.4 3.6-2 1.4a10.4 10.4 0 0 0 5 5l1.4-2 3.6 1.4v3a1.6 1.6 0 0 1-1.8 1.6C10.9 18 6 13.1 4.6 6.4A1.6 1.6 0 0 1 6.2 4.6Z" />
    </Svg>
  );
}

export function NoteIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 6.4A1.4 1.4 0 0 1 6.4 5h11.2A1.4 1.4 0 0 1 19 6.4v11.2a1.4 1.4 0 0 1-1.4 1.4H6.4A1.4 1.4 0 0 1 5 17.6Z" />
      <path d="M8.4 9.2h7.2M8.4 12.4h7.2M8.4 15.6h4" />
    </Svg>
  );
}

export function ChartIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.4 19.2h15.2" />
      <path d="M7.2 16.4v-4.6M12 16.4V7.6M16.8 16.4v-6.8" />
    </Svg>
  );
}
