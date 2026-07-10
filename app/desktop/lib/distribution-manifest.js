const fs = require("fs");
const path = require("path");

const DEFAULT_MANIFEST = Object.freeze({
  variant: "lite",
  bundledModelName: null,
  bundledModelDir: null,
  bundledModelRequired: false
});

function loadDistributionManifest(options = {}) {
  const resourcesRoot = path.resolve(
    options.resourcesPath || process.resourcesPath || "."
  );
  const manifestPath = path.join(resourcesRoot, "distribution", "manifest.json");

  if (!options.isPackaged || !fs.existsSync(manifestPath)) {
    return { ...DEFAULT_MANIFEST };
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const bundledModelRelativePath = manifest.bundledModelRelativePath || null;

  return {
    variant: manifest.variant || "lite",
    bundledModelName: manifest.bundledModelName || null,
    bundledModelDir: bundledModelRelativePath
      ? path.join(resourcesRoot, bundledModelRelativePath)
      : null,
    bundledModelRequired: Boolean(manifest.bundledModelRequired)
  };
}

module.exports = {
  loadDistributionManifest
};
