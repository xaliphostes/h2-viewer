/**
 * Color Mapper - Flexible color mapping for heatmaps
 */

export interface RGB {
    r: number;
    g: number;
    b: number;
}

export interface ColorStop {
    position: number; // 0 to 1
    color: RGB;
}

export type ColorScheme = 'rainbow' | 'viridis' | 'plasma' | 'turbo' | 'thermal' | 'grayscale' | 'logarithmic' | 'twostep';

export type ColorMapFunction = (normalized: number) => RGB;

export class ColorMapper {
    private minValue: number;
    private maxValue: number;
    private colorFunction: ColorMapFunction;

    constructor(
        minValue: number,
        maxValue: number,
        scheme: ColorScheme | ColorStop[] | ColorMapFunction = 'rainbow'
    ) {
        this.minValue = minValue;
        this.maxValue = maxValue;

        if (typeof scheme === 'function') {
            // User-defined function
            this.colorFunction = scheme;
        } else if (Array.isArray(scheme)) {
            // User-defined color stops
            this.colorFunction = this.createGradientFunction(scheme);
        } else {
            // Predefined scheme
            this.colorFunction = this.getPredefinedScheme(scheme);
        }
    }

    /**
     * Map a value to an RGB color
     */
    public getColor(value: number): RGB {
        const normalized = this.normalize(value);
        return this.colorFunction(normalized);
    }

    /**
     * Map a value to an RGB string
     */
    public getColorString(value: number): string {
        const { r, g, b } = this.getColor(value);
        return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    }

    /**
     * Map a value to a hex color string
     */
    public getColorHex(value: number): string {
        const { r, g, b } = this.getColor(value);
        const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    /**
     * Normalize value to 0-1 range
     */
    private normalize(value: number): number {
        if (this.maxValue === this.minValue) return 0.5;
        return Math.max(0, Math.min(1, (value - this.minValue) / (this.maxValue - this.minValue)));
    }

    /**
     * Linear interpolation between two values
     */
    private lerp(a: number, b: number, t: number): number {
        return a + (b - a) * t;
    }

    /**
     * Interpolate between two RGB colors
     */
    private lerpColor(color1: RGB, color2: RGB, t: number): RGB {
        return {
            r: this.lerp(color1.r, color2.r, t),
            g: this.lerp(color1.g, color2.g, t),
            b: this.lerp(color1.b, color2.b, t)
        };
    }

    /**
     * Create a color function from color stops
     */
    private createGradientFunction(stops: ColorStop[]): ColorMapFunction {
        // Sort stops by position
        const sortedStops = [...stops].sort((a, b) => a.position - b.position);

        return (normalized: number): RGB => {
            // Handle edge cases
            if (normalized <= sortedStops[0].position) {
                return sortedStops[0].color;
            }
            if (normalized >= sortedStops[sortedStops.length - 1].position) {
                return sortedStops[sortedStops.length - 1].color;
            }

            // Find the two stops to interpolate between
            for (let i = 0; i < sortedStops.length - 1; i++) {
                const stop1 = sortedStops[i];
                const stop2 = sortedStops[i + 1];

                if (normalized >= stop1.position && normalized <= stop2.position) {
                    const t = (normalized - stop1.position) / (stop2.position - stop1.position);
                    return this.lerpColor(stop1.color, stop2.color, t);
                }
            }

            return sortedStops[0].color;
        };
    }

    /**
     * Get predefined color scheme
     */
    private getPredefinedScheme(scheme: ColorScheme): ColorMapFunction {
        switch (scheme) {
            case 'rainbow':
                return this.rainbowScheme();
            case 'viridis':
                return this.viridisScheme();
            case 'plasma':
                return this.plasmaScheme();
            case 'turbo':
                return this.turboScheme();
            case 'thermal':
                return this.thermalScheme();
            case 'grayscale':
                return this.grayscaleScheme();
            case 'logarithmic':
                return this.logarithmicScheme();
            case 'twostep':
                return this.twostepScheme();
            default:
                return this.rainbowScheme();
        }
    }

    /**
 * Logarithmic color scheme (for skewed data distributions)
 */
    private logarithmicScheme(): ColorMapFunction {
        return (normalized: number): RGB => {
            // Convert normalized (0-1) back to actual value
            const value = this.minValue + normalized * (this.maxValue - this.minValue);

            // Apply logarithmic scaling
            const logMin = Math.log10(this.minValue + 0.001);
            const logMax = Math.log10(this.maxValue + 0.001);
            const logValue = Math.log10(value + 0.001);
            const logNormalized = (logValue - logMin) / (logMax - logMin);

            // Use viridis color scheme on log scale
            const stops: ColorStop[] = [
                { position: 0.00, color: { r: 68, g: 1, b: 84 } },
                { position: 0.25, color: { r: 59, g: 82, b: 139 } },
                { position: 0.50, color: { r: 33, g: 145, b: 140 } },
                { position: 0.75, color: { r: 94, g: 201, b: 98 } },
                { position: 1.00, color: { r: 253, g: 231, b: 37 } }
            ];

            // Interpolate color based on log-normalized value
            const gradientFunc = this.createGradientFunction(stops);
            return gradientFunc(logNormalized);
        };
    }

    /**
     * Two-step color scheme (0-1 gets 70% of colors, 1-max gets 30%)
     */
    private twostepScheme(): ColorMapFunction {
        return (normalized: number): RGB => {
            // Convert normalized (0-1) back to actual value
            const value = this.minValue + normalized * (this.maxValue - this.minValue);

            // Define two ranges with different color resolutions
            let adjustedNormalized: number;
            if (value <= 1) {
                // 0-1 range: map to 0-0.7 of color scale (70% of colors)
                adjustedNormalized = (value / 1.0) * 0.7;
            } else {
                // 1-max range: map to 0.7-1.0 of color scale (30% of colors)
                adjustedNormalized = 0.7 + ((value - 1) / (this.maxValue - 1)) * 0.3;
            }

            // Use plasma color scheme
            const stops: ColorStop[] = [
                { position: 0.00, color: { r: 13, g: 8, b: 135 } },
                { position: 0.25, color: { r: 126, g: 3, b: 168 } },
                { position: 0.50, color: { r: 204, g: 71, b: 120 } },
                { position: 0.75, color: { r: 248, g: 149, b: 64 } },
                { position: 1.00, color: { r: 240, g: 249, b: 33 } }
            ];

            // Interpolate color
            const gradientFunc = this.createGradientFunction(stops);
            return gradientFunc(adjustedNormalized);
        };
    }

    /**
     * Rainbow color scheme (blue -> cyan -> green -> yellow -> red)
     */
    private rainbowScheme(): ColorMapFunction {
        return (normalized: number): RGB => {
            let r: number, g: number, b: number;

            if (normalized < 0.25) {
                const t = normalized / 0.25;
                r = 0 + 68 * t;
                g = 0 + 119 * t;
                b = 255 - 74 * t;
            } else if (normalized < 0.5) {
                const t = (normalized - 0.25) / 0.25;
                r = 68 + 92 * t;
                g = 119 + 91 * t;
                b = 181 - 111 * t;
            } else if (normalized < 0.75) {
                const t = (normalized - 0.5) / 0.25;
                r = 160 + 91 * t;
                g = 210 + 35 * t;
                b = 70 - 70 * t;
            } else {
                const t = (normalized - 0.75) / 0.25;
                r = 251 + 4 * t;
                g = 245 - 58 * t;
                b = 0;
            }

            return { r, g, b };
        };
    }

    /**
     * Viridis color scheme (perceptually uniform)
     */
    private viridisScheme(): ColorMapFunction {
        const stops: ColorStop[] = [
            { position: 0.00, color: { r: 68, g: 1, b: 84 } },
            { position: 0.25, color: { r: 59, g: 82, b: 139 } },
            { position: 0.50, color: { r: 33, g: 145, b: 140 } },
            { position: 0.75, color: { r: 94, g: 201, b: 98 } },
            { position: 1.00, color: { r: 253, g: 231, b: 37 } }
        ];
        return this.createGradientFunction(stops);
    }

    /**
     * Plasma color scheme
     */
    private plasmaScheme(): ColorMapFunction {
        const stops: ColorStop[] = [
            { position: 0.00, color: { r: 13, g: 8, b: 135 } },
            { position: 0.25, color: { r: 126, g: 3, b: 168 } },
            { position: 0.50, color: { r: 204, g: 71, b: 120 } },
            { position: 0.75, color: { r: 248, g: 149, b: 64 } },
            { position: 1.00, color: { r: 240, g: 249, b: 33 } }
        ];
        return this.createGradientFunction(stops);
    }

    /**
     * Turbo color scheme (Google's improved rainbow)
     */
    private turboScheme(): ColorMapFunction {
        const stops: ColorStop[] = [
            { position: 0.00, color: { r: 48, g: 18, b: 59 } },
            { position: 0.20, color: { r: 33, g: 102, b: 172 } },
            { position: 0.40, color: { r: 53, g: 183, b: 121 } },
            { position: 0.60, color: { r: 159, g: 231, b: 61 } },
            { position: 0.80, color: { r: 252, g: 178, b: 37 } },
            { position: 1.00, color: { r: 122, g: 4, b: 3 } }
        ];
        return this.createGradientFunction(stops);
    }

    /**
     * Thermal color scheme (black -> red -> orange -> yellow -> white)
     */
    private thermalScheme(): ColorMapFunction {
        const stops: ColorStop[] = [
            { position: 0.00, color: { r: 0, g: 0, b: 0 } },
            { position: 0.25, color: { r: 128, g: 0, b: 0 } },
            { position: 0.50, color: { r: 255, g: 69, b: 0 } },
            { position: 0.75, color: { r: 255, g: 215, b: 0 } },
            { position: 1.00, color: { r: 255, g: 255, b: 255 } }
        ];
        return this.createGradientFunction(stops);
    }

    /**
     * Grayscale color scheme
     */
    private grayscaleScheme(): ColorMapFunction {
        return (normalized: number): RGB => {
            const value = normalized * 255;
            return { r: value, g: value, b: value };
        };
    }

    /**
     * Update value range
     */
    public updateRange(minValue: number, maxValue: number): void {
        this.minValue = minValue;
        this.maxValue = maxValue;
    }

    /**
     * Get the current value range
     */
    public getRange(): { min: number; max: number } {
        return { min: this.minValue, max: this.maxValue };
    }
}

/**
 * Helper function to create a custom color mapper with stops
 */
export function createCustomColorMapper(
    minValue: number,
    maxValue: number,
    stops: ColorStop[]
): ColorMapper {
    return new ColorMapper(minValue, maxValue, stops);
}

/**
 * Helper function to create a color mapper with a custom function
 */
export function createFunctionColorMapper(
    minValue: number,
    maxValue: number,
    colorFunction: ColorMapFunction
): ColorMapper {
    return new ColorMapper(minValue, maxValue, colorFunction);
}