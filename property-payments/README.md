# Charter Pay property-payment landing

Public page: https://ccapital.pro/property-payments/. The current entry point is `assets/payment-ui.mjs`; `service.js` is retained for previously cached HTML. This standalone static page is deployed with the Charter Capital repository, not by redeploying the ThaiPay comparison portal.

## Calculation contract

Both amount fields are editable. The last edited field determines the calculation direction. Funding is RUB or USDT; the receiving-side display is THB or USD. Existing incoming `usd` / `currency` links retain their USD target and funding currency.

RUB uses the official USD CBR rate plus 3%; USDT deducts 2.5% of the incoming amount at explicitly stated USD parity. SWIFT is denominated in USD. THB is an indicative conversion by the receiving bank, using the dated Bangkok Bank **Sight Bill Buying Rates** reference; it is not a new guaranteed direct-THB tariff. Bank costs and the final conversion rate are agreed before payment.

`assets/payment-converter.mjs` uses integer rational arithmetic. A budget rounds USD cents and the THB estimate down; a recipient target rounds USD cents and required funding up. The UI distinguishes the entered THB target from the resulting estimate after USD-cent rounding. A missing or invalid bank reference cannot produce THB; USD remains independent of it. USDT remains independent of CBR. Previous-day data is explicitly a dated reference and cannot receive a current confirmation.

CBR is read from the existing `/thai-payments/cbr.json`, refreshed by the existing hourly workflow. `bangkok-bank.json` is a manually verified reference from the official bank table, last checked on 15 October 2026. Bangkok Bank's official inward-remittance FAQ states TT Buying Rate for actual SWIFT credit. The owner-selected Sight Bill reference is explicitly identified as an indicative benchmark, not that actual execution rate. There is no claimed automatic Bangkok Bank API feed. Keep its publication and verification timestamps truthful; never replace Sight Bill with TT.

## Partner path

Header, content and footer links lead to the existing https://thaipay.pro/referral/ program. Reward remains 0.5% of each successfully completed client payment, in USDT or cash THB, not the full property price. The existing account and enquiry form handle registration and personal links. Bounded `ref` / `tp_visit` values and the existing fixed `/go/contact` endpoint preserve attribution when the customer changes payment currencies. Opening a contact link does not itself send a message or establish an entitlement to payment.

## Presentation and checks

The approved P mark and outlined Manrope wordmark are retained. Charter Pay uses blue #267cb5; ThaiPay remains emerald. Original generated property images are conceptual visuals, with useful alt descriptions and no illustration-caption overlays. Hero motion has a pause control and a reduced-motion alternative. No competitor licences, volumes, testimonials, FET promises or unconfirmed services are imported.

Validation: `node --test .github/tests/payment_*.test.mjs` and `python3 -m unittest discover -s .github/tests -p 'test_property_cbr.py'`. Converter fixtures were independently calculated with Python Decimal. Browser QA covers five distinct scenarios at desktop and mobile CSS widths, long values, input validation, copying, FAQ, image loading, pause and partner-link preservation. No physical-phone or real-money test is claimed.
