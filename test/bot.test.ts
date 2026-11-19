import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { DiscordBot, loadEnv } from '../src/bot.js';
import { DataStore } from '../src/storage/dataStore.js';
import type { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';

describe('DiscordBot', () => {
  let tmpDir: string;
  let store: DataStore;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bot-test-'));
    store = new DataStore(tmpDir);
    await store.init();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('loadEnv', () => {
    it('should parse environment variables from file into process.env', async () => {
      const envFile = path.join(tmpDir, '.test.env');
      await fs.writeFile(envFile, 'TEST_ENV_KEY_1=value1\n# comment\nTEST_ENV_KEY_2="quoted_value"', 'utf-8');

      loadEnv(envFile);
      expect(process.env.TEST_ENV_KEY_1).toBe('value1');
      expect(process.env.TEST_ENV_KEY_2).toBe('quoted_value');

      delete process.env.TEST_ENV_KEY_1;
      delete process.env.TEST_ENV_KEY_2;
    });
  });

  describe('Slash Commands', () => {
    it('should return valid slash command definitions', () => {
      const bot = new DiscordBot({ store });
      const commands = bot.getSlashCommandDefinitions();
      const names = commands.map((c) => c.name);

      expect(names).toContain('help');
      expect(names).toContain('ping');
      expect(names).toContain('sys');
      expect(names).toContain('tree');
      expect(names).toContain('restart');
      expect(names).toContain('set_admin');
      expect(names).toContain('set_server');
      expect(names).toContain('set_4sim_api_key');
      expect(names).toContain('bot_list_line');
      expect(names).toContain('logout_line');
      expect(names).toContain('create_group_id');
      expect(names).toContain('change_group');
      expect(names).toContain('del_group_id');
      expect(names).toContain('create_line');
    });

    it('should handle /help command', async () => {
      const bot = new DiscordBot({ store });
      const replyMock = vi.fn();
      const interaction = {
        commandName: 'help',
        user: { id: 'u1' },
        reply: replyMock,
      } as unknown as ChatInputCommandInteraction;

      await bot.handleCommand(interaction);
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([expect.anything()]),
          ephemeral: true,
        })
      );
    });

    it('should handle /ping command', async () => {
      const bot = new DiscordBot({ store });
      const replyMock = vi.fn();
      const interaction = {
        commandName: 'ping',
        user: { id: 'u1' },
        reply: replyMock,
      } as unknown as ChatInputCommandInteraction;

      await bot.handleCommand(interaction);
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Pong!'),
          ephemeral: true,
        })
      );
    });

    it('should handle /set_admin command', async () => {
      const bot = new DiscordBot({ store });
      const replyMock = vi.fn();
      const interaction = {
        commandName: 'set_admin',
        user: { id: 'admin1' },
        options: {
          getUser: vi.fn().mockReturnValue({ id: 'target1' }),
        },
        reply: replyMock,
      } as unknown as ChatInputCommandInteraction;

      await bot.handleCommand(interaction);
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('管理者'),
          ephemeral: true,
        })
      );

      const config = await store.loadConfig();
      expect(config.adminUserIds).toContain('target1');
    });

    it('should handle /set_server command', async () => {
      // 事前に admin を追加しておく
      const config = await store.loadConfig();
      config.adminUserIds.push('admin1');
      await store.saveConfig(config);

      const bot = new DiscordBot({ store });
      const replyMock = vi.fn();
      const interaction = {
        commandName: 'set_server',
        guildId: 'g1',
        user: { id: 'admin1' },
        options: {
          getString: vi.fn().mockReturnValue('Test Guild'),
          getUser: vi.fn().mockReturnValue({ id: 'ob1' }),
        },
        reply: replyMock,
      } as unknown as ChatInputCommandInteraction;

      await bot.handleCommand(interaction);
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Test Guild'),
          ephemeral: true,
        })
      );
    });

    it('should handle /set_4sim_api_key command', async () => {
      const config = await store.loadConfig();
      config.adminUserIds.push('admin1');
      await store.saveConfig(config);

      const bot = new DiscordBot({ store });
      const replyMock = vi.fn();
      const interaction = {
        commandName: 'set_4sim_api_key',
        user: { id: 'admin1' },
        options: {
          getString: vi.fn().mockReturnValue('test-api-key-1234'),
        },
        reply: replyMock,
      } as unknown as ChatInputCommandInteraction;

      await bot.handleCommand(interaction);
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('4sim.net APIキーを登録しました'),
          ephemeral: true,
        })
      );

      const updated = await store.loadConfig();
      expect(updated.fourSimApiKey).toBe('test-api-key-1234');
    });

    it('should handle /sys command', async () => {
      const bot = new DiscordBot({ store });
      const replyMock = vi.fn();
      const interaction = {
        commandName: 'sys',
        user: { id: 'u1' },
        reply: replyMock,
      } as unknown as ChatInputCommandInteraction;

      await bot.handleCommand(interaction);
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('システムステータス'),
          ephemeral: true,
        })
      );
    });

    it('should handle /restart command with permissions', async () => {
      const config = await store.loadConfig();
      config.adminUserIds.push('admin1');
      await store.saveConfig(config);

      const bot = new DiscordBot({ store });
      const replyMock = vi.fn();

      // 非管理者
      const nonAdminInteraction = {
        commandName: 'restart',
        user: { id: 'user_regular' },
        reply: replyMock,
      } as unknown as ChatInputCommandInteraction;
      await bot.handleCommand(nonAdminInteraction);
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('管理者権限がありません'),
          ephemeral: true,
        })
      );

      // 管理者
      replyMock.mockClear();
      const adminInteraction = {
        commandName: 'restart',
        user: { id: 'admin1' },
        reply: replyMock,
      } as unknown as ChatInputCommandInteraction;
      await bot.handleCommand(adminInteraction);
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Botを再起動します'),
          ephemeral: true,
        })
      );
    });

    it('should handle /bot_list_line command', async () => {
      const config = await store.loadConfig();
      config.adminUserIds.push('admin1');
      await store.saveConfig(config);

      const bot = new DiscordBot({ store });
      const replyMock = vi.fn();

      // 0件の時
      const interactionEmpty = {
        commandName: 'bot_list_line',
        user: { id: 'admin1' },
        reply: replyMock,
      } as unknown as ChatInputCommandInteraction;
      await bot.handleCommand(interactionEmpty);
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('登録されているLINEアカウントはありません'),
          ephemeral: true,
        })
      );

      // アカウントが存在する時
      await store.saveAccounts({
        uuid1: {
          mid: 'mid1',
          account: {
            token: 'tok1',
            ip: '127.0.0.1',
            logincount: 1,
            last_login_time: '2026-11-19T00:00:00Z',
            first_login_name: 'bot1',
          },
          group_id: 'grp1',
          status: 'active',
          type: 'bot',
        },
      });

      replyMock.mockClear();
      await bot.handleCommand(interactionEmpty);
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('uuid1'),
          ephemeral: true,
        })
      );
    });

    it('should handle /logout_line command', async () => {
      const config = await store.loadConfig();
      config.adminUserIds.push('admin1');
      await store.saveConfig(config);

      await store.saveAccounts({
        uuid1: {
          mid: 'mid1',
          account: {
            token: 'tok1',
            ip: '127.0.0.1',
            logincount: 1,
            last_login_time: '2026-11-19T00:00:00Z',
            first_login_name: 'bot1',
          },
          group_id: 'grp1',
          status: 'active',
          type: 'bot',
        },
      });

      const bot = new DiscordBot({ store });
      const replyMock = vi.fn();
      const interaction = {
        commandName: 'logout_line',
        user: { id: 'admin1' },
        options: {
          getString: vi.fn().mockReturnValue('uuid1'),
        },
        reply: replyMock,
      } as unknown as ChatInputCommandInteraction;

      await bot.handleCommand(interaction);
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('ログアウト'),
          ephemeral: true,
        })
      );

      const accounts = await store.loadAccounts();
      expect(accounts.uuid1.status).toBe('sleep');
    });

    it('should handle /create_group_id, /change_group, /del_group_id commands', async () => {
      const config = await store.loadConfig();
      config.adminUserIds.push('admin1');
      await store.saveConfig(config);

      await store.saveAccounts({
        uuid1: {
          mid: 'mid1',
          account: {
            token: 'tok1',
            ip: '127.0.0.1',
            logincount: 1,
            last_login_time: '2026-11-19T00:00:00Z',
            first_login_name: 'bot1',
          },
          group_id: '',
          status: 'active',
          type: 'bot',
        },
      });

      const bot = new DiscordBot({ store });
      const replyMock = vi.fn();

      // create_group_id
      const createGroupInteraction = {
        commandName: 'create_group_id',
        user: { id: 'admin1' },
        options: {
          getString: vi.fn((key: string) => {
            if (key === 'group_id') return 'gid-100';
            if (key === 'name') return 'Group 100';
            return null;
          }),
        },
        reply: replyMock,
      } as unknown as ChatInputCommandInteraction;

      await bot.handleCommand(createGroupInteraction);
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Group 100'),
          ephemeral: true,
        })
      );

      const groups = await store.loadGroups();
      expect(groups['gid-100']).toBeDefined();

      // change_group
      replyMock.mockClear();
      const changeGroupInteraction = {
        commandName: 'change_group',
        user: { id: 'admin1' },
        options: {
          getString: vi.fn((key: string) => {
            if (key === 'uuid') return 'uuid1';
            if (key === 'group_id') return 'gid-100';
            return null;
          }),
        },
        reply: replyMock,
      } as unknown as ChatInputCommandInteraction;

      await bot.handleCommand(changeGroupInteraction);
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('gid-100'),
          ephemeral: true,
        })
      );

      const accounts = await store.loadAccounts();
      expect(accounts.uuid1.group_id).toBe('gid-100');

      // del_group_id
      replyMock.mockClear();
      const delGroupInteraction = {
        commandName: 'del_group_id',
        user: { id: 'admin1' },
        options: {
          getString: vi.fn().mockReturnValue('gid-100'),
        },
        reply: replyMock,
      } as unknown as ChatInputCommandInteraction;

      await bot.handleCommand(delGroupInteraction);
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('削除しました'),
          ephemeral: true,
        })
      );

      const groupsAfter = await store.loadGroups();
      expect(groupsAfter['gid-100']).toBeUndefined();
    });

    it('should handle /tree command', async () => {
      const config = await store.loadConfig();
      config.adminUserIds.push('admin1');
      await store.saveConfig(config);

      await store.saveGroups({
        'gid-tree': {
          name: 'Tree Group',
          create_time: '2026-11-19T00:00:00Z',
          ob_mid: 'ob1',
          bot_status: {},
        },
      });

      await store.saveAccounts({
        u_in_grp: {
          mid: 'm1',
          account: {
            token: 't1',
            ip: '127.0.0.1',
            logincount: 1,
            last_login_time: '2026-11-19T00:00:00Z',
            first_login_name: 'BotInGrp',
          },
          group_id: 'gid-tree',
          status: 'active',
          type: 'bot',
        },
        u_unassigned: {
          mid: 'm2',
          account: {
            token: 't2',
            ip: '127.0.0.1',
            logincount: 1,
            last_login_time: '2026-11-19T00:00:00Z',
            first_login_name: 'SelfUnassigned',
          },
          group_id: '',
          status: 'active',
          type: 'self',
        },
      });

      const bot = new DiscordBot({ store });
      const replyMock = vi.fn();
      const interaction = {
        commandName: 'tree',
        user: { id: 'admin1' },
        reply: replyMock,
      } as unknown as ChatInputCommandInteraction;

      await bot.handleCommand(interaction);
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('LINEグループ & アカウント構成ツリー'),
          ephemeral: true,
        })
      );
      const outputText = replyMock.mock.calls[0][0].content;
      expect(outputText).toContain('Tree Group');
      expect(outputText).toContain('BotInGrp');
      expect(outputText).toContain('SelfUnassigned');
      expect(outputText).toContain('未所属アカウント');
    });

    it('should handle /create_line command with 4sim API and deferReply', async () => {
      const config = await store.loadConfig();
      config.adminUserIds.push('admin1');
      config.fourSimApiKey = 'test-key';
      await store.saveConfig(config);

      const bot = new DiscordBot({ store });
      const replyMock = vi.fn();
      const deferReplyMock = vi.fn();
      const editReplyMock = vi.fn();

      // fetch をモック
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 99999, number: '+66912345678' }),
      } as unknown as Response);

      const interaction = {
        commandName: 'create_line',
        user: { id: 'admin1' },
        options: {
          getString: vi.fn().mockReturnValue('thailand'),
        },
        reply: replyMock,
        deferReply: deferReplyMock,
        editReply: editReplyMock,
      } as unknown as ChatInputCommandInteraction;

      try {
        await bot.handleCommand(interaction);
        expect(deferReplyMock).toHaveBeenCalledWith({ ephemeral: true });
        expect(editReplyMock).toHaveBeenCalledWith(
          expect.objectContaining({
            content: expect.stringContaining('+66912345678'),
          })
        );
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should handle autocomplete for uuid and group_id', async () => {
      await store.saveGroups({
        'gid-auto': {
          name: 'Auto Group',
          create_time: '2026-11-19T00:00:00Z',
          ob_mid: '',
          bot_status: {},
        },
      });

      await store.saveAccounts({
        'uuid-auto-1': {
          mid: 'mid-auto',
          account: {
            token: 't',
            ip: '127.0.0.1',
            logincount: 1,
            last_login_time: '2026-11-19T00:00:00Z',
            first_login_name: 'BotAuto',
          },
          group_id: 'gid-auto',
          status: 'active',
          type: 'bot',
        },
      });

      const bot = new DiscordBot({ store });
      const respondMock = vi.fn();

      // uuid autocomplete
      const uuidInteraction = {
        options: {
          getFocused: vi.fn().mockReturnValue({ name: 'uuid', value: 'auto' }),
        },
        respond: respondMock,
      } as unknown as AutocompleteInteraction;

      await bot.handleAutocomplete(uuidInteraction);
      expect(respondMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            value: 'uuid-auto-1',
            name: expect.stringContaining('BotAuto'),
          }),
        ])
      );

      // group_id autocomplete
      respondMock.mockClear();
      const gidInteraction = {
        options: {
          getFocused: vi.fn().mockReturnValue({ name: 'group_id', value: 'auto' }),
        },
        respond: respondMock,
      } as unknown as AutocompleteInteraction;

      await bot.handleAutocomplete(gidInteraction);
      expect(respondMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            value: 'gid-auto',
            name: expect.stringContaining('Auto Group'),
          }),
        ])
      );
    });
  });

  describe('start', () => {
    it('should throw error if token is missing or placeholder', async () => {
      const oldToken = process.env.discord_bot_token;
      delete process.env.discord_bot_token;

      const nonExistentEnv = path.join(tmpDir, 'empty.env');
      const bot = new DiscordBot({ store });
      await expect(bot.start(undefined, nonExistentEnv)).rejects.toThrow('discord_bot_token is missing');

      if (oldToken) {
        process.env.discord_bot_token = oldToken;
      }
    });

    it('should call client.login with provided token', async () => {
      const bot = new DiscordBot({ store });
      const loginSpy = vi.spyOn(bot.client, 'login').mockResolvedValue('token');
      const nonExistentEnv = path.join(tmpDir, 'empty.env');

      await bot.start('valid-test-token', nonExistentEnv);
      expect(loginSpy).toHaveBeenCalledWith('valid-test-token');
    });
  });
});
