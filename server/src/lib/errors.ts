/** Error de aplicación con código traducible. */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    public params: Record<string, string | number> = {},
  ) {
    super(code);
  }
}

export const notFound = () => new AppError(404, 'not_found');
export const forbidden = () => new AppError(403, 'auth.forbidden');
