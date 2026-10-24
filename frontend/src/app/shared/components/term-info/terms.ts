// Beginner explanations of the trading terms the app shows, behind the ⓘ buttons (TermInfo). Czech wording follows
// docs/GLOSSARY-cs.md.

export type TermId =
  | 'marketCap'
  | 'pe'
  | 'eps'
  | 'avgVolume'
  | 'range52w'
  | 'candles'
  | 'earnings'
  | 'epsEstimate'
  | 'revenueEstimate'
  | 'surprise'
  | 'result'
  | 'reportTime'
  | 'reaction'
  | 'beatRate'
  | 'streak'
  | 'avgReaction'
  | 'recommendations'
  | 'peers'
  | 'averageCost'
  | 'realizedPnl'
  | 'unrealizedPnl'
  | 'totalPnl'
  | 'accountReturn'
  | 'breakEven'
  | 'trueGain'
  | 'fxFees'
  | 'accountFees'
  | 'includingFees'
  | 'tradeDayRate'
  | 'groupPnl'
  | 'todayPnl';

export interface Term {
  title: string;
  /** Short paragraphs, plain language. */
  body: string[];
  /** A worked example with numbers, when it helps. */
  example?: string;
}

export const TERMS: Record<TermId, Term> = {
  marketCap: {
    title: $localize`:Term title:Market cap (market capitalization)`,
    body: [
      $localize`:Term text:Share price × number of shares: what the whole company is worth on the market.`,
    ],
  },
  pe: {
    title: $localize`:Term title:P/E (price-to-earnings ratio)`,
    body: [
      $localize`:Term text:Share price ÷ yearly EPS. High means growth is expected, low can mean a cheap stock. Not shown for loss-making companies.`,
    ],
  },
  eps: {
    title: $localize`:Term title:EPS (earnings per share)`,
    body: [
      $localize`:Term text:Company profit ÷ number of shares. TTM: the last four quarters combined.`,
    ],
  },
  avgVolume: {
    title: $localize`:Term title:Volume`,
    body: [$localize`:Term text:Shares traded per day, on average. A spike often means news.`],
  },
  range52w: {
    title: $localize`:Term title:52-week range`,
    body: [
      $localize`:Term text:Lowest and highest price of the past year; the dot is today's price.`,
    ],
  },
  candles: {
    title: $localize`:Term title:Candlestick chart`,
    body: [
      $localize`:Term text:Each candle is one day: the body runs from open to close (green up, red down), the wicks to the day's high and low. Bars at the bottom show volume.`,
    ],
  },
  earnings: {
    title: $localize`:Term title:Earnings (quarterly results)`,
    body: [
      $localize`:Term text:Quarterly revenue, profit (EPS) and outlook. The price often moves sharply when they differ from analysts' estimates.`,
    ],
  },
  epsEstimate: {
    title: $localize`:Term title:EPS estimate`,
    body: [
      $localize`:Term text:The average EPS analysts expect for the quarter. The market reacts mostly to how far the actual EPS lands from it.`,
    ],
  },
  revenueEstimate: {
    title: $localize`:Term title:Revenue estimate`,
    body: [
      $localize`:Term text:The analysts' average expectation of the quarter's revenue (sales before costs).`,
    ],
  },
  surprise: {
    title: $localize`:Term title:Surprise`,
    body: [
      $localize`:Term text:How far the actual result beat (+) or missed (−) the estimate, in percent.`,
    ],
    example: $localize`:Term example:Estimate $2.00, actual $2.10 → surprise +5%.`,
  },
  result: {
    title: $localize`:Term title:Beat, Miss, In line`,
    body: [$localize`:Term text:Beat: EPS above the estimate. Miss: below. In line: about equal.`],
  },
  reportTime: {
    title: $localize`:Term title:Before open, After close`,
    body: [
      $localize`:Term text:Before open: the price reacts the same day. After close: the next trading day. Time TBD: not announced yet.`,
    ],
  },
  reaction: {
    title: $localize`:Term title:Price reaction`,
    body: [
      $localize`:Term text:Run-up: the 5 trading days before the results.`,
      $localize`:Term text:Gap: from the last close before the results to the next open.`,
      $localize`:Term text:Day: the first trading day after the results.`,
      $localize`:Term text:Drift: the 5 trading days after that.`,
    ],
  },
  beatRate: {
    title: $localize`:Term title:Beat rate`,
    body: [
      $localize`:Term text:Share of recent quarters that beat the EPS estimate. High is common; low is a warning sign.`,
    ],
  },
  streak: {
    title: $localize`:Term title:Current streak`,
    body: [
      $localize`:Term text:Quarters in a row above (or below) the estimate, up to the latest report.`,
    ],
  },
  avgReaction: {
    title: $localize`:Term title:Average reaction`,
    body: [
      $localize`:Term text:Average size of the reaction-day move, either direction: how big a move to expect.`,
    ],
  },
  recommendations: {
    title: $localize`:Term title:Analyst recommendations`,
    body: [
      $localize`:Term text:How many analysts rated the stock buy, hold or sell each month. An opinion, not a guarantee.`,
    ],
  },
  peers: {
    title: $localize`:Term title:Peers`,
    body: [$localize`:Term text:Companies in the same industry, for comparison.`],
  },
  averageCost: {
    title: $localize`:Term title:Average cost`,
    body: [
      $localize`:Term text:What you paid per share, on average, for the shares you hold. Buys change it, sells don't.`,
    ],
    example: $localize`:Term example:10 shares at $100 and 10 more at $120: the average cost is $110.`,
  },
  realizedPnl: {
    title: $localize`:Term title:Realized profit/loss`,
    body: [
      $localize`:Term text:What you made or lost by selling: sale price minus average cost. Fees are shown separately.`,
    ],
  },
  fxFees: {
    title: $localize`:Term title:FX fees`,
    body: [
      $localize`:Term text:The 0.15% Trading 212 charges for currency conversion on every buy and sell. Not deducted in Realized.`,
    ],
  },
  accountFees: {
    title: $localize`:Term title:Account fees`,
    body: [
      $localize`:Term text:Fees not tied to a stock, mostly 0.7% on card, Apple Pay or Google Pay deposits (bank transfers are free).`,
    ],
  },
  includingFees: {
    title: $localize`:Term title:Including fees`,
    body: [
      $localize`:Term text:After the fees and taxes Trading 212 charges on trades, mostly the 0.15% FX fee.`,
    ],
  },
  tradeDayRate: {
    title: $localize`:Term title:Trades in another currency`,
    body: [
      $localize`:Term text:Amounts in another currency are converted to the account currency at the trade day's rate, as in Trading 212. The dialog also shows the original amount.`,
    ],
  },
  groupPnl: {
    title: $localize`:Term title:Profit/loss of a group`,
    body: [
      $localize`:Term text:A group works like a Trading 212 pie: its sells are measured against the average cost of its own buys, so the result can differ from Trading 212's. Sells of shares not bought in the group use Trading 212's profit/loss.`,
    ],
    example: $localize`:Term example:Bought 10 at $100 (group A) and 10 at $200 (B); 10 sold at $180 from B: −$200 in B, +$300 in Trading 212.`,
  },
  unrealizedPnl: {
    title: $localize`:Term title:Unrealized profit/loss`,
    body: [
      $localize`:Term text:Current value of the shares you hold minus what you paid for them.`,
    ],
  },
  todayPnl: {
    title: $localize`:Term title:Today's profit/loss`,
    body: [
      $localize`:Term text:Change in account value since midnight Prague time, excluding deposits and withdrawals. A dash means there is no value from midnight yet.`,
    ],
  },
  totalPnl: {
    title: $localize`:Term title:Total profit/loss`,
    body: [
      $localize`:Term text:Realized profit/loss plus dividends minus fees (for all time, plus unrealized). The percentage is of what you spent buying the stock.`,
    ],
  },
  accountReturn: {
    title: $localize`:Term title:Return on net deposits`,
    body: [
      $localize`:Term text:All-time profit ÷ net deposits (paid in minus taken out). Cash lowers it, so it is often below Trading 212's figure. The range does not change it.`,
    ],
  },
  breakEven: {
    title: $localize`:Term title:Break-even price`,
    body: [
      $localize`:Term text:Your average cost: above it you are in profit, below it at a loss. Fees not included.`,
    ],
  },
  trueGain: {
    title: $localize`:Term title:True gain`,
    body: [
      $localize`:Term text:What the price move alone earned, without currency moves since you bought. True gain + FX impact = unrealized profit/loss.`,
    ],
  },
};
