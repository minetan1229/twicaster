import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DataStore } from '../../src/storage/dataStore.js';
import type { LineAccountData, LineGroupData } from '../../src/types/data.js';

describe('DataStore', () => {
  const testDir = path.resolve('./test-data');
  let store: DataStore;

  beforeEach(async () => {
    store = new DataStore(testDir);
    await store.init();
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('initializes empty accounts and groups files', async () => {
    const accounts = await store.loadAccounts();
    const groups = await store.loadGroups();

    expect(accounts).toEqual({});
    expect(groups).toEqual({});
  });

  it('saves and loads account data correctly', async () => {
    const accountSample: LineAccountData = {
      mid: 'u1234567890abcdef',
      account: {
        token: 'sample_token',
        ip: '127.0.0.1',
        logincount: 1,
        last_login_time: '2026-11-18T00:00:00Z',
        first_login_name: 'TestUser',
      },
      group_id: 'c1234567890abcdef',
      status: 'active',
      type: 'bot',
    };

    await store.saveAccounts({ uuid1: accountSample });
    const loaded = await store.loadAccounts();

    expect(loaded).toHaveProperty('uuid1');
    expect(loaded.uuid1).toEqual(accountSample);
  });

  it('saves and loads group data correctly', async () => {
    const groupSample: LineGroupData = {
      name: 'Test Group',
      create_time: '2026-11-18T00:00:00Z',
      ob_mid: 'u_ob_mid',
      bot_status: {
        bot1: {
          status: 'active',
          mid: 'u1234567890abcdef',
        },
      },
    };

    await store.saveGroups({ ggid1: groupSample });
    const loaded = await store.loadGroups();

    expect(loaded).toHaveProperty('ggid1');
    expect(loaded.ggid1).toEqual(groupSample);
  });
});
