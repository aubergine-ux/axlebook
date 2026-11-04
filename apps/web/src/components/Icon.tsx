import { ICON_PATHS, type IconName } from './icons.gen';

export type { IconName };

/**
 * Brand product icon (logo-assets/icons). Strokes with currentColor, so it takes the text
 * colour it sits in. Decorative by default; pass `label` when the icon stands alone.
 */
export function Icon({
  name,
  size = 20,
  label,
  className,
}: {
  name: IconName;
  size?: 16 | 20 | 24 | 32;
  label?: string;
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {label && <title>{label}</title>}
      {ICON_PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
