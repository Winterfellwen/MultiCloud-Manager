export type UserRole = 'admin' | 'ops_manager' | 'ops_engineer' | 'viewer';
export interface User {
    id: string;
    username: string;
    email: string | null;
    role: UserRole;
    apiKey: string | null;
    createdAt: Date;
    lastLoginAt: Date | null;
}
export interface CreateUserInput {
    username: string;
    email?: string;
    password: string;
    role?: UserRole;
}
export interface LoginInput {
    username: string;
    password: string;
}
export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}
export interface Permission {
    resource: string;
    action: string;
}
export declare const ROLE_PERMISSIONS: Record<UserRole, Permission[]>;
//# sourceMappingURL=user.d.ts.map