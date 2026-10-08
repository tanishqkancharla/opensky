/** Verify an inventory ID against the already authorized fixture app before
 * adding that literal selector to the isolated evaluation guard. No action,
 * launch, fuzzy alias, dynamic selector or public SDK behavior is introduced.
 */
interface InventoryApp { id: string; displayName?: string; isRunning?: boolean }
interface SelectorFacade {
  getState(options: { emit: false }): Promise<{ apps: InventoryApp[] }>;
  getApp(selector: string): Promise<{ readonly targetHandle: string }>;
}

export async function verifiedLinuxAppSelectors(cua: SelectorFacade, appName: string) {
  const inventory = await cua.getState({ emit: false });
  const matches = inventory.apps.filter(app => app.displayName === appName);
  const observed = matches[0];
  if (matches.length !== 1 || observed.isRunning !== true || !observed.id?.trim()
      || observed.id !== observed.id.trim() || observed.id.toLowerCase().startsWith("tgt_")) {
    throw new Error("Owned fixture app has no unique running inventory ID");
  }
  const named = await cua.getApp(appName);
  const identified = await cua.getApp(observed.id);
  if (!named.targetHandle || named.targetHandle !== identified.targetHandle) {
    throw new Error("Inventory ID does not resolve to the authorized fixture target");
  }
  return { appSelectors: [...new Set([appName, observed.id])], observed,
    namedTargetHandle: named.targetHandle, identifiedTargetHandle: identified.targetHandle };
}
