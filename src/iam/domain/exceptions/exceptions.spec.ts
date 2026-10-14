import { readdirSync } from 'fs';
import { join } from 'path';
import { DomainException } from '../../../shared/domain/domain.exception';

/**
 * @Catch(DomainException) matches on class identity, so an exception that does
 * not extend the one shared base class is never caught by the filter: the
 * client gets a 500 with a leaked stack instead of its status code.
 *
 * Every *.exception.ts file in this folder is loaded, so a new exception is
 * checked without anyone having to remember to add it to a list.
 */
const files = readdirSync(__dirname).filter((f) =>
  /\.exception\.(ts|js)$/.test(f),
);

describe('IAM domain exceptions', () => {
  it('finds the exception files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)(
    '%s exports only DomainException subclasses with a 4xx status',
    (file) => {
      const exported = Object.values(
        jest.requireActual<Record<string, unknown>>(join(__dirname, file)),
      );
      const classes = exported.filter(
        (value): value is new (...args: unknown[]) => DomainException =>
          typeof value === 'function',
      );

      expect(classes.length).toBeGreaterThan(0);
      for (const ExceptionClass of classes) {
        expect(ExceptionClass.prototype).toBeInstanceOf(DomainException);

        // Constructors take at most one string argument; extra ones are ignored.
        const instance = new ExceptionClass('x');
        expect(instance.statusCode).toBeGreaterThanOrEqual(400);
        expect(instance.statusCode).toBeLessThan(500);
      }
    },
  );
});
