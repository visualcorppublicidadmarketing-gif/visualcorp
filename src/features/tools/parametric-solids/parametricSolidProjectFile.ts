import { normalizeParametricSolidsDocument } from './parametricSolidModel';
import type { ParametricSolidsDocument } from './parametricSolidModel';

export const PARAMETRIC_PROJECT_FILE_FORMAT = 'visualcorp-parametric-project' as const;
export const PARAMETRIC_PROJECT_FILE_VERSION = 1 as const;
export const PARAMETRIC_PROJECT_MODEL_ID = 'composite-shape' as const;

export interface ParametricProjectFile {
  format: typeof PARAMETRIC_PROJECT_FILE_FORMAT;
  version: typeof PARAMETRIC_PROJECT_FILE_VERSION;
  adapterId: 'parametric-solids';
  modelId: typeof PARAMETRIC_PROJECT_MODEL_ID;
  createdAt: string;
  payload: ParametricSolidsDocument;
}

export function serializeParametricSolidsProject(document: ParametricSolidsDocument) {
  const file: ParametricProjectFile = {
    format: PARAMETRIC_PROJECT_FILE_FORMAT,
    version: PARAMETRIC_PROJECT_FILE_VERSION,
    adapterId: 'parametric-solids',
    modelId: PARAMETRIC_PROJECT_MODEL_ID,
    createdAt: new Date().toISOString(),
    payload: normalizeParametricSolidsDocument(document),
  };
  return JSON.stringify(file, null, 2);
}

export function restoreParametricSolidsProject(value: unknown): ParametricSolidsDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('El archivo no contiene un proyecto paramétrico válido.');
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.format !== PARAMETRIC_PROJECT_FILE_FORMAT
    || candidate.version !== PARAMETRIC_PROJECT_FILE_VERSION
    || candidate.adapterId !== 'parametric-solids'
    || candidate.modelId !== PARAMETRIC_PROJECT_MODEL_ID
    || typeof candidate.createdAt !== 'string'
    || Number.isNaN(Date.parse(candidate.createdAt))
    || !candidate.payload
    || typeof candidate.payload !== 'object'
    || Array.isArray(candidate.payload)) {
    throw new Error('El archivo no usa el formato compatible del modelador paramétrico.');
  }
  return normalizeParametricSolidsDocument(candidate.payload);
}