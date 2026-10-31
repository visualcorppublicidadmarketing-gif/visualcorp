export function nextInventorySku(prefix: string, itemSkus: string[], variantSkus: string[]): string;
export function isInventoryItemSkuConflict(error: unknown): boolean;
export function isValidInventoryReference(value: unknown): boolean;
export function isRecoverableInventoryItem(row: unknown, context: { userId: string; areaId: string | null; brandScope: string; requestedSku?: string; now?: number }): boolean;
