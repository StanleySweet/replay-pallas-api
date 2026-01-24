# Grafana Dashboard - Replay Pallas API

Dashboard d'exemple Grafana pour monitorer l'API Replay Pallas via Prometheus.

## Panneaux inclus

1. **HTTP Requests per second** - Débit des requêtes HTTP (rate 5m)
2. **HTTP Request Duration p95** - Latence des requêtes (percentile 95)
3. **Ratings in Database** - Nombre de ratings stockées
4. **Players with Ratings** - Nombre de joueurs avec des ratings actives
5. **Ratings Calculation Duration** - Temps des calculs (rebuild/merge/update)
6. **Replays Processed per hour** - Débit de traitement des replays
7. **Database Rebuilds per hour** - Fréquence des rebuilds par type

## Installation

### Option 1: Importer via UI Grafana

1. Ouvrir Grafana: `http://localhost:3000`
2. Aller à **Dashboards** → **New** → **Import**
3. Coller le contenu de `dashboard.json` ou charger le fichier
4. Choisir la datasource Prometheus
5. Cliquer **Import**

### Option 2: Importer via API

```bash
curl -X POST http://localhost:3000/api/dashboards/db \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -d @dashboard.json
```

## Configuration Prometheus

Ajouter dans `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'replay-pallas-api'
    static_configs:
      - targets: ['localhost:8080']
    metrics_path: '/metrics'
    scheme: 'http'
    scrape_interval: '30s'
```

Puis redémarrer Prometheus.

## Métriques essentielles à instrumenter

Pour que le dashboard soit complet, instrumentez ces appels dans le code:

### Dans ReplayController.ts
```typescript
import { replaysUploadedTotal, replaysProcessedTotal } from '../prometheus';

// À l'upload d'un replay
replaysUploadedTotal.inc();

// À la fin du traitement
replaysProcessedTotal.labels('success').inc(); // ou 'invalid'
```

### Dans RatingsDB.ts / Calculator.ts
```typescript
import { 
  ratingsCalculationDuration, 
  ratingsInDatabase,
  playersWithRatingsGauge 
} from '../prometheus';

const timer = ratingsCalculationDuration.startTimer({ operation: 'rebuild' });
// ... rebuild logic ...
timer();

// Après rebuild/merge
ratingsInDatabase.set(Object.keys(this.ratingsDatabase).length);
playersWithRatingsGauge.set(Object.keys(this.historyDatabase).length);
```

### Dans ReplayDB.ts
```typescript
import { databaseRebuildsTotal, databaseRebuildDuration } from '../prometheus';

const timer = databaseRebuildDuration.startTimer({ database_type: 'replay' });
// ... rebuild logic ...
timer();
databaseRebuildsTotal.labels('replay').inc();
```

## Notes

- Le dashboard affiche les données des 6 dernières heures
- Adapter les requêtes Prometheus selon vos besoins spécifiques
- Les seuils d'alerte peuvent être configurés dans les panneaux
