import type { NextFunction, Request, Response } from 'express';

/**
 * The API speaks JSON only. A request that carries a body of any other type is
 * refused before a body parser sees it, so an HTML form on another site cannot
 * post to a route: a cross-site form can only send form-encoded, multipart or
 * text/plain bodies. It is registered in configureApp before Nest's parsers.
 *
 * Empty bodies pass: browsers send `Content-Length: 0` and no Content-Type on
 * a POST such as logout or refresh. If an endpoint ever has to accept
 * multipart (it should not: upload through signed URLs instead), scope this to
 * the routes that stay JSON rather than loosening it.
 */
export function requireJsonBody(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const hasBody =
    req.headers['transfer-encoding'] !== undefined ||
    Number(req.headers['content-length'] ?? 0) > 0;

  if (hasBody && !req.is('json')) {
    res.status(415).json({
      statusCode: 415,
      message: 'Content-Type must be application/json.',
      error: 'Unsupported Media Type',
    });
    return;
  }

  next();
}
