import type { MenubarIconStyle } from "@/lib/settings"

/** Windows allocates one square slot rather than a variable-width menu-bar item. */
export function makeSquareWindowsTraySvg({ sizePx, style, percentText, baseSvg, isDark = false }: {
  sizePx: number
  style: MenubarIconStyle
  percentText?: string
  baseSvg: string
  isDark?: boolean
}): string {
  const top = percentText?.trim()
  if (style !== "bars" && style !== "donut" && top && top !== "--%") {
    const rawDigits = top.replace(/%$/, "")
    const digits = rawDigits.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    const context = document.createElement("canvas").getContext("2d")
    if (!context) throw new Error("Canvas 2D context missing")
    let fontSize = 100
    let metrics: TextMetrics
    // Small-size font hinting changes ink bounds; measure again at the final size.
    for (let pass = 0; pass < 3; pass++) {
      context.font = `700 ${fontSize}px "Segoe UI", sans-serif`
      metrics = context.measureText(rawDigits)
      const scale = Math.min(
        (sizePx - 3) / (metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight),
        (sizePx - 3) / (metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent),
      )
      if (scale >= 1) break
      fontSize = Math.floor(fontSize * scale * 4) / 4
    }
    context.font = `700 ${fontSize}px "Segoe UI", sans-serif`
    metrics = context.measureText(rawDigits)
    const width = metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight
    const height = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent
    const x = (sizePx - width) / 2 + metrics.actualBoundingBoxLeft
    const y = (sizePx - height) / 2 + metrics.actualBoundingBoxAscent
    const fill = isDark ? "#ff744d" : "#b73717"
    return `<svg width="${sizePx}" height="${sizePx}" viewBox="0 0 ${sizePx} ${sizePx}" xmlns="http://www.w3.org/2000/svg"><text x="${x}" y="${y}" fill="${fill}" font-family="'Segoe UI',sans-serif" font-weight="700" font-size="${fontSize}">${digits}</text></svg>`
  }

  let content = baseSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1] ?? ""
  if (style === "donut") {
    const donutX = sizePx + Math.max(1, Math.round(sizePx * 0.06))
    content = `<g transform="translate(-${donutX} 0)">${content}</g>`
    // Windows does not template icons; outline white artwork for both taskbar themes.
    const outline = content.replace(/stroke-width="([\d.]+)"/g, (_, width: string) => `stroke-width="${Number(width) + 1.2}"`)
    content = outline + content.replace(/stroke="black"/g, 'stroke="white"')
  } else if (style === "bars") {
    content = content.replace(/fill="black"/g, 'fill="white"')
  }
  return `<svg width="${sizePx}" height="${sizePx}" viewBox="0 0 ${sizePx} ${sizePx}" xmlns="http://www.w3.org/2000/svg"><g stroke="black" stroke-width="0.6" paint-order="stroke">${content}</g></svg>`
}
