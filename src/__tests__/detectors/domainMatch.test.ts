import { describe, it, expect } from 'vitest';
import { matchKnownDomain } from '../../detectors/domainMatch';

const registry = {
  'x.com': 'X',
  'box.com': 'Box',
  'max.com': 'Max',
  'amazon.com': 'Amazon',
};

describe('matchKnownDomain', () => {
  it('returns null for empty domain', () => {
    expect(matchKnownDomain('', registry)).toBeNull();
  });
  it('matches an exact domain', () => {
    expect(matchKnownDomain('x.com', registry)).toBe('X');
  });
  it('matches a subdomain via suffix', () => {
    expect(matchKnownDomain('mail.amazon.com', registry)).toBe('Amazon');
  });
  it('does NOT match unrelated domains that merely contain a base name', () => {
    expect(matchKnownDomain('fedex.com', registry)).toBeNull();
    expect(matchKnownDomain('dropbox.com', registry)).toBeNull();
    expect(matchKnownDomain('mailmax.com', registry)).toBeNull();
    expect(matchKnownDomain('amazonaws.com', registry)).toBeNull();
  });
  it('does not treat the registry domain as a substring needle', () => {
    expect(matchKnownDomain('notamazon.com', registry)).toBeNull();
  });
});
