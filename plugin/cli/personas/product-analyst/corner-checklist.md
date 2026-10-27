# Corner checklist

For each surface the intent touches, settle every line: a requirement or AC, an assumption the owner confirms, or out of scope.

- **Input:** empty, too long, wrong type or format, duplicates, characters from other languages, files too large.
- **Identity:** who may do it, who may not, a session that expired, acting on behalf of someone else.
- **Data:** what is kept, for how long, who may read it, personal data, deletion on request, the same record changed twice at once.
- **Errors:** what the user sees, what is logged, what is retried, what happens halfway through.
- **Scale:** how many users, how much data, the busiest hour, what slows down first.
- **Time:** time zones, dates at month and year ends, deadlines, things that expire.
- **Money:** currency, rounding, refunds, a payment that fails or arrives twice.
- **Outside systems:** one is slow, down, or answers something unexpected.
- **Operations:** how it is deployed, how a bad release is rolled back, how the owner knows it works.
- **Change:** existing users and data when this ships, an older client still in use.
