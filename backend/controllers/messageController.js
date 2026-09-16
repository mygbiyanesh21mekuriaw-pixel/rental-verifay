const Conversation = require('../models/Conversation');
const RentalRequest = require('../models/RentalRequest');
const Property = require('../models/Property');

const conversationView = (query) => query
  .populate('tenant', 'name email')
  .populate('landlord', 'name email phone')
  .populate('property', 'title location');

const canUseConversation = async (conversation) => {
  const propertyId = conversation.property?._id || conversation.property;
  const tenantId = conversation.tenant?._id || conversation.tenant;
  const landlordId = conversation.landlord?._id || conversation.landlord;
  const property = await Property.findOne({
    _id: propertyId,
    availabilityStatus: 'rented',
    rentedBy: tenantId,
  }).select('_id landlord');
  return property && String(property.landlord) === String(landlordId);
};

const openConversation = async (req, res) => {
  try {
    const { propertyId } = req.body;
    const property = await Property.findOne({
      _id: propertyId,
      availabilityStatus: 'rented',
      rentedBy: req.user.id,
    }).select('_id landlord');
    const request = await RentalRequest.findOne({
      property: propertyId,
      tenant: req.user.id,
      status: { $in: ['approved', 'confirmed'] },
    });
    if (!request || !property || String(request.landlord) !== String(property.landlord)) {
      return res.status(403).json({ message: 'Messaging is available for rented properties only' });
    }

    let conversation = await Conversation.findOne({
      tenant: req.user.id,
      landlord: property.landlord,
      property: propertyId,
    });
    if (!conversation) {
      conversation = await Conversation.create({
        tenant: req.user.id,
        landlord: property.landlord,
        property: propertyId,
      });
    }
    conversation = await conversationView(Conversation.findById(conversation._id));
    res.json(conversation);
  } catch (error) {
    console.error('Open conversation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const getConversation = async (req, res) => {
  try {
    const conversation = await conversationView(Conversation.findById(req.params.id));
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
    if (![conversation.tenant._id.toString(), conversation.landlord._id.toString()].includes(req.user.id)) {
      return res.status(403).json({ message: 'You are not a participant in this conversation' });
    }
    if (!(await canUseConversation(conversation))) {
      return res.status(403).json({ message: 'Messaging is available for rented properties only' });
    }
    conversation.messages = conversation.messages.filter(message => (
      !message.recipient || String(message.recipient) === String(req.user.id)
    ));
    res.json(conversation);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const sendMessage = async (req, res) => {
  try {
    const body = String(req.body.body || '').trim();
    if (!body) return res.status(400).json({ message: 'Message cannot be empty' });
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
    if (![conversation.tenant.toString(), conversation.landlord.toString()].includes(req.user.id)) {
      return res.status(403).json({ message: 'You are not a participant in this conversation' });
    }
    if (!(await canUseConversation(conversation))) {
      return res.status(403).json({ message: 'Messaging is available for rented properties only' });
    }
    conversation.messages.push({ sender: req.user.id, body });
    await conversation.save();
    res.status(201).json(await conversationView(Conversation.findById(conversation._id)));
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const sendAdminMessage = async (req, res) => {
  try {
    const body = String(req.body.body || '').trim();
    const { recipientId } = req.body;
    if (!body) return res.status(400).json({ message: 'Message cannot be empty' });

    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
    if (!recipientId || ![String(conversation.tenant), String(conversation.landlord)].includes(String(recipientId))) {
      return res.status(400).json({ message: 'Conversation participants are unavailable' });
    }

    conversation.messages.push({ sender: req.user.id, recipient: recipientId, body });
    await conversation.save();
    res.status(201).json(await conversationView(Conversation.findById(conversation._id)));
  } catch (error) {
    console.error('Admin send message error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const getLandlordConversations = async (req, res) => {
  try {
    const conversations = await conversationView(Conversation.find({ landlord: req.user.id }).sort({ updatedAt: -1 }));
    const validConversations = [];
    for (const conversation of conversations) {
      if (await canUseConversation(conversation)) validConversations.push(conversation);
    }
    res.json(validConversations);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const getTenantConversations = async (req, res) => {
  try {
    const conversations = await conversationView(Conversation.find({ tenant: req.user.id }).sort({ updatedAt: -1 }));
    const validConversations = [];
    for (const conversation of conversations) {
      if (await canUseConversation(conversation)) validConversations.push(conversation);
    }
    res.json(validConversations);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const getAdminConversations = async (req, res) => {
  try {
    const conversations = await conversationView(Conversation.find().sort({ updatedAt: -1 }));
    res.json(conversations);
  } catch (error) {
    console.error('Admin conversations error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  openConversation,
  getConversation,
  sendMessage,
  sendAdminMessage,
  getLandlordConversations,
  getTenantConversations,
  getAdminConversations,
};
