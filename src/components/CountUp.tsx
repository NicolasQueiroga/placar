import { useEffect, useRef, useState } from 'react';

/** Number that counts up to its new value and flashes on change. */
export function CountUp({
  value,
  format = (v: number) => Math.round(v).toLocaleString('pt-BR'),
  className,
  duration = 250,
}: {
  value: number;
  format?: (v: number) => string;
  className?: string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(value);
  const [flash, setFlash] = useState(false);
  const prev = useRef(value);
  const current = useRef(value);
  const raf = useRef<number>(0);

  useEffect(() => {
    if (value === prev.current) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const from = current.current;
    const to = value;
    prev.current = value;
    if (reduceMotion.matches || duration <= 0) {
      current.current = to;
      setDisplay(to);
      setFlash(false);
      return;
    }
    setFlash(true);
    const start = performance.now();
    const step = (now: number) => {
      const t = reduceMotion.matches ? 1 : Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      current.current = t === 1 ? to : from + (to - from) * eased;
      setDisplay(current.current);
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    const clear = setTimeout(() => setFlash(false), 300);
    return () => {
      cancelAnimationFrame(raf.current);
      clearTimeout(clear);
    };
  }, [value, duration]);

  return (
    <span className={`num ${className ?? ''} ${flash ? 'tick-up' : ''}`}>
      {format(display)}
    </span>
  );
}
