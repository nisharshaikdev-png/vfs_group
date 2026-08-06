import mongoose from 'mongoose';

export const REFERRAL_STATUSES = ['pending', 'approved', 'rejected'];

const schema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', unique: true, sparse: true, index: true },
  connector: { type: mongoose.Schema.Types.ObjectId, ref: 'Contractor', required: true, index: true },
  referralCode: { type: String, required: true, trim: true, uppercase: true, index: true },
  status: { type: String, enum: REFERRAL_STATUSES, default: 'pending', index: true },
  createdByConnector: { type: Boolean, default: false },
  source: { type: String, enum: ['customer_registration', 'connector_submission'], default: 'customer_registration', index: true },
  prospect: {
    fullName: { type: String, trim: true, maxlength: 100 },
    mobile: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    customerType: { type: String, enum: ['indian', 'nri'] },
    country: { type: String, trim: true }, city: { type: String, trim: true }, state: { type: String, trim: true },
  },
  accountRegisteredAt: Date,
  rejectionReason: { type: String, trim: true, maxlength: 500 },
  approvedAt: Date,
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectedAt: Date,
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

schema.index({ connector: 1, status: 1, createdAt: -1 });
schema.index({ connector: 1, 'prospect.mobile': 1, status: 1 });
export const Referral = mongoose.model('Referral', schema);
