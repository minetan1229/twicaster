import fs from 'node:fs';
import path from 'node:path';
import {
  Client,
  GatewayIntentBits,
  Events,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  REST,
  Routes,
} from 'discord.js';
import { DataStore } from './storage/dataStore.js';
import { PermissionManager } from './auth/permission.js';

export function loadEnv(envPath: string = '.env'): void {
  try {
    const resolvedPath = path.resolve(envPath);
    if (!fs.existsSync(resolvedPath)) return;
    const content = fs.readFileSync(resolvedPath, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  } catch {
    // 無視
  }
}

export class DiscordBot {
  public client: Client;
  public store: DataStore;
  public permissions: PermissionManager;

  constructor(options?: { client?: Client; store?: DataStore }) {
    this.store = options?.store || new DataStore();
    this.permissions = new PermissionManager(this.store);
    this.client =
      options?.client ||
      new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
        ],
      });

    this.setupEvents();
  }

  public getSlashCommandDefinitions() {
    return [
      new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Botの応答速度を確認します'),
      new SlashCommandBuilder()
        .setName('set_admin')
        .setDescription('新しい管理者ユーザーを設定します')
        .addUserOption((opt) =>
          opt.setName('target').setDescription('管理者に任命するユーザー').setRequired(true)
        ),
      new SlashCommandBuilder()
        .setName('set_server')
        .setDescription('DiscordサーバーとOBユーザーを紐付け登録します')
        .addStringOption((opt) =>
          opt.setName('server_name').setDescription('登録するサーバー名').setRequired(true)
        )
        .addUserOption((opt) =>
          opt.setName('ob_user').setDescription('サーバーのOB担当ユーザー').setRequired(true)
        ),
      new SlashCommandBuilder()
        .setName('set_4sim_api_key')
        .setDescription('4sim.netのAPIキーを設定します（管理者専用）')
        .addStringOption((opt) =>
          opt.setName('api_key').setDescription('4sim.net APIキー').setRequired(true)
        ),
    ];
  }

  private setupEvents(): void {
    this.client.once(Events.ClientReady, (readyClient) => {
      console.log(`[DiscordBot] ログイン成功: ${readyClient.user.tag}`);
    });

    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      await this.handleCommand(interaction);
    });
  }

  public async registerCommands(token: string, clientId: string, guildId?: string): Promise<void> {
    const rest = new REST({ version: '10' }).setToken(token);
    const commandData = this.getSlashCommandDefinitions().map((c) => c.toJSON());

    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandData });
      console.log(`[DiscordBot] ギルドコマンド (${guildId}) を登録しました。`);
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: commandData });
      console.log('[DiscordBot] グローバルスラッシュコマンドを登録しました。');
    }
  }

  public async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const { commandName, user, guildId } = interaction;

    try {
      if (commandName === 'ping') {
        const ping = this.client.ws.ping;
        await interaction.reply({
          content: `Pong! WebSocket Ping: ${ping >= 0 ? `${ping}ms` : '測定中'}`,
          ephemeral: true,
        });
        return;
      }

      if (commandName === 'set_admin') {
        const targetUser = interaction.options.getUser('target', true);
        const result = await this.permissions.setAdmin(user.id, targetUser.id);
        await interaction.reply({ content: result.message, ephemeral: !result.success });
        return;
      }

      if (commandName === 'set_server') {
        if (!guildId) {
          await interaction.reply({ content: 'このコマンドはサーバー内でのみ実行できます。', ephemeral: true });
          return;
        }
        const serverName = interaction.options.getString('server_name', true);
        const obUser = interaction.options.getUser('ob_user', true);
        const result = await this.permissions.setServer(user.id, {
          guildId,
          serverName,
          obUserId: obUser.id,
        });
        await interaction.reply({ content: result.message, ephemeral: !result.success });
        return;
      }

      if (commandName === 'set_4sim_api_key') {
        const apiKey = interaction.options.getString('api_key', true);
        const result = await this.permissions.set4SimApiKey(user.id, apiKey);
        await interaction.reply({ content: result.message, ephemeral: !result.success });
        return;
      }

      await interaction.reply({ content: `不明なコマンドです: ${commandName}`, ephemeral: true });
    } catch (err) {
      console.error('[DiscordBot] コマンド処理中にエラーが発生しました:', err);
      const replyContent = 'コマンド実行中にエラーが発生しました。';
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: replyContent, ephemeral: true });
      } else {
        await interaction.reply({ content: replyContent, ephemeral: true });
      }
    }
  }

  public async start(token?: string, envPath: string = '.env'): Promise<void> {
    loadEnv(envPath);
    await this.store.init();

    const botToken = token || process.env.discord_bot_token;
    if (!botToken || botToken === 'YOUR_DISCORD_BOT_TOKEN') {
      console.error(
        '[DiscordBot] エラー: 有効な discord_bot_token が設定されていません。\n' +
        '.env ファイルに discord_bot_token=あなたのBotトークン を記述してください。'
      );
      throw new Error('discord_bot_token is missing or default placeholder');
    }

    await this.client.login(botToken);
  }
}
