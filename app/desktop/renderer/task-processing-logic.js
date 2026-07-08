"use strict";

(function initTaskProcessingLogicModule(root, factory) {
    const api = factory();

    if (typeof module === "object" && module.exports) {
        module.exports = api;
        return;
    }

    if (root && typeof root === "object") {
        root.taskProcessingLogic = api;
    }
})(
    typeof globalThis !== "undefined" ? globalThis : this,
    function createTaskProcessingLogic() {
        function readTaskStatus(task) {
            return String(task?.status || "").trim();
        }

        function readTaskStage(task) {
            return String(task?.stage || "").trim();
        }

        function shouldShowProcessAction(task) {
            const status = readTaskStatus(task);
            return status === "created" || status === "ready";
        }

        function buildProcessingOverlayMessage(task) {
            const stage = readTaskStage(task);
            if (stage === "preprocessing") {
                return "正在预处理音频...";
            }
            if (stage === "transcribing") {
                return "正在转写文本...";
            }
            if (stage === "diarizing") {
                return "正在识别说话人...";
            }
            if (stage === "exporting") {
                return "正在整理导出结果...";
            }
            return "正在处理任务...";
        }

        return {
            buildProcessingOverlayMessage,
            shouldShowProcessAction
        };
    }
);
