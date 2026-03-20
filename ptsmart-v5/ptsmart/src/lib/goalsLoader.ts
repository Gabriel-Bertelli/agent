// ── Goals loader ───────────────────────────────────────────────────────────
//
// Fetches the goals CSV published from Google Sheets and returns typed rows.
// The CSV has columns: Data, Canal, Investimento, Leads, matriculas, BU
// "Data" is an Excel serial number (days since 1899-12-30).

export interface GoalRow {
  date: string;    // 'yyyy-MM-dd'
  month: string;   // 'yyyy-MM'
  canal: string;
  bu: string;
  investimento: number;
  leads: number;
  matriculas: number;
}

function excelSerialToDate(serial: string): string {
  const n = parseInt(serial.replace(/,/g, '').trim(), 10);
  if (!Number.isFinite(n)) return '';
  const date = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
  return date.toISOString().split('T')[0];
}

function safeFloat(v: string): number {
  const n = parseFloat(v.replace(/,/g, '').trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function parseGoalsCsv(text: string): GoalRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  // Detect delimiter
  const header = lines[0];
  const delimiter = header.includes(';') ? ';' : ',';

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === delimiter && !inQuotes) { result.push(current); current = ''; continue; }
      current += ch;
    }
    result.push(current);
    return result;
  };

  const headers = parseLine(header).map(h => h.trim().toLowerCase());
  const idxDate  = headers.findIndex(h => h === 'data');
  const idxCanal = headers.findIndex(h => h === 'canal');
  const idxInv   = headers.findIndex(h => h === 'investimento');
  const idxLeads = headers.findIndex(h => h === 'leads');
  const idxMat   = headers.findIndex(h => h === 'matriculas');
  const idxBU    = headers.findIndex(h => h === 'bu');

  const rows: GoalRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    if (cols.length < 4) continue;

    const date = excelSerialToDate(cols[idxDate] ?? '');
    if (!date) continue;

    rows.push({
      date,
      month:        date.slice(0, 7),
      canal:        (cols[idxCanal] ?? '').trim().toLowerCase(),
      bu:           (cols[idxBU]    ?? '').trim(),
      investimento: safeFloat(cols[idxInv]   ?? '0'),
      leads:        safeFloat(cols[idxLeads] ?? '0'),
      matriculas:   safeFloat(cols[idxMat]   ?? '0'),
    });
  }

  return rows;
}

let cachedGoals: GoalRow[] | null = null;
let cacheKey = '';

export async function loadGoals(): Promise<GoalRow[]> {
  const url = (import.meta as any).env?.VITE_GOALS_CSV_URL as string | undefined;

  if (!url) {
    console.warn('[GoalsLoader] VITE_GOALS_CSV_URL not set — goals will be empty.');
    return [];
  }

  // Return cache if URL hasn't changed
  if (cachedGoals && cacheKey === url) return cachedGoals;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch goals CSV: ${response.status}`);
  const text = await response.text();

  cachedGoals = parseGoalsCsv(text);
  cacheKey = url;
  return cachedGoals;
}
