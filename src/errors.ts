export class OpenSkyError extends Error {
  constructor(message: string, readonly code?: string, readonly details?: unknown) {
    super(message);
    this.name = "Error";
  }
}

export function invalidParams(detail?: string): OpenSkyError {
  return new OpenSkyError(detail ? `Invalid params: ${detail}` : "Invalid params");
}

export function driverError(message: string, code?: string, details?: unknown): OpenSkyError {
  return new OpenSkyError(message, code, details);
}
