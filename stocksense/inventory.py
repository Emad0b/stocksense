"""Single-period newsvendor simulation, not a live replenishment system."""

import numpy as np


def bootstrap_demand(predicted, residuals, samples=500, seed=17):
    predicted = np.asarray(predicted, dtype=float)
    residuals = np.asarray(residuals, dtype=float)
    if not len(predicted) or not len(residuals):
        raise ValueError("Forecast and calibration residuals are required")
    block = min(7, len(residuals))
    totals = []
    for _ in range(samples):
        errors = []
        while len(errors) < len(predicted):
            seed = (1664525 * seed + 1013904223) & 0xFFFFFFFF
            start = int(seed / 4294967296 * (len(residuals) - block + 1))
            errors.extend(residuals[start : start + block])
        totals.append(
            float(
                np.floor(
                    np.maximum(0, predicted + errors[: len(predicted)]).sum() + 0.5
                )
            )
        )
    return np.sort(totals)


def cost(stock, demand, overage, shortage):
    if min(stock, demand, overage, shortage) < 0:
        raise ValueError("Inputs must be nonnegative")
    return overage * max(stock - demand, 0) + shortage * max(demand - stock, 0)


def target(distribution, overage, shortage):
    if overage <= 0 or shortage <= 0 or len(distribution) == 0:
        raise ValueError("Costs and demand distribution must be positive")
    return int(
        np.ceil(
            np.quantile(
                distribution, shortage / (overage + shortage), method="inverted_cdf"
            )
        )
    )
