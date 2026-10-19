import { useState, useEffect, useRef } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { StableButtonContent } from '@/components/ui/stable-button-content';
import { formatDisplayKeyPrice } from '@/utils/keyPriceDisplay.utils';
import { formatNumber } from '@/utils/numberFormat.utils';
import { formatAbsoluteDateTime } from '@/utils/time.utils';
import { STROOPS_PER_XLM } from '@/constants/stellar';
import {
    useKeyBuyback,
    useSubmitKeyBuybackMutation,
    type KeyBuybackReceipt,
} from '@/hooks/useKeyBuyback';
import { CheckCircle2, ShieldCheck, Copy, Check, Clock, TrendingDown } from 'lucide-react';
import { copyTextToClipboard } from '@/utils/clipboard.utils';

export interface KeyBuybackModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    creatorId: string;
    creatorTitle: string;
    holdingsCount: number;
    buybackPriceStroops?: number;
    expiryDate?: string | null;
    terms?: string | null;
    userAddress?: string;
    onSettled?: (receipt: KeyBuybackReceipt) => void;
}

export const DEFAULT_BUYRACK_TERMS =
    'Guaranteed contract buyback at fixed settlement price. All positions are permanently redeemed and settled in XLM. Action is final and irreversible on the Soroban network.';

export default function KeyBuybackModal({
    open,
    onOpenChange,
    creatorId,
    creatorTitle,
    holdingsCount,
    buybackPriceStroops: explicitPriceStroops,
    expiryDate: explicitExpiryDate,
    terms: explicitTerms,
    userAddress,
    onSettled,
}: KeyBuybackModalProps) {
    const [receipt, setReceipt] = useState<KeyBuybackReceipt | null>(null);
    const [copiedTx, setCopiedTx] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const triggerElementRef = useRef<HTMLElement | null>(null);

    const { data: contractBuyback } = useKeyBuyback(creatorId, open);
    const buybackPriceStroops =
        explicitPriceStroops != null && explicitPriceStroops > 0
            ? explicitPriceStroops
            : (contractBuyback.buybackPriceStroops ?? 0);
    const expiryDate = explicitExpiryDate ?? contractBuyback.expiryDate;
    const terms = explicitTerms ?? contractBuyback.terms;

    const buybackMutation = useSubmitKeyBuybackMutation(userAddress);
    const isSubmitting = buybackMutation.isPending;

    // Live countdown ticker for the notice period
    useEffect(() => {
        if (!open || !expiryDate) return;
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, [open, expiryDate]);

    const expiryMs = expiryDate ? new Date(expiryDate).getTime() : null;
    const remainingMs = expiryMs != null ? Math.max(0, expiryMs - now) : null;
    const isExpired = remainingMs != null && remainingMs <= 0;
    const countdownLabel = (() => {
        if (remainingMs == null) return null;
        if (remainingMs <= 0) return 'Notice period elapsed';
        const totalSeconds = Math.floor(remainingMs / 1000);
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        if (days > 0) return `${days}d ${hours}h ${minutes}m`;
        if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
        return `${minutes}m ${seconds}s`;
    })();

    useEffect(() => {
        if (open) {
            triggerElementRef.current = document.activeElement as HTMLElement | null;
        } else {
            // Reset receipt state after closed
            const timer = setTimeout(() => {
                setReceipt(null);
                setCopiedTx(false);
            }, 200);
            return () => clearTimeout(timer);
        }
    }, [open]);

    const totalPayoutStroops = holdingsCount * buybackPriceStroops;
    const totalPayoutXlm = totalPayoutStroops / STROOPS_PER_XLM;

    const handleConfirmBuyback = async () => {
        if (holdingsCount <= 0 || isSubmitting) return;

        try {
            const result = await buybackMutation.mutateAsync({
                creatorId,
                quantity: holdingsCount,
                buybackPriceStroops,
            });
            setReceipt(result);
            onSettled?.(result);
        } catch {
            // Error handled by mutation onError toast
        }
    };

    const handleCopyTx = async (txHash: string) => {
        await copyTextToClipboard(txHash);
        setCopiedTx(true);
        setTimeout(() => setCopiedTx(false), 2000);
    };

    const handleClose = () => {
        if (isSubmitting) return;
        onOpenChange(false);
    };

    const formattedExpiry = expiryDate
        ? formatAbsoluteDateTime(expiryDate) ?? expiryDate
        : 'Guaranteed active program';

    return (
        <Dialog
            open={open}
            onOpenChange={next => {
                if (!isSubmitting) {
                    onOpenChange(next);
                }
            }}
        >
            <DialogContent
                className="max-w-md border-white/10 bg-[#0a1526]/95 text-white backdrop-blur-xl"
                showCloseButton={!isSubmitting}
                showEscapeHint={!isSubmitting}
                data-testid="key-buyback-modal"
                onCloseAutoFocus={event => {
                    event.preventDefault();
                    triggerElementRef.current?.focus();
                }}
                onEscapeKeyDown={event => {
                    if (isSubmitting) event.preventDefault();
                }}
                onInteractOutside={event => {
                    if (isSubmitting) event.preventDefault();
                }}
            >
                {receipt ? (
                    /* Buyback Confirmed State */
                    <div className="space-y-5 py-2">
                        <div className="flex flex-col flex-items-center text-center">
                            <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-3 shadow-lg shadow-emerald-500/10">
                                <CheckCircle2 className="size-8" />
                            </div>
                            <DialogTitle
                                className="text-xl font-bold font-grotesque text-white tracking-tight"
                                data-testid="buyback-settlement-confirmed"
                            >
                                Buyback Confirmed
                            </DialogTitle>
                            <DialogDescription className="text-sm text-white/70 mt-1">
                                Your position in{' '}
                                <span className="font-semibold text-white">
                                    {creatorTitle}
                                </span>{' '}
                                has been successfully settled at the guaranteed buyback price.
                                Amount received per holder is shown below.
                            </DialogDescription>
                        </div>

                        {/* Settlement Receipt Card */}
                        <div
                            className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-4 space-y-3 text-sm"
                            data-testid="buyback-settlement-receipt"
                        >
                            <div className="flex items-center justify-between pb-2 border-b border-white/10">
                                <span className="text-white/60">Settlement Status</span>
                                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                                    <Check className="size-3" /> Settled
                                </span>
                            </div>

                            <div className="flex items-center justify-between">
                                <span className="text-white/60">Keys Redeemed</span>
                                <span className="font-semibold text-white tabular-nums">
                                    {formatNumber(receipt.quantity)}
                                </span>
                            </div>

                            <div className="flex items-center justify-between">
                                <span className="text-white/60">Settlement Price</span>
                                <span className="font-semibold text-white tabular-nums">
                                    {formatDisplayKeyPrice(receipt.buybackPriceStroops)}
                                </span>
                            </div>

                            <div className="flex items-center justify-between">
                                <span className="text-white/60">Amount Received</span>
                                <span className="font-bold text-emerald-400 tabular-nums text-base">
                                    {formatNumber(
                                        receipt.totalPayoutStroops / STROOPS_PER_XLM,
                                        {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 4,
                                        }
                                    )}{' '}
                                    XLM
                                </span>
                            </div>

                            <div className="flex items-center justify-between pt-1">
                                <span className="text-white/60">Settled At</span>
                                <span className="text-xs text-white/80 tabular-nums">
                                    {formatAbsoluteDateTime(receipt.settledAt) ??
                                        receipt.settledAt}
                                </span>
                            </div>

                            <div className="pt-2 border-t border-white/10">
                                <div className="flex items-center justify-between text-xs text-white/60 mb-1">
                                    <span>Transaction Hash</span>
                                    <button
                                        type="button"
                                        onClick={() => handleCopyTx(receipt.txHash)}
                                        className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 font-medium transition-colors"
                                        title="Copy transaction hash"
                                    >
                                        {copiedTx ? (
                                            <>
                                                <Check className="size-3 text-emerald-400" />
                                                <span className="text-emerald-400">Copied</span>
                                            </>
                                        ) : (
                                            <>
                                                <Copy className="size-3" />
                                                <span>Copy</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                                <p className="font-mono text-xs text-white/80 break-all select-all bg-black/30 p-2 rounded border border-white/5">
                                    {receipt.txHash}
                                </p>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button
                                type="button"
                                onClick={handleClose}
                                className="w-full bg-emerald-500 text-white hover:bg-emerald-600"
                            >
                                <StableButtonContent>Done</StableButtonContent>
                            </Button>
                        </DialogFooter>
                    </div>
                ) : (
                    /* Confirmation State */
                    <>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-xl font-bold font-grotesque text-white">
                                <ShieldCheck className="size-5 text-emerald-400" />
                                Key Buyback
                            </DialogTitle>
                            <DialogDescription className="text-sm text-white/70">
                                Redeem your position in {creatorTitle} at the guaranteed buyback price.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-2">
                            <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3 text-sm">
                                <div className="flex items-center justify-between">
                                    <span className="text-white/60">Your Holdings</span>
                                    <span className="font-semibold text-white tabular-nums">
                                        {formatNumber(holdingsCount)}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-white/60">Buyback Price</span>
                                    <span className="font-semibold text-white tabular-nums">
                                        {formatDisplayKeyPrice(buybackPriceStroops)}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between pt-2 border-t border-white/10">
                                    <span className="text-white/60">Total Payout</span>
                                    <span className="font-bold text-emerald-400 tabular-nums text-base">
                                        {formatNumber(totalPayoutXLm, {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 4,
                                        })}{' '}
                                        XLM
                                    </span>
                                </div>
                            </div>

                            {expiryDate && (
                                <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
                                    <Clock className="size-4 shrink-0" />
                                    <span>
                                        {isExpired ? 'Notice period has elapsed' : `Notice period ends in ${countdownLabel}`}
                                    </span>
                                </div>
                            )}

                            {terms && (
                                <p className="text-xs text-white/50 leading-relaxed">
                                    {terms}
                                </p>
                            )}
                        </div>

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleClose}
                                disabled={isSubmitting}
                                className="border-white/10 text-white hover:bg-white/5"
                            >
                                <StableButtonContent>Cancel</StableButtonContent>
                            </Button>
                            <Button
                                type="button"
                                onClick={handleConfirmBuyback}
                                disabled={isSubmitting || holdingsCount <= 0}
                                className="bg-emerald-500 text-white hover:bg-emerald-600"
                            >
                                <StableButtonContent isLoading={isSubmitting}>
                                    {isSubmitting ? 'Settling...' : 'Confirm Buyback'}
                                </StableButtonContent>
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
