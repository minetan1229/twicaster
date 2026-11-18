import fs from 'node:fs/promises';
import path from 'node:path';
import type { LineAccountMap, LineGroupMap, SystemConfig } from '../types/data.js';

export class DataStore {
  private baseDir: string;
  private liPath: string;
  private grPath: string;
  private configPath: string;

  constructor(baseDir: string = './data') {
    this.baseDir = path.resolve(baseDir);
    this.liPath = path.join(this.baseDir, 'li.json');
    this.grPath = path.join(this.baseDir, 'gr.json');
    this.configPath = path.join(this.baseDir, 'config.json');
  }

  async init(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
    try {
      await fs.access(this.liPath);
    } catch {
      await this.saveAccounts({});
    }
    try {
      await fs.access(this.grPath);
    } catch {
      await this.saveGroups({});
    }
    try {
      await fs.access(this.configPath);
    } catch {
      await this.saveConfig({ adminUserIds: [], servers: {} });
    }
  }

  private async atomicWrite(filePath: string, data: unknown): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    const jsonStr = JSON.stringify(data, null, 2);
    await fs.writeFile(tempPath, jsonStr, 'utf-8');
    await fs.rename(tempPath, filePath);
  }

  async loadAccounts(): Promise<LineAccountMap> {
    try {
      const content = await fs.readFile(this.liPath, 'utf-8');
      return JSON.parse(content) as LineAccountMap;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return {};
      }
      throw err;
    }
  }

  async saveAccounts(accounts: LineAccountMap): Promise<void> {
    await this.atomicWrite(this.liPath, accounts);
  }

  async loadGroups(): Promise<LineGroupMap> {
    try {
      const content = await fs.readFile(this.grPath, 'utf-8');
      return JSON.parse(content) as LineGroupMap;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return {};
      }
      throw err;
    }
  }

  async saveGroups(groups: LineGroupMap): Promise<void> {
    await this.atomicWrite(this.grPath, groups);
  }

  async loadConfig(): Promise<SystemConfig> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      return JSON.parse(content) as SystemConfig;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { adminUserIds: [], servers: {} };
      }
      throw err;
    }
  }

  async saveConfig(config: SystemConfig): Promise<void> {
    await this.atomicWrite(this.configPath, config);
  }
}
