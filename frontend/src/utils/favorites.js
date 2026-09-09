import axios from 'axios';

export const getFavoriteIds = (userId) => {
  try {
    return new Set(JSON.parse(localStorage.getItem(`favorites:${userId}`) || '[]').map(String));
  } catch (error) {
    return new Set();
  }
};

export const fetchFavoriteIds = async (token = localStorage.getItem('token')) => {
  if (!token) {
    return new Set();
  }

  try {
    const response = await axios.get('http://localhost:5000/api/favorites', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const favoriteIds = new Set((response.data || []).map(property => String(property._id)));
    if (response.data && response.data.length > 0) {
      localStorage.setItem(`favorites:${localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')).id : 'guest'}`, JSON.stringify([...favoriteIds]));
    }
    return favoriteIds;
  } catch (error) {
    console.warn('Unable to load server favorites:', error);
    return getFavoriteIds(JSON.parse(localStorage.getItem('user') || '{}')?.id || 'guest');
  }
};

export const toggleFavorite = async (userId, propertyId, token = null) => {
  const normalizedId = String(propertyId);

  try {
    if (!token) {
      token = localStorage.getItem('token');
    }

    if (token) {
      const response = await axios.post(
        'http://localhost:5000/api/favorites/toggle',
        { propertyId: normalizedId },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const favoriteIds = getFavoriteIds(userId);
      if (response.data.isFavorite) {
        favoriteIds.add(normalizedId);
      } else {
        favoriteIds.delete(normalizedId);
      }
      localStorage.setItem(`favorites:${userId}`, JSON.stringify([...favoriteIds]));

      window.dispatchEvent(new CustomEvent('favorites-changed', {
        detail: { propertyId: normalizedId, isFavorite: response.data.isFavorite },
      }));

      return response.data.isFavorite;
    }
  } catch (error) {
    console.warn('Failed to sync favorite with backend, using local storage:', error);
  }

  const favoriteIds = getFavoriteIds(userId);
  const isFavorite = favoriteIds.has(normalizedId);

  if (isFavorite) {
    favoriteIds.delete(normalizedId);
  } else {
    favoriteIds.add(normalizedId);
  }

  localStorage.setItem(`favorites:${userId}`, JSON.stringify([...favoriteIds]));
  window.dispatchEvent(new CustomEvent('favorites-changed', {
    detail: { propertyId: normalizedId, isFavorite: !isFavorite },
  }));

  return !isFavorite;
};
