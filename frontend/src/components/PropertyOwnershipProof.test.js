import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import PropertyOwnershipProof from './PropertyOwnershipProof';

describe('PropertyOwnershipProof', () => {
  const originalFetch = global.fetch;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    localStorage.setItem('token', 'owner-session-token');
    URL.createObjectURL = jest.fn(() => 'blob:private-proof');
    URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    localStorage.clear();
  });

  test('fetches proof bytes with the authenticated session instead of loading a public URL', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['private proof'], { type: 'image/png' }),
      headers: { get: () => 'image/png' },
    });

    render(
      <PropertyOwnershipProof
        propertyId="property-123"
        hasProof
        title="Riverside home"
      />,
    );

    expect(await screen.findByRole('img', {
      name: 'Proof of ownership for Riverside home',
    })).toHaveAttribute('src', 'blob:private-proof');
    expect(global.fetch).toHaveBeenCalledWith(
      `${process.env.REACT_APP_API_URL || ''}/api/properties/property-123/ownership-proof`,
      expect.objectContaining({
        headers: { Authorization: 'Bearer owner-session-token' },
      }),
    );
  });

  test('does not request or reveal a proof when the API denies access', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });

    render(
      <PropertyOwnershipProof propertyId="property-123" hasProof title="Private home" />,
    );

    expect(await screen.findByText(/unavailable or requires secure migration/i)).toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  test('does not fetch proof bytes when no authorized proof is available', async () => {
    global.fetch = jest.fn();

    const { container } = render(
      <PropertyOwnershipProof propertyId="property-123" title="Private home" />,
    );

    await waitFor(() => expect(global.fetch).not.toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
