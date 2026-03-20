// ── Goals mapper ───────────────────────────────────────────────────────────
//
// Maps raw Supabase row fields (platform, tipo_campanha, produto) to the
// canonical keys used in the goals sheet (canal, BU).
//
// Canal mapping rules (evaluated in priority order):
//   1. tipo_campanha contains "lead" and "ads"  → "lead_ads"
//   2. tipo_campanha contains "whatsapp"         → "whatsapp_ativo"
//   3. tipo_campanha contains "meta site"        → "meta_site"
//   4. platform = "Google" (any tipo_campanha)   → "google"
//   5. everything else                           → "outros"

export function mapToCanal(platform: string, tipoCampanha: string): string {
  const tc = (tipoCampanha ?? '').toLowerCase().trim();
  const pl = (platform     ?? '').toLowerCase().trim();

  if (tc.includes('lead') && tc.includes('ads'))  return 'lead_ads';
  if (tc.includes('whatsapp'))                    return 'whatsapp_ativo';
  if (tc.includes('meta site') || tc === 'meta_site') return 'meta_site';
  if (pl.includes('google'))                      return 'google';
  return 'outros';
}

// BU mapping: produto field in Supabase matches BU in goals sheet exactly.
export function mapToBU(produto: string): string {
  return (produto ?? '').trim();
}
