import { BaseApiService, type APIResponse } from './api.service';

export interface KeyAnalyticsData {
	/** Unique wallet addresses that have bought or sold keys */
	uniqueTraderCount: number;
	/** Cumulative trade transactions (buys + sells) */
	totalTradeCount: number;
	/** Cumulative trading volume in XLM */
	cumulativeVolumeXlm: number;
	/** Cumulative trading volume in USD */
	cumulativeVolumeUsd: number;
	/** Conversion rate used for XLM to USD */
	xlmPriceUsd: number;
	/** ISO timestamp when the contract accumulator was last fetched */
	lastUpdated: string;
}

export type ProtocolTimeRange = '7d' | '30d' | '90d';

/**
 * Protocol-wide current metrics sourced from the on-chain analytics registry (#1167).
 */
export interface ProtocolAnalyticsSummary {
	/** Total value locked across all creator keys, in XLM */
	totalTvlXlm: number;
	/** Cumulative all-time trading volume across all keys, in XLM */
	cumulativeVolumeXlm: number;
	/** Creator keys currently active on the protocol */
	activeKeys: number;
	/** Unique wallets that have traded any key */
	uniqueTraders: number;
	/** Conversion rate used for XLM to USD */
	xlmPriceUsd: number;
}

/**
 * Single historical data point for the protocol TVL / volume charts.
 */
export interface ProtocolHistoryPoint {
	/** ISO timestamp of the sample */
	timestamp: string;
	/** Total value locked at this point, in XLM */
	tvl: number;
	/** Trading volume recorded for this interval, in XLM */
	volume: number;
}

/**
 * A creator key ranked by trading volume on the protocol analytics dashboard.
 */
export interface ProtocolTopKey {
	id: string;
	title: string;
	thumbnail?: string;
	/** 24-hour trading volume, in XLM */
	volume24h: number;
	/** Price change percentage over the last 24 hours (e.g. 5.2 = +5.2%) */
	change24h: number;
	/** Cumulative all-time trading volume, in XLM */
	cumulativeVolumeXlm: number;
}

/**
 * Full payload returned by GET /analytics/protocol.
 */
export interface ProtocolAnalyticsData {
	summary: ProtocolAnalyticsSummary;
	/** TVL history points ordered oldest → newest */
	tvlHistory: ProtocolHistoryPoint[];
	/** Volume history points ordered oldest → newest */
	volumeHistory: ProtocolHistoryPoint[];
	/** Top keys by 24-hour volume, descending */
	topKeys: ProtocolTopKey[];
	/** ISO timestamp when the analytics registry was last sampled */
	lastUpdated: string;
}

const DEFAULT_XLM_PRICE_USD = 0.12;

export class AnalyticsService extends BaseApiService {
	/**
	 * Fetches on-chain unique trader count and cumulative trade volume stats
	 * from the contract analytics accumulator endpoint (#966).
	 */
	async getKeyAnalytics(creatorId?: string): Promise<KeyAnalyticsData> {
		try {
			const response = await this.api.get<APIResponse<KeyAnalyticsData>>(
				'/analytics/keys',
				{
					params: creatorId ? { creatorId } : undefined,
				}
			);
			return response.data.data;
		} catch {
			// Fallback mock accumulator data for dev/testing or when backend is offline
			return this.getMockKeyAnalytics(creatorId);
		}
	}

	/**
	 * Fetches protocol-wide analytics (#1167): total TVL, cumulative volume,
	 * active keys, unique traders, historical TVL/volume points, and the top
	 * keys by 24-hour volume, from the on-chain analytics registry.
	 */
	async getProtocolAnalytics(
		range: ProtocolTimeRange = '30d'
	): Promise<ProtocolAnalyticsData> {
		try {
			const response = await this.api.get<APIResponse<ProtocolAnalyticsData>>(
				'/analytics/protocol',
				{ params: { range } }
			);
			return response.data.data;
		} catch {
			// Fallback mock registry data for dev/testing or when backend is offline
			return this.getMockProtocolAnalytics(range);
		}
	}

	/**
	 * Deterministic mock protocol analytics for fallback environments
	 */
	getMockProtocolAnalytics(range: ProtocolTimeRange = '30d'): ProtocolAnalyticsData {
		const dayCount = range === '7d' ? 7 : range === '30d' ? 30 : 90;
		const activeKeys = 148;
		const uniqueTraders = 3820;
		const baseTvl = 245_000;
		const dailyVolume = 18_500;
		const dayMs = 86_400_000;
		const now = Date.now();

		const tvlHistory: ProtocolHistoryPoint[] = [];
		const volumeHistory: ProtocolHistoryPoint[] = [];

		for (let daysAgo = dayCount - 1; daysAgo >= 0; daysAgo--) {
			const timestamp = new Date(now - daysAgo * dayMs).toISOString();
			const progress = dayCount - daysAgo;
			const point: ProtocolHistoryPoint = {
				timestamp,
				tvl: Math.round(baseTvl * (1 + Math.sin(progress / 4) * 0.08 + progress * 0.004)),
				volume: Math.round(dailyVolume * (1 + Math.cos(progress) * 0.35)),
			};
			tvlHistory.push(point);
			volumeHistory.push(point);
		}

		const latestTvl = tvlHistory[tvlHistory.length - 1]?.tvl ?? baseTvl;
		const cumulativeVolumeXlm =
			volumeHistory.reduce((sum, point) => sum + point.volume, 0) * 12;

		const topKeys: ProtocolTopKey[] = Array.from({ length: 10 }, (_, index) => ({
			id: `mock-key-${index + 1}`,
			title: `Creator Key #${index + 1}`,
			volume24h: Math.round(dailyVolume * (0.9 - index * 0.07)),
			change24h: Math.round(Math.sin(index + 1) * 1200) / 100,
			cumulativeVolumeXlm: Math.round(dailyVolume * (30 - index * 2)),
		}));

		return {
			summary: {
				totalTvlXlm: latestTvl,
				cumulativeVolumeXlm,
				activeKeys,
				uniqueTraders,
				xlmPriceUsd: DEFAULT_XLM_PRICE_USD,
			},
			tvlHistory,
			volumeHistory,
			topKeys,
			lastUpdated: new Date().toISOString(),
		};
	}

	/**
	 * Deterministic mock data for fallback environments
	 */
	getMockKeyAnalytics(creatorId?: string): KeyAnalyticsData {
		const seed = creatorId ? creatorId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) : 42;
		const uniqueTraders = 1240 + (seed % 500);
		const totalTrades = uniqueTraders * 4 + (seed % 350);
		const volumeXlm = 145000 + (seed * 120);
		const volumeUsd = Math.round(volumeXlm * DEFAULT_XLM_PRICE_USD * 100) / 100;

		return {
			uniqueTraderCount: uniqueTraders,
			totalTradeCount: totalTrades,
			cumulativeVolumeXlm: volumeXlm,
			cumulativeVolumeUsd: volumeUsd,
			xlmPriceUsd: DEFAULT_XLM_PRICE_USD,
			lastUpdated: new Date().toISOString(),
		};
	}
}

export const analyticsService = new AnalyticsService();
