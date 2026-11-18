export interface FourSimOrder {
  id: number;
  phone: string;
  service: string;
  status: string;
}

export interface FourSimSmsResult {
  code: string | null;
  status: string;
}

export class FourSimClient {
  private baseUrl = 'https://4sim.net/api';

  constructor(private apiKey: string, baseUrl?: string) {
    if (baseUrl) {
      this.baseUrl = baseUrl;
    }
  }

  private async request<T>(endpoint: string, params: Record<string, string | number> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    url.searchParams.set('api_key', this.apiKey);
    for (const [key, val] of Object.entries(params)) {
      url.searchParams.set(key, String(val));
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`4sim API error: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  }

  async getBalance(): Promise<number> {
    const data = await this.request<{ balance?: number; error?: string }>('/user/balance');
    if (typeof data.balance === 'number') {
      return data.balance;
    }
    throw new Error(data.error || 'Failed to get balance');
  }

  async orderNumber(service = 'line', country = 'thailand'): Promise<FourSimOrder> {
    const data = await this.request<{ id?: number; number?: string; error?: string }>('/order/create', {
      service,
      country,
    });
    if (data.id && data.number) {
      return { id: data.id, phone: data.number, service, status: 'PENDING' };
    }
    throw new Error(data.error || 'Failed to order phone number');
  }

  async checkSms(orderId: number): Promise<FourSimSmsResult> {
    const data = await this.request<{ sms?: string | null; status?: string; error?: string }>('/order/check', {
      order_id: orderId,
    });
    return {
      code: data.sms || null,
      status: data.status || (data.sms ? 'RECEIVED' : 'WAITING'),
    };
  }

  async finishOrder(orderId: number): Promise<boolean> {
    const data = await this.request<{ success?: boolean; error?: string }>('/order/finish', {
      order_id: orderId,
    });
    return !!data.success;
  }

  async cancelOrder(orderId: number): Promise<boolean> {
    const data = await this.request<{ success?: boolean; error?: string }>('/order/cancel', {
      order_id: orderId,
    });
    return !!data.success;
  }
}
