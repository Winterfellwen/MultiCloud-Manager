export const ROLE_PERMISSIONS = {
    admin: [{ resource: '*', action: '*' }],
    ops_manager: [
        { resource: 'instance', action: 'list' },
        { resource: 'instance', action: 'view' },
        { resource: 'instance', action: 'start' },
        { resource: 'instance', action: 'stop' },
        { resource: 'instance', action: 'reboot' },
        { resource: 'monitor', action: 'view' },
        { resource: 'alert', action: 'manage' },
        { resource: 'cost', action: 'view' },
        { resource: 'report', action: 'generate' },
    ],
    ops_engineer: [
        { resource: 'instance', action: 'list' },
        { resource: 'instance', action: 'view' },
        { resource: 'instance', action: 'start' },
        { resource: 'instance', action: 'stop' },
        { resource: 'instance', action: 'reboot' },
        { resource: 'exec', action: 'command' },
    ],
    viewer: [
        { resource: 'instance', action: 'list' },
        { resource: 'instance', action: 'view' },
        { resource: 'monitor', action: 'view' },
        { resource: 'cost', action: 'view' },
    ],
};
//# sourceMappingURL=user.js.map