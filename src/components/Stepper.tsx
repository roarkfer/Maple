import { useEffect, useRef, useState } from "react";

function DigitWheel({
  digit,
  onDigit,
}: {
  digit: number;
  onDigit: (digit: number) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ITEM_HEIGHT = 32;

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = digit * ITEM_HEIGHT;
  }, [digit]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <div
      ref={ref}
      onScroll={() => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          const el = ref.current;
          if (!el) return;

          const nextDigit = Math.max(
            0,
            Math.min(9, Math.round(el.scrollTop / ITEM_HEIGHT)),
          );

          el.scrollTo({
            top: nextDigit * ITEM_HEIGHT,
            behavior: "smooth",
          });

          onDigit(nextDigit);
        }, 120);
      }}
      className="h-24 w-9 snap-y snap-mandatory overflow-y-auto overscroll-contain rounded border border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div style={{ height: ITEM_HEIGHT }} />

      {Array.from({ length: 10 }).map((_, value) => (
        <div
          key={value}
          style={{ height: ITEM_HEIGHT }}
          className={`flex snap-center items-center justify-center text-[17px] tabular-nums ${
            value === digit ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          {value}
        </div>
      ))}

      <div style={{ height: ITEM_HEIGHT }} />
    </div>
  );
}

/**
 * Reemplazo independiente del Stepper de Maple.
 *
 * - Sin TanStack Router.
 * - Sin Lovable.
 * - Solo depende de React y de las clases Tailwind ya usadas por Maple.
 * - Mantiene el comportamiento del archivo original: valores enteros de 0 a 99.
 * - Mantén presionado el número ~800 ms para abrir las ruedas.
 */
export default function Stepper({
  value,
  onChange,
  min = 0,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  step?: number;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const normalized = Math.max(0, Math.min(99, Math.round(value)));
  const tens = Math.floor(normalized / 10);
  const units = normalized % 10;

  const startLongPress = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      setOpen(true);
    }, 800);
  };

  const cancelLongPress = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const setDigits = (nextTens: number, nextUnits: number) => {
    onChange(Math.max(min, nextTens * 10 + nextUnits));
  };

  return (
    <div className="relative flex items-center justify-center">
      <span
        role="button"
        tabIndex={0}
        aria-label={`Modificar ${label}`}
        onPointerDown={startLongPress}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
        onPointerCancel={cancelLongPress}
        onContextMenu={(event) => event.preventDefault()}
        className={`min-w-8 select-none rounded px-1 text-center text-[17px] tabular-nums ${
          open ? "bg-foreground text-background" : ""
        }`}
      >
        {normalized}
      </span>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onPointerDown={() => setOpen(false)}
          />

          <div className="absolute left-1/2 top-full z-50 mt-1 flex -translate-x-1/2 gap-1 rounded-md border border-border bg-background p-1 shadow-lg">
            <DigitWheel
              digit={tens}
              onDigit={(digit) => setDigits(digit, units)}
            />
            <DigitWheel
              digit={units}
              onDigit={(digit) => setDigits(tens, digit)}
            />
          </div>
        </>
      )}
    </div>
  );
}
