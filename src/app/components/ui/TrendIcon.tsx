import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { Trend } from "../../types";

export function TrendIcon({ trend, size = 14 }: { trend: Trend; size?: number }) {
  if (trend === "up") {
    return <ArrowUpRight size={size} className="text-green-600" aria-hidden="true" />;
  }
  if (trend === "down") {
    return <ArrowDownRight size={size} className="text-red-500" aria-hidden="true" />;
  }
  return <Minus size={size} className="text-gray-400" aria-hidden="true" />;
}
