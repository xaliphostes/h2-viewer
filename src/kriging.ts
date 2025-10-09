/**
 * Kriging Simple - Interpolation géostatistique
 * 
 * Le Kriging est une méthode d'interpolation qui prend en compte
 * la corrélation spatiale entre les points de mesure.
 */

import { DataPoint, VariogramModel, Interpolator } from './interpolation.types';

export interface KrigingParams {
    model?: VariogramModel;
    nugget?: number;
    sill?: number | null;
    range?: number | null;
}

export interface VariogramParameters {
    model: VariogramModel;
    nugget: number;
    sill: number;
    range: number;
}

class Kriging implements Interpolator {
    private data: DataPoint[];
    private model: VariogramModel;
    private nugget: number;
    private sill: number;
    private range: number;
    private K: number[][] | null = null;
    private M: number[][] | null = null;

    constructor(data: DataPoint[], params: KrigingParams = {}) {
        this.data = data;

        // Paramètres du variogramme
        this.model = params.model || 'exponential';
        this.nugget = params.nugget || 0;
        this.sill = params.sill ?? null as any;
        this.range = params.range ?? null as any;

        // Calculer automatiquement les paramètres si non fournis
        if (this.sill === null || this.range === null) {
            this.fitVariogram();
        }

        this.prepareMatrices();
    }

    /**
     * Interpole la valeur à un point donné
     */
    public interpolate(lon: number, lat: number): number {
        const n = this.data.length;

        if (!this.M) {
            throw new Error('Matrix not initialized');
        }

        // Vecteur de covariance entre le point cible et les données
        const k: number[] = Array(n).fill(0);
        for (let i = 0; i < n; i++) {
            const h = this.distance({ lon, lat }, this.data[i]);
            k[i] = this.sill - this.variogram(h);
        }

        // Calculer les poids λ = M * k
        const weights: number[] = Array(n).fill(0);
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                weights[i] += this.M[i][j] * k[j];
            }
        }

        // Valeur interpolée = Σ(λᵢ * zᵢ)
        let value = 0;
        for (let i = 0; i < n; i++) {
            value += weights[i] * this.data[i].h2;
        }

        return value;
    }

    /**
     * Calcule la variance de kriging (incertitude)
     */
    public variance(lon: number, lat: number): number {
        const n = this.data.length;

        if (!this.M) {
            throw new Error('Matrix not initialized');
        }

        // Vecteur de covariance
        const k: number[] = Array(n).fill(0);
        for (let i = 0; i < n; i++) {
            const h = this.distance({ lon, lat }, this.data[i]);
            k[i] = this.sill - this.variogram(h);
        }

        // Poids
        const weights: number[] = Array(n).fill(0);
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                weights[i] += this.M[i][j] * k[j];
            }
        }

        // Variance = sill - Σ(λᵢ * kᵢ)
        let variance = this.sill;
        for (let i = 0; i < n; i++) {
            variance -= weights[i] * k[i];
        }

        return Math.max(0, variance); // Éviter les valeurs négatives dues aux erreurs numériques
    }

    /**
     * Retourne les paramètres du variogramme
     */
    public getParameters(): VariogramParameters {
        return {
            model: this.model,
            nugget: this.nugget,
            sill: this.sill,
            range: this.range
        };
    }

    /**
     * Calcule la distance euclidienne entre deux points
     */
    private distance(p1: { lon: number; lat: number }, p2: { lon: number; lat: number }): number {
        return Math.sqrt(
            Math.pow(p1.lon - p2.lon, 2) +
            Math.pow(p1.lat - p2.lat, 2)
        );
    }

    /**
     * Modèles de variogramme
     * Le variogramme décrit comment la corrélation diminue avec la distance
     */
    private variogram(h: number): number {
        if (h === 0) return 0;

        const { nugget, sill, range } = this;
        const c = sill - nugget; // Contribution spatiale

        switch (this.model) {
            case 'exponential':
                // Diminution exponentielle
                return nugget + c * (1 - Math.exp(-3 * h / range));

            case 'gaussian':
                // Diminution gaussienne (très lisse)
                return nugget + c * (1 - Math.exp(-3 * Math.pow(h / range, 2)));

            case 'spherical':
                // Modèle sphérique (classique en géologie)
                if (h >= range) {
                    return sill;
                }
                return nugget + c * (1.5 * h / range - 0.5 * Math.pow(h / range, 3));

            default:
                return nugget + c * (1 - Math.exp(-3 * h / range));
        }
    }

    /**
     * Estime automatiquement les paramètres du variogramme
     */
    private fitVariogram(): void {
        const n = this.data.length;
        const distances: number[] = [];
        const variances: number[] = [];

        // Calculer les distances et semi-variances empiriques
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const d = this.distance(this.data[i], this.data[j]);
                const gamma = 0.5 * Math.pow(this.data[i].h2 - this.data[j].h2, 2);
                distances.push(d);
                variances.push(gamma);
            }
        }

        // Estimer le palier (sill) comme la variance des données
        const values = this.data.map(d => d.h2);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;

        this.sill = variance * 1.2; // Un peu plus que la variance

        // Estimer la portée (range) comme une fraction de la distance maximale
        const maxDist = Math.max(...distances);
        this.range = maxDist * 0.3; // 30% de la distance max

        // Nugget par défaut faible
        if (this.nugget === 0) {
            this.nugget = this.sill * 0.05; // 5% du sill
        }
    }

    /**
     * Prépare les matrices pour le système de Kriging
     */
    private prepareMatrices(): void {
        const n = this.data.length;

        // Matrice de covariance K (n x n)
        this.K = Array(n).fill(0).map(() => Array(n).fill(0));

        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                const h = this.distance(this.data[i], this.data[j]);
                // Covariance = Sill - Variogramme
                this.K[i][j] = this.sill - this.variogram(h);
            }
        }

        // Inverser la matrice K (utilisant l'élimination de Gauss)
        this.M = this.invertMatrix(this.K);
    }

    /**
     * Inverse une matrice (méthode de Gauss-Jordan)
     */
    private invertMatrix(matrix: number[][]): number[][] {
        const n = matrix.length;
        const identity: number[][] = Array(n).fill(0).map((_, i) =>
            Array(n).fill(0).map((_, j) => i === j ? 1 : 0)
        );

        // Créer une copie augmentée [A | I]
        const augmented: number[][] = matrix.map((row, i) => [...row, ...identity[i]]);

        // Élimination de Gauss-Jordan
        for (let i = 0; i < n; i++) {
            // Trouver le pivot
            let maxRow = i;
            for (let k = i + 1; k < n; k++) {
                if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
                    maxRow = k;
                }
            }

            // Échanger les lignes
            [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

            // Normaliser la ligne pivot
            const pivot = augmented[i][i];
            if (Math.abs(pivot) < 1e-10) {
                console.warn('Matrice singulière détectée');
                continue;
            }

            for (let j = 0; j < 2 * n; j++) {
                augmented[i][j] /= pivot;
            }

            // Éliminer la colonne
            for (let k = 0; k < n; k++) {
                if (k !== i) {
                    const factor = augmented[k][i];
                    for (let j = 0; j < 2 * n; j++) {
                        augmented[k][j] -= factor * augmented[i][j];
                    }
                }
            }
        }

        // Extraire la matrice inverse (partie droite)
        return augmented.map(row => row.slice(n));
    }
}

export default Kriging;