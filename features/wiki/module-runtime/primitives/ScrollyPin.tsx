"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { usePrefersReducedMotion } from "@/features/wiki/module-runtime/motion";

gsap.registerPlugin(ScrollTrigger);

interface ScrollyPinProps {
  children: React.ReactNode;
  pinDuration?: number;
  id?: string;
  className?: string;
}

export function ScrollyPin({
  children,
  pinDuration = 2,
  id,
  className,
}: ScrollyPinProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced || !containerRef.current || !pinRef.current) return;

    const trigger = ScrollTrigger.create({
      trigger: containerRef.current,
      pin: pinRef.current,
      start: "top top",
      end: `+=${pinDuration * 100}vh`,
      pinSpacing: false,
    });

    return () => {
      trigger.kill();
    };
  }, [pinDuration, reduced]);

  if (reduced) {
    return (
      <div id={id} className={className}>
        {children}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      id={id}
      className={className}
      style={{ height: `${pinDuration * 100}vh` }}
    >
      <div ref={pinRef}>{children}</div>
    </div>
  );
}
