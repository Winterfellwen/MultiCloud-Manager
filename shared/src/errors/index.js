export class AppError extends Error {
    code;
    statusCode;
    details;
    constructor(message, code, statusCode = 500, details) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
        this.name = 'AppError';
    }
}
export class NotFoundError extends AppError {
    constructor(resource, id) {
        super(`${resource} not found: ${id}`, 'NOT_FOUND', 404, { resource, id });
    }
}
export class UnauthorizedError extends AppError {
    constructor(message = 'Unauthorized') {
        super(message, 'UNAUTHORIZED', 401);
    }
}
export class ForbiddenError extends AppError {
    constructor(message = 'Forbidden') {
        super(message, 'FORBIDDEN', 403);
    }
}
export class ValidationError extends AppError {
    constructor(message, details) {
        super(message, 'VALIDATION_ERROR', 400, details);
    }
}
export class ConflictError extends AppError {
    constructor(message) {
        super(message, 'CONFLICT', 409);
    }
}
//# sourceMappingURL=index.js.map