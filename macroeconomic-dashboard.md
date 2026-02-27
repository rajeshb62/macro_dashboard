# Macroeconomic Dashboard

A single-file, serverless HTML dashboard that fetches live macroeconomic data for six major economies and presents it in a dark-themed, color-coded table layout.

## Overview

**File:** `macroeconomic-dashboard.html`
**Dependencies:** None — no build step, no server, no API keys required.
**Usage:** Open directly in any modern browser.

---

## Countries

| Code | Name  | Notes                          |
|------|-------|--------------------------------|
| US   | USA   |                                |
| CN   | China |                                |
| EU   | EU    | Treated as a single aggregate  |
| JP   | Japan |                                |
| IN   | India |                                |
| GB   | UK    |                                |

---

## Sections

### 1. Macro Indicators

Source: **World Bank Open Data API** (`api.worldbank.org/v2`)

Fetches the most recent available value for each country using `mrv=1`. Color-codes each cell based on thresholds defined per indicator.

| Indicator | World Bank ID | Unit | Good | Warn | Bad |
|-----------|--------------|------|------|------|-----|
| GDP Growth Rate | `NY.GDP.MKTP.KD.ZG` | % annual | ≥ 3% | 0–3% | < 0% |
| Inflation Rate (CPI) | `FP.CPI.TOTL.ZG` | % annual | ≤ 3% | 3–6% | < 0% or > 6% |
| Unemployment Rate | `SL.UEM.TOTL.ZS` | % of labor force | ≤ 4% | 4–7% | > 7% |
| Current Account Balance | `BN.CAB.XOKA.GD.ZS` | % of GDP | ≥ +1% | −2% to +1% | < −5% |
| Government Debt | `GC.DOD.TOTL.GD.ZS` | % of GDP | < 40% | 70–100% | ≥ 100% |

The header badge shows the data period range across all indicators (e.g. "Data period: 2022–2023").

### 2. Bond Markets

Source: **OECD SDMX API** (`sdmx.oecd.org`)

Fetches annual 10-year government bond yields (indicator `IRLT`) using the SDMX-JSON format. Searches from 2022 onward and picks the latest non-null observation per country.

| Color | Range | Interpretation |
|-------|-------|----------------|
| Neutral | < 1% | Near-zero / deflation risk |
| Good | 1–4% | Normal developed-economy range |
| Warn | 4–7% | Elevated |
| Bad | ≥ 7% | Very high / fiscal stress |

**Country mapping to OECD codes:**

| Dashboard | OECD code | Note |
|-----------|-----------|------|
| US | USA | |
| CN | — | Not an OECD member; shown as N/A |
| EU | DEU | Germany used as proxy |
| JP | JPN | |
| IN | IND | |
| GB | GBR | |

### 3. Energy (unchanged — see below)

### 4. Freight

Source: **World Bank Open Data API** — five indicators fetched in parallel using `mrv=5`.

All cells are colored neutral — values represent relative scale between countries, not good/bad thresholds.

#### Volume rows

| Indicator | World Bank ID | Unit | Coverage |
|-----------|--------------|------|----------|
| Rail Freight | `IS.RRS.GOOD.MT.K6` | million ton-km | Primarily **domestic** (goods moved on country's rail network) |
| Air Freight | `IS.AIR.GOOD.MT.K1` | million ton-km | Primarily **international** (ton-km flown by country-registered carriers) |
| Sea Freight | `IS.SHP.GOOD.TU` | TEU | **International** (total container port throughput, imports + exports + transshipment) |

**ton-km**: moving 1 metric ton of goods 1 km — accounts for both weight and distance.
**TEU**: Twenty-foot Equivalent Unit — standard shipping container used to measure port throughput.

#### Trade value rows (for comparison with Sea Freight)

| Indicator | World Bank ID | Unit | Coverage |
|-----------|--------------|------|----------|
| Merch. Exports | `BX.GSR.MRCH.CD` | current USD | BoP merchandise goods exports |
| Merch. Imports | `BM.GSR.MRCH.CD` | current USD | BoP merchandise goods imports |

These allow direct comparison of Sea Freight container volumes against the dollar value of goods flowing through ports.

#### Number formatting

| Scale | Display |
|-------|---------|
| ≥ 1 trillion | `$1.23T` |
| ≥ 1 billion | `$456.7B` / `1.23B` |
| ≥ 1 million | `$12.3M` / `62.21M` |
| ≥ 1 thousand | `456.7K` |

---

### 3. Energy

Source: **World Bank Open Data API** — two indicators combined.

The World Bank's direct total-energy indicator (`EG.USE.COMM.KT.OE`) was archived. Total consumption is instead derived as:

```
Total TWh = (energy per capita [kgoe/person] × population [persons]) ÷ 1,000,000 × 0.01163
```

| Indicator | World Bank ID | Unit |
|-----------|--------------|------|
| Energy use per capita | `EG.USE.PCAP.KG.OE` | kgoe / person |
| Population | `SP.POP.TOTL` | persons |

Both are fetched with `mrv=5` (up to 5 years back) and the latest non-null value is used for each country. The year badge on each cell reflects the energy per capita data year.

All cells are colored neutral — total energy has no universal good/bad threshold; the relative scale between countries is the signal.

**Approximate values (2023):**

| Country | Approx TWh |
|---------|-----------|
| CN      | ~39,000   |
| US      | ~25,000   |
| EU      | ~14,000   |
| IN      | ~13,000   |
| JP      | ~4,500    |
| GB      | ~3,500    |

---

## Architecture

Everything lives in a single HTML file with no external assets.

### Data flow

```
init()
  └── Promise.all([
        Promise.all(INDICATORS.map(fetchIndicator)),   ← World Bank (5 calls)
        fetchBondYields(),                              ← OECD (1 call)
        fetchEnergyData(),                             ← World Bank (2 calls in parallel)
        fetchFreightData(),                            ← World Bank (5 calls in parallel)
      ])
        ├── buildTable(wbResults)
        ├── buildBondTable(bondData)    or inline error
        ├── buildEnergyTable(energyData) or inline error
        └── buildFreightTable(freightData) or inline error
```

All four data sources are fetched in parallel. A failure in bond, energy, or freight data only disables that section — the rest of the dashboard remains functional. A failure in the core World Bank macro fetch shows the full-page error state with a Retry button.

### Key functions

| Function | Purpose |
|----------|---------|
| `fetchIndicator(indicator)` | Fetches one World Bank indicator for all 6 countries; returns `{ countryCode: { value, year } }` |
| `fetchBondYields()` | Fetches OECD SDMX-JSON; parses series/observation structure; returns `{ oecdCode: { value, year } }` |
| `fetchEnergyData()` | Fetches per-capita energy and population in parallel; multiplies and converts to TWh |
| `fetchFreightData()` | Fetches rail, air, sea, export, and import indicators in parallel; returns `{ railData, airData, seaData, exportData, importData }` |
| `buildTable(results)` | Renders the macro indicators table and data-period badge |
| `buildBondTable(bondData)` | Renders the bond yields table |
| `buildEnergyTable(energyData)` | Renders the energy table |
| `buildFreightTable(freightData)` | Renders the freight table (5 rows: rail, air, sea, exports, imports) |
| `fmtFreight(v)` | Formats freight volumes as K / M / B |
| `fmtUSD(v)` | Formats trade values as $M / $B / $T |

### Unit conversion

```
1 kgoe  = 1 kilogram of oil equivalent
1 ktoe  = 1,000 toe = 1,000,000 kgoe
1 ktoe  × 0.01163 = 1 TWh

Therefore:
  (kgoe/person × persons) ÷ 1,000,000 = ktoe
  ktoe × 0.01163 = TWh
```

---

## Error handling

| Scenario | Behaviour |
|----------|-----------|
| Core World Bank fetch fails | Full-page error with Retry button |
| OECD bond fetch fails | Bond section replaced with inline message; rest loads normally |
| Energy fetch fails | Energy section replaced with inline message; rest loads normally |
| Freight fetch fails | Freight section replaced with inline message; rest loads normally |
| Individual cell has no data | Cell shows "N/A" in neutral gray |

---

## Styling

Dark theme using CSS custom properties. No external stylesheets or frameworks.

| Variable | Value | Purpose |
|----------|-------|---------|
| `--bg-primary` | `#0f1117` | Page background |
| `--bg-secondary` | `#1a1d27` | Table wrapper background |
| `--bg-header` | `#13161f` | Table header row |
| `--bg-label` | `#161925` | Sticky label column |
| `--color-good` | `#22c55e` | Green |
| `--color-warn` | `#f59e0b` | Amber |
| `--color-bad` | `#ef4444` | Red |
| `--color-neutral` | `#94a3b8` | Gray |
| `--color-accent` | `#6366f1` | Indigo (header, spinner, button) |

The first column (indicator label) is `position: sticky; left: 0` so it stays visible when scrolling horizontally on narrow screens. Tables have `min-width: 680px` to prevent column compression.
