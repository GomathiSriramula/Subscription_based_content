import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { MongoClient } from 'mongodb';
import multer from 'multer';
import Razorpay from 'razorpay';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4000);
const frontendOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const jwtSecret = process.env.JWT_SECRET || 'change-me-in-production';
const razorpayKeyId = (process.env.RAZORPAY_KEY_ID || '').trim();
const razorpayKeySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
const isRazorpayConfigured = Boolean(razorpayKeyId && razorpayKeySecret);

const razorpayClient = isRazorpayConfigured
  ? new Razorpay({
      key_id: razorpayKeyId,
      key_secret: razorpayKeySecret,
    })
  : null;

const mongoUri = (process.env.MONGO_URI || process.env.MONGODB_URI || '').trim();
if (!mongoUri) {
  throw new Error('Missing MongoDB connection string. Set MONGO_URI or MONGODB_URI to your MongoDB Atlas URI.');
}
const mongoDbName = (process.env.MONGODB_DB_NAME || 'content-access').trim();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '..', 'uploads');
const dbPath = path.join(__dirname, '..', 'data', 'db.json');
const mongoClient = new MongoClient(mongoUri);
let mongoDatabasePromise = null;
const DEFAULT_CATEGORY_NAMES = [
  'Health',
  'Finance',
  'Education',
  'Technology',
  'Business',
  'Self Help',
  'Psychology',
  'Productivity',
  'Career',
  'Lifestyle',
];

app.use(
  cors({
    origin(origin, callback) {
      // Allow server-to-server tools and local dev origins (Vite can auto-switch ports).
      if (!origin) {
        return callback(null, true);
      }

      if (frontendOrigins.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || /^http:\/\/\[::1\](:\d+)?$/.test(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
  })
);
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

const hybridBookUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadsDir),
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      const fallbackExtension = file.fieldname === 'pdf_file' ? '.pdf' : '';
      callback(null, `${file.fieldname}-${Date.now()}-${uuidv4()}${extension || fallbackExtension}`);
    },
  }),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    if (file.fieldname === 'cover_file') {
      if (!file.mimetype.startsWith('image/')) {
        return callback(new Error('Cover upload must be an image file.'));
      }
      return callback(null, true);
    }

    if (file.fieldname === 'pdf_file') {
      if (file.mimetype !== 'application/pdf') {
        return callback(new Error('PDF upload must be a PDF file.'));
      }
      return callback(null, true);
    }

    return callback(new Error('Unexpected upload field.'));
  },
});

const hybridBookUploadFields = hybridBookUpload.fields([
  { name: 'cover_file', maxCount: 1 },
  { name: 'pdf_file', maxCount: 1 },
]);

async function readDb() {
  const database = await getMongoDatabase();
  const [users, subscriptions, subscriptionPlans, books, categories] = await Promise.all([
    database.collection('users').find({}).toArray(),
    database.collection('subscriptions').find({}).toArray(),
    database.collection('subscription_plans').find({}).toArray(),
    database.collection('books').find({}).toArray(),
    database.collection('categories').find({}).toArray(),
  ]);

  return {
    users: users.map(stripMongoId),
    subscriptions: subscriptions.map(stripMongoId),
    subscription_plans: subscriptionPlans.map(stripMongoId),
    books: books.map(stripMongoId),
    categories: categories.map(stripMongoId),
  };
}

async function writeDb(db) {
  const database = await getMongoDatabase();
  const collections = {
    users: Array.isArray(db.users) ? db.users : [],
    subscriptions: Array.isArray(db.subscriptions) ? db.subscriptions : [],
    subscription_plans: Array.isArray(db.subscription_plans) ? db.subscription_plans : [],
    books: Array.isArray(db.books) ? db.books : [],
    categories: Array.isArray(db.categories) ? db.categories : [],
  };

  await Promise.all(
    Object.entries(collections).map(async ([collectionName, documents]) => {
      const collection = database.collection(collectionName);
      await collection.deleteMany({});
      if (documents.length > 0) {
        await collection.insertMany(documents);
      }
    })
  );
}

function stripMongoId(document) {
  const { _id, ...rest } = document;
  return rest;
}

function getUploadUrl(req, fieldName) {
  const file = req.files?.[fieldName]?.[0];
  if (!file) {
    return null;
  }

  return `/uploads/${file.filename}`;
}

function normalizeMaybeUrl(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseBooleanInput(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes';
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  return false;
}

function sortBooksFeaturedFirst(a, b) {
  const featuredDiff = Number(Boolean(b.featured)) - Number(Boolean(a.featured));
  if (featuredDiff !== 0) {
    return featuredDiff;
  }

  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

function resolveBookAsset(req, body, fieldName, sourceFieldName) {
  const source = normalizeMaybeUrl(body?.[sourceFieldName]) || 'url';
  const uploadUrl = getUploadUrl(req, fieldName);
  const urlValue = normalizeMaybeUrl(body?.[fieldName.replace('_file', '_url')]);

  if (source === 'upload') {
    if (!uploadUrl) {
      throw new Error(`${fieldName === 'cover_file' ? 'Cover image' : 'PDF'} file is required when upload is selected.`);
    }
    return uploadUrl;
  }

  if (!urlValue) {
    throw new Error(`${fieldName === 'cover_file' ? 'Cover image URL' : 'PDF URL'} is required when URL is selected.`);
  }

  return urlValue;
}

async function seedDatabase(database) {
  const hasSeedFile = await fs
    .access(dbPath)
    .then(() => true)
    .catch(() => false);

  if (!hasSeedFile) {
    const plansCollection = database.collection('subscription_plans');
    if ((await plansCollection.countDocuments()) === 0) {
      await plansCollection.insertMany(getDefaultSubscriptionPlans());
    }
    const categoriesCollection = database.collection('categories');
    if ((await categoriesCollection.countDocuments()) === 0) {
      await categoriesCollection.insertMany(getDefaultCategories());
    }
    return;
  }

  const raw = await fs.readFile(dbPath, 'utf8');
  const seedData = JSON.parse(raw);
  const seedCollections = [
    ['users', seedData.users || []],
    ['subscriptions', seedData.subscriptions || []],
    ['subscription_plans', seedData.subscription_plans || getDefaultSubscriptionPlans()],
    ['books', seedData.books || []],
    ['categories', seedData.categories || buildSeedCategories(seedData)],
  ];

  for (const [collectionName, documents] of seedCollections) {
    const collection = database.collection(collectionName);
    if ((await collection.countDocuments()) === 0 && documents.length > 0) {
      await collection.insertMany(documents);
    }
  }
}

async function getMongoDatabase() {
  if (!mongoDatabasePromise) {
    mongoDatabasePromise = (async () => {
      await mongoClient.connect();
      const database = mongoClient.db(mongoDbName);
      await seedDatabase(database);
      return database;
    })();
  }

  return mongoDatabasePromise;
}

function getDefaultSubscriptionPlans() {
  return [
    { id: 'monthly', name: 'Monthly', amount: 29900, duration_days: 30 },
    { id: 'yearly', name: 'Yearly', amount: 299900, duration_days: 365 },
  ];
}

function normalizeSubscriptionPlanName(value) {
  return normalizeMaybeUrl(value);
}

function normalizeSubscriptionPlanRecord(plan) {
  return {
    id: String(plan?.id || `plan-${uuidv4()}`),
    name: String(plan?.name || plan?.id || '').trim(),
    amount: Number(plan?.amount || 0),
    duration_days: Number(plan?.duration_days || 0),
  };
}

function getSubscriptionPlans(db) {
  if (!Array.isArray(db.subscription_plans) || db.subscription_plans.length === 0) {
    db.subscription_plans = getDefaultSubscriptionPlans();
  }

  return db.subscription_plans
    .map(normalizeSubscriptionPlanRecord)
    .filter((plan) => Boolean(plan.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function findSubscriptionPlanById(db, planId) {
  return getSubscriptionPlans(db).find((plan) => plan.id === planId) || null;
}

function findSubscriptionPlanByName(db, planName) {
  const normalizedName = normalizeSubscriptionPlanName(planName).toLowerCase();
  if (!normalizedName) {
    return null;
  }

  return getSubscriptionPlans(db).find((plan) => plan.name.toLowerCase() === normalizedName) || null;
}

function hasSubscriptionPlanUsage(db, planId) {
  return db.subscriptions.some((subscription) => {
    const explicitPlan = subscription.plan || subscription.plan_id || subscription.planId || subscription.subscription_plan || subscription.subscriptionPlan || null;
    if (explicitPlan) {
      return String(explicitPlan) === String(planId);
    }

    return false;
  });
}

function getDefaultCategories() {
  const timestamp = new Date().toISOString();
  return DEFAULT_CATEGORY_NAMES.map((name) => ({
    id: `category-${slugifyCategoryName(name)}`,
    name,
    created_at: timestamp,
    updated_at: timestamp,
  }));
}

function buildSeedCategories(seedData) {
  const categoryNames = new Set(DEFAULT_CATEGORY_NAMES);

  if (Array.isArray(seedData?.books)) {
    for (const book of seedData.books) {
      const categoryName = normalizeCategoryName(book?.category);
      if (categoryName) {
        categoryNames.add(categoryName);
      }
    }
  }

  const timestamp = new Date().toISOString();
  return Array.from(categoryNames).map((name) => ({
    id: `category-${slugifyCategoryName(name)}`,
    name,
    created_at: timestamp,
    updated_at: timestamp,
  }));
}

function normalizeCategoryName(value) {
  return normalizeMaybeUrl(value);
}

function slugifyCategoryName(value) {
  const slug = normalizeCategoryName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || `category-${uuidv4().slice(0, 8)}`;
}

function normalizeCategoryRecord(category) {
  const name = normalizeCategoryName(category?.name);
  const now = new Date().toISOString();

  return {
    id: String(category?.id || `category-${slugifyCategoryName(name)}`),
    name,
    created_at: category?.created_at || now,
    updated_at: category?.updated_at || category?.created_at || now,
  };
}

function getCategories(db) {
  if (!Array.isArray(db.categories) || db.categories.length === 0) {
    db.categories = getDefaultCategories();
  }

  return db.categories
    .map(normalizeCategoryRecord)
    .filter((category) => Boolean(category.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function findCategoryById(db, categoryId) {
  return getCategories(db).find((category) => category.id === categoryId) || null;
}

function findCategoryByName(db, categoryName) {
  const normalizedName = normalizeCategoryName(categoryName).toLowerCase();
  if (!normalizedName) {
    return null;
  }

  return getCategories(db).find((category) => category.name.toLowerCase() === normalizedName) || null;
}

function updateBooksForCategoryRename(db, previousName, nextName) {
  for (const book of db.books) {
    if (book.category === previousName) {
      book.category = nextName;
    }
  }
}

function formatMonthLabel(date) {
  return date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}

function getRecentMonths(count = 6) {
  const now = new Date();
  const months = [];

  for (let index = count - 1; index >= 0; index -= 1) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - index, 1);
    months.push({
      key: `${monthDate.getFullYear()}-${monthDate.getMonth()}`,
      label: formatMonthLabel(monthDate),
    });
  }

  return months;
}

function csvEscape(value) {
  const normalized = value === null || value === undefined ? '' : String(value);
  const escaped = normalized.replace(/"/g, '""');
  if (/[",\n\r]/.test(escaped)) {
    return `"${escaped}"`;
  }
  return escaped;
}

function buildCsv(headers, rows) {
  const headerLine = headers.map(csvEscape).join(',');
  const dataLines = rows.map((row) => row.map(csvEscape).join(','));
  return [headerLine, ...dataLines].join('\n');
}

function parseDateRangeFromQuery(query) {
  const startDateRaw = typeof query?.start_date === 'string' ? query.start_date.trim() : '';
  const endDateRaw = typeof query?.end_date === 'string' ? query.end_date.trim() : '';

  if (!startDateRaw && !endDateRaw) {
    return { startDate: null, endDate: null, error: null };
  }

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (startDateRaw && !datePattern.test(startDateRaw)) {
    return { startDate: null, endDate: null, error: 'Invalid start_date format. Use YYYY-MM-DD.' };
  }
  if (endDateRaw && !datePattern.test(endDateRaw)) {
    return { startDate: null, endDate: null, error: 'Invalid end_date format. Use YYYY-MM-DD.' };
  }

  const startDate = startDateRaw ? new Date(`${startDateRaw}T00:00:00.000Z`) : null;
  const endDate = endDateRaw ? new Date(`${endDateRaw}T23:59:59.999Z`) : null;

  if (startDate && Number.isNaN(startDate.getTime())) {
    return { startDate: null, endDate: null, error: 'Invalid start_date value.' };
  }
  if (endDate && Number.isNaN(endDate.getTime())) {
    return { startDate: null, endDate: null, error: 'Invalid end_date value.' };
  }
  if (startDate && endDate && startDate > endDate) {
    return { startDate: null, endDate: null, error: 'start_date must be less than or equal to end_date.' };
  }

  return { startDate, endDate, error: null };
}

function isDateInRange(dateValue, startDate, endDate) {
  const parsed = new Date(dateValue || '');
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  if (startDate && parsed < startDate) {
    return false;
  }
  if (endDate && parsed > endDate) {
    return false;
  }

  return true;
}

function buildAnalytics(db, notificationWindowDaysInput = 7) {
  const now = new Date();
  const parsedNotificationWindow = Number(notificationWindowDaysInput);
  const notificationWindowDays = Number.isFinite(parsedNotificationWindow)
    ? Math.max(1, Math.min(60, Math.round(parsedNotificationWindow)))
    : 7;
  const notificationWindowStart = new Date(now);
  notificationWindowStart.setDate(notificationWindowStart.getDate() - notificationWindowDays);

  const successfulSubscriptions = db.subscriptions.filter(
    (subscription) => Boolean(subscription.razorpay_payment_id) && subscription.status !== 'pending'
  );

  const activeSubscriptions = db.subscriptions.filter((subscription) => {
    if (subscription.status !== 'active') {
      return false;
    }

    if (!subscription.expiry_date) {
      return true;
    }

    return new Date(subscription.expiry_date) >= now;
  });

  const totalRevenuePaise = successfulSubscriptions.reduce(
    (total, subscription) => total + Number(subscription.amount || 0),
    0
  );

  const currentMonthKey = `${now.getFullYear()}-${now.getMonth()}`;
  const monthlyRevenuePaise = successfulSubscriptions.reduce((total, subscription) => {
    const createdAt = new Date(subscription.created_at);
    if (Number.isNaN(createdAt.getTime())) {
      return total;
    }

    const key = `${createdAt.getFullYear()}-${createdAt.getMonth()}`;
    if (key !== currentMonthKey) {
      return total;
    }

    return total + Number(subscription.amount || 0);
  }, 0);

  const months = getRecentMonths(6);
  const revenueByMonth = new Map(months.map((month) => [month.key, 0]));
  const subscriptionsByMonth = new Map(months.map((month) => [month.key, 0]));

  for (const subscription of successfulSubscriptions) {
    const createdAt = new Date(subscription.created_at);
    if (Number.isNaN(createdAt.getTime())) {
      continue;
    }

    const key = `${createdAt.getFullYear()}-${createdAt.getMonth()}`;
    if (!revenueByMonth.has(key)) {
      continue;
    }

    revenueByMonth.set(key, (revenueByMonth.get(key) || 0) + Number(subscription.amount || 0));
    subscriptionsByMonth.set(key, (subscriptionsByMonth.get(key) || 0) + 1);
  }

  const recentUsers = db.users
    .map((user) => ({
      id: user.id,
      name: user.fullName || user.full_name || user.email || 'Unknown user',
      email: user.email || '',
      created_at: user.createdAt || user.created_at || null,
    }))
    .filter((user) => {
      const createdAt = new Date(user.created_at || 0);
      return !Number.isNaN(createdAt.getTime()) && createdAt >= notificationWindowStart;
    })
    .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime());

  const plans = getSubscriptionPlans(db);
  const recentSubscriptions = db.subscriptions
    .filter((subscription) => subscription.status === 'active')
    .map((subscription) => {
      const user = db.users.find((entry) => entry.id === subscription.user_id);
      const plan = plans.find((entry) => entry.id === subscription.plan) || null;
      const createdAt = subscription.start_date || subscription.updated_at || subscription.created_at || null;

      return {
        id: subscription.id,
        user_name: user?.fullName || user?.full_name || user?.email || 'Unknown user',
        user_email: user?.email || '',
        plan_name: plan?.name || String(subscription.plan || 'Unknown'),
        amount_inr: Number((Number(subscription.amount || 0) / 100).toFixed(2)),
        created_at: createdAt,
      };
    })
    .filter((subscription) => {
      const createdAt = new Date(subscription.created_at || 0);
      return !Number.isNaN(createdAt.getTime()) && createdAt >= notificationWindowStart;
    })
    .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime());

  return {
    totals: {
      total_users: db.users.length,
      total_books: db.books.length,
      active_subscriptions: activeSubscriptions.length,
      total_revenue_paise: totalRevenuePaise,
      total_revenue_inr: Number((totalRevenuePaise / 100).toFixed(2)),
      monthly_revenue_paise: monthlyRevenuePaise,
      monthly_revenue_inr: Number((monthlyRevenuePaise / 100).toFixed(2)),
    },
    charts: {
      revenue_last_6_months: months.map((month) => ({
        label: month.label,
        value_paise: revenueByMonth.get(month.key) || 0,
        value_inr: Number(((revenueByMonth.get(month.key) || 0) / 100).toFixed(2)),
      })),
      subscriptions_last_6_months: months.map((month) => ({
        label: month.label,
        value: subscriptionsByMonth.get(month.key) || 0,
      })),
    },
    notifications: {
      window_days: notificationWindowDays,
      new_users_count: recentUsers.length,
      new_subscriptions_count: recentSubscriptions.length,
      recent_users: recentUsers.slice(0, 5),
      recent_subscriptions: recentSubscriptions.slice(0, 5),
    },
  };
}

function getCompletedPaymentTransactions(db) {
  const plans = getSubscriptionPlans(db);

  return db.subscriptions
    .filter((subscription) => Boolean(subscription.razorpay_payment_id) && subscription.status !== 'pending')
    .map((subscription) => {
      const user = db.users.find((entry) => entry.id === subscription.user_id);
      const matchedPlan = plans.find((plan) => plan.id === subscription.plan) || null;
      const paymentDate = subscription.updated_at || subscription.created_at || null;

      return {
        id: subscription.id,
        user_id: subscription.user_id,
        user_name: user?.fullName || user?.email || 'Unknown user',
        user_email: user?.email || '',
        plan_id: subscription.plan || null,
        plan_name: matchedPlan?.name || String(subscription.plan || 'Unknown'),
        amount_paise: Number(subscription.amount || 0),
        amount_inr: Number((Number(subscription.amount || 0) / 100).toFixed(2)),
        payment_date: paymentDate,
        status: String(subscription.status || '').toLowerCase(),
        razorpay_payment_id: subscription.razorpay_payment_id || null,
      };
    })
    .sort((left, right) => new Date(right.payment_date || 0).getTime() - new Date(left.payment_date || 0).getTime());
}

function getSubscriptionUserId(record) {
  return record.user_id || record.userId || null;
}

function getSubscriptionStatus(record) {
  return String(record.status || '').toLowerCase();
}

function getSubscriptionCreatedAt(record) {
  return record.created_at || record.createdAt || record.updated_at || record.updatedAt || null;
}

function getSubscriptionExpiryDate(record) {
  return record.expiry_date || record.expiryDate || null;
}

function getSubscriptionPlan(record, db) {
  const explicitPlan = record.plan || record.plan_id || record.planId || record.subscription_plan || record.subscriptionPlan || null;
  if (explicitPlan) {
    return explicitPlan;
  }

  const amount = Number(record.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const plans = getSubscriptionPlans(db);
  const matchedPlan = plans.find((plan) => Number(plan.amount) === amount);
  return matchedPlan?.id || null;
}

function getUserSubscriptionSummary(db, userId) {
  const now = new Date();
  const records = db.subscriptions
    .filter((subscription) => getSubscriptionUserId(subscription) === userId)
    .sort((a, b) => {
      const aTime = new Date(getSubscriptionCreatedAt(a) || 0).getTime();
      const bTime = new Date(getSubscriptionCreatedAt(b) || 0).getTime();
      return bTime - aTime;
    });

  if (records.length === 0) {
    return {
      subscription_status: 'none',
      subscription_plan: null,
      subscription_amount_paise: null,
      subscription_expiry_date: null,
    };
  }

  const activeRecord = records.find((subscription) => {
    if (getSubscriptionStatus(subscription) !== 'active') {
      return false;
    }

    const expiryDate = getSubscriptionExpiryDate(subscription);
    if (!expiryDate) {
      return true;
    }

    return new Date(expiryDate) >= now;
  });

  if (activeRecord) {
    return {
      subscription_status: 'active',
      subscription_plan: getSubscriptionPlan(activeRecord, db),
      subscription_amount_paise: Number(activeRecord.amount || 0),
      subscription_expiry_date: getSubscriptionExpiryDate(activeRecord),
    };
  }

  const pendingRecord = records.find((subscription) => getSubscriptionStatus(subscription) === 'pending');
  if (pendingRecord) {
    return {
      subscription_status: 'pending',
      subscription_plan: getSubscriptionPlan(pendingRecord, db),
      subscription_amount_paise: Number(pendingRecord.amount || 0),
      subscription_expiry_date: null,
    };
  }

  const latestRecord = records[0];
  return {
    subscription_status: 'expired',
    subscription_plan: getSubscriptionPlan(latestRecord, db),
    subscription_amount_paise: Number(latestRecord.amount || 0),
    subscription_expiry_date: getSubscriptionExpiryDate(latestRecord),
  };
}

function getUserSubscriptionRecords(db, userId) {
  return db.subscriptions
    .filter((subscription) => getSubscriptionUserId(subscription) === userId)
    .sort((a, b) => new Date(getSubscriptionCreatedAt(b) || 0).getTime() - new Date(getSubscriptionCreatedAt(a) || 0).getTime());
}

function parseExpiryDateInput(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function createManualSubscriptionRecord({
  userId,
  planId,
  amount,
  expiryDate,
  now,
}) {
  return {
    id: `sub-${uuidv4()}`,
    user_id: userId,
    status: 'active',
    start_date: now.toISOString(),
    expiry_date: expiryDate.toISOString(),
    razorpay_order_id: null,
    razorpay_payment_id: null,
    plan: planId,
    amount,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
}

function applyManualSubscriptionChange(db, userId, input) {
  const user = db.users.find((entry) => entry.id === userId);
  if (!user) {
    return { error: 'User not found', status: 404 };
  }

  const plans = getSubscriptionPlans(db);
  const plan = input.planId ? plans.find((entry) => entry.id === input.planId) : null;
  if (input.planId && !plan) {
    return { error: 'Plan not found', status: 404 };
  }

  const now = new Date();
  const nextExpiryInput = parseExpiryDateInput(input.expiryDate);
  const extendDays = Number(input.extendDays);
  if (input.extendDays !== undefined && (!Number.isFinite(extendDays) || extendDays <= 0)) {
    return { error: 'Extend days must be a positive number.', status: 400 };
  }

  const existingRecords = getUserSubscriptionRecords(db, userId);
  const activeRecord = existingRecords.find((record) => getSubscriptionStatus(record) === 'active' && (!getSubscriptionExpiryDate(record) || new Date(getSubscriptionExpiryDate(record)) >= now)) || null;
  const baselineDate = activeRecord?.expiry_date && new Date(activeRecord.expiry_date) > now
    ? new Date(activeRecord.expiry_date)
    : now;

  let expiryDate = nextExpiryInput;
  if (!expiryDate) {
    const durationDays = input.action === 'extend'
      ? (Number.isFinite(extendDays) && extendDays > 0 ? extendDays : plan?.duration_days || 30)
      : (Number.isFinite(extendDays) && extendDays > 0 ? extendDays : plan?.duration_days || 30);
    expiryDate = new Date(baselineDate);
    expiryDate.setDate(expiryDate.getDate() + durationDays);
  }

  if (!expiryDate || Number.isNaN(expiryDate.getTime())) {
    return { error: 'Valid expiry date is required.', status: 400 };
  }

  for (const subscription of db.subscriptions) {
    if (subscription.user_id === userId && subscription.status === 'active') {
      subscription.status = 'expired';
      subscription.updated_at = now.toISOString();
    }
  }

  const planId = plan?.id || activeRecord?.plan || null;
  const amount = plan?.amount || activeRecord?.amount || 0;
  const targetRecord = activeRecord || createManualSubscriptionRecord({
    userId,
    planId,
    amount,
    expiryDate,
    now,
  });

  targetRecord.status = 'active';
  targetRecord.start_date = targetRecord.start_date || now.toISOString();
  targetRecord.expiry_date = expiryDate.toISOString();
  targetRecord.plan = planId;
  targetRecord.amount = amount;
  targetRecord.updated_at = now.toISOString();

  if (!activeRecord) {
    db.subscriptions.push(targetRecord);
  }

  return {
    user,
    subscription: targetRecord,
    expiry_date: targetRecord.expiry_date,
  };
}

function isUserBlocked(user) {
  return Boolean(user?.isBlocked || user?.is_blocked);
}

function makeToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role || 'user' }, jwtSecret, { expiresIn: '7d' });
}

function normalizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role || 'user',
    user_metadata: {
      full_name: user.fullName,
    },
  };
}

async function findActiveSubscription(userId) {
  const db = await readDb();
  const now = new Date();
  let active = db.subscriptions
    .filter((s) => s.user_id === userId && s.status === 'active')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] || null;

  if (active?.expiry_date && new Date(active.expiry_date) < now) {
    active.status = 'expired';
    active.updated_at = now.toISOString();
    await writeDb(db);
    return null;
  }

  return active;
}

async function authRequired(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, jwtSecret);
    const db = await readDb();
    const user = db.users.find((u) => u.id === payload.sub);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (isUserBlocked(user)) {
      return res.status(403).json({ error: 'Your account is blocked. Please contact admin.' });
    }

    req.userId = payload.sub;
    req.userRole = user.role || 'user';
    req.token = token;
    return next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

function adminRequired(req, res, next) {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }
  return next();
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, fullName } = req.body || {};
    if (!email || !password || !fullName) {
      return res.status(400).json({ error: 'Email, password, and full name are required.' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const db = await readDb();
    const normalizedEmail = String(email).trim().toLowerCase();
    const exists = db.users.some((u) => u.email === normalizedEmail);
    if (exists) {
      return res.status(409).json({ error: 'An account already exists with this email.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = {
      id: uuidv4(),
      email: normalizedEmail,
      fullName: String(fullName).trim(),
      passwordHash,
      role: 'user',
      isBlocked: false,
      blockedAt: null,
      createdAt: new Date().toISOString(),
    };

    db.users.push(user);
    await writeDb(db);

    const token = makeToken(user);
    return res.status(201).json({
      user: normalizeUser(user),
      session: { access_token: token },
      subscription: null,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const db = await readDb();
    const normalizedEmail = String(email).trim().toLowerCase();
    const user = db.users.find((u) => u.email === normalizedEmail);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    if (isUserBlocked(user)) {
      return res.status(403).json({ error: 'Your account is blocked. Please contact admin.' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = makeToken(user);
    const subscription = await findActiveSubscription(user.id);

    return res.json({
      user: normalizeUser(user),
      session: { access_token: token },
      subscription,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.get('/api/auth/me', authRequired, async (req, res) => {
  try {
    const db = await readDb();
    const user = db.users.find((u) => u.id === req.userId);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const subscription = await findActiveSubscription(user.id);
    return res.json({
      user: normalizeUser(user),
      session: { access_token: req.token },
      subscription,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.put('/api/auth/me', authRequired, async (req, res) => {
  try {
    const { email, fullName } = req.body || {};
    const db = await readDb();
    const user = db.users.find((entry) => entry.id === req.userId);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const nextFullName = fullName !== undefined ? String(fullName).trim() : String(user.fullName || '').trim();
    const nextEmail = email !== undefined ? String(email).trim().toLowerCase() : String(user.email || '').trim().toLowerCase();

    if (!nextFullName) {
      return res.status(400).json({ error: 'Full name is required.' });
    }

    if (!nextEmail) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const duplicateEmail = db.users.some((entry) => entry.id !== user.id && entry.email === nextEmail);
    if (duplicateEmail) {
      return res.status(409).json({ error: 'An account already exists with this email.' });
    }

    user.fullName = nextFullName;
    user.email = nextEmail;
    await writeDb(db);

    const subscription = await findActiveSubscription(user.id);
    return res.json({
      user: normalizeUser(user),
      session: { access_token: req.token },
      subscription,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.put('/api/auth/password', authRequired, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    const db = await readDb();
    const user = db.users.find((entry) => entry.id === req.userId);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const validPassword = await bcrypt.compare(String(currentPassword), user.passwordHash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    user.passwordHash = await bcrypt.hash(String(newPassword), 10);
    await writeDb(db);

    return res.json({ message: 'Password updated successfully.' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.get('/api/books', async (_req, res) => {
  try {
    const db = await readDb();
    const books = [...db.books].sort(sortBooksFeaturedFirst);
    return res.json({ data: books });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.get('/api/books/user', authRequired, async (req, res) => {
  try {
    const db = await readDb();
    const user = db.users.find((u) => u.id === req.userId);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const subscription = await findActiveSubscription(user.id);
    const isSubscribed = Boolean(subscription && subscription.status === 'active');
    const isAdmin = req.userRole === 'admin';

    const books = [...db.books]
      .sort(sortBooksFeaturedFirst)
      .map((book) => {
        const isUnlocked = isAdmin || Boolean(book.is_free) || isSubscribed;
        return {
          ...book,
          is_locked: !isUnlocked,
          is_unlocked: isUnlocked,
        };
      });

    return res.json({
      data: books,
      access: {
        isAdmin,
        isSubscribed,
        plan: subscription?.plan || null,
        expiry_date: subscription?.expiry_date || null,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.get('/api/books/count', async (_req, res) => {
  try {
    const db = await readDb();
    return res.json({ count: db.books.length });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.get('/api/categories', async (_req, res) => {
  try {
    const db = await readDb();
    const categories = getCategories(db);
    return res.json({ data: categories });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.get('/api/plans', async (_req, res) => {
  try {
    const db = await readDb();
    const plans = getSubscriptionPlans(db);
    return res.json({ data: plans });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.get('/api/admin/books', authRequired, adminRequired, async (_req, res) => {
  try {
    const db = await readDb();
    const books = [...db.books].sort(sortBooksFeaturedFirst);
    return res.json({ data: books });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.get('/api/admin/books/export.csv', authRequired, adminRequired, async (_req, res) => {
  try {
    const { startDate, endDate, error: dateRangeError } = parseDateRangeFromQuery(_req.query);
    if (dateRangeError) {
      return res.status(400).json({ error: dateRangeError });
    }

    const db = await readDb();
    const books = [...db.books]
      .filter((book) => isDateInRange(book.created_at, startDate, endDate))
      .sort(sortBooksFeaturedFirst);

    const headers = [
      'id',
      'title',
      'author',
      'category',
      'is_free',
      'featured',
      'created_at',
      'updated_at',
      'cover_url',
      'pdf_url',
    ];
    const rows = books.map((book) => [
      book.id,
      book.title,
      book.author,
      book.category,
      Boolean(book.is_free),
      Boolean(book.featured),
      book.created_at || '',
      book.updated_at || '',
      book.cover_url || '',
      book.pdf_url || '',
    ]);
    const csv = buildCsv(headers, rows);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="books-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.status(200).send(csv);
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.get('/api/admin/plans', authRequired, adminRequired, async (_req, res) => {
  try {
    const db = await readDb();
    const plans = getSubscriptionPlans(db);
    return res.json({ data: plans });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.post('/api/admin/plans', authRequired, adminRequired, async (req, res) => {
  try {
    const name = normalizeSubscriptionPlanName(req.body?.name);
    const amount = Number(req.body?.amount);
    const durationDays = Number(req.body?.duration_days);

    if (!name) {
      return res.status(400).json({ error: 'Plan name is required.' });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Price must be a positive number.' });
    }
    if (!Number.isFinite(durationDays) || durationDays <= 0) {
      return res.status(400).json({ error: 'Duration must be a positive number of days.' });
    }

    const db = await readDb();
    if (findSubscriptionPlanByName(db, name)) {
      return res.status(409).json({ error: 'Plan name already exists.' });
    }

    const now = new Date().toISOString();
    const plan = {
      id: `plan-${uuidv4()}`,
      name,
      amount: Math.round(amount),
      duration_days: Math.round(durationDays),
      created_at: now,
      updated_at: now,
    };

    db.subscription_plans = getSubscriptionPlans(db);
    db.subscription_plans.push(plan);
    db.subscription_plans = db.subscription_plans.sort((left, right) => left.name.localeCompare(right.name));
    await writeDb(db);

    return res.status(201).json({ data: plan });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.get('/api/admin/analytics', authRequired, adminRequired, async (req, res) => {
  try {
    const db = await readDb();
    const analytics = buildAnalytics(db, req.query.window_days);
    return res.json({ data: analytics });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.get('/api/admin/transactions', authRequired, adminRequired, async (_req, res) => {
  try {
    const db = await readDb();
    const transactions = getCompletedPaymentTransactions(db);
    return res.json({ data: transactions });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.get('/api/admin/categories', authRequired, adminRequired, async (_req, res) => {
  try {
    const db = await readDb();
    const categories = getCategories(db);
    return res.json({ data: categories });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.post('/api/admin/categories', authRequired, adminRequired, async (req, res) => {
  try {
    const name = validateCategoryName(req.body?.name);
    if (!name) {
      return res.status(400).json({ error: 'Category name is required.' });
    }

    const db = await readDb();
    if (findCategoryByName(db, name)) {
      return res.status(409).json({ error: 'Category already exists.' });
    }

    const now = new Date().toISOString();
    const category = {
      id: `category-${uuidv4()}`,
      name,
      created_at: now,
      updated_at: now,
    };

    db.categories = getCategories(db);
    db.categories.push(category);
    db.categories = db.categories.sort((a, b) => a.name.localeCompare(b.name));
    await writeDb(db);

    return res.status(201).json({ data: category });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.put('/api/admin/categories/:categoryId', authRequired, adminRequired, async (req, res) => {
  try {
    const { categoryId } = req.params;
    const nextName = validateCategoryName(req.body?.name);
    if (!nextName) {
      return res.status(400).json({ error: 'Category name is required.' });
    }

    const db = await readDb();
    const category = findCategoryById(db, categoryId);
    if (!category) {
      return res.status(404).json({ error: 'Category not found.' });
    }

    const duplicate = findCategoryByName(db, nextName);
    if (duplicate && duplicate.id !== categoryId) {
      return res.status(409).json({ error: 'Category already exists.' });
    }

    const previousName = category.name;
    category.name = nextName;
    category.updated_at = new Date().toISOString();
    updateBooksForCategoryRename(db, previousName, nextName);
    db.categories = getCategories(db).map((item) => (item.id === categoryId ? category : item));
    await writeDb(db);

    return res.json({ data: category });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.delete('/api/admin/categories/:categoryId', authRequired, adminRequired, async (req, res) => {
  try {
    const { categoryId } = req.params;
    const db = await readDb();
    const category = findCategoryById(db, categoryId);
    if (!category) {
      return res.status(404).json({ error: 'Category not found.' });
    }

    const inUseCount = db.books.filter((book) => book.category === category.name).length;
    if (inUseCount > 0) {
      return res.status(400).json({ error: 'Category is used by existing books. Reassign those books before deleting it.' });
    }

    db.categories = getCategories(db).filter((item) => item.id !== categoryId);
    await writeDb(db);

    return res.json({ message: `Category "${category.name}" deleted successfully.` });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.put('/api/admin/plans/:planId', authRequired, adminRequired, async (req, res) => {
  try {
    const { planId } = req.params;
    const { amount, duration_days, name } = req.body || {};

    const numericAmount = Number(amount);
    const numericDuration = Number(duration_days);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number.' });
    }
    if (!Number.isFinite(numericDuration) || numericDuration <= 0) {
      return res.status(400).json({ error: 'Duration must be a positive number of days.' });
    }

    const db = await readDb();
    const plans = getSubscriptionPlans(db);
    const plan = plans.find((item) => item.id === planId);
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    const nextName = name !== undefined ? normalizeSubscriptionPlanName(name) : plan.name;
    if (!nextName) {
      return res.status(400).json({ error: 'Plan name is required.' });
    }

    const duplicate = findSubscriptionPlanByName(db, nextName);
    if (duplicate && duplicate.id !== planId) {
      return res.status(409).json({ error: 'Plan name already exists.' });
    }

    plan.amount = Math.round(numericAmount);
    plan.duration_days = Math.round(numericDuration);
    plan.name = nextName;

    db.subscription_plans = plans;
    await writeDb(db);
    return res.json({ data: plan });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.delete('/api/admin/plans/:planId', authRequired, adminRequired, async (req, res) => {
  try {
    const { planId } = req.params;
    const db = await readDb();
    const plan = findSubscriptionPlanById(db, planId);
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    if (hasSubscriptionPlanUsage(db, planId)) {
      return res.status(400).json({ error: 'Plan is used by existing subscriptions. Remove those subscriptions before deleting the plan.' });
    }

    db.subscription_plans = getSubscriptionPlans(db).filter((item) => item.id !== planId);
    await writeDb(db);

    return res.json({ message: `Plan "${plan.name}" deleted successfully.` });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.post('/api/admin/books', authRequired, adminRequired, hybridBookUploadFields, async (req, res) => {
  try {
    const { title, author, description, category, is_free, featured } = req.body || {};
    
    if (!title || !author || !description || !category) {
      return res.status(400).json({ error: 'All book fields (title, author, description, category) are required.' });
    }

    const db = await readDb();
    const normalizedCategory = validateCategoryName(category);
    if (!normalizedCategory || !findCategoryByName(db, normalizedCategory)) {
      return res.status(400).json({ error: 'Category not found. Add it from the Categories section first.' });
    }

    const cover_url = resolveBookAsset(req, req.body || {}, 'cover_file', 'cover_source');
    const pdf_url = resolveBookAsset(req, req.body || {}, 'pdf_file', 'pdf_source');
    const book = {
      id: `book-${uuidv4()}`,
      title: String(title).trim(),
      author: String(author).trim(),
      description: String(description).trim(),
      cover_url: String(cover_url).trim(),
      pdf_url: String(pdf_url).trim(),
      category: normalizedCategory,
      is_free: parseBooleanInput(is_free),
      featured: parseBooleanInput(featured),
      created_at: new Date().toISOString(),
    };

    db.books.push(book);
    await writeDb(db);

    return res.status(201).json({ data: book });
  } catch (error) {
    if (error instanceof Error && error.message.includes('required')) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.put('/api/admin/books/:bookId', authRequired, adminRequired, hybridBookUploadFields, async (req, res) => {
  try {
    const { bookId } = req.params;
    const { title, author, description, category, is_free, featured } = req.body || {};

    const db = await readDb();
    const book = db.books.find((b) => b.id === bookId);

    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    if (title !== undefined) book.title = String(title).trim();
    if (author !== undefined) book.author = String(author).trim();
    if (description !== undefined) book.description = String(description).trim();
    if (category !== undefined) {
      const normalizedCategory = validateCategoryName(category);
      if (!normalizedCategory || !findCategoryByName(db, normalizedCategory)) {
        return res.status(400).json({ error: 'Category not found. Add it from the Categories section first.' });
      }
      book.category = normalizedCategory;
    }
    if (is_free !== undefined) book.is_free = parseBooleanInput(is_free);
    if (featured !== undefined) book.featured = parseBooleanInput(featured);

    const coverSource = normalizeMaybeUrl(req.body?.cover_source) || 'url';
    const pdfSource = normalizeMaybeUrl(req.body?.pdf_source) || 'url';

    if (coverSource === 'upload') {
      const uploadedCover = getUploadUrl(req, 'cover_file');
      if (!uploadedCover) {
        return res.status(400).json({ error: 'Cover image file is required when upload is selected.' });
      }
      book.cover_url = uploadedCover;
    } else if (req.body?.cover_url !== undefined) {
      const nextCoverUrl = normalizeMaybeUrl(req.body.cover_url);
      if (!nextCoverUrl) {
        return res.status(400).json({ error: 'Cover image URL is required when URL is selected.' });
      }
      book.cover_url = nextCoverUrl;
    }

    if (pdfSource === 'upload') {
      const uploadedPdf = getUploadUrl(req, 'pdf_file');
      if (!uploadedPdf) {
        return res.status(400).json({ error: 'PDF file is required when upload is selected.' });
      }
      book.pdf_url = uploadedPdf;
    } else if (req.body?.pdf_url !== undefined) {
      const nextPdfUrl = normalizeMaybeUrl(req.body.pdf_url);
      if (!nextPdfUrl) {
        return res.status(400).json({ error: 'PDF URL is required when URL is selected.' });
      }
      book.pdf_url = nextPdfUrl;
    }

    await writeDb(db);

    return res.json({ data: book });
  } catch (error) {
    if (error instanceof Error && error.message.includes('required')) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.delete('/api/admin/books/:bookId', authRequired, adminRequired, async (req, res) => {
  try {
    const { bookId } = req.params;
    const db = await readDb();
    const bookIndex = db.books.findIndex((b) => b.id === bookId);

    if (bookIndex === -1) {
      return res.status(404).json({ error: 'Book not found' });
    }

    const deletedBook = db.books.splice(bookIndex, 1)[0];
    await writeDb(db);

    return res.json({ message: `Book "${deletedBook.title}" deleted successfully`, data: deletedBook });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.get('/api/subscription/me', authRequired, async (req, res) => {
  try {
    const subscription = await findActiveSubscription(req.userId);
    return res.json({ data: subscription });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.post('/api/payments/create-order', authRequired, async (req, res) => {
  try {
    if (!isRazorpayConfigured || !razorpayClient) {
      return res.status(503).json({
        error: 'Razorpay is not configured on server. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in backend/.env.',
      });
    }

    const { plan = 'monthly' } = req.body || {};

    const db = await readDb();
    const plans = getSubscriptionPlans(db);
    const selectedPlan = plans.find((item) => item.id === plan);
    if (!selectedPlan) {
      return res.status(400).json({ error: 'Invalid subscription plan.' });
    }

    const amount = selectedPlan.amount;
    const order = await razorpayClient.orders.create({
      amount,
      currency: 'INR',
      receipt: `sub_${req.userId.slice(0, 8)}_${Date.now()}`,
      notes: {
        user_id: req.userId,
        plan: selectedPlan.id,
      },
    });

    if (!order?.id) {
      return res.status(502).json({ error: 'Failed to create Razorpay order.' });
    }

    const pendingSubscription = {
      id: uuidv4(),
      user_id: req.userId,
      status: 'pending',
      start_date: null,
      expiry_date: null,
      razorpay_order_id: order.id,
      razorpay_payment_id: null,
      plan: selectedPlan.id,
      amount,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    db.subscriptions.push(pendingSubscription);
    await writeDb(db);

    return res.json({
      orderId: order.id,
      amount,
      currency: 'INR',
      keyId: razorpayKeyId,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.post('/api/payments/verify', authRequired, async (req, res) => {
  try {
    if (!isRazorpayConfigured) {
      return res.status(503).json({
        error: 'Razorpay is not configured on server. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in backend/.env.',
      });
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment details.' });
    }

    const db = await readDb();
    const plans = getSubscriptionPlans(db);
    const record = db.subscriptions
      .filter((s) => s.user_id === req.userId && s.razorpay_order_id === razorpay_order_id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

    if (!record) {
      return res.status(404).json({ error: 'Subscription record not found.' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', razorpayKeySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');
    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment verification failed: invalid signature.' });
    }

    const now = new Date();
    const expiryDate = new Date(now);
    const matchedPlan = plans.find((item) => item.id === record.plan);
    const durationDays = matchedPlan?.duration_days || (record.plan === 'yearly' ? 365 : 30);
    expiryDate.setDate(expiryDate.getDate() + durationDays);

    for (const sub of db.subscriptions) {
      if (sub.user_id === req.userId && sub.status === 'active') {
        sub.status = 'expired';
        sub.updated_at = now.toISOString();
      }
    }

    record.status = 'active';
    record.start_date = now.toISOString();
    record.expiry_date = expiryDate.toISOString();
    record.razorpay_payment_id = razorpay_payment_id;
    record.updated_at = now.toISOString();

    await writeDb(db);

    return res.json({ success: true, expiry_date: record.expiry_date });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.get('/api/admin/users', authRequired, adminRequired, async (_req, res) => {
  try {
    const db = await readDb();
    const users = db.users.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      role: u.role || 'user',
      createdAt: u.createdAt,
      is_blocked: isUserBlocked(u),
      blocked_at: u.blockedAt || u.blocked_at || null,
      ...getUserSubscriptionSummary(db, u.id),
    }));
    return res.json({ data: users });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.get('/api/admin/users/export.csv', authRequired, adminRequired, async (_req, res) => {
  try {
    const { startDate, endDate, error: dateRangeError } = parseDateRangeFromQuery(_req.query);
    if (dateRangeError) {
      return res.status(400).json({ error: dateRangeError });
    }

    const db = await readDb();
    const users = db.users
      .map((user) => ({
        id: user.id,
        email: user.email,
        full_name: user.fullName || '',
        role: user.role || 'user',
        created_at: user.createdAt || '',
        is_blocked: isUserBlocked(user),
        blocked_at: user.blockedAt || user.blocked_at || '',
        ...getUserSubscriptionSummary(db, user.id),
      }))
      .filter((user) => isDateInRange(user.created_at, startDate, endDate))
      .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime());

    const headers = [
      'id',
      'email',
      'full_name',
      'role',
      'created_at',
      'is_blocked',
      'blocked_at',
      'subscription_status',
      'subscription_plan',
      'subscription_amount_paise',
      'subscription_expiry_date',
    ];
    const rows = users.map((user) => [
      user.id,
      user.email,
      user.full_name,
      user.role,
      user.created_at,
      Boolean(user.is_blocked),
      user.blocked_at,
      user.subscription_status || '',
      user.subscription_plan || '',
      user.subscription_amount_paise || '',
      user.subscription_expiry_date || '',
    ]);
    const csv = buildCsv(headers, rows);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="users-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.status(200).send(csv);
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.post('/api/admin/users/:userId/promote', authRequired, adminRequired, async (req, res) => {
  try {
    const { userId } = req.params;
    const db = await readDb();
    const user = db.users.find((u) => u.id === userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.role = 'admin';
    await writeDb(db);

    return res.json({
      message: `User ${user.email} promoted to admin`,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.post('/api/admin/users/:userId/demote', authRequired, adminRequired, async (req, res) => {
  try {
    const { userId } = req.params;
    const db = await readDb();
    const user = db.users.find((u) => u.id === userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.role = 'user';
    await writeDb(db);

    return res.json({
      message: `User ${user.email} demoted to user`,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.post('/api/admin/users/:userId/block', authRequired, adminRequired, async (req, res) => {
  try {
    const { userId } = req.params;
    if (req.userId === userId) {
      return res.status(400).json({ error: 'You cannot block your own account.' });
    }

    const db = await readDb();
    const user = db.users.find((u) => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.isBlocked = true;
    user.blockedAt = new Date().toISOString();
    await writeDb(db);

    return res.json({
      message: `User ${user.email} has been blocked`,
      user: {
        id: user.id,
        email: user.email,
        is_blocked: true,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.post('/api/admin/users/:userId/unblock', authRequired, adminRequired, async (req, res) => {
  try {
    const { userId } = req.params;
    const db = await readDb();
    const user = db.users.find((u) => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.isBlocked = false;
    user.blockedAt = null;
    await writeDb(db);

    return res.json({
      message: `User ${user.email} has been unblocked`,
      user: {
        id: user.id,
        email: user.email,
        is_blocked: false,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.post('/api/admin/users/:userId/subscription', authRequired, adminRequired, async (req, res) => {
  try {
    const { userId } = req.params;
    const action = String(req.body?.action || '').toLowerCase();
    if (action !== 'activate' && action !== 'extend') {
      return res.status(400).json({ error: 'Action must be activate or extend.' });
    }

    const planId = req.body?.planId || req.body?.plan_id || null;
    const expiryDate = req.body?.expiryDate || req.body?.expiry_date || null;
    const extendDays = req.body?.extendDays ?? req.body?.extend_days ?? null;

    const db = await readDb();
    const result = applyManualSubscriptionChange(db, userId, {
      action,
      planId,
      expiryDate,
      extendDays,
    });

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    await writeDb(db);

    return res.json({
      message: action === 'extend' ? 'Subscription extended successfully.' : 'Subscription activated successfully.',
      user: {
        id: result.user.id,
        email: result.user.email,
        role: result.user.role || 'user',
      },
      subscription: result.subscription,
      summary: getUserSubscriptionSummary(db, userId),
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.use((error, _req, res, next) => {
  if (error?.message === 'Cover upload must be an image file.' || error?.message === 'PDF upload must be a PDF file.' || error?.message === 'Unexpected upload field.') {
    return res.status(400).json({ error: error.message });
  }

  if (error?.name === 'MulterError') {
    return res.status(400).json({ error: error.message });
  }

  return next(error);
});

async function startServer() {
  try {
    await fs.mkdir(uploadsDir, { recursive: true });
    await getMongoDatabase();
    app.listen(port, () => {
      // Keep startup log minimal and clear for local development.
      console.log(`Backend running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to connect to MongoDB before starting the server:', error);
    process.exit(1);
  }
}

startServer();
