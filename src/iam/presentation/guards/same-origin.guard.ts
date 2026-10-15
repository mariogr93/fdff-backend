import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { resolveAllowedOrigins } from '../../../shared/config/allowed-origins';
import { CrossOriginRequestException } from '../../domain/exceptions/cross-origin-request.exception';

/**
 * Refuses state-changing requests that a page on another site caused the
 * browser to send. SameSite=Strict only protects routes that need the cookie;
 * login, logout and register need none, so a hostile page could still post to
 * them (login CSRF: the victim ends up signed in as the attacker).
 *
 * A page cannot set Origin or Sec-Fetch-Site, so they are trustworthy for this:
 * - Origin present: it must be on the FRONTEND_URL allowlist. Browsers send it
 *   on every POST, including same-origin ones.
 * - Origin absent: allowed unless the browser marked it Sec-Fetch-Site:
 *   cross-site. A request with neither header is not a browser (curl, a
 *   server), and CSRF only concerns browsers.
 */
@Injectable()
export class SameOriginGuard implements CanActivate {
  private readonly allowedOrigins: string[];

  constructor(config: ConfigService) {
    this.allowedOrigins = resolveAllowedOrigins(
      config.get<string>('FRONTEND_URL'),
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const { headers } = context.switchToHttp().getRequest<Request>();
    const origin = headers.origin;

    if (origin !== undefined) {
      if (this.allowedOrigins.includes(origin)) return true;
      throw new CrossOriginRequestException();
    }

    if (headers['sec-fetch-site'] === 'cross-site') {
      throw new CrossOriginRequestException();
    }

    return true;
  }
}
