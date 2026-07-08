const fs = require("fs/promises");
const path = require("path");

const DEFAULT_SETTINGS = Object.freeze({
  language: "zh",
  modelName: "small",
  exportFormat: "txt"
});

function normalizeString(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed || fallback;
}

function sanitizeSettings(input = {}) {
  return {
    language: normalizeString(input.language, DEFAULT_SETTINGS.language),
    modelName: normalizeString(input.modelName, DEFAULT_SETTINGS.modelName),
    exportFormat: normalizeString(input.exportFormat, DEFAULT_SETTINGS.exportFormat)
  };
}

function createSettingsStore(settingsFilePath) {
  async function readStoredSettings() {
    try {
      const raw = await fs.readFile(settingsFilePath, "utf8");
      return sanitizeSettings(JSON.parse(raw));
    } catch (_error) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  return {
    async get() {
      return readStoredSettings();
    },
    async set(input) {
      const nextValue = sanitizeSettings({
        ...(await readStoredSettings()),
        ...(input || {})
      });
      await fs.mkdir(path.dirname(settingsFilePath), { recursive: true });
      await fs.writeFile(settingsFilePath, JSON.stringify(nextValue, null, 2), "utf8");
      return nextValue;
    }
  };
}

module.exports = {
  DEFAULT_SETTINGS,
  createSettingsStore
};
