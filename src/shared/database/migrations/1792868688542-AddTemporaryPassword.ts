import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTemporaryPassword1792868688542 implements MigrationInterface {
  name = 'AddTemporaryPassword1792868688542';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "accounts" ADD "must_change_password" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounts" ADD "temporary_password_hash" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounts" ADD "temporary_password_expires_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounts" ADD "temporary_password_used_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "accounts" DROP COLUMN "temporary_password_used_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounts" DROP COLUMN "temporary_password_expires_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounts" DROP COLUMN "temporary_password_hash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accounts" DROP COLUMN "must_change_password"`,
    );
  }
}
