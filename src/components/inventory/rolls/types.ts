export type Branch = {
  id: string;
  name: string;
};

export type InventoryItem = {
  id?: string;
  variantId?: string;
  remoteItemId?: string;
  branchId?: string | null;
  branch?: string;
  name?: string;
  variant?: string;
  variantSku?: string;
  sku?: string;
  unit?: string;
  category?: string;
  itemType?: string;
  tags?: string[];
  location?: string;
  variantAttributes?: Record<string, unknown>;
  customFields?: Record<string, unknown>;
  archived?: boolean;
  rollGroupId?: string;
  groupId?: string;
  categoryId?: string;
  inventoryGroupId?: string;
};

export type LocationOption = {
  code: string;
  name: string;
};

export type MaterialCategoryTab = 'todos' | 'vinil' | 'lona' | 'micro' | 'especial';

export type RollCondition = 'full' | 'partial';
