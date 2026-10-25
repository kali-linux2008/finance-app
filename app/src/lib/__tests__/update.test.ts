import { installedVersion, isNewer, versionLabel } from '../update';

const build = (versionCode: number) => ({ versionCode, version: '0.1.0', built: null, size: 1, sha256: null });

describe('app-updates', () => {
  it('leest het eigen versienummer', () => {
    expect(installedVersion('29372410')).toBe(29372410);
    expect(installedVersion('1')).toBe(1);
    expect(installedVersion(null)).toBeNull();
    expect(installedVersion('abc')).toBeNull();
  });

  it('alleen een hoger nummer is een update', () => {
    expect(isNewer(build(200), 100)).toBe(true);
    expect(isNewer(build(100), 100)).toBe(false);
    expect(isNewer(build(50), 100)).toBe(false);
    expect(isNewer(null, 100)).toBe(false);
    expect(isNewer(build(200), null)).toBe(false);
    expect(isNewer(build(29372410), 1)).toBe(true); // eerste eigen bouw had versie 1
  });

  it('toont de bouwdatum', () => {
    const code = Math.floor(new Date(2026, 9, 25, 14, 30).getTime() / 60_000);
    expect(versionLabel(code)).toBe('25-10-2026 14:30');
    expect(versionLabel(1)).toBe('eerste versie');
    expect(versionLabel(null)).toBe('onbekend');
  });
});
