import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ProfileAvatar from './ProfileAvatar';

describe('ProfileAvatar', () => {
  test('shows the profile photo when one is available', () => {
    render(
      <ProfileAvatar
        user={{ name: 'Dejen', profilePhoto: '/uploads/dejen.jpg' }}
      />
    );

    const avatar = screen.getByRole('img', { name: 'Dejen profile' });
    const photo = avatar.querySelector('img');

    expect(photo).toHaveAttribute('src', '/uploads/dejen.jpg');
    expect(avatar).toHaveTextContent('D');
  });

  test('keeps the initial visible if the profile photo fails to load', () => {
    render(
      <ProfileAvatar
        user={{ name: 'Dejen', profilePhoto: '/uploads/missing.jpg' }}
      />
    );

    const avatar = screen.getByRole('img', { name: 'Dejen profile' });
    const photo = avatar.querySelector('img');

    fireEvent.error(photo);

    expect(avatar).toHaveTextContent('D');
    expect(photo).toHaveStyle({ display: 'none' });
  });

  test('shows a fallback initial when no profile photo is set', () => {
    render(<ProfileAvatar user={{ name: 'Dejen' }} />);

    expect(screen.getByRole('img', { name: 'Dejen profile' })).toHaveTextContent('D');
  });
});
