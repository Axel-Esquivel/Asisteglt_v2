import { CommonErrorCode, ServiceStatus } from '../index';

describe('contratos compartidos', () => {
  it('expone estados y códigos estables', () => {
    expect(Object.values(ServiceStatus)).toEqual(['UP', 'DEGRADED', 'DOWN']);
    expect(CommonErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
  });
});
