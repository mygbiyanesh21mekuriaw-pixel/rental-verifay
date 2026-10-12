import { apiUrl } from './apiUrl';

describe('apiUrl', () => {
  const originalApiUrl = process.env.REACT_APP_API_URL;

  afterEach(() => {
    if (originalApiUrl === undefined) {
      delete process.env.REACT_APP_API_URL;
    } else {
      process.env.REACT_APP_API_URL = originalApiUrl;
    }
  });

  test.each([
    ['https://api.example.test:5000', '/api/admin/system-settings', 'https://api.example.test:5000/api/admin/system-settings'],
    ['https://api.example.test:5000/api/', '/api/admin/system-settings', 'https://api.example.test:5000/api/admin/system-settings'],
    ['', '/api/admin/system-settings', '/api/admin/system-settings'],
  ])('builds the endpoint for API base %s', (base, path, expected) => {
    process.env.REACT_APP_API_URL = base;
    expect(apiUrl(path)).toBe(expected);
  });
});
