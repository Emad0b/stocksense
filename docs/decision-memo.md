# Decision memo: forecasting is an input, not the decision

## Recommendation

Treat StockSense as a reproducible research demonstration, not an inventory deployment recommendation. Keep simple baselines. Evaluate forecasts and stocking policies separately on larger, operationally representative data before making purchasing decisions.

## Evidence

The experiment uses eight related food-product series from Nixtla's public M5 sample: 15,752 daily observations from 29 January 2011 through 19 June 2016. There are three 28-day model-selection windows, one subsequent calibration window, and a final 28-day test. Models are selected per SKU by mean selection-window MAE.

Final holdout WAPE was **105.76%** for seasonal naive, **80.05%** for the 28-day mean, **78.19%** for gradient boosting, and **80.88%** for the preselected per-SKU strategy. The selection strategy improved on seasonal naive, but did not beat the global boosting comparator on this test. Do not change the selected strategy based on this holdout and still describe it as untouched.

The selected strategy's nominal 90% residual intervals covered **91.07%** of held-out product-days. This is an empirical result from a small, dependent time-series sample, not a guarantee of future coverage.

**A concrete counterexample:** for `FOODS_1_004`, gradient boosting achieved **60.7% WAPE**, versus **77.2%** for seasonal naive. Yet their calibrated inventory targets incurred **$65** versus **$12** of realized simulated cost, respectively, under $1 overage and $5 shortage costs, zero starting inventory and a 28-day single-period model. Calibration and demand distributions matter to the decision; lower point error alone was insufficient. The dashboard's starting-inventory control can change the comparison.

## Decision assumptions

One order is placed at the start of a period and is available immediately. There is no within-period replenishment or supplier lead time. Overage cost applies to units left at the end; shortage cost applies to unmet observed sales. Purchase costs, fixed order fees, daily carrying charges, salvage, substitution, backorders and price optimization are excluded.

The target is a newsvendor quantile of a simulated demand distribution built from forecast values and seven-day blocks of calibration residuals. Negative daily simulated values are clipped to zero, and period totals rounded to integer units. Costs are user-specified assumptions, not measured Walmart operating costs. Existing on-hand stock cannot be returned: order quantity is max(target − assumed starting stock, 0).

## What would change the recommendation?

Add inventory availability and stockout labels to distinguish sales from latent demand; supplier lead-time data; actual shortage/overage economics; more products and stores; and a new, prospectively reserved test window. Evaluate intermittent-demand methods, horizon-specific calibration and rolling replenishment. Measure interval coverage by product and demand regime rather than relying on one aggregate number.
