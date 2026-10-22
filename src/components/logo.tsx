interface LogoProps {
  className?: string
  active?: boolean
  /** When true, the logo is decorative (aria-hidden, no label/role). */
  "aria-hidden"?: boolean | "true" | "false"
}

/**
 * One More Prompt's One Slot Left mark.
 *
 * The ring is a capacity gauge with one deliberately precise opening in the
 * right side. The orange chevron is the next prompt waiting at that
 * opening. Both shapes stay as simple vector paths so they remain crisp in
 * the header, share exports and compact tray-adjacent surfaces.
 */
export const SIGNAL_APERTURE_RING_PATH = "M 205.6 86.6 A 88 88 0 1 0 205.6 169.4"
export const SIGNAL_APERTURE_CHEVRON_PATH = "M 190 112 L 208 128 L 190 144"

export function Logo({ className, active = false, "aria-hidden": ariaHidden }: LogoProps) {
  const decorative = ariaHidden === true || ariaHidden === "true"
  return (
    <svg
      viewBox="0 0 256 256"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : "One More Prompt"}
      role={decorative ? undefined : "img"}
    >
      <g
        className={active ? "signal-aperture-ring signal-aperture-ring-active" : "signal-aperture-ring"}
        data-testid="logo-activity-ring"
        data-active={active ? "true" : "false"}
      >
        <path
          d={SIGNAL_APERTURE_RING_PATH}
          stroke="currentColor"
          strokeWidth="20"
          strokeLinecap="round"
        />
        <g
          className={active ? "signal-aperture-chevron signal-aperture-chevron-active" : "signal-aperture-chevron"}
          data-testid="logo-activity-chevron"
        >
          <path
            d={SIGNAL_APERTURE_CHEVRON_PATH}
            stroke="var(--wire-orange, #F5572F)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </g>
    </svg>
  )
}
