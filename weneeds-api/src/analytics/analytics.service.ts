import { Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';

export type TimelineGroupBy = 'month' | 'day' | 'hour';

export interface DateFilters {
  startDate?: string;
  endDate?: string;
  month?: number;
  year?: number;
}

const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function hasAnyFilter(f: DateFilters): boolean {
  return (
    f.startDate != null ||
    f.endDate != null ||
    f.month != null ||
    f.year != null
  );
}

function makeDateFilter(f: DateFilters): (dateStr: string) => boolean {
  if (!hasAnyFilter(f)) return () => true;
  return (dateStr: string) => {
    if (!dateStr) return false;
    const ymd = dateStr.slice(0, 10);
    if (f.startDate && ymd < f.startDate) return false;
    if (f.endDate && ymd > f.endDate) return false;
    if (f.year != null) {
      const y = parseInt(ymd.slice(0, 4), 10);
      if (y !== f.year) return false;
    }
    if (f.month != null) {
      const m = parseInt(ymd.slice(5, 7), 10);
      if (m !== f.month) return false;
    }
    return true;
  };
}

@Injectable()
export class AnalyticsService {
  private readCsv<T = Record<string, string>>(fileName: string): T[] {
    const fullPath = path.join(process.cwd(), 'data', 'clean', fileName);
    const fileContent = fs.readFileSync(fullPath);
    return parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
    }) as T[];
  }

  getSummary(filters: DateFilters) {
    const visitorMatch = makeDateFilter(filters);
    const visitors = this.readCsv('visitors_clean.csv').filter((v) =>
      visitorMatch(v['session_started_date']),
    );
    const pageViews = this.readCsv('page_views_clean.csv').filter((p) =>
      visitorMatch(p['date']),
    );

    const totalVisits = visitors.length;
    const uniqueVisitors = new Set(
      visitors.map((v) => v['ip_address']).filter(Boolean),
    ).size;
    const totalPageViews = pageViews.length;

    const durations = visitors
      .map((v) => parseFloat(v['session_duration_seconds']))
      .filter((n) => Number.isFinite(n));
    const avgSeconds = durations.length
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    const bounces = visitors.filter(
      (v) => String(v['is_bounce']).toLowerCase() === 'true',
    ).length;
    const bounceRate = totalVisits ? (bounces / totalVisits) * 100 : 0;

    return {
      total_visits: totalVisits,
      unique_visitors: uniqueVisitors,
      total_page_views: totalPageViews,
      avg_session_duration: round(avgSeconds / 60, 2),
      bounce_rate: round(bounceRate, 2),
      engagement_rate: round(100 - bounceRate, 2),
    };
  }

  getTopPages(limit: number, filters: DateFilters) {
    const match = makeDateFilter(filters);
    const rows = this.readCsv('page_views_clean.csv').filter((p) =>
      match(p['date']),
    );

    type Bucket = {
      page_name: string;
      normalized_path: string;
      views: number;
      sessions: Set<string>;
      scrollSum: number;
      scrollCount: number;
      timeSum: number;
      timeCount: number;
    };
    const groups = new Map<string, Bucket>();

    for (const r of rows) {
      const key = r['normalized_path'] || '';
      let g = groups.get(key);
      if (!g) {
        g = {
          page_name: r['page_name'] || '',
          normalized_path: key,
          views: 0,
          sessions: new Set(),
          scrollSum: 0,
          scrollCount: 0,
          timeSum: 0,
          timeCount: 0,
        };
        groups.set(key, g);
      }
      g.views += 1;
      if (r['session_id']) g.sessions.add(r['session_id']);
      const scroll = parseFloat(r['scroll_depth_pct']);
      if (Number.isFinite(scroll)) {
        g.scrollSum += scroll;
        g.scrollCount += 1;
      }
      const time = parseFloat(r['time_on_page_seconds']);
      if (Number.isFinite(time)) {
        g.timeSum += time;
        g.timeCount += 1;
      }
    }

    return Array.from(groups.values())
      .map((g) => ({
        page_name: g.page_name,
        normalized_path: g.normalized_path,
        views: g.views,
        unique_sessions: g.sessions.size,
        avg_scroll_depth: round(
          g.scrollCount ? g.scrollSum / g.scrollCount : 0,
          2,
        ),
        avg_time_on_page_seconds: round(
          g.timeCount ? g.timeSum / g.timeCount : 0,
          2,
        ),
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, limit);
  }

  // Top pages avec moyennes calculées sur TOUTES les page_views (pas
  // d'agrégation préalable par mois). Seul un filtre year est appliqué.
  // Power BI peut ainsi afficher les vraies moyennes globales sans tomber
  // dans le piège « moyenne des moyennes mensuelles ».
  getTopPagesGlobal(limit: number, year?: number) {
    const match =
      year != null
        ? (dateStr: string) => {
            if (!dateStr) return false;
            const y = parseInt(dateStr.slice(0, 4), 10);
            return y === year;
          }
        : () => true;

    const rows = this.readCsv('page_views_clean.csv').filter((p) =>
      match(p['date']),
    );

    type Bucket = {
      page_name: string;
      normalized_path: string;
      views: number;
      sessions: Set<string>;
      scrollSum: number;
      scrollCount: number;
      timeSum: number;
      timeCount: number;
    };
    const groups = new Map<string, Bucket>();

    for (const r of rows) {
      const key = r['normalized_path'] || '';
      let g = groups.get(key);
      if (!g) {
        g = {
          page_name: r['page_name'] || '',
          normalized_path: key,
          views: 0,
          sessions: new Set(),
          scrollSum: 0,
          scrollCount: 0,
          timeSum: 0,
          timeCount: 0,
        };
        groups.set(key, g);
      }
      g.views += 1;
      if (r['session_id']) g.sessions.add(r['session_id']);
      const scroll = parseFloat(r['scroll_depth_pct']);
      if (Number.isFinite(scroll)) {
        g.scrollSum += scroll;
        g.scrollCount += 1;
      }
      const time = parseFloat(r['time_on_page_seconds']);
      if (Number.isFinite(time)) {
        g.timeSum += time;
        g.timeCount += 1;
      }
    }

    return Array.from(groups.values())
      .map((g) => ({
        page_name: g.page_name,
        normalized_path: g.normalized_path,
        views: g.views,
        unique_sessions: g.sessions.size,
        avg_scroll_depth: round(
          g.scrollCount ? g.scrollSum / g.scrollCount : 0,
          2,
        ),
        avg_time_on_page_seconds: round(
          g.timeCount ? g.timeSum / g.timeCount : 0,
          2,
        ),
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, limit);
  }

  getTrafficSources(filters: DateFilters) {
    const match = makeDateFilter(filters);
    const rows = this.readCsv('visitors_clean.csv').filter((v) =>
      match(v['session_started_date']),
    );
    const counts = new Map<string, number>();
    for (const r of rows) {
      const source = (r['source'] || '').trim() || 'Inconnu';
      counts.set(source, (counts.get(source) ?? 0) + 1);
    }
    return Array.from(counts, ([source, sessions]) => ({ source, sessions }))
      .sort((a, b) => b.sessions - a.sessions);
  }

  getDevices(filters: DateFilters) {
    const match = makeDateFilter(filters);
    const rows = this.readCsv('visitors_clean.csv').filter((v) =>
      match(v['session_started_date']),
    );
    const counts = new Map<string, number>();
    for (const r of rows) {
      const device = (r['device'] || '').trim() || 'Inconnu';
      counts.set(device, (counts.get(device) ?? 0) + 1);
    }
    const total = rows.length || 1;
    return Array.from(counts, ([device, sessions]) => ({
      device,
      sessions,
      percentage: round((sessions / total) * 100, 2),
    })).sort((a, b) => b.sessions - a.sessions);
  }

  getTimeline(groupBy: TimelineGroupBy, filters: DateFilters) {
    const match = makeDateFilter(filters);
    const rows = this.readCsv('visitors_clean.csv').filter((v) =>
      match(v['session_started_date']),
    );
    const buckets = new Map<
      string,
      { sessions: number; bounces: number; sortKey: string }
    >();

    for (const r of rows) {
      const dateStr = (r['session_started_date'] || '').trim();
      if (!dateStr) continue;
      const date = new Date(dateStr);
      if (Number.isNaN(date.getTime())) continue;

      let key: string;
      let sortKey: string;
      if (groupBy === 'month') {
        const m = date.getUTCMonth();
        key = MONTHS_FR[m];
        sortKey = `${date.getUTCFullYear()}-${String(m + 1).padStart(2, '0')}`;
      } else if (groupBy === 'day') {
        key = dateStr;
        sortKey = dateStr;
      } else {
        const hour = (r['session_started_hour'] || '').trim();
        key = hour;
        sortKey = hour.padStart(2, '0');
      }

      const isBounce = String(r['is_bounce']).toLowerCase() === 'true';
      const bucket = buckets.get(key) ?? { sessions: 0, bounces: 0, sortKey };
      bucket.sessions += 1;
      if (isBounce) bucket.bounces += 1;
      buckets.set(key, bucket);
    }

    return Array.from(buckets, ([period, b]) => ({
      period,
      sessions: b.sessions,
      bounce_rate: round((b.bounces / b.sessions) * 100, 2),
      _sortKey: b.sortKey,
    }))
      .sort((a, b) => a._sortKey.localeCompare(b._sortKey))
      .map(({ _sortKey, ...rest }) => rest);
  }

  // Renvoie les lignes brutes de session (1 ligne = 1 session) pour que Power BI
  // fasse ses propres agrégations. La colonne country_factice est générée ici
  // pour rester cohérente avec /analytics/countries.
  getSessions() {
    const rows = this.readCsv('visitors_clean.csv');
    const countryByIp = this.buildCountryAssignment(rows);

    return rows.map((r) => ({
      session_id: r['session_id'],
      ip_address: r['ip_address'] || '',
      session_started_date: (r['session_started_date'] || '').slice(0, 10),
      session_started_hour: parseInt(r['session_started_hour'], 10),
      source: r['source'] || '',
      device: r['device'] || '',
      browser_name: r['browser_name'] || '',
      pages_visited_count: parseInt(r['pages_visited_count'], 10),
      session_duration_minutes: parseFloat(r['session_duration_minutes']),
      is_bounce: String(r['is_bounce']).toLowerCase() === 'true',
      is_returning_visitor:
        String(r['is_returning_visitor']).toLowerCase() === 'true',
      country_factice: countryByIp.get(r['session_id']) ?? 'France',
    }));
  }

  private buildCountryAssignment(
    rows: Record<string, string>[],
  ): Map<string, string> {
    const distribution: Array<{ country: string; count: number }> = [
      { country: 'France', count: 720 },
      { country: 'Maroc', count: 215 },
      { country: 'Belgique', count: 180 },
      { country: 'Tunisie', count: 95 },
      { country: 'Sénégal', count: 80 },
      { country: 'Canada', count: 75 },
      { country: 'Algérie', count: 60 },
      { country: "Côte d'Ivoire", count: 16 },
    ];
    const sortedIds = rows
      .map((r) => r['session_id'])
      .filter(Boolean)
      .sort();
    const out = new Map<string, string>();
    let i = 0;
    for (const { country, count } of distribution) {
      for (let k = 0; k < count && i < sortedIds.length; k++, i++) {
        out.set(sortedIds[i], country);
      }
    }
    for (; i < sortedIds.length; i++) {
      out.set(sortedIds[i], 'France');
    }
    return out;
  }

  // DONNÉES FICTIVES — utilisé uniquement pour alimenter la carte Power BI tant
  // que les vraies données géographiques ne sont pas encore disponibles.
  getCountries() {
    return [
      { country: 'France', sessions: 720 },
      { country: 'Maroc', sessions: 215 },
      { country: 'Belgique', sessions: 180 },
      { country: 'Tunisie', sessions: 95 },
      { country: 'Sénégal', sessions: 80 },
      { country: 'Canada', sessions: 75 },
      { country: 'Algérie', sessions: 60 },
      { country: "Côte d'Ivoire", sessions: 16 },
    ];
  }

  getPageViewsTotal(filters: DateFilters) {
    const match = makeDateFilter(filters);
    const total = this.readCsv('page_views_clean.csv').filter((p) =>
      match(p['date']),
    ).length;
    return { total_page_views: total };
  }

  getBrowsers(filters: DateFilters) {
    const match = makeDateFilter(filters);
    const rows = this.readCsv('visitors_clean.csv').filter((v) =>
      match(v['session_started_date']),
    );
    const counts = new Map<string, number>();
    for (const r of rows) {
      const browser = (r['browser_name'] || '').trim() || 'Inconnu';
      counts.set(browser, (counts.get(browser) ?? 0) + 1);
    }
    return Array.from(counts, ([browser, sessions]) => ({ browser, sessions }))
      .sort((a, b) => b.sessions - a.sessions);
  }
}
