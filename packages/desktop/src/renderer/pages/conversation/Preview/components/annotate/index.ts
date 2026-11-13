/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export { default as AnnotatableDiff } from './AnnotatableDiff';
export type { ReviewScope } from './useReviewThreads';
export { countUnresolved, parseDiffModel, selectRange, buildDiffContext, placeThreads } from './annotateModel';
export { buildOfficeReviewScope, buildOfficeAnchorInput, formatOfficeThreadTarget } from './officeReviewModel';
export type { OfficeDocKind, OfficeAnchorInput } from './officeReviewModel';
export { default as OfficeReviewDrawer } from './OfficeReviewDrawer';
export type { OfficeLockedTarget } from './OfficeReviewDrawer';
