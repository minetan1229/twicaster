import crypto from 'node:crypto';
import type { DataStore } from '../storage/dataStore.js';
import type { LineAccountData } from '../types/data.js';

export const LINE_DEFAULT_PASSWORD = 'Hexhex1758';

export function generateLineAccountName(): string {
  const randomHex = crypto.randomBytes(4).toString('hex');
  return `hex_${randomHex}`;
}

export interface LineRegistrationInfo {
  uuid: string;
  mid: string;
  name: string;
  phone: string;
  token: string;
}

export class LineAccountCreator {
  constructor(private store: DataStore) {}

  async registerCreatedAccount(params: {
    uuid?: string;
    mid: string;
    token: string;
    accountName: string;
    ip?: string;
    groupId?: string;
    type?: 'self' | 'bot';
  }): Promise<LineRegistrationInfo> {
    const uuid = params.uuid || crypto.randomUUID();
    const accountData: LineAccountData = {
      mid: params.mid,
      account: {
        token: params.token,
        ip: params.ip || '127.0.0.1',
        logincount: 1,
        last_login_time: new Date().toISOString(),
        first_login_name: params.accountName,
      },
      group_id: params.groupId || '',
      status: 'active',
      type: params.type || 'bot',
    };

    const accounts = await this.store.loadAccounts();
    accounts[uuid] = accountData;
    await this.store.saveAccounts(accounts);

    return {
      uuid,
      mid: params.mid,
      name: params.accountName,
      phone: '',
      token: params.token,
    };
  }
}
