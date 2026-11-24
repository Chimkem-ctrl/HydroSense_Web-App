import type { Role, SignupAddress } from '@hydrosense/shared';

export type RequestedRole = Role;
export type AccountStatus = 'pending' | 'approved' | 'rejected';

export interface SignInValues {
  email: string;
  password: string;
}

export interface SignUpValues extends SignInValues {
  firstName: string;
  lastName: string;
  employeeId: string;
  phone: string;
  hatcheryId: string;
  requestedRole: RequestedRole;
  address: SignupAddress;
  emergencyContactName: string;
  emergencyContactPhone: string;
  confirmPassword: string;
  termsAccepted: boolean;
}

export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role | null;
  requestedRole: RequestedRole | null;
  status: AccountStatus;
  employeeId?: string;
  phone?: string;
  position?: string;
  avatarUrl?: string;
  hatcheryId?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  createdAt: string;
}

export interface StoredAccount {
  user: AuthUser;
  passwordSalt: string;
  passwordHash: string;
}

export type PendingRequest = AuthUser & {
  role: null;
  status: 'pending';
};

export interface ForgotPasswordValues {
  email: string;
}

export type FormErrors<T> = Partial<Record<keyof T, string>>;
