import { Box, Text } from "gloomberb/ui";
import { useMemo } from "react";
import { EmptyState, StaticChartSurface, Tabs } from "gloomberb/components";
import { colors } from "gloomberb/theme";
import { formatNumber, formatPercentRaw } from "gloomberb/utils";
import { coercePredictionPointDate } from "./services/history";
import type { PredictionHistoryPoint, PredictionHistoryRange } from "./types";

const RANGES: PredictionHistoryRange[] = ["1D", "1W", "1M", "ALL"];
const RANGE_TABS = RANGES.map((entry) => ({ label: entry, value: entry }));

interface ChartPoint {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function toPricePoints(points: PredictionHistoryPoint[]): ChartPoint[] {
  return points.flatMap((point) => {
    const date = coercePredictionPointDate(point.date);
    if (!date) return [];
    return [{
      date,
      close: point.close,
      open: point.open ?? point.close,
      high: point.high ?? point.close,
      low: point.low ?? point.close,
      volume: point.volume ?? 0,
    }];
  });
}

function PredictionRangeTabs({
  activeRange,
  focused,
  onRangeSelect,
}: {
  activeRange: PredictionHistoryRange;
  focused: boolean;
  onRangeSelect: (range: PredictionHistoryRange) => void;
}) {
  return (
    <Tabs
      tabs={RANGE_TABS}
      activeValue={activeRange}
      onSelect={(value) => onRangeSelect(value as PredictionHistoryRange)}
      compact
      variant="bare"
      focused={focused}
    />
  );
}

export function PredictionMarketChart({
  history,
  width,
  height,
  loading = false,
  focused = false,
  range,
  onRangeSelect,
}: {
  history: PredictionHistoryPoint[];
  width: number;
  height: number;
  loading?: boolean;
  focused?: boolean;
  range: PredictionHistoryRange;
  onRangeSelect: (range: PredictionHistoryRange) => void;
}) {
  const pricePoints = useMemo(() => toPricePoints(history), [history]);

  if (pricePoints.length === 0) {
    return (
      <Box flexDirection="column" height={height}>
        <Box flexDirection="row" height={1}>
          <PredictionRangeTabs
            activeRange={range}
            focused={focused}
            onRangeSelect={onRangeSelect}
          />
        </Box>
        <Box flexGrow={1} justifyContent="center">
          {loading ? (
            <Text fg={colors.textDim}>Loading chart...</Text>
          ) : (
            <EmptyState
              title="No chart history."
              hint="This venue did not return price history for the selected market."
            />
          )}
        </Box>
      </Box>
    );
  }

  const first = pricePoints[0] ?? null;
  const last = pricePoints[pricePoints.length - 1] ?? null;
  const delta = first && last ? last.close - first.close : 0;
  const deltaPct = first?.close ? (delta / first.close) * 100 : 0;
  const chartHeight = Math.max(height - 1, 2);
  const lineColor = delta > 0 ? colors.positive : delta < 0 ? colors.negative : colors.text;

  return (
    <Box flexDirection="column" height={height}>
      <Box flexDirection="row" height={1}>
        <PredictionRangeTabs
          activeRange={range}
          focused={focused}
          onRangeSelect={onRangeSelect}
        />
        <Box flexGrow={1} />
        <Text fg={lineColor}>
          {`${formatNumber(last?.close ?? 0, 3)}  ${formatPercentRaw(deltaPct)}`}
        </Text>
      </Box>
      <StaticChartSurface
        width={width}
        height={chartHeight}
        points={pricePoints}
        mode="area"
        colors={{
          lineColor,
          gridColor: colors.border,
          crosshairColor: colors.borderFocused,
          bgColor: colors.panel,
          axisColor: colors.textDim,
        }}
        showTimeAxis
        yAxisLabel="YES"
        formatYAxisValue={(value) => formatNumber(value, 2)}
      />
    </Box>
  );
}
