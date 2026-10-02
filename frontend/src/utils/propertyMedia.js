export const getPropertyImages = (property) => {
  const imageFields = [
    property?.images,
    property?.propertyImages,
    property?.image,
  ];

  return imageFields
    .flatMap((field) => (Array.isArray(field) ? field : [field]))
    .filter((image) => {
      if (typeof image === 'string') return Boolean(image.trim());
      return Boolean(image && (image.secure_url || image.url || image.path));
    });
};
