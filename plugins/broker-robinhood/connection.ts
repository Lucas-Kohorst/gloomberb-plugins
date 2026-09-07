import type { BrokerInstanceConfig } from "gloomberb/types/config";

// Inlined from src/shared/robinhood-oauth.ts — the external plugin cannot
// import internal shared modules.
const ROBINHOOD_CONNECTION_MODE = "oauth";

const ROBINHOOD_CONNECTION_OPTION = {
  label: "Robinhood sign-in (read accounts, trade Agentic)",
  value: ROBINHOOD_CONNECTION_MODE,
  description: "Reads every Robinhood account. Orders go only to the Agentic account.",
} as const;

export function robinhoodConnectionMode(instance: BrokerInstanceConfig): string {
  const fromConfig = instance.config?.connectionMode;
  if (typeof fromConfig === "string" && fromConfig.trim()) return fromConfig;
  if (typeof instance.connectionMode === "string" && instance.connectionMode.trim()) {
    return instance.connectionMode;
  }
  return ROBINHOOD_CONNECTION_MODE;
}

/** OAuth is the only Robinhood mode; missing config still means sign-in is ready. */
export function isRobinhoodOAuthConfigured(instance: BrokerInstanceConfig): boolean {
  return robinhoodConnectionMode(instance) === ROBINHOOD_CONNECTION_MODE;
}

export function robinhoodConfigSchema() {
  return [{
    key: "connectionMode",
    label: "Connection",
    type: "select" as const,
    required: true,
    defaultValue: ROBINHOOD_CONNECTION_MODE,
    options: [{
      label: ROBINHOOD_CONNECTION_OPTION.label,
      value: ROBINHOOD_CONNECTION_OPTION.value,
      description: ROBINHOOD_CONNECTION_OPTION.description,
    }],
  }];
}
