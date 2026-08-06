import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDatabase(uri = env.MONGODB_URI) {
  if (!uri) throw new Error('MONGODB_URI is required. Add an Atlas or local MongoDB connection string to server/.env.');
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { autoIndex: env.NODE_ENV !== 'production' });
  await prepareReferralIndexes();
  return mongoose.connection;
}

async function prepareReferralIndexes() {
  const collection = mongoose.connection.collection('referrals');
  let indexes;
  try { indexes = await collection.indexes(); } catch (error) { if (error?.code === 26) return; throw error; }
  const customerIndex = indexes.find((index) => index.key?.customer === 1 && Object.keys(index.key).length === 1);
  if (!customerIndex || customerIndex.sparse) return;
  await collection.dropIndex(customerIndex.name);
  await collection.createIndex({ customer: 1 }, { name: 'customer_1', unique: true, sparse: true });
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
