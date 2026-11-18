import type { DataStore } from '../storage/dataStore.js';
import type { UserRole } from '../types/data.js';

export interface SetServerParams {
  guildId: string;
  serverName: string;
  obUserId: string;
}

export class PermissionManager {
  constructor(private store: DataStore) {}

  async getUserRole(userId: string, guildId?: string): Promise<UserRole> {
    const config = await this.store.loadConfig();

    if (config.adminUserIds.includes(userId)) {
      return 'admin';
    }

    if (guildId) {
      const server = config.servers[guildId];
      if (server && server.obUserId === userId) {
        return 'bot_ob';
      }
    }

    return 'comon';
  }

  async canExecute(userId: string, guildId?: string): Promise<boolean> {
    const role = await this.getUserRole(userId, guildId);
    return role === 'admin' || role === 'bot_ob';
  }

  async canManageServer(userId: string, targetGuildId: string): Promise<boolean> {
    const role = await this.getUserRole(userId, targetGuildId);
    return role === 'admin' || role === 'bot_ob';
  }

  async setAdmin(executorUserId: string, targetUserId: string): Promise<{ success: boolean; message: string }> {
    const config = await this.store.loadConfig();

    // 初回管理者設定: まだ管理者が誰も設定されていない場合は誰でも初回登録可能
    if (config.adminUserIds.length > 0 && !config.adminUserIds.includes(executorUserId)) {
      return { success: false, message: '管理者権限がありません。' };
    }

    if (!config.adminUserIds.includes(targetUserId)) {
      config.adminUserIds.push(targetUserId);
      await this.store.saveConfig(config);
    }

    return { success: true, message: `ユーザー <@${targetUserId}> を管理者に設定しました。` };
  }

  async setServer(executorUserId: string, params: SetServerParams): Promise<{ success: boolean; message: string }> {
    const role = await this.getUserRole(executorUserId, params.guildId);

    // サーバー設定は admin または既存の bot_ob（またはサーバー未登録時は admin）のみ実行可能
    const config = await this.store.loadConfig();
    const existingServer = config.servers[params.guildId];

    if (existingServer) {
      if (role !== 'admin' && existingServer.obUserId !== executorUserId) {
        return { success: false, message: 'このサーバーの設定を変更する権限がありません。' };
      }
    } else {
      if (role !== 'admin') {
        return { success: false, message: '新規サーバー登録には管理者権限が必要です。' };
      }
    }

    config.servers[params.guildId] = {
      guildId: params.guildId,
      serverName: params.serverName,
      obUserId: params.obUserId,
      createdAt: existingServer?.createdAt || new Date().toISOString(),
    };

    await this.store.saveConfig(config);
    return { success: true, message: `サーバー ${params.serverName} (OB: <@${params.obUserId}>) を設定しました。` };
  }

  async set4SimApiKey(executorUserId: string, apiKey: string): Promise<{ success: boolean; message: string }> {
    const role = await this.getUserRole(executorUserId);
    if (role !== 'admin') {
      return { success: false, message: '4sim APIキーの設定には管理者権限が必要です。' };
    }

    const config = await this.store.loadConfig();
    config.fourSimApiKey = apiKey;
    await this.store.saveConfig(config);

    return { success: true, message: '4sim.net APIキーを登録しました。' };
  }
}

