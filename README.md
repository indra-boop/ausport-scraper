# Ausport Scraper

Automated web scraper untuk mengumpulkan data jadwal olahraga Australia dan mengintegrasikannya ke dalam Jerco Sports Schedule Dashboard.

## Deskripsi

**ausport-scraper** adalah service yang mengotomatisasi ekstraksi data jadwal olahraga dari sumber Australia dan mengirimkan hasilnya ke Jerco Dashboard melalui private gateway. Digunakan untuk memastikan data jadwal sports (khususnya Australian sports) selalu tersinkronisasi dan up-to-date di platform Jerco untuk kebutuhan commercial sports viewing.

## Fitur

- ✅ Automated web scraping dengan schedule teratur (08:00 WITA daily)
- ✅ Authentication melalui private Sites gateway
- ✅ Production-grade ingest token validation (non-mutating)
- ✅ Guarded production sync workflow dengan safety checks
- ✅ Integration langsung ke Jerco Dashboard ingest pipeline
- ✅ Error handling dan retry logic

## Arsitektur

```
Ausport Data Source
        ↓
   Scraper Service
        ↓
Private Sites Gateway (Authentication)
        ↓
Token Validation (Non-mutating)
        ↓
Jerco Dashboard Ingest API
        ↓
Jerco Sports Schedule Database
```

## Instalasi & Setup

### Prerequisites
- Python 3.8+
- Access ke private Sites gateway credentials
- Jerco Dashboard ingest token
- Cron/Scheduler (untuk automated runs)

### Configuration

Set environment variables sebelum running:

```bash
# Private Sites gateway authentication
export SITES_GATEWAY_TOKEN="your-private-gateway-token"

# Jerco Dashboard ingest endpoint
export JERCO_INGEST_URL="https://dashboard.jerco.local/api/ingest"
export JERCO_INGEST_TOKEN="your-ingest-token"

# Scraper behavior
export SCRAPE_TIMEZONE="Asia/Makassar"  # WITA
export SCRAPE_TIME="08:00"
```

### Deployment

#### Docker
```bash
docker build -t ausport-scraper .
docker run -e SITES_GATEWAY_TOKEN="..." \
           -e JERCO_INGEST_TOKEN="..." \
           ausport-scraper
```

#### Cron (Scheduled Runs)
```bash
# Tambah ke crontab untuk runs at 08:00 WITA daily
0 8 * * * /path/to/ausport-scraper/run.sh >> /var/log/ausport-scraper.log 2>&1
```

#### Systemd (Continuous Service)
```ini
[Unit]
Description=Ausport Scraper Service
After=network.target

[Service]
Type=simple
User=scraper
WorkingDirectory=/opt/ausport-scraper
ExecStart=/usr/bin/python3 main.py
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
```

## Cara Kerja

### 1. Scraping
Service mengakses data jadwal olahraga Australia dari sumber publik dan mengekstraksi informasi:
- Event/Match details
- Tanggal dan waktu
- Kompetisi/League
- Team atau participant info

### 2. Authentication
Sebelum mengirim data ke Jerco, scraper harus authenticate melalui **private Sites gateway**:
- Pass gateway token sebagai credential
- Gateway validates akses dan forward request ke Jerco

### 3. Token Validation
Sebelum ingest data:
- Non-mutating validation dari Jerco ingest token
- Memastikan token masih valid dan belum expired
- Tidak mengubah status token (read-only check)

### 4. Safe Sync
Production sync dilindungi dengan:
- Pre-flight checks (data integrity, schema validation)
- Rollback capability jika ada error
- Logging & audit trail semua sync operations

### 5. Ingest
Data yang sudah valid dikirim ke Jerco Dashboard ingest API:
```json
{
  "source": "ausport",
  "timestamp": "2026-07-28T08:15:00+08:00",
  "events": [
    {
      "id": "event_12345",
      "title": "AFL Round 18: Collingwood vs Melbourne",
      "start_time": "2026-07-28T19:20:00+10:00",
      "end_time": "2026-07-28T20:50:00+10:00",
      "league": "AFL",
      "competitors": ["Collingwood", "Melbourne"],
      "venue": "MCG"
    }
  ]
}
```

## Usage

### Manual Run
```bash
python3 main.py --now
```

### Dry Run (Preview tanpa ingest)
```bash
python3 main.py --dry-run
```

### Check Status
```bash
python3 main.py --status
```

### Validate Token
```bash
python3 main.py --validate-token
```

## Monitoring & Logging

Logs disimpan di `./logs/ausport-scraper.log`

### Log Levels
- `INFO`: Scraping dimulai/selesai, ingest successful
- `WARNING`: Data validation warnings, retries
- `ERROR`: Scraping failures, ingest errors, auth problems

### Key Metrics
- Execution time per run
- Records scraped vs ingested
- Token validation status
- Gateway response time
- Dashboard ingest latency

## Troubleshooting

### "Gateway Authentication Failed"
- Verify `SITES_GATEWAY_TOKEN` is set dan valid
- Check gateway endpoint accessibility
- Review gateway logs untuk details

### "Ingest Token Invalid"
- Token mungkin expired → regenerate dari Jerco Dashboard
- Verify token scope includes `ingest:sports-schedule`
- Check token environment variable spelling

### "Data Validation Failed"
- Review event schema di `schemas/event.json`
- Check raw scraped data di debug logs
- Validate source HTML structure (mungkin site changed)

### "Timeout atau Slow Sync"
- Check network latency ke private gateway
- Monitor Jerco Dashboard API performance
- Review concurrent ingest requests (rate limiting)

## Maintenance

### Update Data Sources
Edit `config/sources.yaml` untuk tambah/update sport sources:
```yaml
sources:
  - name: afl
    url: "https://www.afl.com.au/schedule"
    selector: ".fixture-item"
  - name: nrl
    url: "https://www.nrl.com/schedule"
    selector: ".match-card"
```

### Token Rotation
Rotate tokens setiap quarter:
```bash
python3 scripts/rotate-tokens.py --gateway --jerco
```

### Backup & Recovery
```bash
# Backup local ingest cache
tar -czf ausport-scraper-backup-$(date +%Y%m%d).tar.gz ./cache

# Restore if needed
tar -xzf ausport-scraper-backup-20260728.tar.gz
```

## Security

- **Private Gateway**: Semua requests authenticate melalui private Sites gateway
- **Token Management**: Ingest tokens disimpan di environment variables, tidak di code
- **No Credentials in Logs**: Gateway/ingest tokens tidak akan muncul di logs
- **Data Validation**: Input dari scraping di-sanitize sebelum ingest
- **HTTPS Only**: Semua komunikasi encrypted end-to-end

## API Reference

### Ingest Endpoint
```
POST {JERCO_INGEST_URL}/sport-events
Authorization: Bearer {JERCO_INGEST_TOKEN}
Content-Type: application/json
```

**Request Body:**
```json
{
  "source": "ausport",
  "timestamp": "ISO 8601",
  "events": [...]
}
```

**Response:**
```json
{
  "status": "success",
  "inserted": 42,
  "updated": 5,
  "duplicates": 0,
  "errors": []
}
```

## Testing

```bash
# Unit tests
python3 -m pytest tests/unit -v

# Integration tests (requires gateway/dashboard access)
python3 -m pytest tests/integration -v --markers=integration

# Coverage report
python3 -m pytest --cov=ausport_scraper tests/
```

## Development Workflow

1. Create feature branch: `git checkout -b feature/your-feature`
2. Make changes dengan tests
3. Push dan create PR
4. After merge, deploy ke staging: `./scripts/deploy-staging.sh`
5. Validate 1 cycle di staging
6. Deploy ke production: `./scripts/deploy-prod.sh`

## Contributing

Untuk contribution, pastikan:
- Semua tests pass
- Code style consistent (black, isort)
- Documentation updated
- Commit messages clear dan descriptive

## Support & Issues

- **Critical Issues**: Slack #jerco-tech atau @on-call
- **Feature Requests**: GitHub Issues dengan label `enhancement`
- **Bug Reports**: Include logs dari `/logs/ausport-scraper.log`

## License

CV Jerco Digital Solusi - Internal Use Only

---

**Last Updated**: 28 Jul 2026  
**Status**: Production  
**Maintained By**: Jerco Engineering Team