import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { DiscordBot, loadEnv } from '../src/bot.js';
import { DataStore } from '../src/storage/dataStore.js';
import type { ChatInputCommandInteraction } from 'discord.js';

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

      expect(names).toContain('ping');
      expect(names).toContain('set_admin');
      expect(names).toContain('set_server');
      expect(names).toContain('set_4sim_api_key');
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
          ephemeral: false,
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
          ephemeral: false,
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
          ephemeral: false,
        })
      );

      const updated = await store.loadConfig();
      expect(updated.fourSimApiKey).toBe('test-api-key-1234');
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
