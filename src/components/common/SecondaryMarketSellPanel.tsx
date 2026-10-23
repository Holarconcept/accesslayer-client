/**
 * Secondary-market sell panel (#1174).
 * Offers two listing modes side by side: Fixed Price and Auction.
 * The auction tab collects fraction amount, reserve price, and duration,
 * shows a summary preview, and submits `create_auction`.
 *
 * Retirement support: when `retirement` is provided, the panel renders a
 * retirement banner (buyback price, notice countdown, progress bar) and a
 * voluntary exit section that lets holders sell during the notice period at
 * market rate. The banner disappears once the retirement has executed.
 */

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatDisplayKeyPrice } from '@/utils/keyPriceDisplay.utils';
import showToast from '@/utils/toast.util';
import {
	AUCTION_DURATIONS,
	buildAuctionSummary,
	durationLabelToSeconds,
	type AuctionDurationLabel,
} from '@/utils/auction.utils';

export type SellMode = 'fixed' | 'auction';

export interface KeyRetirementInfo {
	/** Buyback price per fraction, in stroops. */
	buybackPriceStroops: number;
	/** Notice period start, unix ms. */
	noticeStartMs: number;
	/** Notice period end (forced buyback), unix ms. */
	noticeEndMs: number;
	/** Current market price per fraction, in stroops (for voluntary exit). */
	marketPriceStroops: number;
	/** True once execute_retirement has run; hides the banner. */
	executed?: boolean;
	/** Amount received per holder on buyback, in stroops (for confirmation). */
	amountReceivedStroops?: number;
}

export interface SecondaryMarketSellPanelProps {
	/** Fraction balance the seller can list. */
	availableFractions: number;
	/** Submit a fixed-price listing. */
	onCreateFixedPriceListing?: (input: {
		fractionAmount: number;
		priceStroops: number;
	}) => Promise<void> | void;
	/**
	 * Submit an auction listing. Must fire the `create_auction` contract call
	 * with the exact params produced by `buildAuctionSummary`.
	 */
	onCreateAuction: (params: {
		fractionAmount: number;
		reservePriceStroops: number;
		durationSeconds: number;
	}) => Promise<void> | void;
	/** Voluntary sell during notice period at market rate. */
	onVoluntaryExit?: (input: {
		fractionAmount: number;
		priceStroops: number;
	}) => Promise<void> | void;
	/** Retirement state for the key, if retirement has been proposed. */
	retirement?: KeyRetirementInfo;
	/** Current time in unix ms; injectable for deterministic rendering. */
	nowMs?: number;
	isSubmitting?: boolean;
}

const TABS: Array<{ id: SellMode; label: string }> = [
	{ id: 'fixed', label: 'Fixed Price' },
	{ id: 'auction', label: 'Auction' },
];

const inputClass =
	'w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-amber-300/50 focus:outline-none';

export function getNoticeProgress(
	noticeStartMs: number,
	noticeEndMs: number,
	nowMs: number
): number {
	const total = noticeEndMs - noticeStartMs;
	if (total <= 0) return 100;
	const elapsed = Math.min(Math.max(nowMs - noticeStartMs, 0), total);
	return Math.round((elapsed / total) * 100);
}

export function formatCountdown(remainingMs: number): string {
	if (remainingMs <= 0) return 'Buyback due';
	const totalMinutes = Math.floor(remainingMs / 60000);
	const days = Math.floor(totalMinutes / (60 * 24));
	const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
	const minutes = totalMinutes % 60;
	if (days > 0) return `${days}d ${hours}h remaining`;
	if (hours > 0) return `${hours}h ${minutes}m remaining`;
	return `${minutes}m remaining`;
}

const RetirementBanner: React.FC<{
	retirement: KeyRetirementInfo;
	nowMs: number;
}> = ({ retirement, nowMs }) => {
	const progress = getNoticeProgress(
		retirement.noticeStartMs,
		retirement.noticeEndMs,
		nowMs
	);
	const remaining = retirement.noticeEndMs - nowMs;
	return (
		<div
			className="space-y-3 rounded-lg border border-amber-300/40 bg-amber-300/5 p-4"
			data-testid="retirement-banner"
			role="status"
		>
			<div className="flex items-center justify-between text-sm">
				<span className="font-medium text-amber-200">This key is being retired</span>
				<span className="text-xs text-white/70" data-testid="retirement-countdown">
					{formatCountdown(remaining)}
				</span>
			</div>
			<div className="flex justify-between text-xs">
				<span className="text-white/60">Buyback price</span>
				<span className="font-mono text-white/90" data-testid="retirement-buyback-price">
					{formatDisplayKeyPrice(retirement.buybackPriceStroops)}
				</span>
			</div>
			<div>
				<div
					className="h-2 w-full overflow-hidden rounded-full bg-white/10"
					role="progressbar"
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={progress}
					data-testid="notice-progress"
				>
					<div
						className="h-full bg-amber-300 transition-all"
						style={{ width: `${progress}%` }}
					/>
				</div>
				<span className="mt-1 block text-[11px] text-white/50">
					{progress}% of notice period elapsed
				</span>
			</div>
		</div>
	);
};

const VoluntaryExitPanel: React.FC<{
	retirement: KeyRetirementInfo;
	availableFractions: number;
	onVoluntaryExit: NonNullable<SecondaryMarketSellPanelProps['onVoluntaryExit']>;
	isSubmitting: boolean;
}> = ({ retirement, availableFractions, onVoluntaryExit, isSubmitting }) => {
	const [amountInput, setAmountInput] = useState('1');
	const amount = Number(amountInput);
	const valid =
		Number.isInteger(amount) && amount > 0 && amount <= availableFractions;

	const submit = async () => {
		if (!valid) {
			showToast.error('Enter a valid fraction amount');
			return;
		}
		try {
			await onVoluntaryExit({
				fractionAmount: amount,
				priceStroops: retirement.marketPriceStroops,
			});
			showToast.success('Voluntary exit submitted');
		} catch (error) {
			showToast.error(
				error instanceof Error ? error.message : 'Failed to sell'
			);
		}
	};

	return (
		<div
			className="space-y-3 rounded-lg border border-white/10 bg-white/[0.02] p-4"
			data-testid="voluntary-exit-panel"
		>
			<div className="text-sm font-medium text-white/90">Voluntary exit</div>
			<p className="text-xs text-white/60">
				Sell before forced buyback at the current market price.
			</p>
			<label className="block">
				<span className="mb-1 block text-xs text-white/60">Fraction amount</span>
				<input
					type="number"
					min={1}
					max={availableFractions}
					value={amountInput}
					onChange={e => setAmountInput(e.target.value)}
					className={inputClass}
					data-testid="voluntary-exit-amount"
				/>
			</label>
			<div className="flex justify-between text-xs">
				<span className="text-white/60">Market price</span>
				<span className="font-mono text-white/90" data-testid="voluntary-exit-price">
					{formatDisplayKeyPrice(retirement.marketPriceStroops)}
				</span>
			</div>
			<Button
				type="button"
				onClick={submit}
				disabled={isSubmitting || !valid}
				data-testid="submit-voluntary-exit"
			>
				{isSubmitting ? 'Submitting…' : 'Sell at market'}
			</Button>
		</div>
	);
};

const BuybackConfirmed: React.FC<{ amountReceivedStroops: number }> = ({
	amountReceivedStroops,
}) => (
	<div
		className="rounded-lg border border-emerald-300/40 bg-emerald-300/5 p-4 text-sm"
		data-testid="buyback-confirmed"
	>
		<div className="font-medium text-emerald-200">Buyback confirmed</div>
		<div className="mt-2 flex justify-between text-xs">
			<span className="text-white/60">Amount received</span>
			<span className="font-mono text-white/90" data-testid="buyback-amount-received">
				{formatDisplayKeyPrice(amountReceivedStroops)}
			</span>
		</div>
	</div>
);

const RetirementNotificationCard: React.FC<{ retirement: KeyRetirementInfo; nowMs: number }> = ({
	retirement,
	nowMs,
}) => (
	<div
		className="rounded-lg border border-white/10 bg-white/[0.02] p-4 text-xs text-white/80"
		data-testid="retirement-notification"
	>
		<div className="mb-1 font-medium text-white/90">Notice: key retirement</div>
		<p>
			A retirement has been proposed for a key you hold. Buyback at{' '}
			{formatDisplayKeyPrice(retirement.buybackPriceStroops)} per fraction.{' '}
			{formatCountdown(retirement.noticeEndMs - nowMs)}. You may sell voluntarily
			at market price below, or wait for buyback.
		</p>
	</div>
);

const SecondaryMarketSellPanel: React.FC<SecondaryMarketSellPanelProps> = ({
	availableFractions,
	onCreateFixedPriceListing,
	onCreateAuction,
	onVoluntaryExit,
	retirement,
	nowMs,
	isSubmitting = false,
}) => {
	const [mode, setMode] = useState<SellMode>('fixed');
	const [fractionAmount, setFractionAmount] = useState('1');
	const [reservePrice, setReservePrice] = useState('');
	const [fixedPrice, setFixedPrice] = useState('');
	const [duration, setDuration] = useState<AuctionDurationLabel>('1h');

	const now = nowMs ?? Date.now();
	const showRetirementBanner = !!retirement && !retirement.executed;

	const amount = Number(fractionAmount);
	const reserve = Number(reservePrice);
	const price = Number(fixedPrice);
	const durationSeconds = durationLabelToSeconds(duration);

	const auctionSummary = useMemo(() => {
		if (
			!Number.isInteger(amount) ||
			amount <= 0 ||
			!Number.isFinite(reserve) ||
			reserve <= 0
		) {
			return null;
		}
		try {
			return buildAuctionSummary({
				fractionAmount: amount,
				reservePriceStroops: reserve,
				durationSeconds,
			});
		} catch {
			return null;
		}
	}, [amount, reserve, durationSeconds]);

	const submitAuction = async () => {
		if (!auctionSummary) {
			showToast.error('Enter a valid fraction amount and reserve price');
			return;
		}
		try {
			await onCreateAuction({
				fractionAmount: auctionSummary.fractionAmount,
				reservePriceStroops: auctionSummary.reservePriceStroops,
				durationSeconds: auctionSummary.durationSeconds,
			});
			showToast.success(
				`Auction created — ends ${auctionSummary.endTime.toLocaleTimeString()}`
			);
		} catch (error) {
			showToast.error(
				error instanceof Error ? error.message : 'Failed to create auction'
			);
		}
	};

	const submitFixedPrice = async () => {
		if (!Number.isInteger(amount) || amount <= 0 || !Number.isFinite(price) || price <= 0) {
			showToast.error('Enter a valid fraction amount and price');
			return;
		}
		try {
			await onCreateFixedPriceListing?.({
				fractionAmount: amount,
				priceStroops: price,
			});
			showToast.success('Listing created');
		} catch (error) {
			showToast.error(
				error instanceof Error ? error.message : 'Failed to create listing'
			);
		}
	};

	if (retirement?.executed && retirement.amountReceivedStroops !== undefined) {
		return (
			<div className="rounded-xl border border-white/10 bg-white/[0.02] p-5" data-testid="secondary-market-sell-panel">
				<BuybackConfirmed amountReceivedStroops={retirement.amountReceivedStroops} />
			</div>
		);
	}

	return (
		<div className="rounded-xl border border-white/10 bg-white/[0.02] p-5" data-testid="secondary-market-sell-panel">
			{showRetirementBanner && retirement && (
				<div className="mb-5 space-y-4">
					<RetirementNotificationCard retirement={retirement} nowMs={now} />
					<RetirementBanner retirement={retirement} nowMs={now} />
					{onVoluntaryExit && (
						<VoluntaryExitPanel
							retirement={retirement}
							availableFractions={availableFractions}
							onVoluntaryExit={onVoluntaryExit}
							isSubmitting={isSubmitting}
						/>
					)}
				</div>
			)}

			{/* Tabs */}
			<div
				className="mb-5 flex gap-2 border-b border-white/10"
				role="tablist"
				aria-label="Listing type"
				data-testid="sell-mode-tabs"
			>
				{TABS.map(tab => (
					<button
						key={tab.id}
						type="button"
						role="tab"
						aria-selected={mode === tab.id}
						onClick={() => setMode(tab.id)}
						className={`relative -mb-px px-4 py-2 text-sm font-medium transition-colors ${
							mode === tab.id
								? 'border-b-2 border-amber-300 text-amber-200'
								: 'text-white/60 hover:text-white'
						}`}
						data-testid={`sell-mode-tab-${tab.id}`}
					>
						{tab.label}
					</button>
				))}
			</div>

			{/* Shared: fraction amount */}
			<label className="mb-3 block">
				<span className="mb-1 block text-xs text-white/60">Fraction amount</span>
				<input
					type="number"
					min={1}
					max={availableFractions}
					value={fractionAmount}
					onChange={e => setFractionAmount(e.target.value)}
					className={inputClass}
					data-testid="auction-fraction-amount"
				/>
				<span className="mt-1 block text-[11px] text-white/40">
					{availableFractions} available
				</span>
			</label>

			{mode === 'fixed' ? (
				<div className="space-y-3" data-testid="fixed-price-panel">
					<label className="block">
						<span className="mb-1 block text-xs text-white/60">
							Price per fraction (stroops)
						</span>
						<input
							type="number"
							min={1}
							value={fixedPrice}
							onChange={e => setFixedPrice(e.target.value)}
							className={inputClass}
							data-testid="fixed-price-input"
						/>
					</label>
					<Button
						type="button"
						onClick={submitFixedPrice}
						disabled={isSubmitting}
						data-testid="submit-fixed-price"
					>
						{isSubmitting ? 'Submitting…' : 'Create listing'}
					</Button>
				</div>
			) : (
				<div className="space-y-4" data-testid="auction-panel">
					<label className="block">
						<span className="mb-1 block text-xs text-white/60">
							Reserve price (stroops)
						</span>
						<input
							type="number"
							min={1}
							value={reservePrice}
							onChange={e => setReservePrice(e.target.value)}
							className={inputClass}
							data-testid="auction-reserve-price"
						/>
					</label>

					<fieldset>
						<legend className="mb-1 text-xs text-white/60">Duration</legend>
						<div className="flex gap-2" data-testid="auction-duration-selector">
							{AUCTION_DURATIONS.map(d => (
								<button
									key={d.label}
									type="button"
									onClick={() => setDuration(d.label)}
									aria-pressed={duration === d.label}
									className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
										duration === d.label
											? 'border-amber-300/60 bg-amber-300/10 text-amber-200'
											: 'border-white/10 text-white/60 hover:text-white'
									}`}
									data-testid={`auction-duration-${d.label}`}
									data-seconds={d.seconds}
								>
									{d.label}
								</button>
							))}
						</div>
					</fieldset>

					{/* Summary preview */}
					<div
						className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs"
						data-testid="auction-summary"
					>
						<div className="flex justify-between">
							<span className="text-white/60">Reserve</span>
							<span className="font-mono text-white/90" data-testid="auction-summary-reserve">
								{auctionSummary
									? formatDisplayKeyPrice(auctionSummary.reservePriceStroops)
									: '—'}
							</span>
						</div>
						<div className="flex justify-between">
							<span className="text-white/60">Fractions</span>
							<span className="font-mono text-white/90" data-testid="auction-summary-amount">
								{auctionSummary?.fractionAmount ?? '—'}
							</span>
						</div>
						<div className="flex justify-between">
							<span className="text-white/60">Ends</span>
							<span className="font-mono text-white/90" data-testid="auction-summary-end">
								{auctionSummary
									? auctionSummary.endTime.toLocaleString()
									: '—'}
							</span>
						</div>
					</div>

					<Button
						type="button"
						onClick={submitAuction}
						disabled={isSubmitting || !auctionSummary}
						data-testid="submit-auction"
					>
						{isSubmitting ? 'Submitting…' : 'Create auction'}
					</Button>
				</div>
			)}
		</div>
	);
};

export default SecondaryMarketSellPanel;
