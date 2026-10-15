/* eslint-disable no-undef */
// Extra matchers / global setup for the Jest suite.
// Pure logic (money, dates, budget math) is unit tested without native mocks.

jest.setTimeout(20000);

if (!globalThis.__matchaWarnedOnce) {
  globalThis.__matchaWarnedOnce = true;
}