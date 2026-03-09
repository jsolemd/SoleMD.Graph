import { useCallback, useRef } from "react";
import { clamp } from "@/lib/helpers";

export function useDragResize(opts: {
  height: number;
  min: number;
  max: number;
  onResize: (h: number) => void;
}): { onMouseDown: (e: React.MouseEvent) => void } {
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startY: e.clientY, startHeight: opts.height };

      const handleMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const delta = dragRef.current.startY - ev.clientY;
        opts.onResize(clamp(dragRef.current.startHeight + delta, opts.min, opts.max));
      };

      const handleUp = () => {
        dragRef.current = null;
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [opts]
  );

  return { onMouseDown };
}
