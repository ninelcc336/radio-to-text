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
        function readReviewStatusValue(segment) {
            if (segment && typeof segment === "object" && "reviewStatus" in segment) {
                return segment.reviewStatus;
            }

            return segment?.review_status;
        }

        function getReviewStatus(segment) {
            return String(readReviewStatusValue(segment) || "pending").trim() || "pending";
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

        function isDeletedReviewSegment(segment) {
            return getReviewStatus(segment) === "deleted";
        }

        function isPendingReviewSegment(reviewMeta) {
            return Boolean(reviewMeta?.needsReview) && reviewMeta?.reviewStatus === "pending";
        }

        function shouldShowConfirmAction(reviewMeta) {
            return !isDeletedReviewSegment(reviewMeta) && isPendingReviewSegment(reviewMeta);
        }

        function shouldShowConfirmedBadge(reviewMeta) {
            return false;
        }

        return {
            buildSegmentReviewMeta,
            getReviewStatus,
            isDeletedReviewSegment,
            isPendingReviewSegment,
            shouldShowConfirmAction,
            shouldShowConfirmedBadge
        };
    }
);
