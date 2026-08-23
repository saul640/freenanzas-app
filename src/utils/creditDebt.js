const toAmount = (value) => {
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : 0;
};

export const getCardBalanceDOP = (card = {}) => toAmount(card.balanceDOP ?? card.balanceALaFecha ?? card.balance);
export const getCardBalanceUSD = (card = {}) => toAmount(card.balanceUSD ?? card.balanceDolaresALaFecha);
export const getCredimasDebt = (card = {}) => toAmount(card.credimasTotalAdeudado);

export const buildCreditPaymentUpdate = ({ card = {}, paymentType = 'card', currency = 'DOP', amount }) => {
    const paymentAmount = Math.max(toAmount(amount), 0);

    if (paymentType === 'credimas') {
        const currentDebt = getCredimasDebt(card);
        const appliedAmount = Math.min(paymentAmount, currentDebt);
        const approvedLimit = toAmount(card.credimasLimiteAprobado);
        const nextAvailable = toAmount(card.credimasDisponible) + appliedAmount;
        return {
            appliedAmount,
            balanceBefore: currentDebt,
            balanceAfter: currentDebt - appliedAmount,
            updates: {
                credimasTotalAdeudado: currentDebt - appliedAmount,
                credimasDisponible: approvedLimit > 0 ? Math.min(nextAvailable, approvedLimit) : nextAvailable,
            },
        };
    }

    const currentBalance = currency === 'USD' ? getCardBalanceUSD(card) : getCardBalanceDOP(card);
    const appliedAmount = Math.min(paymentAmount, currentBalance);
    const balanceAfter = currentBalance - appliedAmount;
    return {
        appliedAmount,
        balanceBefore: currentBalance,
        balanceAfter,
        updates: currency === 'USD'
            ? { balanceUSD: balanceAfter, balanceDolaresALaFecha: balanceAfter }
            : { balanceDOP: balanceAfter, balanceALaFecha: balanceAfter, balance: balanceAfter },
    };
};

export const summarizeDebts = ({ cards = [], loans = [] } = {}) => {
    const cardDOP = cards.reduce((sum, card) => sum + getCardBalanceDOP(card), 0);
    const cardUSD = cards.reduce((sum, card) => sum + getCardBalanceUSD(card), 0);
    const credimas = cards.reduce((sum, card) => sum + getCredimasDebt(card), 0);
    const loanDebt = loans.reduce((sum, loan) => sum + toAmount(loan.balancePendiente), 0);

    return {
        cardDOP,
        cardUSD,
        credimas,
        loanDebt,
        totalDOP: cardDOP + credimas + loanDebt,
        hasDebt: cardDOP > 0 || cardUSD > 0 || credimas > 0 || loanDebt > 0,
    };
};
