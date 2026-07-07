"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const reviewLogicPath = path.resolve(__dirname, "..", "review-logic.js");
const reviewLogic = require(reviewLogicPath);

test("exports the expected review logic API in Node", () => {
    assert.equal(typeof reviewLogic.buildSegmentReviewMeta, "function");
    assert.equal(typeof reviewLogic.getReviewStatus, "function");
    assert.equal(typeof reviewLogic.isDeletedReviewSegment, "function");
    assert.equal(typeof reviewLogic.isPendingReviewSegment, "function");
    assert.equal(typeof reviewLogic.shouldShowConfirmAction, "function");
    assert.equal(typeof reviewLogic.shouldShowConfirmedBadge, "function");
});

test("normal pending segments are not treated as pending review items", () => {
    const reviewMeta = reviewLogic.buildSegmentReviewMeta({
        needs_review: false,
        review_status: "pending"
    });

    assert.equal(reviewLogic.isPendingReviewSegment(reviewMeta), false);
    assert.equal(reviewLogic.shouldShowConfirmAction(reviewMeta), false);
    assert.equal(reviewLogic.shouldShowConfirmedBadge(reviewMeta), false);
});

test("needs-review pending segments are treated as pending review items", () => {
    const reviewMeta = reviewLogic.buildSegmentReviewMeta({
        needs_review: true,
        review_status: "pending",
        review_reasons: ["low_confidence", "", null, "overlap"]
    });

    assert.deepEqual(reviewMeta, {
        reviewStatus: "pending",
        needsReview: true,
        reviewReasons: ["low_confidence", "overlap"]
    });
    assert.equal(reviewLogic.isPendingReviewSegment(reviewMeta), true);
    assert.equal(reviewLogic.shouldShowConfirmAction(reviewMeta), true);
    assert.equal(reviewLogic.shouldShowConfirmedBadge(reviewMeta), false);
});

test("confirmed segments do not count as pending or show confirmation UI", () => {
    const reviewMeta = reviewLogic.buildSegmentReviewMeta({
        needs_review: true,
        review_status: "confirmed"
    });

    assert.equal(reviewLogic.isPendingReviewSegment(reviewMeta), false);
    assert.equal(reviewLogic.shouldShowConfirmAction(reviewMeta), false);
    assert.equal(reviewLogic.shouldShowConfirmedBadge(reviewMeta), false);
});

test("corrected segments do not count as pending or show confirmation UI", () => {
    const reviewMeta = reviewLogic.buildSegmentReviewMeta({
        needs_review: true,
        review_status: "corrected"
    });

    assert.equal(reviewLogic.isPendingReviewSegment(reviewMeta), false);
    assert.equal(reviewLogic.shouldShowConfirmAction(reviewMeta), false);
    assert.equal(reviewLogic.shouldShowConfirmedBadge(reviewMeta), false);
});

test("deleted segments expose explicit delete-state handling", () => {
    const segment = {
        needs_review: true,
        review_status: "deleted",
        review_reasons: ["duplicate"]
    };
    const reviewMeta = reviewLogic.buildSegmentReviewMeta(segment);

    assert.deepEqual(reviewMeta, {
        reviewStatus: "deleted",
        needsReview: true,
        reviewReasons: ["duplicate"]
    });
    assert.equal(reviewLogic.isDeletedReviewSegment(segment), true);
    assert.equal(reviewLogic.isDeletedReviewSegment(reviewMeta), true);
    assert.equal(reviewLogic.isPendingReviewSegment(reviewMeta), false);
    assert.equal(reviewLogic.shouldShowConfirmAction(reviewMeta), false);
    assert.equal(reviewLogic.shouldShowConfirmedBadge(reviewMeta), false);
});

test("defaults blank review status to pending", () => {
    assert.equal(reviewLogic.getReviewStatus({ review_status: "   " }), "pending");
    assert.equal(reviewLogic.getReviewStatus({}), "pending");
});

test("attaches the API to globalThis.reviewLogic when loaded in a browser-like context", () => {
    const source = fs.readFileSync(reviewLogicPath, "utf8");
    const sandbox = {
        globalThis: {}
    };

    vm.runInNewContext(source, sandbox, { filename: reviewLogicPath });

    assert.ok(sandbox.globalThis.reviewLogic);
    assert.equal(typeof sandbox.globalThis.reviewLogic.buildSegmentReviewMeta, "function");
    assert.equal(typeof sandbox.globalThis.reviewLogic.getReviewStatus, "function");
    assert.equal(typeof sandbox.globalThis.reviewLogic.isDeletedReviewSegment, "function");
});
