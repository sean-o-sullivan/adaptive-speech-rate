import {
  DEFAULT_CONTROLLER_CONFIG,
  type ControllerConfig,
} from "../config.js";

export interface Settings {
  readonly enabled: boolean;
  readonly targetSyllablesPerSecond: number;
  readonly analysisWindowSeconds: number;
  readonly minimumPlaybackRate: number;
  readonly maximumPlaybackRate: number;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  targetSyllablesPerSecond:
    DEFAULT_CONTROLLER_CONFIG.targetSyllablesPerSecond,
  analysisWindowSeconds: DEFAULT_CONTROLLER_CONFIG.analysisWindowSeconds,
  minimumPlaybackRate: DEFAULT_CONTROLLER_CONFIG.minimumPlaybackRate,
  maximumPlaybackRate: DEFAULT_CONTROLLER_CONFIG.maximumPlaybackRate,
};

const SETTING_KEYS = [
  "enabled",
  "targetSyllablesPerSecond",
  "analysisWindowSeconds",
  "minimumPlaybackRate",
  "maximumPlaybackRate",
] as const;

export function normalizeSettings(value: unknown): Settings {
  if (typeof value !== "object" || value === null) return DEFAULT_SETTINGS;
  const candidate = value as Record<string, unknown>;
  const minimumPlaybackRate = boundedNumber(
    candidate.minimumPlaybackRate,
    0.25,
    4,
    DEFAULT_SETTINGS.minimumPlaybackRate,
  );
  const maximumPlaybackRate = boundedNumber(
    candidate.maximumPlaybackRate,
    0.25,
    4,
    DEFAULT_SETTINGS.maximumPlaybackRate,
  );
  const playbackBoundsIncrease = minimumPlaybackRate <= maximumPlaybackRate;
  return {
    enabled:
      typeof candidate.enabled === "boolean"
        ? candidate.enabled
        : DEFAULT_SETTINGS.enabled,
    targetSyllablesPerSecond: boundedNumber(
      candidate.targetSyllablesPerSecond,
      1,
      20,
      DEFAULT_SETTINGS.targetSyllablesPerSecond,
    ),
    analysisWindowSeconds: boundedNumber(
      candidate.analysisWindowSeconds,
      1,
      15,
      DEFAULT_SETTINGS.analysisWindowSeconds,
    ),
    minimumPlaybackRate: playbackBoundsIncrease
      ? minimumPlaybackRate
      : DEFAULT_SETTINGS.minimumPlaybackRate,
    maximumPlaybackRate: playbackBoundsIncrease
      ? maximumPlaybackRate
      : DEFAULT_SETTINGS.maximumPlaybackRate,
  };
}

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get([...SETTING_KEYS]);
  return normalizeSettings(stored);
}

export async function setEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ enabled });
}

export async function setSettings(
  patch: Partial<Settings>,
): Promise<Settings> {
  const current = await loadSettings();
  const normalized = normalizeSettings({ ...current, ...patch });
  await chrome.storage.local.set(normalized);
  return normalized;
}

export function controllerConfigFromSettings(
  settings: Settings,
): ControllerConfig {
  return {
    ...DEFAULT_CONTROLLER_CONFIG,
    targetSyllablesPerSecond: settings.targetSyllablesPerSecond,
    analysisWindowSeconds: settings.analysisWindowSeconds,
    minimumPlaybackRate: settings.minimumPlaybackRate,
    maximumPlaybackRate: settings.maximumPlaybackRate,
  };
}

export function onEnabledChanged(
  listener: (enabled: boolean) => void,
): () => void {
  const handleChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void => {
    if (areaName !== "local") return;
    const enabled = changes.enabled?.newValue;
    if (typeof enabled === "boolean") listener(enabled);
  };

  chrome.storage.onChanged.addListener(handleChange);
  return () => chrome.storage.onChanged.removeListener(handleChange);
}

export function onSettingsChanged(
  listener: (settings: Settings) => void,
): () => void {
  const handleChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void => {
    if (
      areaName !== "local" ||
      !SETTING_KEYS.some((key) => changes[key] !== undefined)
    ) {
      return;
    }
    void loadSettings().then(listener);
  };

  chrome.storage.onChanged.addListener(handleChange);
  return () => chrome.storage.onChanged.removeListener(handleChange);
}

function boundedNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : fallback;
}
