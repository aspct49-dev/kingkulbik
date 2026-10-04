import { useCallback, useLayoutEffect, useRef } from 'react'

/**
 * A callback whose identity never changes but which always runs the latest
 * version of `fn`. Lets memoized children skip re-rendering when only the
 * parent's handlers were re-created.
 */
export function useStableCallback<Args extends unknown[], R>(fn: (...args: Args) => R) {
  const ref = useRef(fn)
  useLayoutEffect(() => {
    ref.current = fn
  })
  return useCallback((...args: Args) => ref.current(...args), [])
}
