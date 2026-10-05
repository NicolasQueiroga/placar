import { useEffect, useRef, useState } from 'react';

/** Number that counts up to its new value and flashes on change. */
export function CountUp({
  value,
  format = (v: number) => v.toLocaleString('pt-BR'),
  className,
  duration = 900,
}: {
  value: number;
  format?: (v: number) => string;
  className?: string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(value);
  const [flash, setFlash] = useState(false);
  const prev = useRef(value);
  const raf = useRef<number>(0);

  useEffect(() => {
    if (value === prev.current) return;
    setFlash(true);
    const from = prev.current;
    const to = value;
    prev.current = value;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    const clear = setTimeout(() => setFlash(false), 1300);
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
