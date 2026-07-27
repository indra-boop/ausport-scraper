# Ausport Scraper - Architecture Documentation

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      Ausport Scraper                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐         ┌──────────────┐                       │
│  │  Scheduler   │────────→│   Scraper    │                       │
│  │  (cron/apsch)│         │    Engine    │                       │
│  └──────────────┘         └──────┬───────┘                       │
│                                   │                              │
│                          ┌────────▼────────┐                     │
│                          │  Data Parser    │                     │
│                          │  & Extractor    │                     │
│                          └────────┬────────┘                     │
│                                   │                              │
│                          ┌────────▼────────┐                     │
│                          │  Validator      │                     │
│                          │  (Schema Check) │                     │
│                          └────────┬────────┘                     │
│                                   │                              │
│                          ┌────────▼────────┐                     │
│                          │ Auth Handler    │                     │
│                          │ (Gateway Token) │                     │
│                          └────────┬────────┘                     │
│                                   │                              │
│                          ┌────────▼────────┐                     │
│                          │ Ingest Pipeline │                     │
│                          │ (Token Validate)│                     │
│                          └────────┬────────┘                     │
│                                   │                              │
└───────────────────────────────────┼─────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
           ┌────────▼─────┐  ┌──────▼──────┐  ┌───▼──────────┐
           │ Local Cache  │  │    Logs     │  │   Metrics    │
           └──────────────┘  └─────────────┘  └──────────────┘
                                    │
                    ┌───────────────┘
                    │
           ┌────────▼─────────────────┐
           │ Private Sites Gateway     │
           │ (Authentication Layer)    │
           └────────┬─────────────────┘
                    │
           ┌────────▼─────────────────┐
           │ Jerco Dashboard API      │
           │ /api/ingest/sport-events │
           └──────────────────────────┘
```

## Component Breakdown

### 1. Scheduler
**Responsibility**: Trigger scraper pada interval tertentu

**Technologies**:
- `APScheduler` (recommended) atau cron untuk simplicity
- Timezone-aware scheduling (WITA/Asia/Makassar)
- Supports cron expression + fixed interval

**Configuration**:
```python
schedule = {
    "type": "cron",
    "time": "08:00",
    "timezone": "Asia/Makassar"
}
```

### 2. Scraper Engine
**Responsibility**: Fetch dan extract data dari sources

**Technologies**:
- `requests` untuk HTTP requests dengan retry logic
- `BeautifulSoup4` atau `Playwright` untuk HTML parsing (depends on JS rendering)
- `lxml` untuk performance-heavy parsing

**Flow**:
```python
def scrape():
    for source in SOURCES:
        response = session.get(source.url, timeout=10)
        soup = BeautifulSoup(response.content, 'html.parser')
        events = parse_events(soup, source.selectors)
        yield events
```

**Error Handling**:
- Automatic retry dengan exponential backoff
- Fallback ke cached data jika scrape fails
- Log semua HTTP errors dan timeouts

### 3. Data Parser & Extractor
**Responsibility**: Transform raw HTML ke structured data

**Output Format** (internal):
```python
{
    "id": "unique_event_id",
    "source": "ausport",
    "title": "Event Title",
    "start_time": "2026-07-28T19:20:00+10:00",  # ISO 8601
    "end_time": "2026-07-28T20:50:00+10:00",
    "league": "AFL",
    "competitors": ["Team A", "Team B"],
    "venue": "Stadium Name",
    "metadata": {}
}
```

**Mapping Config** (YAML):
```yaml
sources:
  afl:
    url: "https://www.afl.com.au/schedule"
    event_selector: ".fixture"
    fields:
      id: ".fixture-id"
      title: ".fixture-teams"
      start_time: ".fixture-time"
      venue: ".fixture-venue"
```

### 4. Validator
**Responsibility**: Ensure data meets schema requirements

**Validation Rules**:
- Required fields present (id, title, start_time, league)
- DateTime format adalah ISO 8601
- Competitors array tidak kosong
- League dari whitelist
- No duplicates dalam batch

**Schema** (JSON Schema):
```json
{
  "type": "object",
  "required": ["id", "title", "start_time", "league"],
  "properties": {
    "id": {"type": "string", "minLength": 5},
    "title": {"type": "string"},
    "start_time": {"type": "string", "format": "date-time"},
    "league": {"enum": ["AFL", "NRL", "A-League", "etc"]},
    "competitors": {
      "type": "array",
      "minItems": 2
    }
  }
}
```

### 5. Auth Handler
**Responsibility**: Manage authentication tokens dan gateway communication

**Token Management**:
```python
class AuthHandler:
    def __init__(self, gateway_token: str):
        self.gateway_token = gateway_token  # dari env var
        self.gateway_url = os.environ.get('SITES_GATEWAY_URL')
    
    def authenticate(self) -> str:
        # Return authenticated session/token
        headers = {"X-Gateway-Token": self.gateway_token}
        return headers
```

**Gateway Flow**:
1. Client → Scraper: Request scrape + gateway token
2. Scraper → Gateway: Authenticate dengan gateway token
3. Gateway → Scraper: Return authorization header
4. Scraper → Jerco API: Use auth header untuk ingest

### 6. Ingest Pipeline
**Responsibility**: Send data ke Jerco Dashboard dengan safety checks

**Pre-ingest Checks**:
```python
def pre_ingest_checks(events):
    # 1. Validate all events pass schema
    for event in events:
        validate_event(event)
    
    # 2. Check for duplicates (via event.id)
    ids = {e['id'] for e in events}
    if len(ids) != len(events):
        log.warning(f"Duplicate events detected")
        events = deduplicate(events)
    
    # 3. Check Jerco ingest token validity (non-mutating)
    validate_ingest_token_readonly()
    
    # 4. Simulate ingest (dry-run mode)
    simulation = dry_run_ingest(events)
    if simulation.has_errors:
        raise IngestValidationError(simulation.errors)
```

**Ingest Request**:
```python
def ingest(events):
    headers = {
        "Authorization": f"Bearer {JERCO_INGEST_TOKEN}",
        "Content-Type": "application/json",
        "X-Request-ID": str(uuid.uuid4()),
        "X-Source": "ausport-scraper"
    }
    
    payload = {
        "source": "ausport",
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        "events": events
    }
    
    response = requests.post(
        f"{JERCO_INGEST_URL}/sport-events",
        json=payload,
        headers=headers,
        timeout=30
    )
    
    response.raise_for_status()
    return response.json()
```

**Error Recovery**:
- Jika ingest fail: Simpan ke queue, retry next cycle
- Jika partial fail: Log failures, retry hanya yang failed
- Dead letter queue untuk events yang consistently fail

### 7. Local Cache
**Responsibility**: Store scraped data untuk recovery & deduplication

**Storage**:
- SQLite database (lightweight, no external deps)
- Structure: `events` table dengan indexed `event_id` + `source`
- Retention: 90 days rolling

**Queries**:
```sql
-- Check if event already ingested
SELECT * FROM events WHERE event_id = ? AND ingested = true

-- Get failed events for retry
SELECT * FROM events WHERE status = 'failed' AND retry_count < 3

-- Cleanup old events
DELETE FROM events WHERE ingested = true AND created_at < NOW() - INTERVAL '90 days'
```

### 8. Logging & Monitoring
**Logging Strategy**:
```python
logger.info(f"Scrape started for source: {source}")
logger.debug(f"Parsed {count} events from {source}")
logger.warning(f"Duplicate events detected: {dup_ids}")
logger.error(f"Ingest failed: {error}", exc_info=True)
```

**Log Levels**:
- `DEBUG`: Detailed parse steps, HTTP requests
- `INFO`: Scrape start/end, ingest success
- `WARNING`: Data anomalies, retries
- `ERROR`: Failures yang perlu attention
- `CRITICAL`: System failures, auth errors

**Metrics to Track**:
- `scraper.execution_time_seconds` (histogram)
- `scraper.events_scraped` (counter per source)
- `scraper.events_ingested` (counter)
- `scraper.ingest_errors` (counter per error type)
- `scraper.gateway_latency_ms` (histogram)
- `scraper.cache_hits` (counter)

## Data Flow - Happy Path

```
1. Scheduler triggers @ 08:00 WITA
        ↓
2. Scraper Engine fetches HTML dari Australian sports sources
        ↓
3. Parser extracts structured event data
        ↓
4. Validator checks schema + logic rules
        ↓
5. Auth Handler authenticate via private gateway
        ↓
6. Pre-ingest checks:
   - Deduplicate
   - Validate tokens (non-mutating)
   - Dry-run simulation
        ↓
7. Ingest Pipeline sends to Jerco Dashboard API
        ↓
8. Cache updated dengan ingested events
        ↓
9. Metrics logged, logs written
        ↓
10. Success → Ready untuk next cycle
```

## Data Flow - Error Scenarios

### Scenario A: Scrape Fails
```
Scraper Error
    ↓
Fetch from cache (last 7 days of data)
    ↓
If cache available → Use cache + log warning
If cache empty → Stop, alert ops
```

### Scenario B: Validation Fails
```
Events fail schema validation
    ↓
Log detail error message
    ↓
Store in "quarantine" table for manual review
    ↓
Alert: "X events failed validation"
```

### Scenario C: Gateway Auth Fails
```
Gateway authentication error
    ↓
Log auth error (without exposing token)
    ↓
Retry dengan exponential backoff (max 3x)
    ↓
If still fails → Alert ops, use backup auth method
```

### Scenario D: Ingest Token Invalid
```
Non-mutating token validation fails
    ↓
Log "Ingest token invalid or expired"
    ↓
Stop ingest (don't attempt with invalid token)
    ↓
Alert: "Regenerate JERCO_INGEST_TOKEN"
```

## Technology Stack

| Component | Technology | Reason |
|-----------|-----------|--------|
| HTTP Requests | `requests` | Stable, widely used, good error handling |
| HTML Parsing | `BeautifulSoup4` + `lxml` | Fast, flexible, good for non-JS sites |
| JS Rendering | `Playwright` (optional) | If sites use JS for rendering |
| Scheduling | `APScheduler` | Flexible, timezone-aware, daemon-safe |
| Validation | `jsonschema` | Standard format, reusable schemas |
| Data Cache | `SQLite` | No external dependencies, built-in |
| Logging | Python `logging` | Built-in, rotated file handlers |
| HTTP Client | `requests` | With `requests-retry` for resilience |

## Deployment Options

### Option 1: Docker Container (Recommended)
- Run in Kubernetes cronjob
- Auto-restart on failure
- Easy scaling & versioning

### Option 2: Systemd Service
- Traditional VPS/VM deployment
- Simpler ops, less overhead
- Good for small deployments

### Option 3: Lambda/Serverless
- If cost-sensitive, low frequency
- Limited by execution timeout (15 min)
- Good for event-driven architecture

## Security Considerations

1. **Token Management**:
   - Never log tokens (mask in logs)
   - Rotate quarterly
   - Use environment variables, not config files

2. **Network**:
   - All comms over HTTPS
   - Verify SSL certificates
   - Private gateway adds extra layer

3. **Data**:
   - Validate all inputs
   - Sanitize before ingest
   - No PII in logs

4. **Access Control**:
   - Scraper runs as dedicated user (low privileges)
   - Only necessary permissions
   - Audit all ingest operations

## Performance Tuning

**Scraping Speed**:
- Connection pooling (Session reuse)
- Concurrent source fetches (ThreadPoolExecutor)
- Parse optimization (lxml vs html.parser)

**Ingest Throughput**:
- Batch events (e.g., 100 events per request)
- Connection pooling to Jerco API
- Async client for parallel requests (if volume warrants)

**Cache Performance**:
- Index pada `event_id` + `source` + `ingested_at`
- Vacuum/optimize periodically
- Archive old data

## Monitoring & Alerting

**Key Alerts**:
- Scrape failure rate > 10%
- Ingest latency > 30sec
- Cache size > 1GB
- Token validation failures
- Gateway authentication errors

**Dashboard Metrics**:
- Last scrape timestamp
- Events ingested today/week/month
- Error rate trends
- Gateway latency p50/p95/p99
- Cache hit rate

---

**Last Updated**: 28 Jul 2026  
**Architecture Version**: 1.0