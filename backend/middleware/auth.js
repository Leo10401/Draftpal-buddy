const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.authenticate = async (req, res, next) => {
  try {
    // Method 1: Check for userId in request body (from Auth.js session)
    if (req.body && req.body.userId) {
      const user = await User.findById(req.body.userId);
      if (user) {
        req.user = user;
        console.log(`Auth middleware - User authenticated via userId: ${user.email}`);
        return next();
      }
    }

    // Method 2: Check for userId in query parameters
    if (req.query && req.query.userId) {
      const user = await User.findById(req.query.userId);
      if (user) {
        req.user = user;
        console.log(`Auth middleware - User authenticated via query userId: ${user.email}`);
        return next();
      }
    }

    // Method 3: Legacy JWT token auth (fallback)
    let token;
    let tokenSource = 'none';
    
    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
      tokenSource = 'cookie';
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
      tokenSource = 'header';
    } else if (req.query && req.query.token) {
      token = req.query.token;
      tokenSource = 'query';
    }
    
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      if (user) {
        req.user = user;
        console.log(`Auth middleware - User authenticated via ${tokenSource} JWT: ${user.email}`);
        return next();
      }
    }

    // No valid authentication found
    return res.status(401).json({ 
      message: 'Not authorized, no valid authentication provided'
    });
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    res.status(401).json({ 
      message: 'Not authorized', 
      error: error.message 
    });
  }
};