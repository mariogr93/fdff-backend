import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/** Mirrors fdff-front signup.schema.ts password rules. */
export const PASSWORD_STRENGTH_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,20}$/;

@ValidatorConstraint({ name: 'isPasswordStrong', async: false })
export class PasswordStrengthConstraint implements ValidatorConstraintInterface {
  validate(password: string): boolean {
    return typeof password === 'string' && PASSWORD_STRENGTH_REGEX.test(password);
  }

  defaultMessage(): string {
    return 'Password must be 8–20 characters and include uppercase, lowercase, number, and special character';
  }
}

export function IsPasswordStrong(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: PasswordStrengthConstraint,
    });
  };
}
