const path = require("path");
const { runEngineRequest } = require("../lib/python-engine");

async function main() {
  const sourceArg = process.argv[2];
  if (!sourceArg) {
    throw new Error("Usage: node process-sample.js <audio-path>");
  }

  const sourcePath = path.resolve(sourceArg);
  const imported = await runEngineRequest({
    action: "import_audio",
    payload: {
      sourcePath
    }
  });

  const taskId = imported.data.task.task_id;
  const processed = await runEngineRequest({
    action: "process_task",
    payload: {
      taskId
    }
  });

  console.log(
    JSON.stringify(
      {
        imported,
        processed
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
