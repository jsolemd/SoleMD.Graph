
'use client';

import { useState, useEffect } from 'react';
import { motion, useAnimation } from 'framer-motion';
import Lottie from 'lottie-react';
import { useWindowScroll } from '@mantine/hooks';
import animationData from '@/lib/animations/lottie-scroll-down.json';

const ScrollDownLottie = () => {
  const [scroll] = useWindowScroll();
  const controls = useAnimation();
  const [hasScrolled, setHasScrolled] = useState(false);

  useEffect(() => {
    const isScrolled = scroll.y > 0;
    if (isScrolled && !hasScrolled) {
      setHasScrolled(true);
    }
  }, [scroll.y, hasScrolled]);

  useEffect(() => {
    if (hasScrolled) {
      controls.start({
        opacity: 0,
        transition: { duration: 0.5, ease: 'easeOut' },
      });
    } else {
      controls.start({
        opacity: 1,
        transition: { duration: 0.5, ease: 'easeIn' },
      });
    }
  }, [hasScrolled, controls]);

  return (
    <motion.div
      className="absolute bottom-10 left-1/2 -translate-x-1/2 z-50"
      animate={controls}
      initial={{ opacity: 1 }}
    >
      <Lottie
        animationData={animationData}
        loop
        autoplay
        style={{ width: 100, height: 100 }}
      />
    </motion.div>
  );
};

export default ScrollDownLottie;
