import { renderHook, act, type RenderHookResult } from "@testing-library/react";

/**
 * Wraps `renderHook` with a render counter. Each time React calls the hook
 * (initial render + re-renders), the counter increments.
 */
export function renderHookWithCount<R>(hookFn: () => R) {
  let count = 0;
  const wrapped = renderHook(() => {
    count++;
    return hookFn();
  });
  return {
    ...wrapped,
    renderCount: () => count,
    resetCount: () => { count = 0; },
  };
}

/**
 * Captures `result.current[key]` references before a mutation, runs mutation
 * inside `act()`, then asserts each key is the same JS reference (`toBe`).
 * `toBe` fails when a `useMemo` returns a new array/object/function — `toEqual`
 * would still pass and miss the regression.
 */
export async function expectStableReferences<R extends Record<string, unknown>>(
  result: RenderHookResult<R, unknown>["result"],
  keys: (keyof R & string)[],
  mutation: () => void,
) {
  const before = Object.fromEntries(keys.map((k) => [k, result.current[k]]));
  await act(() => mutation());
  for (const key of keys) {
    expect(result.current[key]).toBe(before[key]);
  }
}
