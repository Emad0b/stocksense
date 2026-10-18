import json
from pathlib import Path
import numpy as np
import pandas as pd
import pytest
from stocksense import forecast as module
from stocksense.forecast import features, forecast, interval_radius, score, validate
from stocksense.inventory import bootstrap_demand, cost, target


def frame():
    return pd.DataFrame(
        {
            "unique_id": ["sku"] * 400,
            "ds": pd.date_range("2020-01-01", periods=400),
            "y": np.arange(400) % 7,
            "sell_price": 2.0,
        }
    )


def test_schema_rejects_duplicates_negative_and_missing_days():
    original = frame()
    with pytest.raises(ValueError):
        validate(pd.concat([original, original.iloc[:1]]))
    original.loc[2, "y"] = -1
    with pytest.raises(ValueError):
        validate(original)
    with pytest.raises(ValueError):
        validate(frame().drop(index=20))
    broken = frame()
    broken.loc[3, "y"] = np.nan
    with pytest.raises(ValueError):
        validate(broken)


def test_missing_prices_are_preserved_not_future_filled():
    original = frame()
    original.loc[:30, "sell_price"] = np.nan
    checked = validate(original)
    assert checked.sell_price.isna().sum() == 31


def test_features_use_only_historical_observations():
    y = np.arange(80, dtype=float)
    actual = features(y, pd.Timestamp("2020-01-01"))
    np.testing.assert_equal(actual[:4], [79, 73, 66, 52])
    assert actual[4] == np.mean(y[-7:])
    assert actual[6] == np.mean(y[-56:])


def test_recursive_boosting_feeds_predictions_not_future_labels(monkeypatch):
    rows = []

    class Learner:
        def __init__(self, **kwargs):
            pass

        def fit(self, x, y):
            assert max(y) < 100

        def predict(self, x):
            rows.append(x[0].copy())
            return np.array([123.0])

    monkeypatch.setattr(module, "HistGradientBoostingRegressor", Learner)
    y = np.arange(80, dtype=float)
    dates = list(pd.date_range("2020-01-01", periods=80))
    result = forecast(y, dates, 3, "gradient_boosting")
    assert rows[0][0] == 79
    assert rows[1][0] == 123
    np.testing.assert_equal(result, [123, 123, 123])


def test_baselines_and_zero_denominators():
    y = np.arange(70, dtype=float)
    dates = list(pd.date_range("2020-01-01", periods=70))
    np.testing.assert_equal(
        forecast(y, dates, 14, "seasonal_naive"), np.tile(y[-7:], 2)
    )
    np.testing.assert_equal(
        forecast(y, dates, 5, "trailing_mean"), np.repeat(y[-28:].mean(), 5)
    )
    metrics = score([0, 0], [1, 1], np.zeros(20))
    assert metrics["wape"] is None and metrics["mase"] is None and metrics["mae"] == 1


def test_calibration_quantile_and_coverage():
    assert interval_radius(np.arange(1, 29)) == 27
    with pytest.raises(ValueError):
        interval_radius([])


def test_bootstrap_is_reproducible_integer_and_nonnegative():
    a = bootstrap_demand([2.5] * 14, list(range(-5, 6)) * 3)
    b = bootstrap_demand([2.5] * 14, list(range(-5, 6)) * 3)
    np.testing.assert_equal(a, b)
    assert min(a) >= 0 and np.equal(a, np.floor(a)).all()
    assert len(set(a)) > 5


def test_newsvendor_target_minimizes_simulated_cost():
    distribution = np.array([1, 2, 2, 3, 5, 8, 9])
    chosen = target(distribution, 1, 5)
    expected = lambda stock: np.mean([cost(stock, d, 1, 5) for d in distribution])
    assert expected(chosen) == min(expected(stock) for stock in range(15))
    assert target(distribution, 1, 15) >= target(distribution, 1, 1)
    assert target(distribution, 8, 1) <= target(distribution, 1, 1)
    assert cost(10, 15, 2, 7) == 35
    assert cost(20, 15, 2, 7) == 10


def test_published_benchmark_selection_and_metrics():
    data = json.loads(Path("public/benchmark.json").read_text())
    assert len(data["products"]) == 8
    assert data["source"]["observations"] == 15752
    for product in data["products"]:
        chosen = min(
            product["models"], key=lambda m: product["models"][m]["selection_mae"]
        )
        assert chosen == product["selected_model"]
        rows = [r for r in data["folds"] if r["sku"] == product["id"]]
        assert len(rows) == 15
        assert {r["phase"] for r in rows} == {"selection", "calibration", "test"}
        for model in product["models"].values():
            assert (
                len(model["test_prediction"]) == len(model["future_prediction"]) == 28
            )
            expected = np.abs(
                np.array(product["test_actual"]) - np.array(model["test_prediction"])
            ).mean()
            assert model["metrics"]["mae"] == pytest.approx(expected)
    selected = next(x for x in data["leaderboard"] if x["id"] == "selected")
    assert selected["wape"] == pytest.approx(0.8087931289, abs=1e-6)
