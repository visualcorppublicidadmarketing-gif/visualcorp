import { buildBoxPanels, buildPanelOutline, type BoxCamProfile, type BoxProject } from './boxModel';
import { measureBoxContour, type BoxSheetPlan } from './boxFabrication';
import { offsetBoxContour } from './boxKerf';

export interface BoxProductionEstimate {
  cutLengthMm: number;
  cutMinutes: number | null;
  materialCost: number | null;
  machineCost: number | null;
  totalCost: number | null;
}

/**
 * Produces a geometric estimate from values entered by the operator. It does
 * not account for travel, acceleration, pierces, passes, setup, or waste.
 */
export function estimateBoxProduction(project: BoxProject, profile: BoxCamProfile, plan?: BoxSheetPlan | null): BoxProductionEstimate {
  const kerfMm = profile.kerfMm ?? 0;
  const cutLengthMm = plan?.totalCutLengthMm ?? buildBoxPanels(project).reduce((sum, panel) => {
    const contour = offsetBoxContour(buildPanelOutline(panel, project), kerfMm / 2);
    return sum + measureBoxContour(contour).perimeterMm;
  }, 0);
  const cutMinutes = profile.cutSpeedMmPerMin && profile.cutSpeedMmPerMin > 0
    ? cutLengthMm / profile.cutSpeedMmPerMin
    : null;
  const machineCost = cutMinutes !== null && profile.machineRatePerHour !== null
    ? (cutMinutes / 60) * profile.machineRatePerHour
    : null;
  const materialCost = plan && profile.sheetPrice !== null
    ? plan.totalSheets * profile.sheetPrice
    : null;
  return {
    cutLengthMm,
    cutMinutes,
    materialCost,
    machineCost,
    totalCost: materialCost !== null && machineCost !== null ? materialCost + machineCost : null,
  };
}

