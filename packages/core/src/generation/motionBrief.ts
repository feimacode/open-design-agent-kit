// The brief's Motion section for skills that animate (openspec add-motion-vocabulary).

import type { DesignSystemDetail } from '../content/contentIndex';
import { TOKEN_SCHEMA } from '../vendored/designTokenSchema';
import { resolveDesignSystemDetailTokens } from './designSystemPreview';
import { composeMotionSection, skillAnimates } from './motionVocabulary';

/** The schema's motion fallbacks, for a brief made with no design system. */
function defaultMotionTokens(): Map<string, string> {
  const out = new Map<string, string>();
  for (const spec of TOKEN_SCHEMA) if (/^--(motion|ease)-/.test(spec.name) && spec.fallback) out.set(spec.name, spec.fallback);
  return out;
}

/** The Motion section for this skill and design system, or undefined when the skill makes something still. */
export function motionSectionForBrief(
  skill: { id: string; name?: string; mode?: string; category?: string; body?: string },
  designSystem?: DesignSystemDetail,
): string | undefined {
  if (!skillAnimates(skill)) return undefined;
  const tokens = designSystem ? resolveDesignSystemDetailTokens(designSystem).tokens : defaultMotionTokens();
  return composeMotionSection({ tokens, brandMotion: designSystem?.brand?.motion, designSystemName: designSystem?.name });
}
