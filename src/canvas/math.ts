/** Smallest multiple of `step` that is >= n. */
export const ceilTo = (n: number, step: number): number => Math.ceil(n / step) * step;
