'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ClinicalPearl } from './data';
import { PearlCard } from './PearlCard';

interface PearlCarouselProps {
  pearls: ClinicalPearl[];
  searchQuery?: string;
  onBookmark?: (pearlId: string) => void;
  bookmarkedPearls?: Set<string>;
  className?: string;
}

export function PearlCarousel({
  pearls,
  searchQuery = '',
  onBookmark,
  bookmarkedPearls = new Set(),
  className = ''
}: PearlCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'center',
    containScroll: 'trimSnaps',
    dragFree: false,
    loop: false,
    skipSnaps: false,
    startIndex: 0
  });

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  // Check for reduced motion preference
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext();
  }, [emblaApi]);

  const scrollTo = useCallback(
    (index: number) => {
      if (emblaApi) emblaApi.scrollTo(index);
    },
    [emblaApi]
  );

  const onInit = useCallback((emblaApi: NonNullable<typeof emblaApi>) => {
    setScrollSnaps(emblaApi.scrollSnapList());
  }, []);

  const onSelect = useCallback((emblaApi: NonNullable<typeof emblaApi>) => {
    setSelectedIndex(emblaApi.selectedScrollSnap());
    setCanScrollPrev(emblaApi.canScrollPrev());
    setCanScrollNext(emblaApi.canScrollNext());
  }, []);

  useEffect(() => {
    if (!emblaApi) return;

    onInit(emblaApi);
    onSelect(emblaApi);

    emblaApi.on('reInit', onInit);
    emblaApi.on('select', onSelect);

    return () => {
      emblaApi.off('reInit', onInit);
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi, onInit, onSelect]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!emblaApi) return;

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          scrollPrev();
          break;
        case 'ArrowRight':
          event.preventDefault();
          scrollNext();
          break;
        case 'Home':
          event.preventDefault();
          scrollTo(0);
          break;
        case 'End':
          event.preventDefault();
          scrollTo(pearls.length - 1);
          break;
      }
    };

    const element = document.querySelector('[data-pearl-carousel]');
    if (element) {
      element.addEventListener('keydown', handleKeyDown);
      return () => element.removeEventListener('keydown', handleKeyDown);
    }
  }, [emblaApi, scrollPrev, scrollNext, scrollTo, pearls.length]);

  if (pearls.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 text-gray-500">
        <div className="text-center">
          <div className="text-lg font-medium mb-2">No pearls found</div>
          <div className="text-sm">Try adjusting your search or filters</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} data-pearl-carousel>
      {/* Carousel container */}
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex ml-[calc(50vw-160px)]">
          <AnimatePresence>
            {pearls.map((pearl, index) => (
              <motion.div
                key={pearl.id}
                className="flex-[0_0_auto] min-w-0 pl-4 first:pl-0"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{
                  duration: reducedMotion ? 0.1 : 0.5,
                  delay: reducedMotion ? 0 : index * 0.1,
                  ease: [0.23, 1, 0.32, 1]
                }}
              >
                <PearlCard
                  pearl={pearl}
                  isActive={index === selectedIndex}
                  searchQuery={searchQuery}
                  onBookmark={onBookmark}
                  isBookmarked={bookmarkedPearls.has(pearl.id)}
                  reducedMotion={reducedMotion}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Navigation buttons */}
      <motion.button
        className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-full shadow-lg flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed z-10"
        onClick={scrollPrev}
        disabled={!canScrollPrev}
        whileHover={!reducedMotion ? { scale: 1.05 } : undefined}
        whileTap={!reducedMotion ? { scale: 0.95 } : undefined}
        aria-label="Previous pearl"
      >
        <ChevronLeft size={20} />
      </motion.button>

      <motion.button
        className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-full shadow-lg flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed z-10"
        onClick={scrollNext}
        disabled={!canScrollNext}
        whileHover={!reducedMotion ? { scale: 1.05 } : undefined}
        whileTap={!reducedMotion ? { scale: 0.95 } : undefined}
        aria-label="Next pearl"
      >
        <ChevronRight size={20} />
      </motion.button>

      {/* Dots indicator */}
      <div className="flex justify-center mt-8 space-x-2">
        {scrollSnaps.map((_, index) => (
          <motion.button
            key={index}
            className={`w-2 h-2 rounded-full transition-colors duration-200 ${
              index === selectedIndex
                ? 'bg-blue-500'
                : 'bg-gray-300 hover:bg-gray-400'
            }`}
            onClick={() => scrollTo(index)}
            whileHover={!reducedMotion ? { scale: 1.2 } : undefined}
            whileTap={!reducedMotion ? { scale: 0.9 } : undefined}
            aria-label={`Go to pearl ${index + 1} of ${pearls.length}`}
          />
        ))}
      </div>

      {/* Status */}
      <div className="text-center mt-4 text-sm text-gray-500">
        {selectedIndex + 1} of {pearls.length} clinical pearls
      </div>

      {/* Keyboard hints */}
      <div className="text-center mt-2 text-xs text-gray-400">
        Use ← → arrow keys to navigate • Enter to flip cards
      </div>
    </div>
  );
}

interface CarouselProgressProps {
  current: number;
  total: number;
  className?: string;
}

export function CarouselProgress({ current, total, className = '' }: CarouselProgressProps) {
  const progress = (current / (total - 1)) * 100;

  return (
    <div className={`w-full ${className}`}>
      <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-blue-500 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-500 mt-1">
        <span>1</span>
        <span>{total}</span>
      </div>
    </div>
  );
}