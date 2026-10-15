import { ApiProperty } from '@nestjs/swagger';
import { UserRoles } from '../../domain/enums/user-roles.enums';

/**
 * Body of a successful login or refresh. The refresh token is never in the
 * body: it arrives as the HttpOnly `refresh_token` cookie.
 */
export class AuthSessionResponseDto {
  /** RS256 JWT, valid for JWT_EXPIRES_IN (15 minutes by default). Keep it in memory only. */
  accessToken: string;
  accountId: string;
  @ApiProperty({ enum: UserRoles })
  role: string;
}
