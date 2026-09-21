import type { DesignSystemDetail } from '../content/contentIndex';

// A host (VS Code, the MCP server, or any future host) persists "which
// design system is currently active" however fits its own environment
// (editor settings, a local JSON file, ...). This interface is the only
// contract the shared resolution logic below depends on.
export interface ActiveDesignSystemStore {
  get(): Promise<string | undefined>;
  set(id: string | undefined): Promise<void>;
}

export interface DesignSystemResolution {
  designSystemId: string | undefined;
  designSystem: DesignSystemDetail | undefined;
  /** Set when an explicit id was given but doesn't resolve to a known design system. */
  unknownExplicitId?: string;
}

/**
 * Resolves the design system to use for a generation request: an explicit
 * id wins and becomes the new sticky active one; otherwise falls back to
 * whatever is currently active. A stale active id (no longer present in the
 * catalog) degrades to "none" silently, rather than erroring — it shouldn't
 * block every future generation until manually fixed.
 */
export async function resolveActiveDesignSystem(
  explicitDesignSystemId: string | undefined,
  store: ActiveDesignSystemStore,
  getDesignSystem: (id: string) => Promise<DesignSystemDetail | undefined>,
): Promise<DesignSystemResolution> {
  if (explicitDesignSystemId) {
    const designSystem = await getDesignSystem(explicitDesignSystemId);
    if (!designSystem) {
      return { designSystemId: undefined, designSystem: undefined, unknownExplicitId: explicitDesignSystemId };
    }
    await store.set(explicitDesignSystemId);
    return { designSystemId: explicitDesignSystemId, designSystem };
  }

  const activeId = await store.get();
  if (!activeId) return { designSystemId: undefined, designSystem: undefined };
  const designSystem = await getDesignSystem(activeId);
  return designSystem ? { designSystemId: activeId, designSystem } : { designSystemId: undefined, designSystem: undefined };
}

export type SetActiveDesignSystemResult =
  | { outcome: 'cleared' }
  | { outcome: 'set'; designSystem: DesignSystemDetail }
  | { outcome: 'unknown'; unknownId: string };

/** Shared logic behind the `set_active_design_system` tool, on any host. */
export async function setActiveDesignSystem(
  designSystemId: string | undefined,
  store: ActiveDesignSystemStore,
  getDesignSystem: (id: string) => Promise<DesignSystemDetail | undefined>,
): Promise<SetActiveDesignSystemResult> {
  if (!designSystemId || designSystemId.trim().length === 0) {
    await store.set(undefined);
    return { outcome: 'cleared' };
  }

  const designSystem = await getDesignSystem(designSystemId);
  if (!designSystem) {
    return { outcome: 'unknown', unknownId: designSystemId };
  }

  await store.set(designSystemId);
  return { outcome: 'set', designSystem };
}
