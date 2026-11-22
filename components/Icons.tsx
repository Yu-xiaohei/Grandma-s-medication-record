import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export function IconCheck({ size = 18, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M4.5 12.5l4.5 4.5L19.5 6.5" />
    </svg>
  );
}

export function IconClock({ size = 18, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function IconAlert({ size = 18, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M12 4.5l8.5 15H3.5z" />
      <path d="M12 9.5v4" />
      <path d="M12 16.6h.01" />
    </svg>
  );
}

export function IconDrop({ size = 18, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M12 3.5s6 6.2 6 10a6 6 0 1 1-12 0c0-3.8 6-10 6-10z" />
    </svg>
  );
}

export function IconHeart({ size = 18, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M12 20s-7.5-4.6-7.5-9.6A4.4 4.4 0 0 1 12 7.4a4.4 4.4 0 0 1 7.5 3C19.5 15.4 12 20 12 20z" />
    </svg>
  );
}

export function IconBed({ size = 18, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M3.5 18.5V9" />
      <path d="M3.5 12.5h13a4 4 0 0 1 4 4v2" />
      <path d="M7.5 12.5V9.5h4v3" />
    </svg>
  );
}

export function IconChevron({ size = 18, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function IconClose({ size = 18, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function IconCalendar({ size = 18, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 10h17M8.5 3.5v3M15.5 3.5v3" />
    </svg>
  );
}

export function IconPill({ size = 18, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <rect x="2.6" y="8.6" width="18.8" height="6.8" rx="3.4" transform="rotate(-40 12 12)" />
      <path d="M9.1 5.6l9.3 5.5" />
    </svg>
  );
}

export function IconBowl({ size = 18, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M3.5 11h17a8.5 8.5 0 0 1-17 0z" />
      <path d="M7 7.4c0-1.4 1-1.6 1-3M12 6.6c0-1.4 1-1.6 1-3M17 7.4c0-1.4 1-1.6 1-3" />
    </svg>
  );
}

export function IconCup({ size = 18, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M6 6.5h11l-1.2 12.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8z" />
      <path d="M17.6 9.5h1.6a2.4 2.4 0 0 1 0 4.8h-1.2" />
    </svg>
  );
}

export function IconLock({ size = 18, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <rect x="4.5" y="10" width="15" height="10.5" rx="3" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
    </svg>
  );
}

export function IconLogout({ size = 18, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M14.5 4.5H6.2A2.2 2.2 0 0 0 4 6.7v10.6a2.2 2.2 0 0 0 2.2 2.2h8.3" />
      <path d="M16 8.5l4 3.5-4 3.5M20 12h-9" />
    </svg>
  );
}

export function IconMegaphone({ size = 18, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M4 10.5v3a1.5 1.5 0 0 0 1.5 1.5H8l6.5 4V5L8 9H5.5A1.5 1.5 0 0 0 4 10.5z" />
      <path d="M18.5 9a4.5 4.5 0 0 1 0 6" />
    </svg>
  );
}

export function IconShield({ size = 18, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M12 3.2l7 2.6v5.6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V5.8z" />
    </svg>
  );
}

export function IconEdit({ size = 18, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M4.5 19.5l.9-4 10-10a2.2 2.2 0 0 1 3.1 3.1l-10 10z" />
      <path d="M13.8 6.2l4 4" />
    </svg>
  );
}

export function IconLockOpen({ size = 18, ...rest }: P) {
  return (
    <svg {...base(size)} {...rest}>
      <rect x="4.5" y="10" width="15" height="10.5" rx="3" />
      <path d="M8 10V7.5a4 4 0 0 1 7.6-1.6" />
    </svg>
  );
}

const MAP = {
  drop: IconDrop,
  heart: IconHeart,
  bed: IconBed,
  pill: IconPill,
  bowl: IconBowl,
  cup: IconCup,
  shield: IconShield,
} as const;

export function IconByName({ name, size = 18 }: { name: keyof typeof MAP; size?: number }) {
  const C = MAP[name];
  return <C size={size} />;
}