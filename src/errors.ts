export class OpenSkyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Error";
  }
}

export function invalidParams(detail?: string): OpenSkyError {
  return new OpenSkyError(detail ? `Invalid params: ${detail}` : "Invalid params");
}

export function driverError(message: string): OpenSkyError {
  return new OpenSkyError(message);
}
