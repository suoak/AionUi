/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** Maps legacy nested links to Skill Evolution's independent top-level routes. */
export const legacySkillEvolutionPath = (create: boolean, search: string): string =>
  `/skill-evolution${create ? '/new' : ''}${search}`;
