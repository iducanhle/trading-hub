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
  | 'breakEven'
  | 'fxFees'
  | 'accountFees';

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
      $localize`:Term text:The total value of all the company's shares on the stock market: the share price × the number of shares.`,
      $localize`:Term text:It shows how big the company is in the eyes of investors. Large companies usually move less than small ones.`,
    ],
    example: $localize`:Term example:$250 per share × 1 billion shares = $250B market cap.`,
  },
  pe: {
    title: $localize`:Term title:P/E (price-to-earnings ratio)`,
    body: [
      $localize`:Term text:How many dollars investors pay for $1 of the company's yearly profit: the share price ÷ EPS over the last 12 months.`,
      $localize`:Term text:A high P/E means investors expect strong growth; a low one can mean the stock is cheap, or that little growth is expected. Compare it with similar companies, not across industries. It is not shown when the company made a loss.`,
    ],
    example: $localize`:Term example:Price $100 ÷ EPS $5 = P/E of 20.`,
  },
  eps: {
    title: $localize`:Term title:EPS (earnings per share)`,
    body: [
      $localize`:Term text:The company's profit divided by the number of its shares: how much of the profit belongs to one share.`,
      $localize`:Term text:TTM (trailing twelve months) means the last four reported quarters added together.`,
    ],
    example: $localize`:Term example:Profit $10B ÷ 2 billion shares = EPS of $5.`,
  },
  avgVolume: {
    title: $localize`:Term title:Volume`,
    body: [
      $localize`:Term text:How many shares changed hands during a trading day. Average volume is the usual daily amount.`,
      $localize`:Term text:High volume means the stock is easy to buy and sell. A day with much higher volume than usual often means important news.`,
    ],
  },
  range52w: {
    title: $localize`:Term title:52-week range`,
    body: [
      $localize`:Term text:The lowest and the highest price of the last 52 weeks (one year). The dot shows where today's price is.`,
      $localize`:Term text:Near the right end, the stock trades close to its yearly high; near the left end, close to its yearly low.`,
    ],
  },
  candles: {
    title: $localize`:Term title:Candlestick chart`,
    body: [
      $localize`:Term text:Each candle is one trading day. Its thick body spans the opening and the closing price: green when the price closed higher than it opened, red when lower.`,
      $localize`:Term text:The thin lines above and below (wicks) reach the highest and the lowest price of the day. The bars at the bottom show the volume.`,
    ],
  },
  earnings: {
    title: $localize`:Term title:Earnings (quarterly results)`,
    body: [
      $localize`:Term text:Four times a year, listed companies publish their results for the past quarter: revenue, profit (EPS) and often an outlook for the coming months.`,
      $localize`:Term text:The price often moves strongly right after the results, because investors compare them with what analysts expected.`,
    ],
  },
  epsEstimate: {
    title: $localize`:Term title:EPS estimate`,
    body: [
      $localize`:Term text:The average EPS that the analysts following the company expect for the quarter (also called the consensus).`,
      $localize`:Term text:The market reacts mostly to the difference between the actual EPS and this estimate, not to the number itself.`,
    ],
  },
  revenueEstimate: {
    title: $localize`:Term title:Revenue estimate`,
    body: [
      $localize`:Term text:Revenue is all the money the company took in from sales, before any costs are subtracted. The estimate is the analysts' average expectation for the quarter.`,
    ],
  },
  surprise: {
    title: $localize`:Term title:Surprise`,
    body: [
      $localize`:Term text:How much the actual result differed from the estimate, in percent. Positive means better than expected, negative means worse.`,
    ],
    example: $localize`:Term example:Estimate $2.00, actual $2.10 → surprise +5%.`,
  },
  result: {
    title: $localize`:Term title:Beat, Miss, In line`,
    body: [
      $localize`:Term text:Beat: the actual EPS was above the estimate. Miss: below it. In line: about the same.`,
      $localize`:Term text:A beat does not guarantee that the price goes up: revenue and the company's outlook matter too.`,
    ],
  },
  reportTime: {
    title: $localize`:Term title:Before open, After close`,
    body: [
      $localize`:Term text:When the company publishes its results. Before open: before the stock exchange opens, so the price reacts the same day. After close: after the exchange closes, so the price reacts on the next trading day.`,
      $localize`:Term text:US exchanges trade from 9:30 to 16:00 New York time (15:30 to 22:00 Prague time). "Time TBD" means the company has not announced the time yet.`,
    ],
  },
  reaction: {
    title: $localize`:Term title:Price reaction`,
    body: [
      $localize`:Term text:Run-up: the price change over the 5 trading days before the results.`,
      $localize`:Term text:Gap: the jump from the last close before the results to the next opening price.`,
      $localize`:Term text:Day: the price change on the reaction day, the first trading day after the results.`,
      $localize`:Term text:Drift: the price change over the 5 trading days after the reaction day, showing whether the move continued or reversed.`,
    ],
  },
  beatRate: {
    title: $localize`:Term title:Beat rate`,
    body: [
      $localize`:Term text:In how many of the recent quarters the company beat the EPS estimate.`,
      $localize`:Term text:Most large companies beat the estimate most of the time, so a high beat rate is common. A low one is a warning sign.`,
    ],
    example: $localize`:Term example:6 of 8 quarters = 75%.`,
  },
  streak: {
    title: $localize`:Term title:Current streak`,
    body: [
      $localize`:Term text:How many quarters in a row the company has beaten (or missed) the estimate, counting back from the latest report.`,
    ],
  },
  avgReaction: {
    title: $localize`:Term title:Average reaction`,
    body: [
      $localize`:Term text:How much the price moved on the reaction day on average, up or down (the direction is ignored). It shows how big a move to expect after the results.`,
    ],
    example: $localize`:Term example:±4% means the price usually moved about 4% one way or the other.`,
  },
  recommendations: {
    title: $localize`:Term title:Analyst recommendations`,
    body: [
      $localize`:Term text:Analysts at banks and brokers rate stocks: Strong buy, Buy, Hold (keep it if you own it), Sell and Strong sell.`,
      $localize`:Term text:Each bar shows how many analysts gave each rating in that month. It is an opinion, not a guarantee.`,
    ],
  },
  peers: {
    title: $localize`:Term title:Peers`,
    body: [
      $localize`:Term text:Companies in the same industry. Useful for comparing numbers such as P/E or how the price reacted to results.`,
    ],
  },
  averageCost: {
    title: $localize`:Term title:Average cost`,
    body: [
      $localize`:Term text:What you paid per share, on average, for the shares you hold now. Every buy moves it; a sell does not change it.`,
      $localize`:Term text:Trading 212 calculates it this way, and profits from sells are measured against it.`,
    ],
    example: $localize`:Term example:10 shares at $100 and 10 more at $120: the average cost is $110.`,
  },
  realizedPnl: {
    title: $localize`:Term title:Realized profit/loss`,
    body: [
      $localize`:Term text:Money you actually made or lost by selling: the sale price minus the average cost of the shares sold.`,
      $localize`:Term text:For a period, it counts the sells in that period, measured against what you paid, even if you bought earlier. Fees are not deducted; they are shown separately.`,
    ],
    example: $localize`:Term example:Average cost $110, you sell 5 shares at $130: realized profit is 5 × $20 = $100.`,
  },
  fxFees: {
    title: $localize`:Term title:FX fees`,
    body: [
      $localize`:Term text:Trading 212 charges 0.15% each time it converts your money into the stock's currency: on every buy and again on every sell.`,
      $localize`:Term text:Frequent trading adds up: the fee is paid on the whole amount of each trade, win or lose. It is not deducted in Realized.`,
    ],
    example: $localize`:Term example:You buy for 100,000 CZK and later sell for 100,000 CZK: you pay 150 CZK twice, 300 CZK in total.`,
  },
  accountFees: {
    title: $localize`:Term title:Account fees`,
    body: [
      $localize`:Term text:Fees Trading 212 takes from the account that do not belong to any stock, so the profit/loss of the stocks does not include them.`,
      $localize`:Term text:Mostly the 0.7% fee for deposits by card, Apple Pay or Google Pay. Deposits by bank transfer are free.`,
    ],
    example: $localize`:Term example:You deposit 30,000 CZK by card: Trading 212 charges 210 CZK.`,
  },
  unrealizedPnl: {
    title: $localize`:Term title:Unrealized profit/loss`,
    body: [
      $localize`:Term text:How much the shares you still hold are up or down: their current value minus what you paid for them.`,
      $localize`:Term text:It changes with the price every day and becomes realized only when you sell. It is always as of now.`,
    ],
    example: $localize`:Term example:You hold 10 shares with an average cost of $110 and the price is $100: unrealized loss is −$100.`,
  },
  totalPnl: {
    title: $localize`:Term title:Total profit/loss`,
    body: [
      $localize`:Term text:Realized profit/loss plus dividends, minus fees. For all time, the unrealized profit/loss of what you still hold is added too.`,
      $localize`:Term text:The percentage compares it with everything you spent on buying the stock.`,
    ],
    example: $localize`:Term example:Realized +$100, dividends +$5, fees −$2 and unrealized −$40: total +$63.`,
  },
  breakEven: {
    title: $localize`:Term title:Break-even price`,
    body: [
      $localize`:Term text:The price at which you are neither up nor down on the shares you hold: your average cost. Above it you are in profit, below it at a loss. Fees are not included.`,
      $localize`:Term text:Exchange rate changes move the value in your account currency too, so the result can change even when the price does not.`,
    ],
    example: $localize`:Term example:Average cost $110 and the price is $100: the price has to rise 10% to break even.`,
  },
};
