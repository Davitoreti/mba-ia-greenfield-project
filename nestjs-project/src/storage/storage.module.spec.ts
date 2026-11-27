import { Test } from '@nestjs/testing';
import { StorageModule } from './storage.module';
import { STORAGE, type StoragePort } from './storage.port';

describe('StorageModule', () => {
  it('resolves its exported storage port with the configured real SDK client', async () => {
    const module = await Test.createTestingModule({
      imports: [StorageModule],
    }).compile();
    try {
      expect(module.get<StoragePort>(STORAGE)).toBeDefined();
    } finally {
      await module.close();
    }
  });
});
