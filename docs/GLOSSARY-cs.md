# Czech glossary

The Czech UI uses these terms. The English and Czech terms must mean exactly the same thing, so use them
consistently. Translations live in `frontend/src/locale/messages.cs.json`, and `npm run i18n:check` fails
when an English text has no Czech translation.

| English | Czech | Note |
|---|---|---|
| Earnings (report) | výsledky (hospodaření) | "Earnings date" = datum výsledků |
| Report (a company's earnings release) | zveřejnění (výsledků) | The noun stays the same after any number: 1 / 3 / 5 zveřejnění |
| Upcoming earnings | Nadcházející výsledky | |
| EPS | EPS | Zisk na akcii; Czech financial sites keep the abbreviation |
| EPS (TTM) | EPS (TTM) | Last 12 months |
| EPS estimate / est. | Odhad EPS | |
| Revenue | Tržby | |
| Surprise | Překvapení | % difference between the actual result and the estimate |
| Beat / Miss / In line | Nad odhadem / Pod odhadem / Dle odhadu | |
| Beat rate | Míra překonání odhadů | |
| Streak | Série | |
| Before open / After close / During market | Před otevřením / Po uzavření / Během obchodování | Trading session of the exchange |
| Time TBD | Čas neurčen | |
| Market cap | Tržní kapitalizace | |
| P/E | P/E | |
| Avg volume / Vol | Prům. objem / Obj. | |
| 52-week range | 52týdenní rozpětí | |
| Price reaction | Reakce ceny | |
| Run-up | Náběh | Change in the 5 sessions before the report |
| Gap | Gap | Opening price gap on the reaction day; Czech traders use the English term |
| Day | Den | Change on the reaction day |
| Drift | Drift | Change in the 5 sessions after the reaction day |
| Strong buy / Buy / Hold / Sell / Strong sell | Silně koupit / Koupit / Držet / Prodat / Silně prodat | Analyst ratings |
| Peers | Srovnatelné firmy | |
| Performance history | Historie výkonnosti | |
| Daily / Weekly / Monthly | Denně / Týdně / Měsíčně | |
| 1W / 1M / 6M / YTD / 1Y / 5Y | 1T / 1M / 6M / YTD / 1R / 5R | T = týden, R = rok |
| Close (price) | Závěrečná cena | |
| Follow / Following / Unfollow / Followed | Sledovat / Sledováno / Přestat sledovat / Sledované | |
| Email digest | Souhrnný e-mail | |

Numbers and dates use Czech formats when the app is in Czech: `254,43 $`, `+1,24 %`, `8,4 mld. $`,
`3,78 bil. $`, `29. 9. 2026`. In Czech, *bilion* means 10¹², which is the English "trillion".
