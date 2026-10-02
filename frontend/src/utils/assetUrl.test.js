import { isPdfAsset, resolveAssetUrl } from './assetUrl';

describe('resolveAssetUrl', () => {
  const originalApiUrl = process.env.REACT_APP_API_URL;

  beforeEach(() => {
    process.env.REACT_APP_API_URL = 'https://api.example.test/api';
  });

  afterAll(() => {
    if (originalApiUrl === undefined) {
      delete process.env.REACT_APP_API_URL;
    } else {
      process.env.REACT_APP_API_URL = originalApiUrl;
    }
  });

  test('resolves stored upload paths against the API host', () => {
    expect(resolveAssetUrl('/uploads/house.jpg')).toBe('https://api.example.test/uploads/house.jpg');
    expect(resolveAssetUrl('house.jpg')).toBe('https://api.example.test/uploads/house.jpg');
  });

  test('preserves hosted image URLs and remaps local uploads to the API host', () => {
    expect(resolveAssetUrl('https://images.example.test/house.jpg')).toBe('https://images.example.test/house.jpg');
    expect(resolveAssetUrl('http://localhost:5000/uploads/house.jpg')).toBe('https://api.example.test/uploads/house.jpg');
  });

  test('upgrades legacy HTTP upload URLs from the API host', () => {
    expect(resolveAssetUrl('http://api.example.test/uploads/house.jpg')).toBe('https://api.example.test/uploads/house.jpg');
  });

  test('recognizes PDF proofs regardless of URL query parameters', () => {
    expect(isPdfAsset('https://files.example.test/proof.pdf?download=1')).toBe(true);
    expect(isPdfAsset('https://images.example.test/proof.jpg')).toBe(false);
  });
});
