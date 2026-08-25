declare global {
  interface Window {
    /**
     * Test-only seam. Playwright can call `page.addInitScript` to set this
     * before the app loads, seeding the local game at a specific FEN so
     * E2E tests can reach positions (e.g. one move from promotion) without
     * replaying dozens of legal moves from the start position.
     *
     * This is never read from a URL, query string, or any other
     * user-reachable input - a real user visiting the app has no way to
     * set it, so it carries no product behaviour of its own.
     */
    __POCKET_CHESS_TEST_FEN__?: string;
  }
}

export function readTestSeedFen(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return window.__POCKET_CHESS_TEST_FEN__;
}
