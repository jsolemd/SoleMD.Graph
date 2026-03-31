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
    setOpacity(0)
    const timer = setTimeout(() => setOpacity(1), 50)
    return () => clearTimeout(timer)
  }, [isDark])

  return opacity
}
