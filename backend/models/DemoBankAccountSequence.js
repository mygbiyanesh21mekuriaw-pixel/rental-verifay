const mongoose = require('mongoose');

const DemoBankAccountSequenceSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  sequence: { type: Number, default: 0, min: 0 },
});

module.exports = mongoose.model('DemoBankAccountSequence', DemoBankAccountSequenceSchema);
