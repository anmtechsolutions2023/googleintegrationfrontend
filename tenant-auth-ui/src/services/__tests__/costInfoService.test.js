import costInfoService, { idOf } from '../costInfoService';
import { create } from '../crudService';

jest.mock('../crudService', () => ({
  create: jest.fn(),
  remove: jest.fn(),
  getReferenceData: jest.fn(),
}));
jest.mock('../../api/api', () => ({ __esModule: true, default: { get: jest.fn() } }));

afterEach(() => jest.clearAllMocks());

// The created record is `{ id, ...data }`; several controllers call
// createdResponse(res, record, message) with the args SWAPPED, so the record
// arrives under `message`. The service must find it either way.
test('createTaxGroup reads the record when it arrives under `message` (swapped envelope)', async () => {
  create.mockResolvedValue({
    success: true,
    message: { id: 'g1', Name: 'GST 18%', Active: true },
    data: 'Tax group created successfully',
  });
  const rec = await costInfoService.createTaxGroup('GST 18%');
  expect(idOf(rec)).toBe('g1');
  expect(rec.Name).toBe('GST 18%');
});

test('createTaxGroup reads the record when it arrives under `data` (correct envelope)', async () => {
  create.mockResolvedValue({ success: true, message: 'ok', data: { Id: 'g2', Name: 'GST 5%' } });
  const rec = await costInfoService.createTaxGroup('GST 5%');
  expect(idOf(rec)).toBe('g2');
});

test('createCostInfo coerces the amount and returns the created id', async () => {
  create.mockResolvedValue({ message: { id: 'ci-1' }, data: 'created' });
  const rec = await costInfoService.createCostInfo({ amount: '250', taxGroupId: 'g1', isTaxIncluded: true });
  expect(create).toHaveBeenCalledWith('costInfos', { Amount: 250, TaxGroupId: 'g1', IsTaxIncluded: true, Active: true });
  expect(idOf(rec)).toBe('ci-1');
});
