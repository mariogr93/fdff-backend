import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPreviousRefreshTokenHash1791930665146 implements MigrationInterface {
  name = 'AddPreviousRefreshTokenHash1791930665146';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "accounts" ADD "previous_refresh_token_hash" character varying(64)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "accounts" DROP COLUMN "previous_refresh_token_hash"`,
    );
  }
}
