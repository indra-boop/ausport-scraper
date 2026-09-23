# CLAUDE.md — ausport-scraper

> Peta repo untuk AI agent. Baca file ini dulu sebelum explore repo.
> Auto-generated oleh `_tools/gen_claude_md.py`; bagian bertanda ISI MANUAL perlu dilengkapi.
> Last updated: 2026-09-24

## 1. Identitas

| Item | Nilai |
|---|---|
| Repo | `indra-boop/ausport-scraper` |
| Deskripsi | ISI MANUAL |
| Default branch | `main` |
| Visibility | public |
| Stack (auto-detect) | Node.js |
| Commit terakhir | 2026-09-23 (392 commit) |
| Jumlah file (tanpa ignore) | 16 |
| Status | ISI MANUAL (active / maintenance) |
| Deploy target | ISI MANUAL |

## 2. Struktur folder (hanya file ter-track git, depth 2)

```
ausport-scraper/
  .github/
    workflows/
  docs/
    ARCHITECTURE.md
    DEPLOYMENT.md
  test-fixtures/
    event-time-past.html
    generic-h6-p.html
    hot-events.html
  .gitignore
  baseline.json
  package-lock.json
  package.json
  README.md
  results.csv
  scraper.js
  test-freshness.js
  test-guard.js
  test-scraper-markup.js
```

## 3. File kunci

| Path | Fungsi |
|---|---|
| `README.md` | Dokumentasi utama |
| `package.json` | Dependency & scripts |
| `.github/workflows/scrape.yml` | CI workflow |
| `.github/workflows/validate-ingest-token.yml` | CI workflow |

## 4. Command standar (auto-detect, verifikasi dulu)

```bash
npm install
npm run start    # node scraper.js
npm run test    # node test-guard.js && node test-freshness.js && node test-scraper-mark
```

## 5. Aturan kerja untuk agent

- Jangan explore full tree; gunakan section 2 dan 3 sebagai peta.
- Search pakai `rg` lokal; kalau via GitHub connector wajib qualifier `repo:` `path:`.
- Baca file via path spesifik; hindari file generated, lockfile, dan binary.
- `git pull` dulu sebelum analisa final (clone lokal bisa stale).
- Jangan commit secret, `.env`, atau data client mentah.

## 6. Diabaikan saat explore

```
.cache  .git  .gradle  .idea  .mypy_cache  .next  .pytest_cache  .ruff_cache  .venv  .vscode  .wrangler  __pycache__  build  coverage  dist  node_modules  out  target  vendor  venv  *.lock  *.map  *.min.js
```

## 7. Status & isu terbuka

| Item | Status | Owner |
|---|---|---|
| ISI MANUAL | | BELUM DITENTUKAN |
