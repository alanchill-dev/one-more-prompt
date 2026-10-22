import { useLayoutEffect, useRef, type RefObject } from "react"

/** Fade only: chart, reader, and drill-down geometry must never move with navigation. */
export function useWorkspacePageMotion(
  pageKey: string,
  surfaceRef: RefObject<HTMLElement | null>,
  skipMotion: boolean,
) {
  const previousPage = useRef(pageKey)

  useLayoutEffect(() => {
    const changed = previousPage.current !== pageKey
    previousPage.current = pageKey
    const surface = surfaceRef.current
    if (!changed || skipMotion || !surface || typeof surface.animate !== "function") return

    const animation = surface.animate([{ opacity: .72 }, { opacity: 1 }], {
      duration: 240,
      easing: "cubic-bezier(.22, 1, .36, 1)",
    })
    return () => animation.cancel()
  }, [pageKey, surfaceRef, skipMotion])
}
