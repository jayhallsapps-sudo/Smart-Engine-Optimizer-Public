declare module "@replit/connectors-sdk" {
  interface ProxyResponse {
    ok: boolean;
    status: number;
    statusText: string;
    json(): Promise<unknown>;
    text(): Promise<string>;
  }
  export class ReplitConnectors {
    proxy(
      connectorId: string,
      path: string,
      options?: {
        method?: string;
        headers?: Record<string, string>;
        body?: Buffer | string;
      }
    ): Promise<ProxyResponse>;
  }
}
