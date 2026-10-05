export type Role = 'admin' | 'procurement' | 'reviewer' | 'viewer' | 'ges';
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  ges_id: string | null;
}
export const INTERNAL: Role[] = ['admin', 'procurement', 'reviewer', 'viewer'];
export const isGes = (u: AuthUser) => u.role === 'ges';
