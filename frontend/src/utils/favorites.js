import axios from 'axios';

export const getFavoriteIds = (userId) => {
  try {
    return new Set(JSON.parse(localStorage.getItem(`favorites:${userId}`) || '[]').map(String));
  } catch (error) {
    return new Set();
  }
};

export const fetchFavoriteIds = async (
  token = localStorage.getItem('token'),
  userId = JSON.parse(localStorage.getItem('user') || '{}')?.id
) => {
  if (!token) {
    throw new Error('Please sign in to load your favorites.');
  }

  try {
    const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/favorites`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const favoriteIds = new Set((response.data || []).map(property => String(property._id)));
    if (userId) localStorage.setItem(`favorites:${userId}`, JSON.stringify([...favoriteIds]));
    return favoriteIds;
  } catch (error) {
    console.warn('Unable to load server favorites:', error);
    throw error;
  }
};

export const toggleFavorite = async (userId, propertyId, token = null) => {
  const normalizedId = String(propertyId);

  try {
    if (!token) {
      token = localStorage.getItem('token');
    }
    if (!token) {
      throw new Error('Please sign in to save favorites.');
    }

    if (token) {
      const response = await axios.post(
        `${process.env.REACT_APP_API_URL}/api/favorites/toggle`,
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
    throw error;
  }
};
