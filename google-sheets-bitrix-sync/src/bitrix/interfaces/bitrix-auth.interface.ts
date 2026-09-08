// Contract for Bitrix24 authentication strategies resolving endpoints and headers
export interface IBitrixAuthStrategy {
  // Returns the fully qualified REST API URL for the given method
  getEndpoint(method: string): string;

  // Returns authentication and content headers for the HTTP request
  getHeaders(): Record<string, string>;
}
