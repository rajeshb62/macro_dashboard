const WB_BASE = 'https://api.worldbank.org/v2';

const WB_INDICATORS = [
  'NY.GDP.MKTP.KD.ZG',  // GDP Growth Rate
  'FP.CPI.TOTL.ZG',     // Inflation CPI
  'SL.UEM.TOTL.ZS',     // Unemployment Rate
  'BN.CAB.XOKA.GD.ZS',  // Current Account % GDP
  'GC.DOD.TOTL.GD.ZS',  // Govt Debt % GDP
];

const WB_COUNTRIES = ['US', 'CN', 'EU', 'JP', 'IN', 'GB'];
const COUNTRY_PARAM = WB_COUNTRIES.join(';');

async function fetchIndicatorFromWB(indicatorId) {
  const url = `${WB_BASE}/country/${COUNTRY_PARAM}/indicator/${indicatorId}?format=json&mrv=5&per_page=50`;
  const r = await fetch(url, {
    headers: { 'Accept': 'application/json' },
  });
  if (!r.ok) throw new Error(`WB HTTP ${r.status}`);
  const dataArray = (await r.json())[1] ?? [];

  const map = {};
  for (const item of dataArray) {
    if (item.value === null || item.value === undefined) continue;
    const code = (item.countryiso3166alpha2 ?? item.country?.id ?? '').toUpperCase();
    if (!code || !WB_COUNTRIES.includes(code)) continue;
    if (!map[code] || item.date > map[code].year) {
      map[code] = { value: item.value, year: item.date };
    }
  }
  return { indicatorId, map };
}

export default async function handler(req, res) {
  const results = await Promise.all(
    WB_INDICATORS.map(id =>
      fetchIndicatorFromWB(id)
        .catch(err => { console.error(`WB ${id} failed:`, err.message); return { indicatorId: id, map: {} }; })
    )
  );

  const combined = {};
  for (const { indicatorId, map } of results) {
    combined[indicatorId] = {};
    for (const code of WB_COUNTRIES) {
      combined[indicatorId][code] = map[code] ?? { value: null, year: null };
    }
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 's-maxage=14400, stale-while-revalidate=86400');
  return res.status(200).json(combined);
}
