export const ROLES = [
  'member',
  'premium',
  'verified',
  'moderator',
  'administrator',
  'super_admin',
  'owner',
];

export const ROLE_RANK = Object.fromEntries(ROLES.map((role, index) => [role, index]));

export const ROLE_LABELS = {
  owner: 'Owner',
  super_admin: 'Super Admin',
  administrator: 'Administrator',
  moderator: 'Moderator',
  verified: 'Verified',
  premium: 'Premium',
  member: 'Member',
};

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function assertRole(role) {
  if (!ROLES.includes(role)) {
    throw new ApiError(400, 'invalid_role', `Unknown role: ${role}`);
  }
}

export function atLeast(actorRole, requiredRole) {
  return ROLE_RANK[actorRole] >= ROLE_RANK[requiredRole];
}

export function canAssignRole(actor, role) {
  if (actor.role === 'owner') return true;
  if (role === 'owner' || role === 'super_admin') return false;
  if (actor.role === 'super_admin') {
    return role !== 'owner' && role !== 'super_admin';
  }
  if (actor.role === 'administrator') {
    return ROLE_RANK[role] <= ROLE_RANK.moderator;
  }
  return false;
}

export function canManageUser(actor, target) {
  if (actor.id === target.id) return false;
  if (actor.role === 'owner') return true;
  if (target.role === 'owner') return false;
  if (target.role === 'super_admin') return false;
  if (actor.role === 'super_admin') return true;
  if (actor.role === 'administrator') {
    return ROLE_RANK[target.role] <= ROLE_RANK.moderator;
  }
  return false;
}

export function assertCanManageUser(actor, target) {
  if (!canManageUser(actor, target)) {
    throw new ApiError(403, 'insufficient_role', 'You cannot manage this user.');
  }
}

export function assertAdmin(actor) {
  if (!atLeast(actor.role, 'moderator')) {
    throw new ApiError(403, 'admin_required', 'Administrator access required.');
  }
}

export function canGrantFirecoins(actor) {
  return atLeast(actor.role, 'administrator');
}

export function publicUser(user) {
  return {
    id: user.id,
    telegramUserId: user.telegram_user_id || null,
    username: user.username || null,
    displayName: user.display_name,
    role: user.role,
    roleLabel: ROLE_LABELS[user.role],
    verified: !!user.verified,
    verificationKind: user.verification_kind,
    blocked: !!user.blocked,
    createdAt: user.created_at,
  };
}

export function selfUser(user, balance) {
  return {
    ...publicUser(user),
    phone: user.phone || null,
    premiumUntil: user.premium_until || null,
    firecoins: balance,
  };
}
