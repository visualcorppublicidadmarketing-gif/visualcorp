import type { GeoCoordinates } from './geospatialProximity';

export type WorkshopSpecialPinKey = 'visual-corp' | 'gigaprint';

export interface WorkshopSpecialPin extends GeoCoordinates {
  key: WorkshopSpecialPinKey;
  name: string;
  address: string;
  verified: boolean;
}

/** Initial reference points. The owner can drag each marker to its exact entrance. */
export const DEFAULT_WORKSHOP_SPECIAL_PINS: readonly WorkshopSpecialPin[] = [
  {
    key: 'visual-corp',
    name: 'Visual Corp',
    address: 'Av. Jaime Roldós y General Andrade, Milagro, Guayas',
    lat: -2.135,
    lng: -79.5925,
    verified: false,
  },
  {
    key: 'gigaprint',
    name: 'GigaPrint',
    address: 'Av. Las Américas y Loja 48, Av. Los Chirijos, Milagro, Guayas',
    // Center of the public short code VC83+G84 recovered around Milagro.
    lat: -2.1337375,
    lng: -79.596671875,
    verified: false,
  },
];
