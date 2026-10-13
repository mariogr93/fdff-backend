import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Emails are now stored trimmed and lowercase and looked up the same way, so
 * a row saved earlier with capitals would never match again. This repairs
 * those rows once.
 *
 * It fails loudly, rather than merging anything, if two accounts differ only
 * by case: the unique constraint on email rejects the second UPDATE. Resolve
 * such pairs by hand first.
 */
export class LowercaseEmails1791932743668 implements MigrationInterface {
  name = 'LowercaseEmails1791932743668';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "accounts" SET "email" = lower(trim("email")) WHERE "email" <> lower(trim("email"))`,
    );
  }

  public async down(): Promise<void> {
    // Irreversible: the original capitalisation is not kept.
  }
}
