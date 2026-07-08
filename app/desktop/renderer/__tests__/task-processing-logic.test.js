"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const taskProcessingLogicPath = path.resolve(
    __dirname,
    "..",
    "task-processing-logic.js"
);
const taskProcessingLogic = require(taskProcessingLogicPath);

test("exports the expected task processing logic API in Node", () => {
    assert.equal(typeof taskProcessingLogic.shouldShowProcessAction, "function");
    assert.equal(typeof taskProcessingLogic.buildProcessingOverlayMessage, "function");
});

test("shows process action for created and ready tasks only", () => {
    assert.equal(taskProcessingLogic.shouldShowProcessAction({ status: "created" }), true);
    assert.equal(taskProcessingLogic.shouldShowProcessAction({ status: "ready" }), true);
    assert.equal(taskProcessingLogic.shouldShowProcessAction({ status: "processing" }), false);
    assert.equal(taskProcessingLogic.shouldShowProcessAction({ status: "completed" }), false);
    assert.equal(taskProcessingLogic.shouldShowProcessAction({ status: "failed" }), false);
});

test("maps processing stages to user-facing overlay messages", () => {
    assert.equal(
        taskProcessingLogic.buildProcessingOverlayMessage({
            status: "processing",
            stage: "preprocessing"
        }),
        "正在预处理音频..."
    );
    assert.equal(
        taskProcessingLogic.buildProcessingOverlayMessage({
            status: "processing",
            stage: "transcribing"
        }),
        "正在转写文本..."
    );
    assert.equal(
        taskProcessingLogic.buildProcessingOverlayMessage({
            status: "processing",
            stage: "diarizing"
        }),
        "正在识别说话人..."
    );
    assert.equal(
        taskProcessingLogic.buildProcessingOverlayMessage({
            status: "processing",
            stage: "exporting"
        }),
        "正在整理导出结果..."
    );
    assert.equal(
        taskProcessingLogic.buildProcessingOverlayMessage({
            status: "processing",
            stage: "unknown"
        }),
        "正在处理任务..."
    );
});

test("attaches the API to globalThis.taskProcessingLogic in a browser-like context", () => {
    const source = fs.readFileSync(taskProcessingLogicPath, "utf8");
    const sandbox = {
        globalThis: {}
    };

    vm.runInNewContext(source, sandbox, { filename: taskProcessingLogicPath });

    assert.ok(sandbox.globalThis.taskProcessingLogic);
    assert.equal(
        typeof sandbox.globalThis.taskProcessingLogic.shouldShowProcessAction,
        "function"
    );
    assert.equal(
        typeof sandbox.globalThis.taskProcessingLogic.buildProcessingOverlayMessage,
        "function"
    );
});
