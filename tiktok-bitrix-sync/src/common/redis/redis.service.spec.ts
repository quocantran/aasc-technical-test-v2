import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisService } from './redis.service';

jest.mock('ioredis', () => {
  const MockRedis = jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    eval: jest.fn(),
    quit: jest.fn().mockResolvedValue('OK'),
    disconnect: jest.fn(),
  }));
  return {
    __esModule: true,
    default: MockRedis,
    Redis: MockRedis,
  };
});


describe('RedisService', () => {
  let service: RedisService;
  let mockConfigService: any;
  let mockLogger: any;
  let clientMock: any;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'redis.host') return 'localhost';
        if (key === 'redis.port') return 6379;
        if (key === 'redis.password') return 'secret';
        if (key === 'redis.db') return 0;
        return undefined;
      }),
    };

    mockLogger = {
      warn: jest.fn(),
      error: jest.fn(),
      log: jest.fn(),
      debug: jest.fn(),
    };

    service = new RedisService(mockConfigService as unknown as ConfigService, mockLogger as any);
    clientMock = service.getClient();
  });

  it('should return client instance', () => {
    expect(service.getClient()).toBeDefined();
  });

  describe('get', () => {
    it('should return value from redis', async () => {
      clientMock.get.mockResolvedValueOnce('cached-val');
      const result = await service.get('my-key');
      expect(result).toBe('cached-val');
      expect(clientMock.get).toHaveBeenCalledWith('my-key');
    });

    it('should catch error and return null', async () => {
      clientMock.get.mockRejectedValueOnce(new Error('Redis connection lost'));
      const result = await service.get('err-key');
      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('set', () => {
    it('should set key without ttl', async () => {
      clientMock.set.mockResolvedValueOnce('OK');
      await service.set('my-key', 'my-val');
      expect(clientMock.set).toHaveBeenCalledWith('my-key', 'my-val');
    });

    it('should set key with EX ttl when provided', async () => {
      clientMock.set.mockResolvedValueOnce('OK');
      await service.set('my-key', 'my-val', 60);
      expect(clientMock.set).toHaveBeenCalledWith('my-key', 'my-val', 'EX', 60);
    });

    it('should catch error and log warning', async () => {
      clientMock.set.mockRejectedValueOnce(new Error('Set failed'));
      await expect(service.set('err-key', 'val')).resolves.toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('setNxWithTtl', () => {
    it('should return true when key was set (OK)', async () => {
      clientMock.set.mockResolvedValueOnce('OK');
      const res = await service.setNxWithTtl('lock-key', 'val', 30);
      expect(res).toBe(true);
      expect(clientMock.set).toHaveBeenCalledWith('lock-key', 'val', 'EX', 30, 'NX');
    });

    it('should return false when key was already locked', async () => {
      clientMock.set.mockResolvedValueOnce(null);
      const res = await service.setNxWithTtl('lock-key', 'val', 30);
      expect(res).toBe(false);
    });

    it('should return false on error', async () => {
      clientMock.set.mockRejectedValueOnce(new Error('Timeout'));
      const res = await service.setNxWithTtl('err-key', 'val', 30);
      expect(res).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('del', () => {
    it('should delete key', async () => {
      clientMock.del.mockResolvedValueOnce(1);
      await service.del('del-key');
      expect(clientMock.del).toHaveBeenCalledWith('del-key');
    });

    it('should catch error on del failure', async () => {
      clientMock.del.mockRejectedValueOnce(new Error('Del error'));
      await expect(service.del('err-key')).resolves.toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('incrWithTtl', () => {
    it('should execute lua script and return incremented count', async () => {
      clientMock.eval.mockResolvedValueOnce(2);
      const res = await service.incrWithTtl('rate:ip', 60);
      expect(res).toBe(2);
      expect(clientMock.eval).toHaveBeenCalledWith(expect.any(String), 1, 'rate:ip', 60);
    });

    it('should catch error and fallback to 1', async () => {
      clientMock.eval.mockRejectedValueOnce(new Error('Script error'));
      const res = await service.incrWithTtl('rate:err', 60);
      expect(res).toBe(1);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('acquireLock and releaseLock', () => {
    it('acquireLock returns true on OK', async () => {
      clientMock.set.mockResolvedValueOnce('OK');
      const acquired = await service.acquireLock('lock:test', 'uuid-123', 5000);
      expect(acquired).toBe(true);
      expect(clientMock.set).toHaveBeenCalledWith('lock:test', 'uuid-123', 'PX', 5000, 'NX');
    });

    it('acquireLock returns false when already held', async () => {
      clientMock.set.mockResolvedValueOnce(null);
      const acquired = await service.acquireLock('lock:test', 'uuid-123', 5000);
      expect(acquired).toBe(false);
    });

    it('acquireLock falls back to true on Redis error', async () => {
      clientMock.set.mockRejectedValueOnce(new Error('Redis down'));
      const acquired = await service.acquireLock('lock:test', 'uuid-123', 5000);
      expect(acquired).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('releaseLock returns true when lua returns 1', async () => {
      clientMock.eval.mockResolvedValueOnce(1);
      const released = await service.releaseLock('lock:test', 'uuid-123');
      expect(released).toBe(true);
      expect(clientMock.eval).toHaveBeenCalledWith(expect.any(String), 1, 'lock:test', 'uuid-123');
    });

    it('releaseLock returns false when owner does not match (returns 0)', async () => {
      clientMock.eval.mockResolvedValueOnce(0);
      const released = await service.releaseLock('lock:test', 'wrong-uuid');
      expect(released).toBe(false);
    });

    it('releaseLock returns false on error', async () => {
      clientMock.eval.mockRejectedValueOnce(new Error('Eval failed'));
      const released = await service.releaseLock('lock:test', 'uuid-123');
      expect(released).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('onModuleDestroy', () => {
    it('should call quit on module destroy', async () => {
      await service.onModuleDestroy();
      expect(clientMock.quit).toHaveBeenCalled();
    });

    it('should fallback to disconnect if quit throws', async () => {
      clientMock.quit.mockRejectedValueOnce(new Error('Quit error'));
      await service.onModuleDestroy();
      expect(clientMock.disconnect).toHaveBeenCalled();
    });
  });

  describe('retryStrategy and connection events', () => {
    it('should trigger retryStrategy calculation and error listener', () => {
      const RedisConstructor = Redis as unknown as jest.Mock;
      const passedOpts = RedisConstructor.mock.calls[0][0];
      expect(passedOpts.retryStrategy(1)).toBe(100);
      expect(passedOpts.retryStrategy(50)).toBe(3000);

      const onCall = clientMock.on.mock.calls.find((c: any) => c[0] === 'error');
      if (onCall && typeof onCall[1] === 'function') {
        onCall[1](new Error('Simulated event error'));
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Simulated event error'),
          'RedisService',
        );
      }
    });

    it('should handle connect rejection and default options when config is empty', async () => {
      const RedisConstructor = Redis as unknown as jest.Mock;
      const mockWarn = jest.fn();
      RedisConstructor.mockImplementationOnce(() => ({
        on: jest.fn(),
        connect: jest.fn().mockRejectedValue(new Error('Connect failed')),
      }));

      const customLogger = { warn: mockWarn, error: jest.fn(), log: jest.fn(), debug: jest.fn() };
      const emptyConfig = { get: jest.fn().mockReturnValue(undefined) } as any;

      const fallbackService = new RedisService(emptyConfig, customLogger as any);
      expect(fallbackService).toBeDefined();

      // Wait a microtask tick for .catch to execute
      await new Promise((resolve) => setImmediate(resolve));
      expect(mockWarn).toHaveBeenCalledWith(
        expect.stringContaining('Initial Redis connection failed: Connect failed'),
        'RedisService',
      );
    });

    it('should instantiate with default AppLogger when logger is not provided', () => {
      const fallbackService = new RedisService(mockConfigService as any);
      expect(fallbackService).toBeDefined();
    });

    it('should call set without EX when ttlSeconds is <= 0', async () => {
      clientMock.set.mockResolvedValueOnce('OK');
      await service.set('non-ttl-key', 'val', 0);
      expect(clientMock.set).toHaveBeenCalledWith('non-ttl-key', 'val');

      clientMock.set.mockResolvedValueOnce('OK');
      await service.set('non-ttl-key-2', 'val', -10);
      expect(clientMock.set).toHaveBeenCalledWith('non-ttl-key-2', 'val');
    });
  });
});
