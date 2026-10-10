import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefreshTokenExpiry1791598529785 implements MigrationInterface {
  name = 'AddRefreshTokenExpiry1791598529785';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "accounts" ADD "refresh_token_expires_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "accounts" DROP COLUMN "refresh_token_expires_at"`,
    );
  }
}
