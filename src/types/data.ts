export type LineAccountStatus = 'active' | 'sleep' | 'ban';
export type LineAccountType = 'self' | 'bot';

export interface LineAccountInfo {
  token: string;
  ip: string;
  logincount: number;
  last_login_time: string;
  first_login_name: string;
}

export interface LineAccountData {
  mid: string;
  account: LineAccountInfo;
  group_id: string;
  status: LineAccountStatus;
  type: LineAccountType;
}

export type LineAccountMap = Record<string, LineAccountData>;

export type LineBotStatus = 'active' | 'None';

export interface LineGroupBotEntry {
  status: LineBotStatus;
  mid: string;
}

export interface LineGroupData {
  name: string;
  create_time: string;
  ob_mid: string;
  bot_status: Record<string, LineGroupBotEntry>;
}

export type LineGroupMap = Record<string, LineGroupData>;
