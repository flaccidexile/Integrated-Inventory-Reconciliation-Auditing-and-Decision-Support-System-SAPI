import { Star } from "lucide-react";

export function StarRating({ rating, label }: { rating: number; label?: string }) {
  return (
    <div
      className="flex items-center gap-0.5"
      role="img"
      aria-label={label ?? `Rated ${rating} out of 5`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={11}
          aria-hidden="true"
          className={
            i <= Math.floor(rating)
              ? "text-amber-400 fill-amber-400"
              : "text-gray-300 fill-gray-200"
          }
        />
      ))}
      <span className="text-[11px] text-[#6c757d] ml-1" style={{ fontVariantNumeric: "tabular-nums" }}>
        {rating}
      </span>
    </div>
  );
}
