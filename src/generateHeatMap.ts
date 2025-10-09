import Kriging from "./kriging";
import interpolateIDW from "./idw";
import { DataPoint, Bounds, InterpolationAlgorithm, VariogramModel } from './interpolation.types';
import { ColorMapper, ColorScheme, ColorStop, ColorMapFunction } from './ColorMapper';

export default function generateHeatmap(
    h2Data: DataPoint[],
    bounds: Bounds,
    algorithm: InterpolationAlgorithm = 'kriging',
    variogramModel: VariogramModel = 'exponential',
    colorScheme: ColorScheme | ColorStop[] | ColorMapFunction = 'rainbow'
): string {
    const canvas = document.createElement('canvas');
    const width = 800;
    const height = 600;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        throw new Error('Failed to get 2D context from canvas');
    }

    const [minLon, minLat, maxLon, maxLat] = bounds;
    const lonRange = maxLon - minLon;
    const latRange = maxLat - minLat;

    // Get H2 value range
    const h2Values = h2Data.map(d => d.h2);
    const minH2 = Math.min(...h2Values);
    const maxH2 = Math.max(...h2Values);

    // Initialize color mapper
    const colorMapper = new ColorMapper(minH2, maxH2, colorScheme);

    // Initialize interpolation model
    let krigingModel: Kriging | null = null;
    if (algorithm === 'kriging') {
        krigingModel = new Kriging(h2Data, { model: variogramModel });
    }

    // Generate grid
    const gridSize = 50;
    const cellWidth = width / gridSize;
    const cellHeight = height / gridSize;

    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            const lon = minLon + lonRange * (i + 0.5) / gridSize;
            const lat = maxLat - latRange * (j + 0.5) / gridSize;

            let value: number;
            if (algorithm === 'kriging' && krigingModel) {
                value = krigingModel.interpolate(lon, lat);
            } else {
                value = interpolateIDW(lon, lat, h2Data);
            }

            const color = colorMapper.getColorString(value);
            ctx.fillStyle = color;
            ctx.fillRect(i * cellWidth, j * cellHeight, cellWidth, cellHeight);
        }
    }

    // Convert canvas to data URL
    return canvas.toDataURL();
}