/// <reference types="vite/client" />

interface Window {
  ethereum?: {
    request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
  };
}
