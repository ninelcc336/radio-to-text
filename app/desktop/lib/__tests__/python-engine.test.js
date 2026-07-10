"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeEngineRequest } = require("../python-engine");

test("normalizeEngineRequest converts Windows path fields to forward slashes", () => {
  const request = {
    action: "import_audio",
    payload: {
      sourcePath: "C:\\Users\\Administrator\\Desktop\\sample-meeting.wav",
      nestedDir: "C:\\Users\\Administrator\\AppData\\Roaming\\音频转写助手\\tasks",
      taskId: "20260710-000000-abcd1234",
      note: "keep\\this\\string"
    }
  };

  const normalized = normalizeEngineRequest(request);

  assert.deepEqual(normalized, {
    action: "import_audio",
    payload: {
      sourcePath: "C:/Users/Administrator/Desktop/sample-meeting.wav",
      nestedDir: "C:/Users/Administrator/AppData/Roaming/音频转写助手/tasks",
      taskId: "20260710-000000-abcd1234",
      note: "keep\\this\\string"
    }
  });
});
