from math import ceil
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

MODELS = ("seasonal_naive", "trailing_mean", "gradient_boosting")
LABELS = {
    "seasonal_naive": "Seasonal naive",
    "trailing_mean": "28-day mean",
    "gradient_boosting": "Gradient boosting",
}
HORIZON = 28


def validate(frame):
    required = {"unique_id", "ds", "y", "sell_price"}
    if not required.issubset(frame.columns):
        raise ValueError("Required columns: unique_id, ds, y, sell_price")
    frame = frame.copy()
    frame["ds"] = pd.to_datetime(frame["ds"], errors="raise")
    for column in ["y", "sell_price"]:
        frame[column] = pd.to_numeric(frame[column], errors="raise")
        observed = frame[column].dropna() if column == "sell_price" else frame[column]
        if not np.isfinite(observed).all() or (observed < 0).any():
            raise ValueError(f"{column} must be finite and nonnegative")
    if frame["unique_id"].isna().any() or frame.duplicated(["unique_id", "ds"]).any():
        raise ValueError("Series/date keys must be present and unique")
    for _, group in frame.groupby("unique_id"):
        dates = group["ds"].sort_values()
        if len(dates) < 365 or not dates.diff().dropna().eq(pd.Timedelta(days=1)).all():
            raise ValueError(
                "Each series needs at least 365 contiguous daily observations"
            )
    return frame.sort_values(["unique_id", "ds"])


def features(history, date):
    history = np.asarray(history, dtype=float)
    return np.array(
        [history[-lag] for lag in [1, 7, 14, 28]]
        + [float(np.mean(history[-w:])) for w in [7, 28, 56]]
        + [
            float(np.std(history[-28:])),
            date.dayofweek,
            date.month,
            np.sin(2 * np.pi * date.dayofyear / 365.25),
            np.cos(2 * np.pi * date.dayofyear / 365.25),
        ]
    )


def forecast(y, dates, horizon, model):
    """Recursive multi-step forecast; only the supplied historical prefix is read."""
    y = np.asarray(y, dtype=float)
    if horizon < 1 or len(y) < 57:
        raise ValueError("Need positive horizon and at least 57 historical days")
    if model == "seasonal_naive":
        return np.tile(y[-7:], ceil(horizon / 7))[:horizon]
    if model == "trailing_mean":
        return np.repeat(np.mean(y[-28:]), horizon)
    if model != "gradient_boosting":
        raise ValueError("Unknown model")
    start = max(56, len(y) - 730)
    x = np.stack([features(y[:i], dates[i]) for i in range(start, len(y))])
    learner = HistGradientBoostingRegressor(
        max_iter=70,
        max_leaf_nodes=12,
        l2_regularization=5,
        learning_rate=0.06,
        random_state=17,
    )
    learner.fit(x, y[start:])
    history = list(y)
    result = []
    for date in pd.date_range(dates[-1] + pd.Timedelta(days=1), periods=horizon):
        value = max(
            0.0, float(learner.predict(features(history, date).reshape(1, -1))[0])
        )
        result.append(value)
        history.append(value)
    return np.asarray(result)


def interval_radius(errors, coverage=0.9):
    """Finite-sample absolute-residual quantile; time-series coverage is empirical."""
    values = np.sort(np.abs(np.asarray(errors, dtype=float)))
    if not len(values) or not 0 < coverage < 1:
        raise ValueError("Need calibration errors and valid coverage")
    return float(values[min(len(values) - 1, ceil((len(values) + 1) * coverage) - 1)])


def score(actual, predicted, training):
    actual = np.asarray(actual)
    predicted = np.asarray(predicted)
    training = np.asarray(training)
    error = np.abs(actual - predicted)
    denominator = float(actual.sum())
    scale = float(np.mean(np.abs(training[7:] - training[:-7])))
    return {
        "mae": float(error.mean()),
        "wape": float(error.sum() / denominator) if denominator else None,
        "mase": float(error.mean() / scale) if scale else None,
        "absolute_error": float(error.sum()),
        "actual_units": denominator,
        "bias": float((predicted - actual).mean()),
    }
