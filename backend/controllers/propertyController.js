const mongoose = require('mongoose');
const Property = require('../models/Property');
const User = require('../models/User');
const Notification = require('../models/Notification');
const VerificationRequest = require('../models/VerificationRequest');
const RentalRequest = require('../models/RentalRequest');
const fs = require('fs');
const path = require('path');
const { createSystemLog } = require('./systemLogController');
const {
  hasCloudinaryCredentials,
  uploadBuffer,
  uploadPrivateProof,
  saveLocalUpload,
  uploadFilesToUrls,
} = require('../utils/uploadMedia');
const cloudinary = require('../config/cloudinary');
const { downloadPrivateProof, validateCloudinaryAsset } = require('../services/privateOwnershipProof');
const {
  normalizeAdminAreaObject,
  propertyMatchesAdminAreas,
  buildAdminAreaQuery,
} = require('../utils/adminArea');

const canViewVerificationDocument = (user, property) => {
  if (!user) return false;

  const landlordId = property.landlord?._id || property.landlord;
  if (user.role === 'landlord' && String(landlordId) === String(user.id)) return true;
  if (user.role !== 'admin') return false;
  if (user.adminType === 'platform') return true;

  const adminAreas = (user.adminAreas || []).map(normalizeAdminAreaObject).filter(Boolean);
  return adminAreas.length > 0 && propertyMatchesAdminAreas(property, adminAreas);
};

const propertyResponse = (property, user) => {
  const result = typeof property.toObject === 'function' ? property.toObject() : { ...property };
  const canViewProof = canViewVerificationDocument(user, property);
  result.hasVerificationDocument = Boolean(
    canViewProof && (property.verificationDocument || property.verificationDocumentAsset?.publicId),
  );
  delete result.verificationDocument;
  delete result.verificationDocumentAsset;
  return result;
};

const getCloudinaryAssetFromLegacyUrl = (documentUrl) => {
  if (typeof documentUrl !== 'string' || !documentUrl) return null;
  let url;
  try {
    url = new URL(documentUrl);
  } catch (error) {
    return null;
  }

  const cloudName = cloudinary.config().cloud_name;
  if (!cloudName || url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com') return null;
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] !== cloudName || !['image', 'raw'].includes(segments[1])) return null;

  const resourceType = segments[1];
  const deliveryType = segments[2];
  if (!['upload', 'private', 'authenticated'].includes(deliveryType)) return null;
  const assetPath = segments.slice(3);
  if (assetPath[0]?.startsWith('v') && /^v\d+$/.test(assetPath[0])) assetPath.shift();
  const filename = assetPath.pop();
  if (!filename) return null;
  const extensionIndex = filename.lastIndexOf('.');
  const format = extensionIndex > 0 ? filename.slice(extensionIndex + 1) : '';
  assetPath.push(extensionIndex > 0 ? filename.slice(0, extensionIndex) : filename);
  const publicId = assetPath.join('/');
  if (!/^[A-Za-z0-9_/-]+$/.test(publicId) || publicId.includes('..')) return null;
  return { publicId, resourceType, format, deliveryType };
};

const getOwnershipProof = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Property not found' });
    }
    const property = await Property.findById(req.params.id)
      .select('_id landlord region zone wereda city subCity verificationDocument verificationDocumentAsset');
    if (!property) return res.status(404).json({ message: 'Property not found' });
    if (!canViewVerificationDocument(req.user, property)) {
      return res.status(404).json({ message: 'Ownership proof not found' });
    }

    if (property.verificationDocumentAsset?.publicId) {
      const asset = property.verificationDocumentAsset.toObject
        ? property.verificationDocumentAsset.toObject()
        : property.verificationDocumentAsset;
      validateCloudinaryAsset(asset);
      const { buffer, contentType } = await downloadPrivateProof(asset);
      res.set({
        'Cache-Control': 'private, no-store',
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
      });
      return res.type(contentType).send(buffer);
    }

    const cloudinaryAsset = getCloudinaryAssetFromLegacyUrl(property.verificationDocument);
    if (cloudinaryAsset) {
      if (cloudinaryAsset.deliveryType !== 'authenticated') {
        return res.status(409).json({
          message: 'This existing ownership proof must be migrated to authenticated Cloudinary delivery before it can be viewed.',
          code: 'OWNERSHIP_PROOF_MIGRATION_REQUIRED',
        });
      }
      const { buffer, contentType } = await downloadPrivateProof(cloudinaryAsset);
      res.set({
        'Cache-Control': 'private, no-store',
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
      });
      return res.type(contentType).send(buffer);
    }

    if (typeof property.verificationDocument === 'string' && property.verificationDocument) {
      let localUrl;
      let decodedPath;
      try {
        localUrl = new URL(property.verificationDocument);
        decodedPath = decodeURIComponent(localUrl.pathname);
      } catch (error) {
        return res.status(404).json({ message: 'Ownership proof not found' });
      }
      const uploadsPrefix = '/uploads/';
      if (!decodedPath.startsWith(uploadsPrefix)) {
        return res.status(404).json({ message: 'Ownership proof not found' });
      }
      const filename = path.basename(decodedPath);
      if (!filename || filename !== decodedPath.slice(uploadsPrefix.length)) {
        return res.status(404).json({ message: 'Ownership proof not found' });
      }
      const uploadsDirectory = path.resolve(__dirname, '..', 'uploads');
      const localPath = path.resolve(uploadsDirectory, filename);
      if (!localPath.startsWith(`${uploadsDirectory}${path.sep}`)) {
        return res.status(404).json({ message: 'Ownership proof not found' });
      }
      const fileInfo = await fs.promises.lstat(localPath).catch((error) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (!fileInfo || !fileInfo.isFile()) {
        return res.status(404).json({ message: 'Ownership proof not found' });
      }
      if (fileInfo.size > 10 * 1024 * 1024) {
        return res.status(413).json({ message: 'Ownership proof exceeds the allowed file size' });
      }
      const buffer = await fs.promises.readFile(localPath);
      if (!buffer) return res.status(404).json({ message: 'Ownership proof not found' });
      res.set({
        'Cache-Control': 'private, no-store',
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
      });
      const contentTypeByExtension = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.pdf': 'application/pdf',
      };
      const contentType = contentTypeByExtension[path.extname(filename).toLowerCase()] || 'application/octet-stream';
      return res.type(contentType).send(buffer);
    }

    return res.status(404).json({ message: 'Ownership proof not found' });
  } catch (error) {
    console.error('Ownership proof delivery failed:', error.message);
    return res.status(error.statusCode || 503).json({
      message: error.statusCode ? error.message : 'Unable to securely retrieve ownership proof',
    });
  }
};

// አዲስ ንብረት መፍጠር (Landlord ብቻ)
const normalizeCoordinate = (value, fieldName) => {
  if (value === undefined || value === null || value === '') return null;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    throw new Error(`${fieldName} must be a valid number`);
  }
  return numericValue;
};

const addressFields = ['region', 'zone', 'wereda', 'city', 'subCity', 'kebele', 'houseNumber'];
const normalizeAddress = (body) => {
  const address = Object.fromEntries(addressFields.map(field => [field, String(body[field] || '').trim()]));
  const missingField = addressFields.find(field => !address[field]);
  if (missingField) {
    const labels = {
      region: 'Region',
      zone: 'Zone',
      wereda: 'Wereda',
      city: 'City',
      subCity: 'Sub-city',
      kebele: 'Kebele',
      houseNumber: 'House Number',
    };
    const error = new Error(`${labels[missingField]} is required`);
    error.statusCode = 400;
    throw error;
  }
  return {
    ...address,
    location: Object.values(address).join(', '),
  };
};

const createProperty = async (req, res) => {
  try {
    const { title, description, price, bedrooms, latitude, longitude } = req.body;
    const address = normalizeAddress(req.body);
    const landlord = await User.findOne({ _id: req.user.id, role: 'landlord' }).select('_id');

    if (!landlord) {
      return res.status(403).json({ message: 'Authenticated user is not a registered landlord' });
    }
    
    // የባለቤትነት ማስረጃ ፋይል መኖሩን ያረጋግጡ
    if (!req.files || !req.files.document) {
      return res.status(400).json({ message: 'Verification document is required' });
    }

    if (!req.files.images || req.files.images.length === 0) {
      return res.status(400).json({ message: 'At least one property image is required' });
    }

    // ምስሎችን ወደ Cloudinary ይላኩ
    const imageUrls = [];
    if (req.files.images) {
      for (const file of req.files.images) {
        if (hasCloudinaryCredentials) {
          const result = await uploadBuffer(file.buffer, 'image');
          imageUrls.push(result.secure_url);
        } else {
          imageUrls.push(saveLocalUpload(file, req));
        }
      }
    }

    // የባለቤትነት ማስረጃ ወደ Cloudinary ይላኩ
    const document = req.files.document[0];
    const privateDocumentAsset = hasCloudinaryCredentials
      ? await uploadPrivateProof(document.buffer)
      : null;
    const documentUrl = privateDocumentAsset ? '' : saveLocalUpload(document, req);

    const latitudeValue = normalizeCoordinate(latitude, 'Latitude');
    const longitudeValue = normalizeCoordinate(longitude, 'Longitude');

    if (latitudeValue !== null && (latitudeValue < -90 || latitudeValue > 90)) {
      return res.status(400).json({ message: 'Latitude must be between -90 and 90' });
    }

    if (longitudeValue !== null && (longitudeValue < -180 || longitudeValue > 180)) {
      return res.status(400).json({ message: 'Longitude must be between -180 and 180' });
    }

    // አዲስ ንብረት ይፍጠሩ
    const property = new Property({
      landlord: landlord._id,
      title,
      description,
      price,
      location: address.location,
      region: address.region,
      zone: address.zone,
      wereda: address.wereda,
      city: address.city,
      subCity: address.subCity,
      kebele: address.kebele,
      houseNumber: address.houseNumber,
      latitude: latitudeValue,
      longitude: longitudeValue,
      bedrooms,
      images: imageUrls,
      verificationDocument: documentUrl,
      verificationDocumentAsset: privateDocumentAsset || undefined,
      isVerified: false,
      verificationStatus: 'pending',
    });

    await property.save();

    await createSystemLog({
      user: req.user.id,
      role: req.user.role,
      action: 'PROPERTY_CREATED',
      description: `Landlord created property "${property.title}" and submitted it for verification.`,
      property: property._id,
      status: 'success',
      ipAddress: req.ip || '',
    });

    // የማረጋገጫ ጥያቄ ይፍጠሩ
    const verificationRequest = new VerificationRequest({
      property: property._id,
      landlord: landlord._id,
      documentUrl: documentUrl || '',
      documentAsset: privateDocumentAsset || undefined,
      status: 'pending',
    });

    await verificationRequest.save();

    await Notification.create({
      recipientRole: 'admin',
      property: property._id,
      propertyTitle: property.title,
      message: `New property submitted for verification: "${property.title}".`,
      type: 'pending',
      instructions: 'Review this property in the Admin Dashboard.',
      read: false,
    });

    res.status(201).json({
      message: 'Property created successfully. Awaiting verification.',
      property: propertyResponse(property, req.user),
    });
  } catch (error) {
    console.error('Property creation error:', error);
    res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Server error', error: error.message });
  }
};

// ሁሉንም ንብረቶች ማግኘት (የተረጋገጡትን ብቻ ለTenant)
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getAllProperties = async (req, res) => {
  try {
    const {
      verified,
      search,
      title,
      description,
      location,
      address,
      region,
      zone,
      wereda,
      city,
      subCity,
      kebele,
      houseNumber,
      price,
      minPrice,
      maxPrice,
      bedrooms,
      availability,
      sortPrice,
    } = req.query;

    const parseNumeric = (value, fieldName) => {
      if (value === undefined || value === null || value === '') return undefined;
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue) || numericValue < 0) {
        throw new Error(`${fieldName} must be a non-negative number`);
      }
      return numericValue;
    };

    let filter = {};
    const publicVerifiedFilter = {
      isVerified: true,
      verificationStatus: 'approved',
      availabilityStatus: { $in: ['available', null] },
    };

    if (req.user?.role === 'tenant') {
      const landlordUsers = await User.find({ role: 'landlord' }).select('_id').lean();
      filter = {
        ...publicVerifiedFilter,
        landlord: { $in: landlordUsers.map(user => user._id) },
        title: { $type: 'string', $ne: '' },
        description: { $type: 'string', $ne: '' },
        location: { $type: 'string', $ne: '' },
        price: { $type: 'number', $gt: 0 },
        bedrooms: { $type: 'number', $gte: 0 },
      };
    } else if (req.user?.role === 'landlord') {
      filter.landlord = req.user.id;
    } else if (req.user?.role === 'admin') {
      const admin = await User.findById(req.user.id).select('adminType adminAreas').lean();
      const isAreaAdmin = admin?.adminType === 'area'
        || (!admin?.adminType && (admin?.adminAreas || []).length > 0);
      if (isAreaAdmin) {
        const adminAreas = (admin.adminAreas || []).map(normalizeAdminAreaObject).filter(Boolean);
        if (adminAreas.length === 0) {
          filter = { _id: null };
        } else {
          filter = {
            ...filter,
            $and: [...(filter.$and || []), buildAdminAreaQuery(adminAreas)],
          };
        }
      } else {
        filter = {};
      }
    } else {
      filter = { ...publicVerifiedFilter };
    }

    const minPriceValue = parseNumeric(minPrice, 'Minimum price');
    const maxPriceValue = parseNumeric(maxPrice, 'Maximum price');
    const bedroomsValue = parseNumeric(bedrooms, 'Bedrooms');

    if (minPriceValue !== undefined && maxPriceValue !== undefined && minPriceValue > maxPriceValue) {
      return res.status(400).json({ message: 'Minimum price cannot be greater than maximum price' });
    }

    if (verified === 'true') {
      filter.isVerified = true;
      filter.verificationStatus = 'approved';
    }

    const fieldSearchConditions = [];

    const pushRegexFilter = (field, value) => {
      if (!value || !String(value).trim()) return;
      fieldSearchConditions.push({ [field]: { $regex: new RegExp(escapeRegex(String(value).trim()), 'i') } });
    };

    if (title) pushRegexFilter('title', title);
    if (description) pushRegexFilter('description', description);

    if (address) {
      const addressPattern = new RegExp(escapeRegex(String(address).trim()), 'i');
      fieldSearchConditions.push({
        $or: [
          { location: { $regex: addressPattern } },
          { region: { $regex: addressPattern } },
          { zone: { $regex: addressPattern } },
          { wereda: { $regex: addressPattern } },
          { city: { $regex: addressPattern } },
          { subCity: { $regex: addressPattern } },
          { kebele: { $regex: addressPattern } },
          { houseNumber: { $regex: addressPattern } },
        ],
      });
    }

    if (region) pushRegexFilter('region', region);
    if (zone) pushRegexFilter('zone', zone);
    if (wereda) pushRegexFilter('wereda', wereda);
    if (city) pushRegexFilter('city', city);
    if (subCity) pushRegexFilter('subCity', subCity);
    if (kebele) pushRegexFilter('kebele', kebele);
    if (houseNumber) pushRegexFilter('houseNumber', houseNumber);

    if (price) {
      const parsedPrice = Number(price);
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ message: 'Price must be a valid non-negative number' });
      }
      fieldSearchConditions.push({ price: { $eq: parsedPrice } });
    }

    if (location) pushRegexFilter('location', location);

    if (fieldSearchConditions.length > 0) {
      filter.$and = fieldSearchConditions;
    }

    if (search) {
      const sanitizedSearch = String(search).trim();
      if (sanitizedSearch) {
        const searchPattern = new RegExp(escapeRegex(sanitizedSearch), 'i');
        filter.$or = [
          { title: { $regex: searchPattern } },
          { description: { $regex: searchPattern } },
          { location: { $regex: searchPattern } },
          { region: { $regex: searchPattern } },
          { zone: { $regex: searchPattern } },
          { wereda: { $regex: searchPattern } },
          { city: { $regex: searchPattern } },
          { subCity: { $regex: searchPattern } },
          { kebele: { $regex: searchPattern } },
          { houseNumber: { $regex: searchPattern } },
          {
            $expr: {
              $regexMatch: {
                input: { $toString: '$price' },
                regex: searchPattern,
              },
            },
          },
        ];
      }
    }

    if (minPriceValue !== undefined || maxPriceValue !== undefined) {
      filter.price = {};
      if (minPriceValue !== undefined) filter.price.$gte = minPriceValue;
      if (maxPriceValue !== undefined) filter.price.$lte = maxPriceValue;
    }

    if (bedroomsValue !== undefined) {
      filter.bedrooms = bedroomsValue;
    }

    if (availability === 'available') {
      filter.availabilityStatus = 'available';
    }

    const sort = {};
    if (sortPrice === 'asc') sort.price = 1;
    else if (sortPrice === 'desc') sort.price = -1;
    else sort.createdAt = -1;

    const queriedProperties = await Property.find(filter)
      .populate('landlord', 'name email phone profilePhoto role')
      .populate('rentedBy', 'name email phone')
      .sort(sort);

    const properties = Array.from(
      new Map(queriedProperties.map(property => [property._id.toString(), property])).values()
    );

    const rentedPropertyIds = properties
      .filter(property => property.availabilityStatus === 'rented' && !property.rentedBy)
      .map(property => property._id);
    if (rentedPropertyIds.length > 0) {
      const confirmedRequests = await RentalRequest.find({
        property: { $in: rentedPropertyIds },
        status: { $in: ['approved', 'confirmed'] },
      }).select('property tenantName tenantEmail tenantPhone').lean();
      const requestByProperty = new Map(
        confirmedRequests
          .filter(request => request.property)
          .map(request => [request.property.toString(), request])
      );
      properties.forEach(property => {
        const request = requestByProperty.get(property._id.toString());
        if (request) {
          property.rentedBy = {
            name: request.tenantName,
            email: request.tenantEmail,
            phone: request.tenantPhone,
          };
        }
      });
    }

    const responseProperties = properties.map((property) => propertyResponse(property, req.user));

    res.json(responseProperties);
  } catch (error) {
    if (error.message && /must be a non-negative number|Minimum price cannot be greater than maximum price/.test(error.message)) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// አንድ ንብረት ማግኘት
const getPropertyById = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id)
      .populate('landlord', 'name email phone profilePhoto role');
    
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    if (!req.user) {
      if (!property.isVerified || property.verificationStatus !== 'approved') {
        return res.status(403).json({ message: 'This property is not verified yet' });
      }
      const publicProperty = propertyResponse(property, null);
      return res.json(publicProperty);
    }

    if (!['tenant', 'landlord', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Please login to view properties' });
    }

    if (req.user.role === 'tenant') {
      const hasValidLandlord = property.landlord?.role === 'landlord';
      const isAvailable = property.availabilityStatus !== 'rented';
      const hasRentalRequest = await RentalRequest.exists({
        property: property._id,
        tenant: req.user.id,
      });
      const hasValidData = typeof property.title === 'string' && property.title.trim() &&
        typeof property.description === 'string' && property.description.trim() &&
        typeof property.location === 'string' && property.location.trim() &&
        typeof property.price === 'number' && property.price > 0 &&
        typeof property.bedrooms === 'number' && property.bedrooms >= 0;
      const canViewRequestedProperty = hasRentalRequest && String(property.rentedBy) === String(req.user.id);
      if (!hasValidLandlord || !property.isVerified || property.verificationStatus !== 'approved' || (!isAvailable && !canViewRequestedProperty) || !hasValidData) {
        return res.status(403).json({ message: 'This property is not available' });
      }
    }

    if (req.user.role === 'landlord') {
      const ownsProperty = String(property.landlord?._id || property.landlord) === String(req.user.id);
      const isPubliclyAvailable = property.isVerified
        && property.verificationStatus === 'approved'
        && property.availabilityStatus !== 'rented';
      if (!ownsProperty && !isPubliclyAvailable) {
        return res.status(404).json({ message: 'Property not found' });
      }
    }

    if (req.user.role === 'admin') {
      const admin = await User.findById(req.user.id).select('adminAreas adminType').lean();
      const isAreaAdmin = admin?.adminType === 'area'
        || (!admin?.adminType && (admin?.adminAreas || []).length > 0);
      if (isAreaAdmin) {
        const adminAreas = (admin?.adminAreas || []).map(normalizeAdminAreaObject).filter(Boolean);
        if (adminAreas.length === 0 || !propertyMatchesAdminAreas(property, adminAreas)) {
          return res.status(403).json({ message: 'This property is outside your assigned admin area' });
        }
      }
    }

    res.json(propertyResponse(property, req.user));
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Server error' });
  }
};

// ንብረት ማዘመን (Landlord ብቻ)
const updateProperty = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    // የራሱ ንብረት መሆኑን ያረጋግጡ
    const isPlatformAdmin = req.user.role === 'admin' && req.user.adminType === 'platform';
    if (property.landlord.toString() !== req.user.id && !isPlatformAdmin) {
      return res.status(403).json({ message: 'Not authorized to update this property' });
    }

    const { title, description, price, bedrooms, latitude, longitude } = req.body;
    const address = normalizeAddress(req.body);

    property.title = title || property.title;
    property.description = description || property.description;
    property.price = price || property.price;
    Object.assign(property, address);
    property.bedrooms = bedrooms || property.bedrooms;

    if (req.files && req.files.images && req.files.images.length > 0) {
      const newImageUrls = await uploadFilesToUrls(req.files.images, req, 'image');
      property.images = [...(property.images || []), ...newImageUrls];
    }

    if (req.files && req.files.document && req.files.document.length > 0) {
      const document = req.files.document[0];
      const privateDocumentAsset = hasCloudinaryCredentials
        ? await uploadPrivateProof(document.buffer)
        : null;
      property.verificationDocument = privateDocumentAsset ? '' : saveLocalUpload(document, req);
      property.verificationDocumentAsset = privateDocumentAsset || undefined;
    }

    if (latitude !== undefined) {
      const latitudeValue = normalizeCoordinate(latitude, 'Latitude');
      if (latitudeValue !== null && (latitudeValue < -90 || latitudeValue > 90)) {
        return res.status(400).json({ message: 'Latitude must be between -90 and 90' });
      }
      property.latitude = latitudeValue;
    }

    if (longitude !== undefined) {
      const longitudeValue = normalizeCoordinate(longitude, 'Longitude');
      if (longitudeValue !== null && (longitudeValue < -180 || longitudeValue > 180)) {
        return res.status(400).json({ message: 'Longitude must be between -180 and 180' });
      }
      property.longitude = longitudeValue;
    }

    // ካዘመነ በኋላ እንደገና መረጋገጥ አለበት
    property.isVerified = false;
    property.verificationStatus = 'pending';

    await property.save();

    await createSystemLog({
      user: req.user.id,
      role: req.user.role,
      action: 'PROPERTY_UPDATED',
      description: `Property "${property.title}" was updated and sent back for re-verification.`,
      property: property._id,
      status: 'success',
      ipAddress: req.ip || '',
    });

    await Notification.create({
      recipientRole: 'admin',
      property: property._id,
      propertyTitle: property.title,
      message: `Property resubmitted for verification: "${property.title}".`,
      type: 'pending',
      instructions: 'Review the updated property in the Admin Dashboard.',
      read: false,
    });

    res.json({
      message: 'Property updated successfully. Needs re-verification.',
      property: propertyResponse(property, req.user),
    });
  } catch (error) {
    console.error('Update property error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ንብረት መሰረዝ
const deleteProperty = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    // የራሱ ንብረት መሆኑን ያረጋግጡ
    const isPlatformAdmin = req.user.role === 'admin' && req.user.adminType === 'platform';
    if (property.landlord.toString() !== req.user.id && !isPlatformAdmin) {
      return res.status(403).json({ message: 'Not authorized to delete this property' });
    }

    const propertyTitle = property.title;
    await property.deleteOne();

    await createSystemLog({
      user: req.user.id,
      role: req.user.role,
      action: 'PROPERTY_DELETED',
      description: `Property "${propertyTitle}" was deleted.`,
      property: property._id,
      status: 'success',
      ipAddress: req.ip || '',
    });

    res.json({ message: 'Property deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  createProperty,
  getAllProperties,
  getPropertyById,
  getOwnershipProof,
  updateProperty,
  deleteProperty,
};