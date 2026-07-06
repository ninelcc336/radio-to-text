const fs = require("fs");
const path = require("path");

const targetArg = process.argv[2] || "dist/win-unpacked";
const unpackedDir = path.resolve(__dirname, "../../../", targetArg);

if (fs.existsSync(unpackedDir)) {
  fs.rmSync(unpackedDir, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 500
  });
  console.log(`Removed previous unpacked output: ${unpackedDir}`);
} else {
  console.log(`No previous unpacked output to remove: ${unpackedDir}`);
}
