export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export const badRequest = (msg: string) => new ApiError(400, msg);
export const notFound = (msg: string) => new ApiError(404, msg);
export const serverError = (msg: string) => new ApiError(500, msg);
export const tooLarge = (msg: string) => new ApiError(413, msg);
export const unsupported = (msg: string) => new ApiError(415, msg);
