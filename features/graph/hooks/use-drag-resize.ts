import { useCallback, useEffect, useRef } from "react";
import { clamp } from "@/lib/helpers";

export function useDragResize(opts: {
  height: number;
  min: number;
  max: number;
  onResize: (h: number) => void;
}): { onMouseDown: (e: React.MouseEvent) => void } {
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const listenersRef = useRef<{ move: (ev: MouseEvent) => void; up: () => void } | null>(null);

  const { height, min, max, onResize } = opts;
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startY: e.clientY, startHeight: height };

      const handleMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const delta = dragRef.current.startY - ev.clientY;
        onResize(clamp(dragRef.current.startHeight + delta, min, max));
      };

      const handleUp = () => {
        dragRef.current = null;
        listenersRef.current = null;
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
      };

      listenersRef.current = { move: handleMove, up: handleUp };
      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [height, min, max, onResize]
  );

  // Clean up document listeners if component unmounts mid-drag
  useEffect(() => {
    return () => {
      if (listenersRef.current) {
        document.removeEventListener("mousemove", listenersRef.current.move);
        document.removeEventListener("mouseup", listenersRef.current.up);
      }
    };
  }, []);

  return { onMouseDown };
}
