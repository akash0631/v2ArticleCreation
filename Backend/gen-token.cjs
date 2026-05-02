require('dotenv').config({ quiet: true });
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

const token = jwt.sign(
  { id: 1, email: 'admin@fashion.com', role: 'ADMIN' },
  JWT_SECRET,
  { expiresIn: '24h' }
);

console.log(token);
