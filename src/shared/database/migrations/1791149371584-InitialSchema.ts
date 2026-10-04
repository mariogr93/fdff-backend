import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1791149371584 implements MigrationInterface {
  name = 'InitialSchema1791149371584';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."account_role" AS ENUM('ADMIN', 'JUDGE', 'ATHLETE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."account_status" AS ENUM('PENDING', 'ACTIVE', 'INACTIVE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "accounts" ("id" uuid NOT NULL, "email" character varying(255) NOT NULL, "password_hash" character varying(255) NOT NULL, "role" "public"."account_role" NOT NULL, "status" "public"."account_status" NOT NULL DEFAULT 'PENDING', "failed_login_attempts" integer NOT NULL DEFAULT '0', "locked_until" TIMESTAMP WITH TIME ZONE, "refresh_token_hash" character varying(64), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_ee66de6cdc53993296d1ceb8aa0" UNIQUE ("email"), CONSTRAINT "PK_5a7a02c20412299d198e097a8fe" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "accounts"`);
    await queryRunner.query(`DROP TYPE "public"."account_status"`);
    await queryRunner.query(`DROP TYPE "public"."account_role"`);
  }
}
