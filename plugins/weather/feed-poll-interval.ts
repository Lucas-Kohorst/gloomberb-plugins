/**
 * Feed poll-interval hook for the pane footer's poll chip.
 *
 * The first-party `useFeedPollInterval` lives in the builtin shared folder and
 * is not part of the public `gloomberb/*` surface, so this plugin carries a
 * local copy built only from public hooks (`useAppDispatch`,
 * `useAppSelector`, `usePluginConfigState`). The poll chip shows the current
 * refresh interval and lets the user change it from the footer; the change is
 * applied to the app store for the session.
 */
import { useCallback, useMemo, useRef } from "react";
import type { PaneFooterSegment } from "gloomberb/components";
import { useAppDispatch, useAppSelector, usePluginConfigState } from "gloomberb/react";

export const FEED_POLL_INTERVAL_MINUTES = [1, 5, 15, 30] as const;

function coercePollIntervalMinutes(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 1) {
    return Math.floor(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed >= 1) return parsed;
  }
  return null;
}

function formatPollIntervalFooterLabel(minutes: number): string {
  return `poll ${Math.max(1, Math.floor(minutes))}m`;
}

function pollIntervalOptionLabel(minutes: number): string {
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

function pollIntervalMenuOptions(): Array<{ value: string; label: string }> {
  return FEED_POLL_INTERVAL_MINUTES.map((minutes) => ({
    value: String(minutes),
    label: pollIntervalOptionLabel(minutes),
  }));
}

function resolveFeedPollIntervalMinutes(
  globalMinutes: number,
  overrideMinutes?: unknown,
  defaultMinutes?: number,
): number {
  const override = coercePollIntervalMinutes(overrideMinutes);
  if (override != null) return override;
  if (typeof defaultMinutes === "number" && defaultMinutes >= 1) {
    return Math.floor(defaultMinutes);
  }
  return Math.max(1, Math.floor(globalMinutes || 1));
}

function pollSegment(minutes: number, setMinutes: (minutes: number) => void): PaneFooterSegment {
  return {
    id: "poll-interval",
    parts: [{ text: formatPollIntervalFooterLabel(minutes), tone: "muted" }],
    menu: {
      value: String(minutes),
      options: pollIntervalMenuOptions(),
      onSelect: (value) => {
        const next = coercePollIntervalMinutes(value);
        if (next != null) setMinutes(next);
      },
    },
  };
}

export function useFeedPollInterval(options?: {
  overrideConfigKey?: string;
  defaultMinutes?: number;
}): {
  intervalMinutes: number;
  intervalMs: number;
  label: string;
  setMinutes: (minutes: number) => void;
  segment: PaneFooterSegment;
} {
  const dispatch = useAppDispatch();
  const globalMinutes = useAppSelector((state) => state.config.refreshIntervalMinutes);
  const [overrideMinutes, setOverrideMinutes] = usePluginConfigState<number | null>(
    options?.overrideConfigKey ?? "__unusedFeedPollOverride",
    null,
  );
  const usingOverride = !!options?.overrideConfigKey;
  const intervalMinutes = resolveFeedPollIntervalMinutes(
    globalMinutes,
    usingOverride ? overrideMinutes : null,
    usingOverride ? options?.defaultMinutes : undefined,
  );
  const config = useAppSelector((state) => state.config);
  const configRef = useRef(config);
  configRef.current = config;

  const setMinutes = useCallback((minutes: number) => {
    const next = Math.max(1, Math.floor(minutes));
    if (usingOverride) {
      setOverrideMinutes(next);
      return;
    }
    const currentConfig = configRef.current;
    if (currentConfig.refreshIntervalMinutes === next) return;
    dispatch({
      type: "SET_CONFIG",
      config: { ...currentConfig, refreshIntervalMinutes: next },
    });
  }, [dispatch, setOverrideMinutes, usingOverride]);
  const setMinutesRef = useRef<(minutes: number) => void>(() => {});
  setMinutesRef.current = setMinutes;

  const stableSetMinutes = useCallback((minutes: number) => {
    setMinutesRef.current(minutes);
  }, []);

  return useMemo(() => ({
    intervalMinutes,
    intervalMs: intervalMinutes * 60_000,
    label: formatPollIntervalFooterLabel(intervalMinutes),
    setMinutes: stableSetMinutes,
    segment: pollSegment(intervalMinutes, stableSetMinutes),
  }), [intervalMinutes, stableSetMinutes]);
}
