export function quantile(values: number[], q: number) {
  if (!values.length || q < 0 || q > 1) throw Error("Invalid quantile");
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1))
  ];
}
export function radius(errors: number[], coverage = 0.9) {
  const values = errors.map(Math.abs).sort((a, b) => a - b);
  return values[
    Math.min(values.length - 1, Math.ceil((values.length + 1) * coverage) - 1)
  ];
}
export function bootstrap(
  predicted: number[],
  errors: number[],
  samples = 500,
) {
  let seed = 17;
  const rng = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const block = Math.min(7, errors.length),
    totals: number[] = [];
  for (let i = 0; i < samples; i++) {
    const noise: number[] = [];
    while (noise.length < predicted.length) {
      const start = Math.floor(rng() * (errors.length - block + 1));
      noise.push(...errors.slice(start, start + block));
    }
    totals.push(
      Math.round(
        predicted.reduce((s, v, j) => s + Math.max(0, v + noise[j]), 0),
      ),
    );
  }
  return totals.sort((a, b) => a - b);
}
export const inventoryCost = (
  stock: number,
  demand: number,
  overage: number,
  shortage: number,
) =>
  overage * Math.max(stock - demand, 0) +
  shortage * Math.max(demand - stock, 0);
export const stockTarget = (
  distribution: number[],
  overage: number,
  shortage: number,
) => Math.ceil(quantile(distribution, shortage / (overage + shortage)));
export const sum = (values: number[]) => values.reduce((s, v) => s + v, 0);
