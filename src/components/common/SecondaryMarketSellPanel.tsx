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
	buildAuctionSummary,
	durationLabelToSeconds,
	type AuctionDurationLabel,
} from '@/utils/auction.utils';
import {
	RetirementBanner,
	RetirementNotificationCard,
	BuybackConfirmed,
	type KeyRetirementInfo,
} from './KeyFreezeStatusBanner';

export type SellMode = 'fixed' | 'auction';

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

			{mode === 'auction' && (
				<div className="space-y-3" data-testid="auction-form">
					<label className="block">
						<span className="mb-1 block text-xs text-white/60">Fraction amount</span>
						<input
							type="number"
							min={1}
							max={availableFractions}
							value={fractionAmount}
							onChange={e => setFractionAmount(e.target.value)}
							className={inputClass}
						/>
					</label>
					<label className="block">
						<span className="mb-1 block text-xs text-white/60">Reserve price</span>
						<input
							type="number"
							min={0}
							value={reservePrice}
							onChange={e => setReservePrice(e.target.value)}
							className={inputClass}
						/>
					</label>
					<Button type="button" onClick={submitAuction} disabled={isSubmitting || !auctionSummary}>
						Create auction
					</Button>
				</div>
			)}

			{mode === 'fixed' && onCreateFixedPriceListing && (
				<div className="space-y-3" data-testid="fixed-price-form">
					<label className="block">
						<span className="mb-1 block text-xs text-white/60">Price</span>
						<input
							type="number"
							min={0}
							value={fixedPrice}
							onChange={e => setFixedPrice(e.target.value)}
							className={inputClass}
						/>
					</label>
					<Button type="button" onClick={submitFixedPrice} disabled={isSubmitting}>
						Create listing
					</Button>
				</div>
			)}
		</div>
	);
};

export default SecondaryMarketSellPanel;
