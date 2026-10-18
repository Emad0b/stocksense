# Methodology and leakage controls

## Data

`data/source.json` pins the public sample's immutable Git commit, exact URL and SHA-256. `python -m stocksense.fetch_data` checks the fingerprint before writing the raw CSV. Raw data are excluded from Git; the browser ships a small derived benchmark and recent historical context.

Schema validation requires unique nonmissing series/date keys, nonnegative finite observed sales, at least 365 contiguous daily observations per series, and finite nonnegative prices when observed. Missing pre-launch prices remain missing. No forward-fill from future rows is performed. Prices are not model inputs.

A SQLite ingestion/audit reports observations, observed units and zero-sales fractions per series. The source's eight food-product identifiers have no supplied descriptions or store identities, so the UI does not invent them. Observed sales are not necessarily unconstrained demand.

## Chronological protocol

The final 140 days are partitioned into five disjoint 28-day windows. The first three select one model per series using average MAE. The fourth estimates residual intervals and the inventory uncertainty distribution. The fifth is used only for final evaluation. Selection and calibration are never recomputed from test results.

Every forecast origin receives only the historical prefix. HistGradientBoosting uses at most 730 historical target rows and features built from lagged sales (1, 7, 14, 28 days), prior rolling means (7, 28, 56), prior 28-day standard deviation, and deterministic calendar terms. During a 28-day forecast, later feature rows use prior predictions, not actual held-out sales. The training target never appears in its own lag or rolling feature. Future realized prices are excluded.

Baselines are the repeated last observed week and a constant trailing 28-day mean. The gradient-boosting model is fitted separately for each series with fixed hyperparameters and random seed 17. No holdout hyperparameter search is performed. The forward outlook refits through the final observed date using the already selected model identity; those future dates have no observed actuals.

## Forecast metrics

WAPE is total absolute error divided by observed units, aggregated by sums across series, not an unweighted average of SKU percentages. A zero denominator is reported as unavailable. MAE is in units/day. Seasonal MASE uses the mean absolute seven-day difference of the historical training prefix and is unavailable for zero-scale series. Bias is predicted minus observed units/day.

This sample is not a full M5 hierarchy evaluation. No official WRMSSE score or competition ranking is claimed.

## Residual intervals

The 90% radius is the ceil((n+1)×0.9)-th ordered absolute calibration residual, capped at the available sample size. Lower limits are clipped at zero. Coverage is measured on the untouched test. With only 28 calibration residuals and temporal dependence, exchangeability assumptions are imperfect; treat the band as an approximate residual interval, not guaranteed conformal time-series coverage. The interval is marginal, not joint over the whole horizon.

## Inventory simulation

Calibration residuals are resampled in contiguous seven-day moving blocks using a fixed 32-bit linear-congruential generator. The same algorithm is implemented in Python and TypeScript; 500 paired sample totals were checked for equality. Simulated daily demand is max(0, forecast + residual), with total demand rounded to integer units. This preserves short-run residual patterns only approximately; the calibration window is small and overlapping blocks are dependent.

For positive overage cost h and shortage cost p, target stock is the empirical demand quantile at p/(p+h). This minimizes expected linear single-period cost over the **assumed simulated distribution**. It does not prove the true demand distribution or an optimal real replenishment policy. The realized-cost graph is retrospective; its minimum is not used to select the recommendation. Default Python decision-memo comparisons assume zero starting stock, h=1 and p=5; the interactive dashboard explicitly defaults to 20 assumed units.

Changing a browser model, SKU, horizon or cost control recomputes views/simulations using saved predictions. It does not retrain a model. Raw evidence and all assumptions are exportable.
