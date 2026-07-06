const fs = require("fs");
const path = require("path");

const enginePath = path.resolve(__dirname, "../../../dist-python/engine/engine.exe");

if (!fs.existsSync(enginePath)) {
  console.error(`Python engine build is missing: ${enginePath}`);
  process.exit(1);
}

console.log(`Verified Python engine build: ${enginePath}`);
