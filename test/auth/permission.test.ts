import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DataStore } from '../../src/storage/dataStore.js';
import { PermissionManager } from '../../src/auth/permission.js';

describe('PermissionManager', () => {
  const testDir = path.resolve('./test-data-auth');
  let store: DataStore;
  let perm: PermissionManager;

  beforeEach(async () => {
    store = new DataStore(testDir);
    await store.init();
    perm = new PermissionManager(store);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('allows initial admin setup when no admins exist', async () => {
    const res = await perm.setAdmin('user-first', 'user-first');
    expect(res.success).toBe(true);

    const role = await perm.getUserRole('user-first');
    expect(role).toBe('admin');
  });

  it('prevents non-admin from adding another admin when admin exists', async () => {
    await perm.setAdmin('user-first', 'user-admin');

    const res = await perm.setAdmin('user-attacker', 'user-attacker');
    expect(res.success).toBe(false);
    expect(res.message).toContain('管理者権限がありません');
  });

  it('allows existing admin to add another admin', async () => {
    await perm.setAdmin('user-first', 'user-admin1');
    const res = await perm.setAdmin('user-admin1', 'user-admin2');

    expect(res.success).toBe(true);
    const role2 = await perm.getUserRole('user-admin2');
    expect(role2).toBe('admin');
  });

  it('correctly identifies roles: admin, bot_ob, comon', async () => {
    await perm.setAdmin('first', 'admin-user');

    // Admin sets up a server with bot_ob
    await perm.setServer('admin-user', {
      guildId: 'guild-100',
      serverName: 'Test Guild',
      obUserId: 'ob-user',
    });

    // Role checks
    expect(await perm.getUserRole('admin-user', 'guild-100')).toBe('admin');
    expect(await perm.getUserRole('ob-user', 'guild-100')).toBe('bot_ob');
    expect(await perm.getUserRole('ob-user', 'guild-200')).toBe('comon');
    expect(await perm.getUserRole('other-user', 'guild-100')).toBe('comon');
  });

  it('checks execution permissions properly', async () => {
    await perm.setAdmin('first', 'admin-user');
    await perm.setServer('admin-user', {
      guildId: 'guild-100',
      serverName: 'Test Guild',
      obUserId: 'ob-user',
    });

    // Admin can execute anywhere
    expect(await perm.canExecute('admin-user', 'guild-100')).toBe(true);
    expect(await perm.canExecute('admin-user', 'guild-200')).toBe(true);

    // bot_ob can execute in their assigned guild only
    expect(await perm.canExecute('ob-user', 'guild-100')).toBe(true);
    expect(await perm.canExecute('ob-user', 'guild-200')).toBe(false);

    // comon cannot execute
    expect(await perm.canExecute('other-user', 'guild-100')).toBe(false);
  });

  it('restricts setServer execution based on role', async () => {
    // Non-admin cannot register a new server
    const failedRegister = await perm.setServer('random-user', {
      guildId: 'guild-999',
      serverName: 'Forbidden Guild',
      obUserId: 'random-user',
    });
    expect(failedRegister.success).toBe(false);
    expect(failedRegister.message).toContain('管理者権限が必要');

    // Admin can register
    await perm.setAdmin('first', 'admin-user');
    const successRegister = await perm.setServer('admin-user', {
      guildId: 'guild-999',
      serverName: 'Allowed Guild',
      obUserId: 'ob-user',
    });
    expect(successRegister.success).toBe(true);

    // Existing bot_ob can update their server
    const obUpdate = await perm.setServer('ob-user', {
      guildId: 'guild-999',
      serverName: 'Renamed Guild',
      obUserId: 'ob-user',
    });
    expect(obUpdate.success).toBe(true);

    // Other user cannot update existing server
    const otherUpdate = await perm.setServer('other-user', {
      guildId: 'guild-999',
      serverName: 'Hacked Guild',
      obUserId: 'other-user',
    });
    expect(otherUpdate.success).toBe(false);
  });
});
