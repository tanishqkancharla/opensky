export class SkyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Error";
  }
}

export function invalidParams(detail?: string): SkyError {
  return new SkyError(detail ? `Invalid params: ${detail}` : "Invalid params");
}

export function driverError(message: string): SkyError {
  return new SkyError(message);
}
