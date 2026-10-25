import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { resolveAllowedOrigins } from '../../../shared/config/allowed-origins';
import {
  IMailerPort,
  TemporaryPasswordMail,
} from '../../application/ports/mailer.port';

/**
 * Development stand-in for a mail provider: each message becomes a file in
 * MAIL_OUTBOX_DIR (default `.dev-outbox/`, gitignored), readable only by its
 * owner. It never logs a message, because messages hold passwords.
 * validateEnv refuses this driver in production.
 */
@Injectable()
export class OutboxMailer implements IMailerPort {
  private readonly dir: string;
  private readonly signInUrl: string;

  constructor(config: ConfigService) {
    this.dir = resolve(config.get<string>('MAIL_OUTBOX_DIR') || '.dev-outbox');
    this.signInUrl = `${resolveAllowedOrigins(config.get<string>('FRONTEND_URL'))[0]}/login`;
  }

  async sendTemporaryPassword(mail: TemporaryPasswordMail): Promise<void> {
    const validity = mail.expiresAt
      ? `Es válida para un solo ingreso, hasta ${mail.expiresAt.toISOString()}.`
      : 'Es válida para un solo ingreso.';

    const body = [
      `Para: ${mail.to}`,
      'Asunto: Su contraseña temporal de la FDFF',
      '',
      'Recibimos una solicitud para ingresar a su cuenta de la Federación Dominicana de Fisicoculturismo y Fitness.',
      '',
      `Contraseña temporal: ${mail.temporaryPassword}`,
      '',
      `${validity} Al ingresar deberá elegir una nueva contraseña.`,
      `Ingrese en: ${this.signInUrl}`,
      '',
      'Si usted no hizo esta solicitud, ignore este mensaje: su contraseña actual sigue funcionando.',
      '',
    ].join('\n');

    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await writeFile(join(this.dir, `${stamp}-${randomUUID()}.txt`), body, {
      mode: 0o600,
    });
  }
}
