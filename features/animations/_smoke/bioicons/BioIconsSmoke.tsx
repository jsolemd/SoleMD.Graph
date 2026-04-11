"use client";
/**
 * Adapted from BioIcons — Voltage-Gated Calcium Channel.
 * Contributor: Marcel Tisch. License: CC0 (public domain).
 * Source: https://bioicons.com/ (static/icons/cc-0/Receptors_channels/Marcel_Tisch/calcium_channel.svg)
 *
 * Only the subunit fills in the `<style>` block have been remapped to
 * SoleMD brand tokens. The underlying geometry — α₁/α₂-δ/β/γ subunits,
 * lipid bilayer heads, phosphorylation markers — is unchanged.
 */
import { motion, useReducedMotion } from "framer-motion";
import { canvasReveal } from "@/lib/motion";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 106.62 95.78" width="100%" height="100%">
<defs><style>
.cls-1{fill:var(--color-golden-yellow);}
.cls-1,.cls-10,.cls-12,.cls-13,.cls-3,.cls-4,.cls-5,.cls-6,.cls-7,.cls-8,.cls-9{stroke:currentColor;stroke-miterlimit:10;opacity:0.92;}
.cls-1,.cls-10,.cls-12,.cls-13,.cls-3,.cls-4,.cls-8{stroke-width:0.2px;}
.cls-14,.cls-2{font-size:7.97px;}
.cls-2{font-family:CambriaMath, Cambria Math;}
.cls-3{fill:var(--surface);opacity:0.85;}
.cls-4{fill:none;opacity:0.55;}
.cls-5,.cls-6,.cls-7,.cls-8,.cls-9{fill:var(--color-fresh-green);}
.cls-5{stroke-width:0.25px;}
.cls-6{stroke-width:0.14px;}
.cls-7{stroke-width:0.18px;}
.cls-9{stroke-width:0.18px;}
.cls-10{fill:var(--color-soft-blue);}
.cls-11{opacity:0.17;}
.cls-12{fill:var(--color-golden-yellow);opacity:0.85;}
.cls-13{fill:var(--color-soft-lavender);}
.cls-14{font-family:MyriadPro-It, Myriad Pro;font-style:italic;letter-spacing:0em;}
</style></defs>
<g>
<path class="cls-5" d="M39.87,54s12.69-9.15,21.57,0l.83-32.73c0-1.62-1.48-3.1-3.83-3.67-3.44-.84-8.52-1.35-12.62,1.29C38.94,23.35,39.87,54,39.87,54Z"/>
<ellipse class="cls-6" cx="53.11" cy="18.3" rx="5" ry="2.14"/>
<ellipse class="cls-7" cx="47" cy="20.11" rx="5.71" ry="3.09" transform="translate(-2.14 6.01) rotate(-7.15)"/>
<ellipse class="cls-8" cx="44.41" cy="22.85" rx="5.71" ry="3.72" transform="translate(-5.53 23.17) rotate(-27.6)"/>
<ellipse class="cls-9" cx="59.14" cy="20.05" rx="3.12" ry="5.71" transform="translate(31.86 76.23) rotate(-82.83)"/>
<path class="cls-10" d="M63.22,22a22.05,22.05,0,0,0-4.17-3.08A8.85,8.85,0,0,1,54.9,9.25C55.42,6.6,56.25,3.51,58.64,2,62-.23,66.58.07,70.42.17a46.4,46.4,0,0,1,13.6,2A25,25,0,0,1,94.55,8.82c1.91,2.08,3.92,4.88,4.16,7.79.34,4.13-3.22,5.17-6.65,5.68a101.38,101.38,0,0,1-14,1.07c-2.46,0-5.2,0-7,1.73-.83.77-1.45,1.89-2.55,2.16a3,3,0,0,1-2.9-1.42c-.66-.93-1-2-1.66-3A6,6,0,0,0,63.22,22Z"/>
<ellipse class="cls-8" cx="61.75" cy="22.85" rx="3.72" ry="5.71" transform="translate(14.96 69.18) rotate(-65.03)"/>
<path class="cls-8" d="M73.86,43.4c.62,10.6,19,18.74-4.08,17.71-14.83-.66-13-8.6-13-19.21s-2.24-21.2,1.78-21.2C61.32,20.7,72.84,26.05,73.86,43.4Z"/>
<path class="cls-11" d="M48.8,37.11c0,10-3.34,13.73-2.28,13.73s6.13-3.68,6.13-13.73.52-17.8-2.88-14.26c-1,1-1.68-.29-2,1.27C47.23,27.28,48.8,30.4,48.8,37.11Z"/>
<path class="cls-12" d="M27.79,19a8.81,8.81,0,0,0-5.59,2,7.75,7.75,0,0,0-1.94,7.05c.54,3.08,2.39,5.63,3.49,8.5,1,2.67,1.16,5.66,2.51,8.18a2.06,2.06,0,0,0,.54.7,2.23,2.23,0,0,0,1.17.31c2.07.17,5.88.21,5.88-2.74A31.41,31.41,0,0,1,36,31.91c.93-2.42,3.7-5.27,3.27-7.83-.48-2.78-3.87-3.64-6.73-4.49A15.27,15.27,0,0,0,27.79,19Z"/>
<path class="cls-8" d="M32.22,42.09C31.6,52.68,2.65,59.8,36.29,59.8c4,0,13-8.6,13-19.21s2.35-20.1-1.67-20.1S33.24,24.74,32.22,42.09Z"/>
<ellipse class="cls-13" cx="71.42" cy="70.5" rx="15.27" ry="9.3"/>
<circle class="cls-1" cx="29.7" cy="63.03" r="3.98"/>
<circle class="cls-1" cx="71.77" cy="82.81" r="3.98"/>
<text class="cls-2" x="26.66" y="29.33" fill="currentColor">γ</text>
<text class="cls-2" x="70.74" y="13.7" fill="currentColor">α</text>
<text class="cls-2" x="75.32" y="16.36" font-size="4.62" fill="currentColor">2</text>
<text class="cls-2" x="77.89" y="13.7" fill="currentColor">δ</text>
<text class="cls-2" x="37.43" y="36.57" fill="currentColor">α</text>
<text class="cls-14" x="42.01" y="39.22" font-size="4.62" fill="currentColor">1</text>
<text class="cls-2" x="69.36" y="73.89" fill="currentColor">β</text>
</g>
</svg>`;

export default function BioIconsSmoke() {
  const reduced = useReducedMotion();
  return (
    <motion.div
      {...canvasReveal}
      className="flex h-[280px] w-full items-center justify-center"
      style={{ color: "var(--text-primary)" }}
    >
      <motion.div
        className="flex h-full w-auto max-h-[240px] items-center justify-center"
        initial={{ scale: 0.96, opacity: 0 }}
        animate={reduced ? { scale: 1, opacity: 1 } : { scale: [1, 1.02, 1], opacity: 1 }}
        transition={
          reduced
            ? { duration: 0.3, ease: "easeOut" }
            : {
                scale: { duration: 3.2, ease: "easeInOut", repeat: Infinity },
                opacity: { duration: 0.3, ease: "easeOut" },
              }
        }
        style={{ transformOrigin: "center" }}
        dangerouslySetInnerHTML={{ __html: SVG }}
      />
    </motion.div>
  );
}
