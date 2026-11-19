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

import { FourSimClient } from './services/fourSimClient.js';

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
        .setName('sys')
        .setDescription('システムの稼働ステータスおよび統計情報を表示します'),
      new SlashCommandBuilder()
        .setName('restart')
        .setDescription('Botを再起動します（管理者専用）'),
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
      new SlashCommandBuilder()
        .setName('bot_list_line')
        .setDescription('登録済みのLINEアカウント一覧を表示します'),
      new SlashCommandBuilder()
        .setName('logout_line')
        .setDescription('LINEアカウントをログアウトします（管理者専用）')
        .addStringOption((opt) =>
          opt.setName('uuid').setDescription('対象アカウントのUUID').setRequired(true)
        ),
      new SlashCommandBuilder()
        .setName('create_group_id')
        .setDescription('新しいLINEグループを登録します')
        .addStringOption((opt) =>
          opt.setName('group_id').setDescription('グループID').setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('name').setDescription('グループ名').setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('ob_mid').setDescription('担当OBのMID').setRequired(false)
        ),
      new SlashCommandBuilder()
        .setName('change_group')
        .setDescription('LINEアカウントの所属グループを変更します')
        .addStringOption((opt) =>
          opt.setName('uuid').setDescription('対象アカウントのUUID').setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('group_id').setDescription('変更先のグループID').setRequired(true)
        ),
      new SlashCommandBuilder()
        .setName('del_group_id')
        .setDescription('登録済みLINEグループを削除します（管理者専用）')
        .addStringOption((opt) =>
          opt.setName('group_id').setDescription('削除するグループID').setRequired(true)
        ),
      new SlashCommandBuilder()
        .setName('create_line')
        .setDescription('4sim.netを利用してLINEアカウント作成用電話番号を発行します')
        .addStringOption((opt) =>
          opt.setName('country').setDescription('国名（デフォルト: thailand）').setRequired(false)
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

      if (commandName === 'sys') {
        const uptimeSec = Math.floor(process.uptime());
        const mem = process.memoryUsage();
        const heapUsedMB = (mem.heapUsed / 1024 / 1024).toFixed(2);
        const accounts = await this.store.loadAccounts();
        const groups = await this.store.loadGroups();

        const msg = [
          `📊 **システムステータス**`,
          `• Node.js: ${process.version}`,
          `• 稼働時間: ${uptimeSec}秒`,
          `• メモリ使用量: ${heapUsedMB} MB`,
          `• 登録LINEアカウント数: ${Object.keys(accounts).length}`,
          `• 登録LINEグループ数: ${Object.keys(groups).length}`,
        ].join('\n');

        await interaction.reply({ content: msg, ephemeral: true });
        return;
      }

      if (commandName === 'restart') {
        const role = await this.permissions.getUserRole(user.id);
        if (role !== 'admin') {
          await interaction.reply({ content: '管理者権限がありません。', ephemeral: true });
          return;
        }
        await interaction.reply({ content: '🔄 Botを再起動します...', ephemeral: true });
        return;
      }

      if (commandName === 'set_admin') {
        const targetUser = interaction.options.getUser('target', true);
        const result = await this.permissions.setAdmin(user.id, targetUser.id);
        await interaction.reply({ content: result.message, ephemeral: true });
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
        await interaction.reply({ content: result.message, ephemeral: true });
        return;
      }

      if (commandName === 'set_4sim_api_key') {
        const apiKey = interaction.options.getString('api_key', true);
        const result = await this.permissions.set4SimApiKey(user.id, apiKey);
        await interaction.reply({ content: result.message, ephemeral: true });
        return;
      }

      if (commandName === 'bot_list_line') {
        const canExec = await this.permissions.canExecute(user.id, guildId || undefined);
        if (!canExec) {
          await interaction.reply({ content: 'このコマンドを実行する権限がありません。', ephemeral: true });
          return;
        }
        const accounts = await this.store.loadAccounts();
        const entries = Object.entries(accounts);
        if (entries.length === 0) {
          await interaction.reply({ content: '登録されているLINEアカウントはありません。', ephemeral: true });
          return;
        }
        const lines = entries.map(([uuid, acc]) => {
          return `• UUID: \`${uuid}\` | 名前: ${acc.account.first_login_name || '未設定'} | 状態: ${acc.status} | 種別: ${acc.type} | グループ: ${acc.group_id || 'なし'}`;
        });
        await interaction.reply({
          content: `📋 **登録LINEアカウント一覧 (${entries.length}件)**:\n${lines.join('\n')}`,
          ephemeral: true,
        });
        return;
      }

      if (commandName === 'logout_line') {
        const role = await this.permissions.getUserRole(user.id);
        if (role !== 'admin') {
          await interaction.reply({ content: '管理者権限がありません。', ephemeral: true });
          return;
        }
        const targetUuid = interaction.options.getString('uuid', true);
        const accounts = await this.store.loadAccounts();
        if (!accounts[targetUuid]) {
          await interaction.reply({ content: `指定されたUUID (\`${targetUuid}\`) のアカウントは見つかりませんでした。`, ephemeral: true });
          return;
        }
        accounts[targetUuid].status = 'sleep';
        await this.store.saveAccounts(accounts);
        await interaction.reply({ content: `アカウント \`${targetUuid}\` をログアウト（スリープ）状態に設定しました。`, ephemeral: true });
        return;
      }

      if (commandName === 'create_group_id') {
        const canExec = await this.permissions.canExecute(user.id, guildId || undefined);
        if (!canExec) {
          await interaction.reply({ content: 'このコマンドを実行する権限がありません。', ephemeral: true });
          return;
        }
        const groupId = interaction.options.getString('group_id', true);
        const name = interaction.options.getString('name', true);
        const obMid = interaction.options.getString('ob_mid') || '';

        const groups = await this.store.loadGroups();
        groups[groupId] = {
          name,
          create_time: new Date().toISOString(),
          ob_mid: obMid,
          bot_status: {},
        };
        await this.store.saveGroups(groups);
        await interaction.reply({ content: `グループ「${name}」 (ID: \`${groupId}\`) を登録しました。`, ephemeral: true });
        return;
      }

      if (commandName === 'change_group') {
        const canExec = await this.permissions.canExecute(user.id, guildId || undefined);
        if (!canExec) {
          await interaction.reply({ content: 'このコマンドを実行する権限がありません。', ephemeral: true });
          return;
        }
        const targetUuid = interaction.options.getString('uuid', true);
        const newGroupId = interaction.options.getString('group_id', true);

        const accounts = await this.store.loadAccounts();
        if (!accounts[targetUuid]) {
          await interaction.reply({ content: `指定されたUUID (\`${targetUuid}\`) のアカウントは見つかりませんでした。`, ephemeral: true });
          return;
        }
        accounts[targetUuid].group_id = newGroupId;
        await this.store.saveAccounts(accounts);
        await interaction.reply({ content: `アカウント \`${targetUuid}\` の所属グループを \`${newGroupId}\` に変更しました。`, ephemeral: true });
        return;
      }

      if (commandName === 'del_group_id') {
        const role = await this.permissions.getUserRole(user.id);
        if (role !== 'admin') {
          await interaction.reply({ content: '管理者権限がありません。', ephemeral: true });
          return;
        }
        const groupId = interaction.options.getString('group_id', true);
        const groups = await this.store.loadGroups();
        if (!groups[groupId]) {
          await interaction.reply({ content: `指定されたグループID (\`${groupId}\`) は登録されていません。`, ephemeral: true });
          return;
        }
        delete groups[groupId];
        await this.store.saveGroups(groups);
        await interaction.reply({ content: `グループID \`${groupId}\` の登録を削除しました。`, ephemeral: true });
        return;
      }

      if (commandName === 'create_line') {
        const canExec = await this.permissions.canExecute(user.id, guildId || undefined);
        if (!canExec) {
          await interaction.reply({ content: 'このコマンドを実行する権限がありません。', ephemeral: true });
          return;
        }
        const config = await this.store.loadConfig();
        if (!config.fourSimApiKey) {
          await interaction.reply({ content: '4sim.net APIキーが未設定です。先に /set_4sim_api_key で設定してください。', ephemeral: true });
          return;
        }
        const country = interaction.options.getString('country') || 'thailand';
        const fourSim = new FourSimClient(config.fourSimApiKey);
        try {
          const order = await fourSim.orderNumber('line', country);
          await interaction.reply({
            content: `📱 4sim.net で電話番号を発行しました。\n• 注文ID: \`${order.id}\`\n• 電話番号: \`${order.phone}\`\n• 状態: ${order.status}`,
            ephemeral: true,
          });
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          await interaction.reply({
            content: `電話番号の発行に失敗しました: ${errorMessage}`,
            ephemeral: true,
          });
        }
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
