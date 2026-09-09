const isApprovedProperty = (property) => Boolean(
  property &&
  property.isVerified === true &&
  property.verificationStatus === 'approved'
);

module.exports = {
  isApprovedProperty,
};
