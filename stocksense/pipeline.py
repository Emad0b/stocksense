"""Five chronological windows: three selection, one calibration, one untouched test."""

import argparse
import hashlib
import json
import sqlite3
from pathlib import Path
import numpy as np
import pandas as pd
from .forecast import (
    HORIZON,
    LABELS,
    MODELS,
    forecast,
    interval_radius,
    score,
    validate,
)
from .inventory import bootstrap_demand, cost, target


def run(source="data/m5_sample.csv", output="public/benchmark.json"):
    source = Path(source)
    frame = validate(pd.read_csv(source))
    Path("runtime").mkdir(exist_ok=True)
    with sqlite3.connect("runtime/stocksense.sqlite") as connection:
        frame.to_sql("daily_sales", connection, if_exists="replace", index=False)
        audit = pd.read_sql_query(
            "SELECT unique_id, COUNT(*) days, SUM(y) units, SUM(CASE WHEN y=0 THEN 1 ELSE 0 END)*1.0/COUNT(*) zero_fraction FROM daily_sales GROUP BY unique_id ORDER BY unique_id",
            connection,
        ).to_dict("records")
    products = []
    folds = []
    inventory_rows = []
    for key, group in frame.groupby("unique_id"):
        y = group["y"].to_numpy(dtype=float)
        dates = list(group["ds"])
        n = len(y)
        origins = [n - HORIZON * i for i in [5, 4, 3, 2, 1]]
        runs = {model: [] for model in MODELS}
        for j, origin in enumerate(origins):
            phase = "selection" if j < 3 else "calibration" if j == 3 else "test"
            for model in MODELS:
                pred = forecast(y[:origin], dates[:origin], HORIZON, model)
                metrics = score(y[origin : origin + HORIZON], pred, y[:origin])
                result = {
                    "origin": str(dates[origin].date()),
                    "phase": phase,
                    "prediction": pred.tolist(),
                    **metrics,
                }
                runs[model].append(result)
                folds.append(
                    {
                        "sku": key,
                        "model": model,
                        "phase": phase,
                        "fold": j + 1,
                        "origin": result["origin"],
                        **metrics,
                    }
                )
        selected = min(MODELS, key=lambda m: sum(r["mae"] for r in runs[m][:3]))
        models = {}
        for model in MODELS:
            errors = y[origins[3] : origins[3] + HORIZON] - np.array(
                runs[model][3]["prediction"]
            )
            radius = interval_radius(errors)
            pred = np.array(runs[model][4]["prediction"])
            actual = y[-HORIZON:]
            lower = np.maximum(0, pred - radius)
            upper = pred + radius
            outlook = forecast(y, dates, HORIZON, model)
            dist = bootstrap_demand(pred, errors)
            stock = target(dist, 1, 5)
            models[model] = {
                "label": LABELS[model],
                "selection_mae": float(np.mean([r["mae"] for r in runs[model][:3]])),
                "metrics": {
                    **score(actual, pred, y[:-HORIZON]),
                    "coverage": float(np.mean((actual >= lower) & (actual <= upper))),
                    "mean_interval_width": float(np.mean(upper - lower)),
                },
                "test_prediction": pred.tolist(),
                "future_prediction": outlook.tolist(),
                "calibration_errors": errors.tolist(),
                "radius90": radius,
                "test_demand_distribution": dist.tolist(),
            }
            inventory_rows.append(
                {
                    "sku": key,
                    "model": model,
                    "stock": stock,
                    "realized_demand": float(actual.sum()),
                    "realized_cost": cost(stock, float(actual.sum()), 1, 5),
                    "forecast_only_cost": cost(
                        float(pred.sum()), float(actual.sum()), 1, 5
                    ),
                }
            )
        products.append(
            {
                "id": key,
                "name": key.replace("_", " "),
                "price": float(group["sell_price"].iloc[-1]),
                "history_dates": [str(d.date()) for d in dates[-112:]],
                "history": y[-112:].tolist(),
                "test_dates": [str(d.date()) for d in dates[-HORIZON:]],
                "test_actual": y[-HORIZON:].tolist(),
                "future_dates": [
                    str(d.date())
                    for d in pd.date_range(
                        dates[-1] + pd.Timedelta(days=1), periods=HORIZON
                    )
                ],
                "selected_model": selected,
                "models": models,
                "zero_fraction": float(np.mean(y == 0)),
            }
        )
        print(
            f"{key}: selected {selected}; test WAPE={models[selected]['metrics']['wape']:.3f}",
            flush=True,
        )
    results = []
    for model in (*MODELS, "selected"):
        metrics = [
            p["models"][p["selected_model"] if model == "selected" else model][
                "metrics"
            ]
            for p in products
        ]
        results.append(
            {
                "id": model,
                "label": "Selected per SKU" if model == "selected" else LABELS[model],
                "wape": sum(m["absolute_error"] for m in metrics)
                / sum(m["actual_units"] for m in metrics),
                "mae": float(np.mean([m["mae"] for m in metrics])),
                "coverage": float(np.mean([m["coverage"] for m in metrics])),
                "bias": float(np.mean([m["bias"] for m in metrics])),
            }
        )
    provenance = json.loads(Path("data/source.json").read_text())
    if hashlib.sha256(source.read_bytes()).hexdigest() != provenance["sha256"]:
        raise ValueError("Source SHA-256 differs from the recorded data manifest")
    payload = {
        "schema_version": 1,
        "source": {
            **provenance,
            "name": "M5 · Nixtla public sample",
            "series": len(products),
            "days_per_series": len(frame) // len(products),
            "start": str(frame.ds.min().date()),
            "end": str(frame.ds.max().date()),
            "observations": len(frame),
        },
        "protocol": {
            "horizon": HORIZON,
            "selection_origins": [str(dates[i].date()) for i in origins[:3]],
            "calibration_origin": str(dates[origins[3]].date()),
            "test_origin": str(dates[origins[4]].date()),
            "coverage_target": 0.9,
            "model_training_days": 730,
            "bootstrap_samples": 500,
            "bootstrap_block_days": 7,
        },
        "products": products,
        "leaderboard": results,
        "folds": folds,
        "audit": audit,
        "inventory_default": inventory_rows,
    }
    output = Path(output)
    output.parent.mkdir(exist_ok=True, parents=True)
    output.write_text(
        json.dumps(payload, separators=(",", ":"), allow_nan=False), encoding="utf-8"
    )
    Path("docs").mkdir(exist_ok=True)
    Path("docs/metrics.json").write_text(
        json.dumps(
            {
                "source": payload["source"],
                "protocol": payload["protocol"],
                "leaderboard": results,
                "inventory_default": inventory_rows,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print("Written", output, flush=True)
    return payload


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="data/m5_sample.csv")
    parser.add_argument("--output", default="public/benchmark.json")
    args = parser.parse_args()
    run(args.source, args.output)
