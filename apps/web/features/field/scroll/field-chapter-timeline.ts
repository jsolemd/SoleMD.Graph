export type FieldChapterValueMap<K extends string> = Record<K, number>;

export interface FieldChapterEvent<K extends string> {
  atProgress: number;
  duration?: number;
  ease?: (value: number) => number;
  set?: Partial<FieldChapterValueMap<K>>;
  to?: Partial<FieldChapterValueMap<K>>;
  fromTo?: Partial<Record<K, { from: number; to: number }>>;
}

export interface FieldChapterTimeline<K extends string> {
  sample(seed: FieldChapterValueMap<K>, progress: number): FieldChapterValueMap<K>;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function interpolate(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

export function createFieldChapterTimeline<K extends string>(
  events: readonly FieldChapterEvent<K>[],
): FieldChapterTimeline<K> {
  const sorted = [...events].sort((left, right) => left.atProgress - right.atProgress);

  return {
    sample(seed, progress) {
      const chapterProgress = clamp01(progress);
      const next = { ...seed };

      for (const event of sorted) {
        if (chapterProgress < event.atProgress) continue;
        const ease = event.ease ?? ((value: number) => value);
        const duration = Math.max(event.duration ?? 0, 0);
        const resolvedProgress =
          duration === 0
            ? 1
            : clamp01((chapterProgress - event.atProgress) / duration);
        const eased = ease(resolvedProgress);

        if (event.set) {
          for (const [key, value] of Object.entries(event.set) as Array<
            [K, number | undefined]
          >) {
            if (value == null) continue;
            next[key] = value;
          }
        }

        if (event.to) {
          for (const [key, value] of Object.entries(event.to) as Array<
            [K, number | undefined]
          >) {
            if (value == null) continue;
            const from = next[key];
            next[key] =
              resolvedProgress >= 1 ? value : interpolate(from, value, eased);
          }
        }

        if (event.fromTo) {
          for (const [key, value] of Object.entries(event.fromTo) as Array<
            [K, { from: number; to: number } | undefined]
          >) {
            if (!value) continue;
            next[key] =
              resolvedProgress >= 1
                ? value.to
                : interpolate(value.from, value.to, eased);
          }
        }
      }

      return next;
    },
  };
}
