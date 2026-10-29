/** Fake 2D context: records calls, remembers property sets. */
export function fakeCtx() {
  const calls: string[] = []
  const props: Record<string, unknown> = {}
  const maxBlur = { v: 0 }
  const trailStrokes = { v: 0 }
  const trailSegments = { v: 0 }
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, k: string) =>
      k in props
        ? props[k]
        : (...a: unknown[]) => {
            calls.push(`${k}(${a.join(',')})`)
            if (k === 'stroke' && props.lineWidth === 2 && props.strokeStyle === '#7fffd4') trailStrokes.v++
            if (k === 'lineTo' && props.lineWidth === 2 && props.strokeStyle === '#7fffd4') trailSegments.v++
          },
    set: (_t, k: string, val) => {
      props[k] = val
      if (k === 'shadowBlur') maxBlur.v = Math.max(maxBlur.v, val as number)
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, calls, maxBlur, trailStrokes, trailSegments }
}
