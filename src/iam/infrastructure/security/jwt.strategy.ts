import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { I_ACCOUNT_REPOSITORY, type IAccountRepository } from '../../application/ports/account.repository.interface';
import { Account } from '../../domain/account.model';
import { AccountStatus } from '../../domain/enums/account-status.enum';
import { JwtPayload } from './jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @Inject(I_ACCOUNT_REPOSITORY)
    private readonly accountRepo: IAccountRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<Account> {
    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid access token payload.');
    }

    const account = await this.accountRepo.findById(payload.sub);
    if (!account) {
      throw new UnauthorizedException('Account not found.');
    }

    if (account.status !== AccountStatus.APPROVED) {
      throw new UnauthorizedException(
        'This account is still pending approval or has been suspended.',
      );
    }

    return account;
  }
}
