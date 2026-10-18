import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  Bar,
} from "recharts";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Box,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FlaskConical,
  Layers3,
  LayoutDashboard,
  LineChart as LineIcon,
  Package,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { bootstrap, inventoryCost, stockTarget, sum } from "./math";
import "./styles.css";
type Metrics = {
  mae: number;
  wape: number | null;
  mase: number | null;
  coverage: number;
  bias: number;
  absolute_error: number;
  actual_units: number;
  mean_interval_width: number;
};
type ForecastModel = {
  label: string;
  selection_mae: number;
  metrics: Metrics;
  test_prediction: number[];
  future_prediction: number[];
  calibration_errors: number[];
  radius90: number;
};
type Product = {
  id: string;
  name: string;
  price: number;
  history_dates: string[];
  history: number[];
  test_dates: string[];
  test_actual: number[];
  future_dates: string[];
  selected_model: string;
  models: Record<string, ForecastModel>;
  zero_fraction: number;
};
type Benchmark = {
  schema_version: number;
  source: {
    name: string;
    url: string;
    sha256: string;
    series: number;
    days_per_series: number;
    start: string;
    end: string;
    observations: number;
    retrieved: string;
  };
  protocol: {
    selection_origins: string[];
    calibration_origin: string;
    test_origin: string;
    horizon: number;
  };
  products: Product[];
  leaderboard: {
    id: string;
    label: string;
    wape: number;
    mae: number;
    coverage: number;
    bias: number;
  }[];
  folds: {
    sku: string;
    model: string;
    phase: string;
    fold: number;
    origin: string;
    mae: number;
    wape: number | null;
  }[];
  audit: {
    unique_id: string;
    days: number;
    units: number;
    zero_fraction: number;
  }[];
};
const number = (v: number, d = 0) =>
  v.toLocaleString("en-US", {
    maximumFractionDigits: d,
    minimumFractionDigits: d,
  });
const percent = (v: number | null, d = 1) =>
  v === null ? "N/A" : number(v * 100, d) + "%";
const money = (v: number) => "$" + number(v, 0);
const date = (v: string) =>
  new Date(v + "T12:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
const longDate = (v: string) =>
  new Date(v + "T12:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const modelOf = (p: Product, key: string) =>
  p.models[key === "selected" ? p.selected_model : key];
function download(name: string, content: string, type = "text/csv") {
  const a = document.createElement("a"),
    url = URL.createObjectURL(new Blob([content], { type }));
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
const nav = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "forecast", label: "Forecast lab", icon: LineIcon },
  { id: "inventory", label: "Inventory lab", icon: Package },
  { id: "backtests", label: "Backtests", icon: FlaskConical },
  { id: "methods", label: "Data & methods", icon: Layers3 },
];
function App() {
  const [data, setData] = useState<Benchmark | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    fetch("/benchmark.json")
      .then((r) => {
        if (!r.ok)
          throw Error(
            "The benchmark has not been generated. Run python -m stocksense.pipeline.",
          );
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return data ? (
    <Studio data={data} />
  ) : (
    <div className="loading">
      <div className="brand-icon">
        <BarChart3 />
      </div>
      <h1>StockSense</h1>
      <p>{error || "Loading measured forecast results…"}</p>
      {error && <button onClick={() => location.reload()}>Retry</button>}
    </div>
  );
}
function Studio({ data }: { data: Benchmark }) {
  const [tab, setTab] = useState("overview"),
    [sku, setSku] = useState(data.products[0].id),
    [model, setModel] = useState("selected"),
    [horizon, setHorizon] = useState(28),
    [mode, setMode] = useState<"future" | "test">("future"),
    [query, setQuery] = useState(""),
    [overage, setOverage] = useState(1),
    [shortage, setShortage] = useState(5),
    [onHand, setOnHand] = useState(20);
  const product = data.products.find((p) => p.id === sku)!,
    forecast = modelOf(product, model),
    pred = forecast.test_prediction.slice(0, horizon),
    actual = product.test_actual.slice(0, horizon);
  const distribution = useMemo(
    () => bootstrap(pred, forecast.calibration_errors),
    [sku, model, horizon, data],
  );
  const target = stockTarget(distribution, overage, shortage),
    available = Math.max(onHand, target),
    demand = sum(actual),
    policyCost = inventoryCost(available, demand, overage, shortage),
    baselineStock = Math.max(
      onHand,
      Math.ceil(
        sum(product.models.seasonal_naive.test_prediction.slice(0, horizon)),
      ),
    ),
    baselineCost = inventoryCost(baselineStock, demand, overage, shortage);
  const portfolio = useMemo(
    () =>
      data.products.map((p) => {
        const m = modelOf(p, model),
          a = p.test_actual.slice(0, horizon),
          f = m.test_prediction.slice(0, horizon);
        return {
          product: p,
          model: m,
          wape: sum(a)
            ? sum(a.map((v, i) => Math.abs(v - f[i]))) / sum(a)
            : null,
          absolute: sum(a.map((v, i) => Math.abs(v - f[i]))),
          units: sum(a),
          forecast: sum(m.future_prediction.slice(0, horizon)),
          coverage:
            a.filter(
              (v, i) =>
                v >= Math.max(0, f[i] - m.radius90) && v <= f[i] + m.radius90,
            ).length / horizon,
        };
      }),
    [data, model, horizon],
  );
  const totalForecast = sum(portfolio.map((p) => p.forecast)),
    totalWape =
      sum(portfolio.map((p) => p.absolute)) /
      sum(portfolio.map((p) => p.units)),
    coverage = sum(portfolio.map((p) => p.coverage)) / portfolio.length;
  const chartData = useMemo(() => {
    if (mode === "future") {
      return [
        ...product.history_dates
          .slice(-42)
          .map((ds, i) => ({ ds, actual: product.history.slice(-42)[i] })),
        ...product.future_dates.slice(0, horizon).map((ds, i) => ({
          ds,
          prediction: forecast.future_prediction[i],
          baseline: product.models.seasonal_naive.future_prediction[i],
          band: [
            Math.max(0, forecast.future_prediction[i] - forecast.radius90),
            forecast.future_prediction[i] + forecast.radius90,
          ],
        })),
      ];
    }
    return product.history_dates.slice(-84).map((ds, i) => {
      const actual = product.history.slice(-84)[i],
        index = product.test_dates.indexOf(ds);
      return index >= 0 && index < horizon
        ? {
            ds,
            actual,
            prediction: forecast.test_prediction[index],
            baseline: product.models.seasonal_naive.test_prediction[index],
            band: [
              Math.max(0, forecast.test_prediction[index] - forecast.radius90),
              forecast.test_prediction[index] + forecast.radius90,
            ],
          }
        : { ds, actual };
    });
  }, [sku, model, horizon, mode, data]);
  const frontier = useMemo(() => {
    const high =
      Math.max(1, distribution[distribution.length - 1], demand) * 1.25;
    return Array.from({ length: 61 }, (_, i) => {
      const stock = Math.ceil((high * i) / 60);
      return {
        stock,
        expected:
          sum(
            distribution.map((d) => inventoryCost(stock, d, overage, shortage)),
          ) / distribution.length,
        realized: inventoryCost(stock, demand, overage, shortage),
      };
    });
  }, [distribution, demand, overage, shortage]);
  const exportForecast = () =>
    download(
      "stocksense-forecast.csv",
      "sku,date,model,forecast,lower_90,upper_90\n" +
        data.products
          .flatMap((p) => {
            const m = modelOf(p, model);
            return p.future_dates
              .slice(0, horizon)
              .map((d, i) =>
                [
                  p.id,
                  d,
                  m.label,
                  m.future_prediction[i].toFixed(3),
                  Math.max(0, m.future_prediction[i] - m.radius90).toFixed(3),
                  (m.future_prediction[i] + m.radius90).toFixed(3),
                ].join(","),
              );
          })
          .join("\n"),
    );
  const visible = portfolio.filter((p) =>
    p.product.id.toLowerCase().includes(query.toLowerCase()),
  );
  const title = nav.find((n) => n.id === tab)!.label;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-icon">
            <BarChart3 size={23} />
          </span>
          StockSense<span className="brand-dot">.</span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">
            <Box size={16} />
          </span>
          <div>
            Retail intelligence<small>Research workspace</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              className={tab === n.id ? "active" : ""}
              onClick={() => setTab(n.id)}
            >
              <n.icon size={18} />
              {n.label}
              {tab === n.id && <span />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="small-label">THE QUESTION THAT MATTERS</span>
          <p>
            Better forecasts.
            <br />
            Better stock decisions.
          </p>
          <div>
            <ShieldCheck size={14} /> Measured, not assumed
          </div>
        </div>
        <div className="sidebar-bottom">
          <div className="dataset-tag">
            <span /> M5 historical sample
          </div>
          <small>8 series · reproducible benchmark</small>
          <a
            href="#methods"
            onClick={(event) => {
              event.preventDefault();
              setTab("methods");
            }}
            target="_blank"
            rel="noreferrer"
          >
            Source & methodology <ArrowUpRight size={13} />
          </a>
          <div className="profile">
            <span>EO</span>
            <div>
              Emad Obeidat<small>Data science portfolio</small>
            </div>
          </div>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumbs">
            Workspace
            <ChevronRight size={13} />
            <strong>{title}</strong>
          </div>
          <div className="header-meta">
            <span className="verified">
              <CheckCircle2 size={13} /> Benchmark v1.0
            </span>
            <span className="header-divider" />
            <span>Historical data</span>
          </div>
        </header>
        <div className="page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                DEMAND FORECASTING & INVENTORY PLANNING
              </div>
              <h1>
                {tab === "overview"
                  ? "A clearer view of what’s next."
                  : tab === "forecast"
                    ? "From history to a useful forecast."
                    : tab === "inventory"
                      ? "Find your inventory balance."
                      : tab === "backtests"
                        ? "Earn confidence. Test on the future."
                        : "Good decisions start with honest data."}
              </h1>
              <p>
                {tab === "overview"
                  ? "Understand demand. See uncertainty. Make the trade-off explicit."
                  : tab === "forecast"
                    ? "Explore recursive forecasts and check them against unseen historical sales."
                    : tab === "inventory"
                      ? "Balance the cost of unsold stock against the cost of lost sales."
                      : tab === "backtests"
                        ? "Models are selected before calibration and final evaluation."
                        : "Every number has a source, a cutoff, and a limitation."}
              </p>
            </div>
            <button className="export-button" onClick={exportForecast}>
              <Download size={15} />
              Export forecast
            </button>
          </div>
          <div className="data-notice">
            <span>
              <span className="status-dot" /> REAL M5 SAMPLE
            </span>
            <p>
              {longDate(data.source.start)} — {longDate(data.source.end)}{" "}
              <b>·</b> {number(data.source.observations)} observations
            </p>
            <button onClick={() => setTab("methods")}>
              View provenance <ArrowUpRight size={13} />
            </button>
          </div>
          {tab !== "methods" && (
            <div className="filterbar">
              <div>
                <label>MODEL</label>
                <select
                  aria-label="Forecast model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                >
                  <option value="selected">Selected per SKU</option>
                  <option value="seasonal_naive">Seasonal naive</option>
                  <option value="trailing_mean">28-day mean</option>
                  <option value="gradient_boosting">Gradient boosting</option>
                </select>
              </div>
              <div>
                <label>PLANNING HORIZON</label>
                <div className="segmented">
                  {[7, 14, 28].map((h) => (
                    <button
                      key={h}
                      className={h === horizon ? "chosen" : ""}
                      onClick={() => setHorizon(h)}
                    >
                      {h} days
                    </button>
                  ))}
                </div>
              </div>
              <div className="filter-end">
                <ShieldCheck size={14} />
                Chronological holdout · no random split
              </div>
            </div>
          )}
          {(tab === "overview" || tab === "forecast") && (
            <>
              <div className="kpis">
                <Kpi
                  title={`${horizon}-DAY FORECAST`}
                  value={number(totalForecast)}
                  unit="units"
                  subtitle="Across all 8 product series"
                  icon={<Package size={17} />}
                />
                <Kpi
                  title="HOLDOUT WAPE"
                  value={percent(totalWape)}
                  subtitle="Weighted absolute percentage error"
                  icon={<TrendingUp size={17} />}
                />
                <Kpi
                  title="90% INTERVAL COVERAGE"
                  value={percent(coverage)}
                  subtitle="Observed coverage on held-out days"
                  icon={<ShieldCheck size={17} />}
                />
                <Kpi
                  title="SERIES EVALUATED"
                  value="8"
                  unit="SKUs"
                  subtitle="3 selection folds + calibration + test"
                  icon={<Layers3 size={17} />}
                />
              </div>
              <div className="main-grid">
                <section className="card chart-card">
                  <div className="card-heading">
                    <div>
                      <h2>
                        Demand outlook{" "}
                        <span className="badge">{horizon} DAY</span>
                      </h2>
                      <p>
                        Historical sales, forecast, and a 90% residual interval
                      </p>
                    </div>
                    <select
                      aria-label="Product series"
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                    >
                      {data.products.map((p) => (
                        <option key={p.id}>{p.id}</option>
                      ))}
                    </select>
                  </div>
                  <div className="chart-toolbar">
                    <div className="segmented">
                      <button
                        className={mode === "future" ? "chosen" : ""}
                        onClick={() => setMode("future")}
                      >
                        Forward outlook
                      </button>
                      <button
                        className={mode === "test" ? "chosen" : ""}
                        onClick={() => setMode("test")}
                      >
                        Holdout check
                      </button>
                    </div>
                    <span className="model-label">
                      <span />
                      {forecast.label}
                    </span>
                  </div>
                  <div className="demand-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={chartData}
                        margin={{ top: 18, right: 18, left: -14, bottom: 4 }}
                      >
                        <CartesianGrid vertical={false} stroke="#e9edeb" />
                        <XAxis
                          dataKey="ds"
                          tickFormatter={date}
                          minTickGap={42}
                          tick={{ fontSize: 10, fill: "#8b9691" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "#8b9691" }}
                          axisLine={false}
                          tickLine={false}
                          label={{
                            value: "Units / day",
                            angle: -90,
                            position: "insideLeft",
                            dx: 16,
                            style: { fontSize: 9, fill: "#8b9691" },
                          }}
                        />
                        <Tooltip
                          labelFormatter={(v) => longDate(String(v))}
                          contentStyle={{
                            borderRadius: 8,
                            border: "1px solid #dce4de",
                            fontSize: 11,
                          }}
                        />
                        <Area
                          isAnimationActive={false}
                          type="monotone"
                          dataKey="band"
                          name="90% interval"
                          stroke="none"
                          fill="#e0eddf"
                          fillOpacity={0.8}
                        />
                        <Line
                          isAnimationActive={false}
                          type="monotone"
                          dataKey="actual"
                          name="Observed sales"
                          stroke="#9daaa5"
                          strokeWidth={1.8}
                          dot={false}
                        />
                        <Line
                          isAnimationActive={false}
                          type="monotone"
                          dataKey="baseline"
                          name="Seasonal naive"
                          stroke="#d0ac72"
                          strokeDasharray="4 4"
                          dot={false}
                          strokeWidth={1.4}
                        />
                        <Line
                          isAnimationActive={false}
                          type="monotone"
                          dataKey="prediction"
                          name="Forecast"
                          stroke="#26745d"
                          strokeWidth={2.4}
                          dot={false}
                        />
                        <ReferenceLine
                          x={
                            mode === "test"
                              ? product.test_dates[0]
                              : product.future_dates[0]
                          }
                          stroke="#8a9e93"
                          strokeDasharray="3 4"
                          label={{
                            value: "Forecast starts",
                            position: "insideTopRight",
                            fontSize: 9,
                            fill: "#788a80",
                          }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="chart-legend">
                    <span>
                      <i style={{ background: "#9daaa5" }} />
                      Observed sales
                    </span>
                    <span>
                      <i style={{ background: "#26745d" }} />
                      Forecast
                    </span>
                    <span>
                      <i style={{ background: "#d0ac72" }} />
                      Seasonal naive
                    </span>
                    <span>
                      <i className="interval-key" />
                      90% interval
                    </span>
                  </div>
                  <div className="chart-caption">
                    {mode === "future"
                      ? `Refit through ${longDate(data.source.end)} · no future actuals available.`
                      : `Model trained before ${longDate(data.protocol.test_origin)} · actuals shown only for evaluation.`}
                  </div>
                </section>
                <section className="insight-card">
                  <div className="insight-label">
                    <FlaskConical size={15} /> THE EXPERIMENT
                  </div>
                  <h2>
                    Accuracy is only
                    <br />
                    half the story.
                  </h2>
                  <p>
                    A forecast becomes useful when it improves a decision. Test
                    the stockout–overstock trade-off with explicit costs.
                  </p>
                  <div className="mini-tradeoff">
                    <div>
                      <span>Too little stock</span>
                      <strong>Lost sales</strong>
                      <div className="mini-bars">
                        {[15, 22, 35, 42, 52, 60, 72].map((h, i) => (
                          <i
                            key={i}
                            style={{ height: h, opacity: 0.3 + i * 0.1 }}
                          />
                        ))}
                      </div>
                    </div>
                    <div>
                      <span>Too much stock</span>
                      <strong>Unsold units</strong>
                      <div className="mini-bars second">
                        {[72, 60, 52, 42, 35, 22, 15].map((h, i) => (
                          <i
                            key={i}
                            style={{ height: h, opacity: 1 - i * 0.1 }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setTab("inventory")}>
                    Open inventory lab <ArrowRight size={15} />
                  </button>
                  <small>Simulated costs. Not observed Walmart savings.</small>
                </section>
              </div>
              {tab === "overview" && (
                <section className="card product-card">
                  <div className="card-heading">
                    <div>
                      <h2>Product-level signals</h2>
                      <p>
                        See where the forecast is useful—and where it needs
                        caution.
                      </p>
                    </div>
                    <div className="search-box">
                      <Search size={14} />
                      <input
                        aria-label="Search products"
                        placeholder="Find a product…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>PRODUCT</th>
                          <th>DEMAND PROFILE</th>
                          <th>{horizon}-DAY FORECAST</th>
                          <th>HOLDOUT WAPE</th>
                          <th>MODEL</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((p) => (
                          <tr key={p.product.id}>
                            <td>
                              <span className="product-icon">
                                <Box size={15} />
                              </span>
                              <strong>{p.product.id}</strong>
                            </td>
                            <td>
                              <span
                                className={
                                  "profile-tag " +
                                  (p.product.zero_fraction > 0.4 ? "amber" : "")
                                }
                              >
                                {p.product.zero_fraction > 0.4
                                  ? "Intermittent"
                                  : "More regular"}
                              </span>
                            </td>
                            <td>
                              {number(p.forecast)} <small>units</small>
                            </td>
                            <td>{percent(p.wape)}</td>
                            <td>
                              <span className="table-model">
                                {p.model.label}
                              </span>
                            </td>
                            <td>
                              <button
                                aria-label={"Explore " + p.product.id}
                                onClick={() => {
                                  setSku(p.product.id);
                                  setTab("forecast");
                                }}
                              >
                                <ArrowUpRight size={15} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!visible.length && (
                      <div className="no-results">
                        No products match “{query}”.
                      </div>
                    )}
                  </div>
                  <div className="table-footer">
                    {visible.length} of 8 series{" "}
                    <span>
                      Product identifiers are retained from the source sample.
                    </span>
                  </div>
                </section>
              )}
              {tab === "forecast" && (
                <div className="two-column">
                  <section className="card detail-card">
                    <h2>What the model knows</h2>
                    <p>
                      Only historical sales and deterministic calendar features
                      enter the forecast. Future prices and held-out sales are
                      excluded.
                    </p>
                    <div className="feature-tags">
                      {[
                        "Lag 1 / 7 / 14 / 28",
                        "Rolling means",
                        "Day of week",
                        "Month",
                        "Annual seasonality",
                      ].map((t) => (
                        <span key={t}>{t}</span>
                      ))}
                    </div>
                  </section>
                  <section className="card detail-card">
                    <h2>A measured uncertainty band</h2>
                    <p>
                      Absolute errors from the earlier 28-day calibration window
                      define the interval. Time dependence and the small sample
                      mean 90% coverage is a target, not a guarantee.
                    </p>
                    <div className="inline-stat">
                      <strong>{percent(forecast.metrics.coverage)}</strong>
                      <span>Observed 28-day coverage for {sku}</span>
                    </div>
                  </section>
                </div>
              )}
            </>
          )}
          {tab === "inventory" && (
            <>
              <div className="inventory-intro">
                <TriangleAlert size={16} />
                <span>
                  Historical simulation · one order at period start · no
                  replenishment or supplier lead times · sales treated as a
                  proxy for demand
                </span>
              </div>
              <div className="inventory-grid">
                <section className="card controls">
                  <div className="card-heading">
                    <div>
                      <h2>Set your assumptions</h2>
                      <p>Costs are user assumptions, not dataset facts.</p>
                    </div>
                    <SlidersHorizontal size={17} />
                  </div>
                  <label>
                    PRODUCT
                    <select
                      aria-label="Inventory product"
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                    >
                      {data.products.map((p) => (
                        <option key={p.id}>{p.id}</option>
                      ))}
                    </select>
                  </label>
                  <Slider
                    label="Cost of one unsold unit"
                    value={overage}
                    set={setOverage}
                    min={0.25}
                    max={10}
                    step={0.25}
                    unit="$/unit"
                  />
                  <Slider
                    label="Cost of one missed sale"
                    value={shortage}
                    set={setShortage}
                    min={0.25}
                    max={20}
                    step={0.25}
                    unit="$/unit"
                  />
                  <Slider
                    label="Assumed starting stock"
                    value={onHand}
                    set={setOnHand}
                    min={0}
                    max={400}
                    step={1}
                    unit="units"
                  />
                  <div className="assumption-note">
                    <ShieldCheck size={15} />
                    <p>
                      Targets use a 7-day block bootstrap of calibration errors.
                      Final-test actuals are used only to score the simulated
                      decision.
                    </p>
                  </div>
                </section>
                <section className="card inventory-results">
                  <div className="card-heading">
                    <div>
                      <h2>The decision, in units</h2>
                      <p>
                        {sku} · first {horizon} days of the untouched holdout
                      </p>
                    </div>
                    <span className="badge">SIMULATION</span>
                  </div>
                  <div className="decision-grid">
                    <div>
                      <span>TARGET STOCK</span>
                      <strong>{number(target)}</strong>
                      <small>units at period start</small>
                    </div>
                    <div className="highlight">
                      <span>SIMULATED ORDER</span>
                      <strong>{number(Math.max(0, target - onHand))}</strong>
                      <small>target less assumed stock</small>
                    </div>
                    <div>
                      <span>OBSERVED SALES</span>
                      <strong>{number(demand)}</strong>
                      <small>holdout units · demand proxy</small>
                    </div>
                  </div>
                  <div className="cost-comparison">
                    <div>
                      <span>Calibrated policy cost</span>
                      <strong>{money(policyCost)}</strong>
                    </div>
                    <span>vs.</span>
                    <div>
                      <span>Seasonal forecast-only cost</span>
                      <strong>{money(baselineCost)}</strong>
                    </div>
                    <span
                      className={policyCost <= baselineCost ? "saving" : "loss"}
                    >
                      {baselineCost
                        ? percent(
                            Math.abs(policyCost - baselineCost) / baselineCost,
                          )
                        : "—"}{" "}
                      {policyCost <= baselineCost ? "lower" : "higher"}
                    </span>
                  </div>
                  <div className="cost-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={frontier}
                        margin={{ left: 0, right: 22, top: 20, bottom: 12 }}
                      >
                        <CartesianGrid vertical={false} stroke="#edf0eb" />
                        <XAxis
                          dataKey="stock"
                          type="number"
                          domain={["dataMin", "dataMax"]}
                          tick={{ fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                          label={{
                            value: "Stock available at period start (units)",
                            position: "insideBottom",
                            offset: -8,
                            fontSize: 10,
                          }}
                        />
                        <YAxis
                          tick={{ fontSize: 10 }}
                          tickFormatter={(v) => "$" + v}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          formatter={(v: number) => money(v)}
                          labelFormatter={(v) => "Stock: " + v + " units"}
                        />
                        <Line
                          isAnimationActive={false}
                          dataKey="expected"
                          name="Expected bootstrap cost"
                          stroke="#26745d"
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line
                          isAnimationActive={false}
                          dataKey="realized"
                          name="Realized holdout cost"
                          stroke="#cc9d5c"
                          strokeDasharray="5 4"
                          strokeWidth={2}
                          dot={false}
                        />
                        <ReferenceLine
                          x={target}
                          stroke="#365b49"
                          strokeDasharray="3 4"
                          label={{
                            value: "Target",
                            fontSize: 10,
                            position: "insideTopRight",
                          }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="chart-legend">
                    <span>
                      <i style={{ background: "#26745d" }} />
                      Expected bootstrap cost
                    </span>
                    <span>
                      <i style={{ background: "#cc9d5c" }} />
                      Realized holdout cost
                    </span>
                  </div>
                  <p className="inventory-footnote">
                    Expected cost uses the forecast and calibration
                    distribution; realized cost uses holdout sales. The
                    recommendation never minimizes cost against known test
                    sales. Costs exclude purchasing, fixed ordering fees and
                    daily carrying charges.
                  </p>
                </section>
              </div>
              <section className="card detail-card formula">
                <h2>A transparent decision rule</h2>
                <p>
                  Target stock is the simulated demand quantile at{" "}
                  <strong>{percent(shortage / (overage + shortage))}</strong>,
                  where the critical fractile is shortage cost ÷ (shortage +
                  overage cost). This is the newsvendor optimum for the assumed
                  simulated distribution—not proof of the true optimum.
                </p>
              </section>
            </>
          )}
          {tab === "backtests" && (
            <>
              <section className="protocol">
                <div className="protocol-step">
                  <span>01</span>
                  <strong>Model selection</strong>
                  <small>3 rolling 28-day windows</small>
                </div>
                <ArrowRight size={18} />
                <div className="protocol-step">
                  <span>02</span>
                  <strong>Calibration</strong>
                  <small>1 separate 28-day window</small>
                </div>
                <ArrowRight size={18} />
                <div className="protocol-step">
                  <span>03</span>
                  <strong>Final holdout</strong>
                  <small>28 untouched days</small>
                </div>
              </section>
              <div className="two-column">
                <section className="card detail-card">
                  <h2>Holdout error by model</h2>
                  <p>WAPE across all 8 series · fixed 28-day test</p>
                  <div style={{ height: 270 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={data.leaderboard.map((r) => ({
                          ...r,
                          error: r.wape * 100,
                        }))}
                        layout="vertical"
                        margin={{ left: 20, right: 25 }}
                      >
                        <CartesianGrid horizontal={false} stroke="#edf0eb" />
                        <XAxis
                          type="number"
                          tickFormatter={(v) => v + "%"}
                          tick={{ fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          dataKey="label"
                          type="category"
                          width={120}
                          tick={{ fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          formatter={(v: number) => v.toFixed(1) + "%"}
                        />
                        <Bar
                          isAnimationActive={false}
                          dataKey="error"
                          name="Holdout WAPE"
                          fill="#397d64"
                          radius={[0, 4, 4, 0]}
                          barSize={23}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
                <section className="card detail-card">
                  <h2>Why the splits matter</h2>
                  <p>
                    The selected model for each SKU minimizes average MAE over
                    the three selection folds. Calibration data set the residual
                    intervals. Neither calibration nor final-test scores select
                    the model.
                  </p>
                  <div className="timeline-dates">
                    <div>
                      <span>Selection begins</span>
                      <strong>
                        {longDate(data.protocol.selection_origins[0])}
                      </strong>
                    </div>
                    <div>
                      <span>Calibration begins</span>
                      <strong>
                        {longDate(data.protocol.calibration_origin)}
                      </strong>
                    </div>
                    <div>
                      <span>Final holdout begins</span>
                      <strong>{longDate(data.protocol.test_origin)}</strong>
                    </div>
                  </div>
                  <div className="method-note">
                    <Check size={15} />
                    Recursive forecasts never read actual holdout lags.
                  </div>
                </section>
              </div>
              <section className="card product-card">
                <div className="card-heading">
                  <div>
                    <h2>Final 28-day scoreboard</h2>
                    <p>
                      Selected per SKU is a selection strategy, not a fourth
                      fitted model.
                    </p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() =>
                      download(
                        "stocksense-benchmark.json",
                        JSON.stringify(data, null, 2),
                        "application/json",
                      )
                    }
                  >
                    <Download size={14} />
                    Download evidence
                  </button>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>MODEL / STRATEGY</th>
                        <th>WAPE</th>
                        <th>MAE (UNITS/DAY)</th>
                        <th>90% COVERAGE</th>
                        <th>BIAS (UNITS/DAY)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.leaderboard.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <strong>{r.label}</strong>
                          </td>
                          <td>{percent(r.wape)}</td>
                          <td>{number(r.mae, 2)}</td>
                          <td>{percent(r.coverage)}</td>
                          <td>{number(r.bias, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {tab === "methods" && (
            <>
              <div className="two-column">
                <section className="card detail-card">
                  <span className="eyebrow">DATA PROVENANCE</span>
                  <h2>Real sales. A deliberately small scope.</h2>
                  <p>
                    Eight food-product series from Nixtla’s published M5 sample.
                    This is a subset of the Walmart competition data, not a
                    full-store or full-hierarchy M5 benchmark. Product
                    descriptions and store identities are not supplied in this
                    sample.
                  </p>
                  <a
                    className="source-link"
                    href={data.source.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Inspect the exact CSV <ExternalLink size={13} />
                  </a>
                  <div className="hash-label">SHA-256</div>
                  <code className="hash">{data.source.sha256}</code>
                  <small className="retrieved">
                    Retrieved {longDate(data.source.retrieved)}
                  </small>
                </section>
                <section className="card detail-card">
                  <span className="eyebrow">LIMITS & ASSUMPTIONS</span>
                  <h2>Know what this cannot tell you.</h2>
                  <ul className="limits">
                    <li>
                      Observed sales can understate demand during stockouts.
                    </li>
                    <li>
                      No measured on-hand stock, supplier lead times or ordering
                      costs.
                    </li>
                    <li>
                      Only 28 calibration residuals per SKU/model; uncertainty
                      is approximate.
                    </li>
                    <li>
                      Temporal dependence and changing demand can reduce
                      interval coverage.
                    </li>
                    <li>
                      Eight related food series cannot establish broad retail
                      performance.
                    </li>
                    <li>
                      Displayed dates are historical, not a live 2026 forecast.
                    </li>
                  </ul>
                </section>
              </div>
              <section className="card product-card">
                <div className="card-heading">
                  <div>
                    <h2>SQL data-quality audit</h2>
                    <p>
                      Unique daily keys · nonnegative finite quantities ·
                      contiguous dates
                    </p>
                  </div>
                  <span className="audit-pass">
                    <CheckCircle2 size={14} />
                    Schema validated
                  </span>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>SERIES</th>
                        <th>DAILY OBSERVATIONS</th>
                        <th>TOTAL OBSERVED UNITS</th>
                        <th>ZERO-SALES DAYS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.audit.map((r) => (
                        <tr key={r.unique_id}>
                          <td>
                            <strong>{r.unique_id}</strong>
                          </td>
                          <td>{number(r.days)}</td>
                          <td>{number(r.units)}</td>
                          <td>{percent(r.zero_fraction)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="card detail-card">
                <h2>Reproduce the experiment</h2>
                <pre>
                  pip install -r requirements.txt{"\n"}python -m
                  stocksense.pipeline{"\n"}python -m pytest -q{"\n"}npm ci &&
                  npm run build
                </pre>
                <p>
                  The Python pipeline records source fingerprints, validates the
                  data, builds a SQLite audit, runs the backtests, and writes
                  the exact results consumed by this browser app. Changing a
                  chart filter does not retrain a model.
                </p>
              </section>
            </>
          )}
          <footer>
            <span>
              <ShieldCheck size={13} />
              Every forecast has a cutoff. Every decision has assumptions.
            </span>
            <span>StockSense · A data science decision lab</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
function Kpi({
  title,
  value,
  unit,
  subtitle,
  icon,
}: {
  title: string;
  value: string;
  unit?: string;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <section className="kpi">
      <div>
        <span>{title}</span>
        <i>{icon}</i>
      </div>
      <strong>
        {value}
        <small>{unit}</small>
      </strong>
      <p>{subtitle}</p>
    </section>
  );
}
function Slider({
  label,
  value,
  set,
  min,
  max,
  step,
  unit,
}: {
  label: string;
  value: number;
  set: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
}) {
  return (
    <div className="slider-control">
      <div>
        <label>{label}</label>
        <strong>
          {number(value, value % 1 ? 2 : 0)} <small>{unit}</small>
        </strong>
      </div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => set(Number(e.target.value))}
      />
      <div className="range-ends">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
