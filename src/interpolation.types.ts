/**
 * Shared types for interpolation algorithms
 */

export interface DataPoint {
    lat: number;
    lon: number;
    h2: number;
}

export type Bounds = [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]

export type InterpolationAlgorithm = 'kriging' | 'idw';

export type VariogramModel = 'exponential' | 'gaussian' | 'spherical';

export interface InterpolationParams {
    power?: number;          // For IDW
    minDistance?: number;    // For IDW
    model?: VariogramModel;  // For Kriging
    nugget?: number;         // For Kriging
    sill?: number | null;    // For Kriging
    range?: number | null;   // For Kriging
}

export interface Interpolator {
    interpolate(lon: number, lat: number): number;
}