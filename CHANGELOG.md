# Changelog

## 3.0.0

### Breaking
- `Email.date` is now `Date | null`. Parsers no longer substitute the current
  time for an unparseable/missing `Date:` header. (#1016)
- `Contact.lastEmailDate`, `Account.signupDate`, `Subscription.lastRenewalDate`,
  and `Newsletter.lastEmailDate` are now `Date | null`. OLM Address Book contacts
  use `null` instead of a fabricated date.
- `Subscription.monthlyAmount` and `Subscription.frequency` are now optional;
  they are populated only when a billing cadence is detected. (#1017)
- `Email.size` now reports UTF-8 bytes (previously a character count capped at
  100000). (#1019)

### Fixed
- Subscription amounts in non-US locales (e.g. `€1.234,56`) parse correctly
  instead of collapsing to ~1/1000 of their value. (#1014)
- Contacts are now extracted for large MBOX inputs (streaming `File` >20MB and
  chunked `Buffer` >500MB), matching the small-file path. (#1015)
- Time-based detection (earliest signup, renewal date, newsletter frequency)
  ignores unknown dates rather than skewing on `now()`. (#1016)
- Newsletter detection no longer flags transactional `mail.*`/`news.*`
  subdomains as promotional without corroborating marketing signals. (#1020)

### Internal
- Shared locale-aware `parseMoney` and `byteLength` helpers in `utils`; both the
  purchase and subscription detectors use `parseMoney`, and `PurchaseDetector`
  now reuses the shared `matchKnownDomain` helper. (#1018)
