const { runEngineRequest } = require("../lib/python-engine");

async function main() {
  const health = await runEngineRequest({
    action: "health",
    payload: {}
  });

  if (!health.ok || health.status !== "completed") {
    throw new Error("Health check failed");
  }

  const mockTask = await runEngineRequest({
    action: "create_mock_task",
    payload: {
      sourceFile: "smoke-test.m4a"
    }
  });

  if (!mockTask.ok || mockTask.status !== "completed") {
    throw new Error("Mock task creation failed");
  }

  console.log(JSON.stringify({ health, mockTask }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
