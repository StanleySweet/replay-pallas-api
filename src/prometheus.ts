/**
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: © 2022 Stanislas Daniel Claude Dolcini
 */

import { register, Counter, Histogram, Gauge } from 'prom-client';

// Métriques HTTP
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 5, 15, 50, 100, 500],
});

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

// Métriques métier - Replays
export const replaysUploadedTotal = new Counter({
  name: 'replays_uploaded_total',
  help: 'Total replays uploaded',
});

export const replaysProcessedTotal = new Counter({
  name: 'replays_processed_total',
  help: 'Total replays successfully processed',
  labelNames: ['status'], // success, invalid
});

// Métriques métier - Ratings
export const ratingsCalculationDuration = new Histogram({
  name: 'ratings_calculation_duration_ms',
  help: 'Duration of rating calculations in ms',
  labelNames: ['operation'], // rebuild, merge, update
  buckets: [100, 500, 1000, 5000, 10000, 30000],
});

export const ratingsCalculationErrors = new Counter({
  name: 'ratings_calculation_errors_total',
  help: 'Total rating calculation errors',
  labelNames: ['operation', 'error_type'],
});

export const playersWithRatingsGauge = new Gauge({
  name: 'players_with_ratings',
  help: 'Number of players with ratings in the system',
});

export const ratingsInDatabase = new Gauge({
  name: 'ratings_in_database',
  help: 'Total number of ratings stored in the database',
});

// Métriques métier - Users
export const usersCreatedTotal = new Counter({
  name: 'users_created_total',
  help: 'Total users created',
});

export const usersAuthenticatedTotal = new Counter({
  name: 'users_authenticated_total',
  help: 'Total successful authentications',
});

// Métriques métier - Database
export const databaseRebuildsTotal = new Counter({
  name: 'database_rebuilds_total',
  help: 'Total database rebuilds',
  labelNames: ['database_type'], // replay, ratings, glicko2
});

export const databaseRebuildDuration = new Histogram({
  name: 'database_rebuild_duration_ms',
  help: 'Duration of database rebuilds in ms',
  labelNames: ['database_type'],
  buckets: [100, 500, 1000, 5000, 10000, 30000, 60000],
});

export { register };
