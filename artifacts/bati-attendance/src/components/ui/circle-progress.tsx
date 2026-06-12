import { cn } from "@/lib/utils";
import React from "react";

interface CircleProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  maxValue: number;
  size?: number;
  strokeWidth?: number;
  getColor?: (pct: number) => string;
  disableAnimation?: boolean;
}

export function CircleProgress({
  value,
  maxValue,
  size = 48,
  strokeWidth = 4,
  getColor,
  disableAnimation = false,
  className,
  ...props
}: CircleProgressProps) {
  const [animated, setAnimated] = React.useState(disableAnimation ? value : 0);
  const animRef = React.useRef(animated);

  React.useEffect(() => { animRef.current = animated; }, [animated]);

  React.useEffect(() => {
    if (disableAnimation) { setAnimated(value); return; }
    const start = animRef.current;
    const end = Math.min(value, maxValue);
    if (start === end) return;
    const startTime = performance.now();
    const duration = 600;
    const frame = (ts: number) => {
      const p = Math.min((ts - startTime) / duration, 1);
      const ease = 1 - (1 - p) * (1 - p);
      setAnimated(start + (end - start) * ease);
      if (p < 1) requestAnimationFrame(frame);
    };
    const id = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(id);
  }, [value, maxValue, disableAnimation]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(animated / maxValue, 1);
  const offset = circumference * (1 - pct);

  const defaultColor = (p: number) => {
    if (p < 0.6) return "stroke-[#5E8B73]";
    if (p < 0.85) return "stroke-amber-500";
    return "stroke-red-500";
  };
  const color = (getColor ?? defaultColor)(pct);

  return (
    <div className={cn("inline-flex items-center justify-center", className)} role="progressbar"
      aria-valuenow={value} aria-valuemin={0} aria-valuemax={maxValue} {...props}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius}
          className="fill-transparent stroke-gray-200" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={radius}
          className={cn("fill-transparent transition-colors", color)}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          strokeLinecap="round" />
      </svg>
    </div>
  );
}
