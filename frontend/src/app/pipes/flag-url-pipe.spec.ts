import { FlagUrlPipe } from './flag-url-pipe';

describe('FlagUrlPipe', () => {
  it('points at the lowercase flag file', () => {
    expect(new FlagUrlPipe().transform('PT')).toBe('flags/pt.svg');
  });
});
