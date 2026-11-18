import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FourSimClient } from '../../src/services/fourSimClient.js';

describe('FourSimClient', () => {
  const apiKey = 'test_api_key_123';
  let client: FourSimClient;

  beforeEach(() => {
    client = new FourSimClient(apiKey, 'https://mock.4sim.net/api');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches balance successfully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ balance: 25.5 }),
    } as Response);

    const balance = await client.getBalance();
    expect(balance).toBe(25.5);
  });

  it('throws error when balance fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: 'INVALID_API_KEY' }),
    } as Response);

    await expect(client.getBalance()).rejects.toThrow('INVALID_API_KEY');
  });

  it('orders phone number for LINE Thailand', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 98765, number: '+66812345678' }),
    } as Response);

    const order = await client.orderNumber('line', 'thailand');
    expect(order.id).toBe(98765);
    expect(order.phone).toBe('+66812345678');
    expect(order.service).toBe('line');
  });

  it('checks sms code received', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sms: '123456', status: 'RECEIVED' }),
    } as Response);

    const res = await client.checkSms(98765);
    expect(res.code).toBe('123456');
    expect(res.status).toBe('RECEIVED');
  });

  it('finishes and cancels order successfully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    const finished = await client.finishOrder(98765);
    expect(finished).toBe(true);

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    const cancelled = await client.cancelOrder(98765);
    expect(cancelled).toBe(true);
  });
});
