import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTokenVersion1792030360371 implements MigrationInterface {
  name = 'AddTokenVersion1792030360371';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Existing rows start at 0. Access tokens issued before this column
    // existed carry no `tv` claim and are rejected, so users sign in again.
    await queryRunner.query(
      `ALTER TABLE "accounts" ADD "token_version" integer NOT NULL DEFAULT '0'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "accounts" DROP COLUMN "token_version"`,
    );
  }
}
