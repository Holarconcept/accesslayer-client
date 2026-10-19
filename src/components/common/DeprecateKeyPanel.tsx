import React, { useState, useEffect } from 'react';
import { AlertTriangle, Clock, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/utils/numberFormat.utils';

export interface DeprecateKeyPanelProps {
	/** Creator ID or key ID. */
	creatorId: string;
	/** Current circulating supply of keys. */
	circulatingSupply: number;
	/** Optional creator wallet balance in XLM to check for sufficient funds. */
	creatorBalanceXlm?: number | null;
	/** Whether the key has already been deprecated. */
	isDeprecated?: boolean;
	/** Called when submitting deprecation with buybackPrice and totalEscrow. */
	onSubmit: (params: {
		buybackPrice: number;
		totalEscrow: number;
	}) => void | Promise<void>;
	isSubmitting?: boolean;
	/** Whether retirement has been proposed (starts notice period). */
	isRetirementProposed?: boolean;
	/** Unix timestamp (ms) when the notice period ends. */
	noticePeriodEndsAt?: number | null;
	/** Unix timestamp (ms) when the notice period started. */
	noticePeriodStartedAt?: number | null;
	/** Current market price per key in XLM for voluntary exit. */
	marketPriceXlm?: number | null;
	/** Holder's key balance available for voluntary exit. */
	holderBalance?: number;
	/** Called when holder voluntarily sells keys during notice period. */
	onVoluntaryExit?: (params: { amount: number; pricePerKey: number }) => void | Promise<void>;
	/** Whether a voluntary exit submission is in flight. */
	isExiting?: boolean;
}

const fieldClass =
	'w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-amber-400/40 focus:ring-[3px] focus:ring-amber-400/20 disabled:opacity-50';

/**
" * Key deprecation management panel for the creator dashboard settings tab.
 *
 * Lets creators initiate key deprecation by specifying a per-key buyback price,
 * previews the required total XLM escrow, verifies sufficient creator balance,
 * and requires typing "DEPRECATE" in a confirmation field to enable submission.
 */
const DeprecateKeyPanel: React.FC<DeprecateKeyPanelProps> = ({
	circulatingSupply,
	creatorBalanceXlm,
	isDeprecated = false,
	onSubmit,
	isSubmitting = false,
	isRetirementProposed = false,
	noticePeriodEndsAt = null,
	noticePeriodStartedAt = null,
	marketPriceXlm = null,
	holderBalance = 0,
	onVoluntaryExit,
	isExiting = false,
}) => {
	const [buybackPriceInput, setBuybackPriceInput] = useState('1');
	const [confirmTextInput, setConfirmTextInput] = useState('');
	const [exitAmountInput, setExitAmountInput] = useState('');
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		if (!isRetirementProposed || noticePeriodEndsAt == null) return;
		const interval = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(interval);
	}, [isRetirementProposed, noticePeriodEndsAt]);

	const parsedBuybackPrice = Number(buybackPriceInput) || 0;
	const totalEscrowRequired = parsedBuybackPrice * circulatingSupply;

	const isConfirmationTyped = confirmTextInput.trim() === 'DEPRECATE';

	// Balance validation: show error if creator balance is known and less than totalEscrowRequired
	const isBalanceInsufficient =
		creatorBalanceXlm != null &&
		Number.isFinite(creatorBalanceXlm) &&
		creatorBalanceXlm < totalEscrowRequired;

	const isSubmitDisabled =
		isSubmitting ||
		!isConfirmationTyped ||
		isBalanceInsufficient ||
		parsedBuybackPrice <= 0;

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (isSubmitDisabled) return;
		onSubmit({
			buybackPrice: parsedBuybackPrice,
			totalEscrow: totalEscrowRequired,
		});
	};

	const noticeTotalMs =
		noticePeriodEndsAt != null && noticePeriodStartedAt != null
			? Math.max(noticePeriodEndsAt - noticePeriodStartedAt, 0)
			: 0;
	const noticeElapsedMs =
		noticePeriodEndsAt != null && noticePeriodStartedAt != null
			? Math.min(Math.max(now - noticePeriodStartedAt, 0), noticeTotalMs)
			: 0;
	const noticeProgressPct =
		noticeTotalMs > 0 ? Math.min(100, (noticeElapsedMs / noticeTotalMs) * 100) : 0;
	const noticeRemainingMs =
		noticePeriodEndsAt != null ? Math.max(noticePeriodEndsAt - now, 0) : 0;
	const formatCountdown = (ms: number) => {
		const totalSeconds = Math.floor(ms / 1000);
		const days = Math.floor(totalSeconds / 86400);
		const hours = Math.floor((totalSeconds % 86400) / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;
		return `${days}d ${hours}h ${minutes}m ${seconds}s`;
	};

	const parsedExitAmount = Number(exitAmountInput) || 0;
	const exitPricePerKey = marketPriceXlm ?? parsedBuybackPrice;
	const exitProceeds = parsedExitAmount * exitPricePerKey;
	const isExitDisabled =
		isExiting ||
		parsedExitAmount <= 0 ||
		parsedExitAmount > holderBalance ||
		!onVoluntaryExit;

	const handleVoluntaryExit = (e: React.FormEvent) => {
		e.preventDefault();
		if (isExitDisabled || !onVoluntaryExit) return;
		onVoluntaryExit({ amount: parsedExitAmount, pricePerKey: exitPricePerKey });
	};

	if (isDeprecated) {
		return (
			<div
				className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-white"
				data-testid="key-deprecated-banner"
			>
				<div className="flex items-center gap-3">
					<AlertTriangle className="size-6 shrink-0 text-amber-400" />
					<div>
						<h3 className="font-grotesque text-lg font-bold text-amber-300">
								Key deprecated
							</h3>
						<p className="mt-1 text-sm text-white/70">
							This key has been deprecated. All new buys are disabled and
							holders can redeem their keys for escrowed buyback value.
						</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{isRetirementProposed && (
				<>
					<div
						className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-white"
						data-testid="retirement-banner"
						>
						<div className="flex items-start gap-3">
						<Clock className="mt-0.5 size-6 shrink-0 text-amber-400" />
						<div className="flex-1">
							<h3 className="font-grotesque text-lg font-bold text-amber-300">
								Retirement proposed
							</h3>
							<p className="mt-1 text-sm text-white/70">
								This key is undergoing retirement. Holders may exit
								voluntarily before the forced buyback executes.
							</p>
							<div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
								<span data-testid="retirement-buyback-price">
									Buyback price:{' '}
								<span className="font-mono font-bold text-amber-300">
										{parsedBuybackPrice.toLocaleString(undefined, {
											minimumFractionDigits: 2,
											maximumFractionDigits: 4,
										})}{' '}
										XLM
								</span>
							</span>
							<span data-testid="retirement-countdown">
								Notice period remaining:{' '}
								<span className="font-mono font-bold text-amber-300">
									{formatCountdown(noticeRemainingMs)}
								</span>
							</span>
						</div>
						<div className="mt-4">
							<div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
								<div
									className="h-full rounded-full bg-amber-400 transition-all"
									style={{ width: `${noticeProgressPct}%` }}
									data-testid="notice-period-progress"
									role="progressbar"
									aria-valuenow={Math.round(noticeProgressPct)}
									aria-valuemin={0}
									aria-valuemax={100}
								/>
							</div>
						</div>
						<p className="mt-1 text-xs text-white/50">
							<span>{Math.round(noticeProgressPct)}% of notice period elapsed</span>
						</p>
					</div>
				</div>
				</div>

				<form
					onSubmit={handleVoluntaryExit}
					className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-white"
					data-testid="voluntary-exit-panel"
					noValidate
				>
					<div className="flex items-center gap-2">
						<TrendingDown className="size-5 text-amber-400" />
						<h3 className="font-grotesque text-base font-bold">
							Forced buyback notice
						</h3>
					</div>
					<p className="mt-1 text-sm text-white/60">
						This key is scheduled for forced buyback at the buyback price
						when the notice period ends. You can exit voluntarily at the
						current market rate before then.
					</p>
					<div className="mt-4 space-y-1.5">
						<label
							htmlFor="exit-amount"
							className="text-xs font-bold uppercase tracking-[0.18em] text-white/50"
						>
							Amount to sell (keys)
						</label>
						<input
							id="exit-amount"
							type="number"
							min="0"
							step="1"
							max={holderBalance}
							value={exitAmountInput}
							onChange={(e) => setExitAmountInput(e.target.value)}
							className={fieldClass}
							placeholder="0"
							disabled={isExiting}
						/>
						<span className="text-xs text-white/50">
							Available: {formatNumber(holderBalance)} keys
						</span>
					</div>
					<div className="mt-4 flex items-center justify-between text-sm">
						<span className="text-white/60">Price per key</span>
						<span className="font-mono font-bold text-amber-300">
							{exitPricePerKey.toLocaleString(undefined, {
								minimumFractionDigits: 2,
								maximumFractionDigits: 4,
							})} XLM
						</span>
					</div>
					<div className="mt-2 flex items-center justify-between text-sm">
						<span className="text-white/60">You receive</span>
						<span className="font-mono font-bold text-white">
							{exitProceeds.toLocaleString(undefined, {
								minimumFractionDigits: 2,
								maximumFractionDigits: 4,
							})} XLM
						</span>
					</div>
					<Button
						type="submit"
						disabled={isExitDisabled}
						className="mt-4 w-full"
						data-testid="voluntary-exit-submit"
					>
						{isExiting ? 'Exiting...' : 'Exit voluntarily'}
					</Button>
				</form>
			</>
			)}
		</div>
	);
};

export default DeprecateKeyPanel;
