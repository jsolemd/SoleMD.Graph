"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Returns a [0, 1] opacity that briefly dips on theme toggle, masking
 * the WebGL color snap with a smooth crossfade. Pair with a CSS
 * `transition: opacity` on the canvas wrapper.
 */
export function useThemeCrossfade(isDark: boolean): number {
  const prevRef = useRef(isDark)
  const [opacity, setOpacity] = useState(1)

  useEffect(() => {
    if (prevRef.current === isDark) return
    prevRef.current = isDark
    // Fade out — CSS transition handles the visual easing
    setOpacity(0)
    // Fade back in after Cosmograph has repainted with new colors
    const timer = setTimeout(() => setOpacity(1), 120)
    return () => clearTimeout(timer)
  }, [isDark])

  return opacity
}
