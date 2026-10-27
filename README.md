# Meter work request – demo

A clickable demo of the Connections to Kraken form (new connections, meter moves, upgrades and downgrades). It follows *Connections to Kraken – Questions and logic v6*. Question IDs (A2, C6, E2a…) match the sheet.

## Open it

Open `index.html` in a browser. Nothing to install. To share it, put the folder on any static host (GitHub Pages, Netlify, etc.).

Add `?type=new_connection`, `?type=meter_move`, `?type=upgrade` or `?type=downgrade` to the address to pre-select the work type.

## Files

| File | What's in it |
| --- | --- |
| `js/questions.js` | Every question, its answers, help text and routing (`next`) – the sheet in code |
| `js/app.js` | Per-fuel status, what Kraken would do (S1–S11), the screens, the demo tools panel |
| `js/core.js` | Supabase connection, helpers, shared answer lists |
| `styles.css` | The look |

## Demo tools (button bottom right)

- **What Kraken would do** – live account route (S1–S5), per-fuel outcome and reason code (S6–S11), specialist review flags, the route taken.
- **Test data** – logins, MPANs, MPRNs and postcodes to try each branch.
- **Settings** – show question IDs, the non-domestic toggle, and a simulated partial failure (S10).

## Data (Supabase project "Connections Demo")

Fake look up data lives in Supabase so you can change it in the table editor without touching code:

- `addresses` – the postcode address finder
- `meter_points` – fake ECOES/Xoserve results (status, postcode, supplier, already on another customer)
- `customers`, `accounts` – test logins, portfolio size, and current meters
- `network_operators` – DNO/GDN by postcode area
- `tariffs` – half-hourly tariff eligibility (E6)
- `submissions` – every request sent from the demo (answers + outcome). The page can add rows but not read them; view them in the dashboard.

Any password works for test logins. Uploaded files stay in the browser and are never sent.
