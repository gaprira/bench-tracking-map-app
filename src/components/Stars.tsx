"use client";

type Props = {
  value: number;
  onChange?: (v: number) => void;
  size?: "sm" | "md" | "lg";
  /** Цвет пустых звёзд: на тёмном фоне нужен полупрозрачный белый */
  tone?: "light" | "dark";
};

const sizes = { sm: 14, md: 20, lg: 34 };

const STAR_PATH =
  "M12 2.5l2.9 6.06 6.6.8-4.87 4.56 1.25 6.58L12 17.3l-5.88 3.2 1.25-6.58L2.5 9.36l6.6-.8L12 2.5z";

export default function Stars({ value, onChange, size = "md", tone = "light" }: Props) {
  const interactive = Boolean(onChange);
  const px = sizes[size];
  const empty = tone === "dark" ? "text-white/25" : "text-sand-dark";
  return (
    <div className={`inline-flex ${size === "lg" ? "gap-1.5" : "gap-0.5"}`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= Math.round(value);
        return (
          <button
            key={n}
            type="button"
            disabled={!interactive}
            onClick={() => onChange?.(n)}
            aria-label={`${n} из 5`}
            className={`${filled ? "text-sun" : empty} ${
              interactive
                ? "cursor-pointer transition duration-200 hover:-translate-y-0.5 hover:scale-110 active:scale-95"
                : "cursor-default"
            }`}
          >
            <svg width={px} height={px} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d={STAR_PATH} strokeLinejoin="round" />
            </svg>
          </button>
        );
      })}
    </div>
  );
}
