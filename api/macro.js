const OECD_EO_URL =
  'https://sdmx.oecd.org/public/rest/data/OECD.ECO.MAD,DSD_EO@DF_EO/' +
  'USA+CHN+DEU+JPN+IND+GBR.GDPV_ANNPCT+CPI+UNR+CBGDPR+GGFLQ.A' +
  '?startPeriod=2022&format=jsondata';

// Map OECD measures → WB IDs (HTML uses WB IDs as keys — no HTML change needed)
const MEASURE_TO_WB = {
  GDPV_ANNPCT: 'NY.GDP.MKTP.KD.ZG',
  CPI:         'FP.CPI.TOTL.ZG',   // index level; compute YoY % change
  UNR:         'SL.UEM.TOTL.ZS',
  CBGDPR:      'BN.CAB.XOKA.GD.ZS',
  GGFLQ:       'GC.DOD.TOTL.GD.ZS',
};

// Map OECD country codes → dashboard 2-letter codes
const OECD_TO_DASH = { USA:'US', CHN:'CN', DEU:'EU', JPN:'JP', IND:'IN', GBR:'GB' };

export default async function handler(req, res) {
  try {
  const r = await fetch(OECD_EO_URL, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; macrodashboard/1.0)',
    },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '(unreadable)');
    throw new Error(`OECD EO HTTP ${r.status}: ${body.slice(0, 300)}`);
  }
  const json = await r.json();

  const data    = json.data;
  const struct  = data.structures[0];
  const areaDim = struct.dimensions.series[0];  // REF_AREA
  const measDim = struct.dimensions.series[1];  // MEASURE
  const timeDim = struct.dimensions.observation[0]; // TIME_PERIOD

  const areaVals = areaDim.values;
  const measVals = measDim.values;
  const timeVals = timeDim.values;

  // raw[measureId][dashCode] = { "2023": value, "2024": value, ... }  (annual only)
  const raw = {};
  for (const meas of measVals) raw[meas.id] = {};

  for (const [key, series] of Object.entries(data.dataSets[0].series)) {
    const parts    = key.split(':');
    const oecdArea = areaVals[parseInt(parts[0])].id;
    const oecdMeas = measVals[parseInt(parts[1])].id;
    const dashCode = OECD_TO_DASH[oecdArea];
    if (!dashCode) continue;

    raw[oecdMeas][dashCode] ??= {};
    for (const [tidx, obs] of Object.entries(series.observations)) {
      if (!obs || obs[0] === null || obs[0] === undefined) continue;
      const period = timeVals[parseInt(tidx)].id;
      if (period.includes('-')) continue;  // skip quarterly e.g. "2024-Q1"
      raw[oecdMeas][dashCode][period] = obs[0];
    }
  }

  const DASH_CODES = ['US', 'CN', 'EU', 'JP', 'IN', 'GB'];
  const combined = {};

  for (const [oecdMeas, wbId] of Object.entries(MEASURE_TO_WB)) {
    combined[wbId] = {};
    for (const code of DASH_CODES) {
      const yearMap = raw[oecdMeas]?.[code] ?? {};
      const years   = Object.keys(yearMap).sort();
      if (oecdMeas === 'CPI') {
        // Compute annual % change from consecutive index values
        if (years.length < 2) { combined[wbId][code] = { value: null, year: null }; continue; }
        const latest = years[years.length - 1];
        const prev   = years[years.length - 2];
        combined[wbId][code] = {
          value: (yearMap[latest] / yearMap[prev] - 1) * 100,
          year:  latest,
        };
      } else {
        const latest = years[years.length - 1] ?? null;
        combined[wbId][code] = latest
          ? { value: yearMap[latest], year: latest }
          : { value: null, year: null };
      }
    }
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 's-maxage=14400, stale-while-revalidate=86400');
  return res.status(200).json(combined);
  } catch (err) {
    console.error('macro handler error:', err);
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
}
