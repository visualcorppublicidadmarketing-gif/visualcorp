import * as THREE from 'three';
import type { ProductBase } from './types';

export type MugWrapSettings = {
  radius: number;
  centerY: number;
  thetaStart: number;
  thetaSpan: number;
  thetaEnd: number;
  height: number;
  yMin: number;
  yMax: number;
  aspectRatio: number;
};

const MUG_PROFILE: Array<[number, number]> = [
  [-0.41, 0.397],
  [-0.35, 0.409],
  [0.37, 0.41],
  [0.43, 0.402],
  [0.466, 0.39],
  [0.475, 0.38],
];

export function getMugWrapSettings(product: ProductBase, warpStrength = 100): MugWrapSettings {
  const radius = 0.41;
  const centerY = 0.01;
  const aspectRatio = product.surfaceProfile?.aspectRatio || 20 / 9;
  const maxTheta = THREE.MathUtils.degToRad(product.surfaceProfile?.wrapAngleDegrees || 236);
  const maxHeight = 0.945 * (product.surfaceProfile?.verticalCoverage || 0.76);
  const baseHeight = Math.min((radius * maxTheta) / aspectRatio, maxHeight);
  const warpScale = Math.min(1, 0.85 + THREE.MathUtils.clamp(warpStrength, 0, 100) / 100 * 0.22);
  const height = baseHeight * warpScale;
  const thetaSpan = (height * aspectRatio) / radius;
  const yMin = centerY - height / 2;
  const yMax = centerY + height / 2;
  const thetaStart = -thetaSpan / 2;

  return { radius, centerY, thetaStart, thetaSpan, thetaEnd: -thetaStart, height, yMin, yMax, aspectRatio };
}

export function getMugOuterRadiusAtY(y: number) {
  if (y <= MUG_PROFILE[0][0]) return MUG_PROFILE[0][1];
  for (let index = 1; index < MUG_PROFILE.length; index += 1) {
    const [y1, r1] = MUG_PROFILE[index];
    const [y0, r0] = MUG_PROFILE[index - 1];
    if (y <= y1) {
      const fraction = (y - y0) / (y1 - y0);
      return r0 + (r1 - r0) * fraction;
    }
  }
  return MUG_PROFILE.at(-1)![1];
}

/** Surface patch with the same UV layout as the 20:9 flattened artwork. */
export function createMugWrapGeometry(settings: MugWrapSettings, radialOffset = 0) {
  const segments = 192;
  const rows = 48;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows;
    const localY = (v - 0.5) * settings.height;
    const radius = getMugOuterRadiusAtY(settings.centerY + localY) + radialOffset;
    for (let segment = 0; segment <= segments; segment += 1) {
      const u = segment / segments;
      const theta = settings.thetaStart + u * settings.thetaSpan;
      positions.push(Math.sin(theta) * radius, localY, Math.cos(theta) * radius);
      uvs.push(u, v);
    }
  }

  for (let row = 0; row < rows; row += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const lowerLeft = row * (segments + 1) + segment;
      const lowerRight = lowerLeft + 1;
      const upperLeft = lowerLeft + segments + 1;
      const upperRight = upperLeft + 1;
      indices.push(lowerLeft, lowerRight, upperLeft, lowerRight, upperRight, upperLeft);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
