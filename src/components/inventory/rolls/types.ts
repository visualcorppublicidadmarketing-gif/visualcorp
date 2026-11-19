import type { RollFamily } from '../../../lib/inventoryRollHelpers.mjs';

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

export type RollRecord = {
  id: string;
  organization_id: string;
  branch_id: string;
  variant_id: string;
  location_code: string;
  machine_name: string;
  material_name: string;
  material_family?: RollFamily | string | null;
  roll_tag: string;
  standard_length_m: number | null;
  nominal_width_cm: number | null;
  remaining_m: number | null;
  remaining_percent: number | null;
  remaining_is_estimate: boolean;
  roll_state: 'bodega' | 'machine';
  status: string;
  operator_name: string;
  notes: string;
  last_measured_at: string;
  created_at?: string;
  updated_at: string;
};

export type RollLogRecord = {
  id: string;
  event_type: string;
  previous_m: number | null;
  new_m: number | null;
  previous_percent?: number | null;
  new_percent?: number | null;
  previous_state: string | null;
  new_state: string | null;
  reason: string;
  work_reference: string;
  operator_name: string;
  recorded_at: string;
  notes: string;
};

export type RollInspectorTab = 'config' | 'calibrate' | 'traceability';
