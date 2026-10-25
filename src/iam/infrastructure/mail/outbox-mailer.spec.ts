import { ConfigService } from '@nestjs/config';
import { mkdtemp, readdir, readFile, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { OutboxMailer } from './outbox-mailer';

describe('OutboxMailer', () => {
  let dir: string;
  let mailer: OutboxMailer;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'fdff-outbox-'));
    const values: Record<string, string> = {
      MAIL_OUTBOX_DIR: dir,
      FRONTEND_URL: 'https://app.fdff.test, https://admin.fdff.test',
    };
    mailer = new OutboxMailer({
      get: (key: string) => values[key],
    } as unknown as ConfigService);
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  const onlyMessage = async () => {
    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    const path = join(dir, files[0]);
    return { path, body: await readFile(path, 'utf8') };
  };

  it('writes one message with the address, the password and the sign-in link', async () => {
    await mailer.sendTemporaryPassword({
      to: 'athlete@fdff.test',
      temporaryPassword: 'Tmp#2abc',
      expiresAt: new Date('2026-10-24T13:00:00.000Z'),
    });

    const { body } = await onlyMessage();
    expect(body).toContain('Para: athlete@fdff.test');
    expect(body).toContain('Contraseña temporal: Tmp#2abc');
    expect(body).toContain('https://app.fdff.test/login');
    expect(body).toContain('2026-10-24T13:00:00.000Z');
  });

  it('says a temporary password with no expiry is valid for one sign-in', async () => {
    await mailer.sendTemporaryPassword({
      to: 'athlete@fdff.test',
      temporaryPassword: 'Tmp#2abc',
      expiresAt: null,
    });

    const { body } = await onlyMessage();
    expect(body).toContain('Es válida para un solo ingreso.');
  });

  it('makes the file readable by its owner only', async () => {
    await mailer.sendTemporaryPassword({
      to: 'athlete@fdff.test',
      temporaryPassword: 'Tmp#2abc',
      expiresAt: null,
    });

    const { path } = await onlyMessage();
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });
});
