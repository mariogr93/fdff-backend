import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ConfigService } from '@nestjs/config';

export interface JwtKeyPair {
  privateKey: string;
  publicKey: string;
}

export function loadJwtKeyPair(config: ConfigService): JwtKeyPair {
  const privateKeyPath = config.get<string>('JWT_PRIVATE_KEY_PATH');
  const publicKeyPath = config.get<string>('JWT_PUBLIC_KEY_PATH');

  if (privateKeyPath && publicKeyPath) {
    return {
      privateKey: readFileSync(resolve(privateKeyPath), 'utf8'),
      publicKey: readFileSync(resolve(publicKeyPath), 'utf8'),
    };
  }

  const privateKey = config.get<string>('JWT_PRIVATE_KEY');
  const publicKey = config.get<string>('JWT_PUBLIC_KEY');

  if (privateKey && publicKey) {
    return {
      privateKey: privateKey.replace(/\\n/g, '\n'),
      publicKey: publicKey.replace(/\\n/g, '\n'),
    };
  }

  throw new Error(
    'JWT keys missing: set JWT_PRIVATE_KEY_PATH/JWT_PUBLIC_KEY_PATH or JWT_PRIVATE_KEY/JWT_PUBLIC_KEY',
  );
}
