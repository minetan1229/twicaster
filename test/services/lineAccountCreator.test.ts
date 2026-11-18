import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DataStore } from '../../src/storage/dataStore.js';
import {
  generateLineAccountName,
  LINE_DEFAULT_PASSWORD,
  LineAccountCreator,
} from '../../src/services/lineAccountCreator.js';

describe('LineAccountCreator', () => {
  const testDir = path.resolve('./test-data-creator');
  let store: DataStore;
  let creator: LineAccountCreator;

  beforeEach(async () => {
    store = new DataStore(testDir);
    await store.init();
    creator = new LineAccountCreator(store);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('generates account name in hex_random format and has default password', () => {
    const name = generateLineAccountName();
    expect(name).toMatch(/^hex_[0-9a-f]{8}$/);
    expect(LINE_DEFAULT_PASSWORD).toBe('Hexhex1758');
  });

  it('registers created account and saves to DataStore', async () => {
    const accountName = generateLineAccountName();
    const result = await creator.registerCreatedAccount({
      mid: 'u_test_line_mid_123',
      token: 'test_token_abc',
      accountName,
      groupId: 'c_test_group',
      type: 'bot',
    });

    expect(result.mid).toBe('u_test_line_mid_123');
    expect(result.name).toBe(accountName);
    expect(result.token).toBe('test_token_abc');
    expect(result.uuid).toBeDefined();

    const accounts = await store.loadAccounts();
    expect(accounts[result.uuid]).toBeDefined();
    expect(accounts[result.uuid].account.first_login_name).toBe(accountName);
    expect(accounts[result.uuid].mid).toBe('u_test_line_mid_123');
    expect(accounts[result.uuid].status).toBe('active');
  });
});
