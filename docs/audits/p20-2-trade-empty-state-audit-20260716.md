# P20.2 Trade Empty State Audit

Root cause: `swapCtaStates.enter_amount.reason` and idle lifecycle description leaked internal/validation wording into screen-reader live regions even when the visible CTA was already “Enter an Amount”.

Fix: public reasons in CTA states; connection-aware idle lifecycle; no raw “empty or zero”.
