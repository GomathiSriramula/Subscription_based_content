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
const dbPath = path.join(__dirname, '..', 'data', 'db.json');
const mongoClient = new MongoClient(mongoUri);
let mongoDatabasePromise = null;

app.use(
  cors({
    origin(origin, callback) {
      // Allow server-to-server tools and local dev origins (Vite can auto-switch ports).
      if (!origin) {
        return callback(null, true);
      }

      if (frontendOrigins.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
  })
);
app.use(express.json());

async function readDb() {
  const database = await getMongoDatabase();
  const [users, subscriptions, subscriptionPlans, books] = await Promise.all([
    database.collection('users').find({}).toArray(),
    database.collection('subscriptions').find({}).toArray(),
    database.collection('subscription_plans').find({}).toArray(),
    database.collection('books').find({}).toArray(),
  ]);

  return {
    users: users.map(stripMongoId),
    subscriptions: subscriptions.map(stripMongoId),
    subscription_plans: subscriptionPlans.map(stripMongoId),
    books: books.map(stripMongoId),
  };
}

async function writeDb(db) {
  const database = await getMongoDatabase();
  const collections = {
    users: Array.isArray(db.users) ? db.users : [],
    subscriptions: Array.isArray(db.subscriptions) ? db.subscriptions : [],
    subscription_plans: Array.isArray(db.subscription_plans) ? db.subscription_plans : [],
    books: Array.isArray(db.books) ? db.books : [],
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
    return;
  }

  const raw = await fs.readFile(dbPath, 'utf8');
  const seedData = JSON.parse(raw);
  const seedCollections = [
    ['users', seedData.users || []],
    ['subscriptions', seedData.subscriptions || []],
    ['subscription_plans', seedData.subscription_plans || getDefaultSubscriptionPlans()],
    ['books', seedData.books || []],
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

function getSubscriptionPlans(db) {
  if (!Array.isArray(db.subscription_plans) || db.subscription_plans.length === 0) {
    db.subscription_plans = getDefaultSubscriptionPlans();
  }

  return db.subscription_plans.map((plan) => ({
    id: String(plan.id),
    name: String(plan.name || plan.id),
    amount: Number(plan.amount || 0),
    duration_days: Number(plan.duration_days || 0),
  }));
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

app.get('/api/books', async (_req, res) => {
  try {
    const db = await readDb();
    const books = [...db.books].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
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
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
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
    const books = [...db.books].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return res.json({ data: books });
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

    plan.amount = Math.round(numericAmount);
    plan.duration_days = Math.round(numericDuration);
    if (name !== undefined) {
      plan.name = String(name).trim() || plan.name;
    }

    db.subscription_plans = plans;
    await writeDb(db);
    return res.json({ data: plan });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.post('/api/admin/books', authRequired, adminRequired, async (req, res) => {
  try {
    const { title, author, description, cover_url, pdf_url, category, is_free } = req.body || {};
    
    if (!title || !author || !description || !cover_url || !pdf_url || !category) {
      return res.status(400).json({ error: 'All book fields (title, author, description, cover_url, pdf_url, category) are required.' });
    }

    const db = await readDb();
    const book = {
      id: `book-${uuidv4()}`,
      title: String(title).trim(),
      author: String(author).trim(),
      description: String(description).trim(),
      cover_url: String(cover_url).trim(),
      pdf_url: String(pdf_url).trim(),
      category: String(category).trim(),
      is_free: Boolean(is_free),
      created_at: new Date().toISOString(),
    };

    db.books.push(book);
    await writeDb(db);

    return res.status(201).json({ data: book });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

app.put('/api/admin/books/:bookId', authRequired, adminRequired, async (req, res) => {
  try {
    const { bookId } = req.params;
    const { title, author, description, cover_url, pdf_url, category, is_free } = req.body || {};

    const db = await readDb();
    const book = db.books.find((b) => b.id === bookId);

    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    if (title !== undefined) book.title = String(title).trim();
    if (author !== undefined) book.author = String(author).trim();
    if (description !== undefined) book.description = String(description).trim();
    if (cover_url !== undefined) book.cover_url = String(cover_url).trim();
    if (pdf_url !== undefined) book.pdf_url = String(pdf_url).trim();
    if (category !== undefined) book.category = String(category).trim();
    if (is_free !== undefined) book.is_free = Boolean(is_free);

    await writeDb(db);
    return res.json({ data: book });
  } catch (error) {
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
    }));
    return res.json({ data: users });
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

async function startServer() {
  try {
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
