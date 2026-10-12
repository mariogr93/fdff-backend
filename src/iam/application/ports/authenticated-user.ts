import { UserRoles } from '../../domain/enums/user-roles.enums';

/**
 * What a guarded request carries as `req.user`. Deliberately not an Account:
 * the domain model holds the password hash and refresh-token hash, and anything
 * on `req.user` is one careless `return req.user` away from the response body.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRoles;
}
