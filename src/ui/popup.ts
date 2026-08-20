import {
  loadSettings,
  onSettingsChanged,
  setSettings,
  type Settings,
} from "../settings/settings.js";

type NumericSettingKey = Exclude<keyof Settings, "enabled">;

const SETTING_KEYS = [
  "targetSyllablesPerSecond",
  "analysisWindowSeconds",
  "minimumPlaybackRate",
  "maximumPlaybackRate",
] as const satisfies readonly NumericSettingKey[];

const toggle = requireElement<HTMLInputElement>("enabled");
const status = requireElement<HTMLElement>("status");
const error = requireElement<HTMLElement>("error");
const inputs = new Map<NumericSettingKey, HTMLInputElement>(
  SETTING_KEYS.map((key) => [key, requireElement<HTMLInputElement>(key)]),
);
let currentSettings: Settings | undefined;

function render(settings: Settings): void {
  currentSettings = settings;
  toggle.checked = settings.enabled;
  status.textContent = settings.enabled ? "Ready on YouTube" : "Off";
  for (const [key, input] of inputs) {
    if (document.activeElement !== input) input.value = String(settings[key]);
  }
}

function setBusy(busy: boolean): void {
  toggle.disabled = busy;
  for (const input of inputs.values()) input.disabled = busy;
}

function persist(settings: Settings): void {
  setBusy(true);
  error.textContent = "";
  void setSettings(settings)
    .then(render)
    .catch((reason: unknown) => {
      error.textContent = reason instanceof Error ? reason.message : String(reason);
      if (currentSettings !== undefined) render(currentSettings);
    })
    .finally(() => setBusy(false));
}

toggle.addEventListener("change", () => {
  if (currentSettings === undefined) return;
  persist({ ...currentSettings, enabled: toggle.checked });
});

for (const [key, input] of inputs) {
  input.addEventListener("change", () => {
    const current = currentSettings;
    if (current === undefined) return;
    input.setCustomValidity("");
    if (!input.checkValidity()) {
      input.reportValidity();
      return;
    }

    const next: Settings = { ...current, [key]: Number(input.value) };
    if (next.minimumPlaybackRate > next.maximumPlaybackRate) {
      input.setCustomValidity("Minimum playback must not exceed maximum playback.");
      input.reportValidity();
      return;
    }
    for (const candidate of inputs.values()) candidate.setCustomValidity("");
    persist(next);
  });
}

const unsubscribe = onSettingsChanged((settings) => {
  render(settings);
  setBusy(false);
});
window.addEventListener("unload", unsubscribe, { once: true });
void loadSettings()
  .then(render)
  .catch((reason: unknown) => {
    error.textContent = reason instanceof Error ? reason.message : String(reason);
  })
  .finally(() => setBusy(false));

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`missing #${id}`);
  return element as T;
}
