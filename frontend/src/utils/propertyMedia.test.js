import { getPropertyImages } from './propertyMedia';

describe('getPropertyImages', () => {
  test.each([
    [{ images: ['house.jpg'] }, ['house.jpg']],
    [{ propertyImages: ['legacy-house.jpg'] }, ['legacy-house.jpg']],
    [{ image: 'single-house.jpg' }, ['single-house.jpg']],
    [{ images: [], propertyImages: ['legacy-house.jpg'] }, ['legacy-house.jpg']],
    [{ images: [{ secure_url: 'https://cdn.example/house.jpg' }] }, [{ secure_url: 'https://cdn.example/house.jpg' }]],
  ])('reads the supported property image fields', (property, expected) => {
    expect(getPropertyImages(property)).toEqual(expected);
  });
});
