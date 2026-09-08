export function allowSharedGlobalOwner(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export function sharedOwnerId(userId: string): string {
  return allowSharedGlobalOwner() ? 'GLOBAL' : userId;
}

export function canAccessOwnedRecord(ownerId: string | undefined, userId: string): boolean {
  return ownerId === userId || (allowSharedGlobalOwner() && ownerId === 'GLOBAL');
}
