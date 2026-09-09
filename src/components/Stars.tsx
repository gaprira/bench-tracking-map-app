"use client";

type Props = {
  value: number;
  onChange?: (v: number) => void;
  size?: "sm" | "md" | "lg";
};

const sizes = { sm: "text-sm", md: "text-xl", lg: "text-3xl" };

export default function Stars({ value, onChange, size = "md" }: Props) {
  const interactive = Boolean(onChange);
  return (
    <div className={`inline-flex gap-0.5 ${sizes[size]} leading-none`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= Math.round(value);
        return (
          <button
            key={n}
            type="button"
            disabled={!interactive}
            onClick={() => onChange?.(n)}
            aria-label={`${n} из 5`}
            className={`${
              filled ? "text-amber-400" : "text-slate-300"
            } ${interactive ? "cursor-pointer transition hover:scale-110" : "cursor-default"}`}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}
