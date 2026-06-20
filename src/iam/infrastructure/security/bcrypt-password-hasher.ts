import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { IPasswordHasherPort } from '../../application/ports/password-hasher.port';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class BcryptPasswordHasher implements IPasswordHasherPort {

  private readonly saltRounds: number;

  constructor(private readonly configService: ConfigService) {
    this.saltRounds = parseInt(this.configService.get<string>('SALT_ROUNDS', '12'), 10);
  }

  private preHash(plain: string): string {
    return crypto.createHash('sha256').update(plain).digest('base64');
  }

  async hash(plain: string): Promise<string> {
    return bcrypt.hash(this.preHash(plain), this.saltRounds);
  }

  async compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(this.preHash(plain), hash);
  }
}
