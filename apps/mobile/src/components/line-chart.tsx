import { formatDate, type Series } from "@aurel/shared";
import { useState } from "react";
import { View } from "react-native";
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from "react-native-svg";

import { usePalette } from "@/lib/theme";

/** Mobile twin of the web chart: same scale rules, sized to the container width. */
export function LineChart({ series, height = 200 }: { series: Series; height?: number }) {
  const p = usePalette();
  const [W, setW] = useState(0);
  const pts = series.points.filter((x) => x.value !== null && x.unit === series.unit) as (Series["points"][number] & { value: number })[];
  if (!pts.length) return null;

  const H = height, L = 40, R = 12, T = 12, B = 26;
  const values = pts.map((x) => x.value);
  const band = [series.ref_low, series.ref_high].filter((v): v is number => v !== null);
  let lo = Math.min(...values, ...band), hi = Math.max(...values, ...band);
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.15;
  lo -= pad; hi += pad;
  const times = pts.map((x) => new Date(x.measured_at).getTime());
  const t0 = Math.min(...times), t1 = Math.max(...times);
  const x = (t: number) => (t1 === t0 ? (L + W - R) / 2 : L + ((t - t0) / (t1 - t0)) * (W - L - R));
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);
  const summary = `${series.name} in ${series.unit}: ` + pts.map((q) => `${formatDate(q.measured_at)} ${q.value}`).join(", ");

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} accessible accessibilityRole="image" accessibilityLabel={summary}>
      {W > 0 && (
        <Svg width={W} height={H}>
          {band.length > 0 && <Rect x={L} width={W - L - R} y={y(series.ref_high ?? hi)} height={Math.max(0, y(series.ref_low ?? lo) - y(series.ref_high ?? hi))} fill={p.successSoft} />}
          {ticks.map((v) => (
            <Line key={`l${v}`} x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={p.border} strokeDasharray="2 4" />
          ))}
          {ticks.map((v) => (
            <SvgText key={`t${v}`} x={L - 6} y={y(v) + 4} fontSize={10} fill={p.inkSubtle} textAnchor="end">{String(+v.toFixed(2))}</SvgText>
          ))}
          {/* Joined only when a trend could be calculated (AUD-16). */}
          {series.trend.comparable && <Polyline points={pts.map((q, i) => `${x(times[i])},${y(q.value)}`).join(" ")} fill="none" stroke={p.primary} strokeWidth={2} />}
          {pts.map((q, i) => (
            <Circle key={q.id} cx={x(times[i])} cy={y(q.value)} r={4.5} fill={p.surface} stroke={q.status === "within" ? p.primary : p.warning} strokeWidth={2} />
          ))}
          {pts.map((q, i) => (
            <SvgText key={`d${q.id}`} x={x(times[i])} y={H - 8} fontSize={10} fill={p.inkSubtle} textAnchor="middle">
              {formatDate(q.measured_at, { month: "short", year: "2-digit" })}
            </SvgText>
          ))}
        </Svg>
      )}
    </View>
  );
}
