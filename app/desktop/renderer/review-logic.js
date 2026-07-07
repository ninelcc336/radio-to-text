"use strict";

(function initReviewLogicModule(root, factory) {
    const api = factory();

    if (typeof module === "object" && module.exports) {
        module.exports = api;
        return;
    }

    if (root && typeof root === "object") {
        root.reviewLogic = api;
    }
})(
    typeof globalThis !== "undefined" ? globalThis : this,
    function createReviewLogic() {
        function getReviewStatus(segment) {
            return String(segment?.review_status || "pending").trim() || "pending";
        }

        function buildSegmentReviewMeta(segment) {
            const reviewStatus = getReviewStatus(segment);

            return {
                reviewStatus,
                needsReview: Boolean(segment?.needs_review),
                reviewReasons: Array.isArray(segment?.review_reasons)
                    ? segment.review_reasons.filter(Boolean)
                    : []
            };
        }

        function isPendingReviewSegment(reviewMeta) {
            return Boolean(reviewMeta?.needsReview) && reviewMeta?.reviewStatus === "pending";
        }

        function shouldShowConfirmAction(reviewMeta) {
            return isPendingReviewSegment(reviewMeta);
        }

        function shouldShowConfirmedBadge(reviewMeta) {
            return false;
        }

        return {
            buildSegmentReviewMeta,
            getReviewStatus,
            isPendingReviewSegment,
            shouldShowConfirmAction,
            shouldShowConfirmedBadge
        };
    }
);
