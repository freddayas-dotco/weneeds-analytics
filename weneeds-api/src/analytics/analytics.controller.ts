import { Controller, Get, Query } from '@nestjs/common';
import {
  AnalyticsService,
  DateFilters,
  TimelineGroupBy,
} from './analytics.service';

function parseFilters(q: {
  startDate?: string;
  endDate?: string;
  month?: string;
  year?: string;
}): DateFilters {
  const out: DateFilters = {};
  if (q.startDate && /^\d{4}-\d{2}-\d{2}$/.test(q.startDate)) {
    out.startDate = q.startDate;
  }
  if (q.endDate && /^\d{4}-\d{2}-\d{2}$/.test(q.endDate)) {
    out.endDate = q.endDate;
  }
  if (q.month != null && q.month !== '') {
    const m = parseInt(q.month, 10);
    if (Number.isFinite(m) && m >= 1 && m <= 12) out.month = m;
  }
  if (q.year != null && q.year !== '') {
    const y = parseInt(q.year, 10);
    if (Number.isFinite(y) && y >= 1900 && y <= 9999) out.year = y;
  }
  return out;
}

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('summary')
  getSummary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    return this.analytics.getSummary(
      parseFilters({ startDate, endDate, month, year }),
    );
  }

  @Get('top-pages')
  getTopPages(
    @Query('limit') limit?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const parsed = limit ? parseInt(limit, 10) : 20;
    const safe = Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
    return this.analytics.getTopPages(
      safe,
      parseFilters({ startDate, endDate, month, year }),
    );
  }

  // Variante non agrégeable côté Power BI : retourne les top pages avec les
  // vraies moyennes globales (avg_scroll_depth, avg_time_on_page_seconds)
  // calculées sur l'ensemble des données. Seul le filtre `year` est exposé.
  @Get('top-pages-global')
  getTopPagesGlobal(
    @Query('limit') limit?: string,
    @Query('year') year?: string,
  ) {
    const parsed = limit ? parseInt(limit, 10) : 20;
    const safe = Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
    let yearNum: number | undefined;
    if (year != null && year !== '') {
      const y = parseInt(year, 10);
      if (Number.isFinite(y) && y >= 1900 && y <= 9999) yearNum = y;
    }
    return this.analytics.getTopPagesGlobal(safe, yearNum);
  }

  @Get('traffic-sources')
  getTrafficSources(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    return this.analytics.getTrafficSources(
      parseFilters({ startDate, endDate, month, year }),
    );
  }

  @Get('devices')
  getDevices(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    return this.analytics.getDevices(
      parseFilters({ startDate, endDate, month, year }),
    );
  }

  @Get('timeline')
  getTimeline(
    @Query('groupBy') groupBy?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const allowed: TimelineGroupBy[] = ['month', 'day', 'hour'];
    const value = (allowed.includes(groupBy as TimelineGroupBy)
      ? groupBy
      : 'month') as TimelineGroupBy;
    return this.analytics.getTimeline(
      value,
      parseFilters({ startDate, endDate, month, year }),
    );
  }

  // Lignes brutes de session, sans agrégation ni filtrage côté API.
  @Get('sessions')
  getSessions() {
    return this.analytics.getSessions();
  }

  // DONNÉES FICTIVES — pas de filtrage par date, renvoie un set fixe.
  @Get('countries')
  getCountries() {
    return this.analytics.getCountries();
  }

  @Get('pageviews-total')
  getPageViewsTotal(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    return this.analytics.getPageViewsTotal(
      parseFilters({ startDate, endDate, month, year }),
    );
  }

  @Get('browsers')
  getBrowsers(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    return this.analytics.getBrowsers(
      parseFilters({ startDate, endDate, month, year }),
    );
  }
}
