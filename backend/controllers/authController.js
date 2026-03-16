const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

exports.googleCallback = (req, res) => {
  try {
    const token = generateToken(req.user._id);
    
    // Set cookie with appropriate settings for cross-origin
    res.cookie('token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: '/'
    });
    
    // Try redirecting to simpler token-handler page to avoid Suspense issues
    res.redirect(`${process.env.CLIENT_URL}/token-handler?token=${token}`);
  } catch (error) {
    console.error('Google callback error:', error);
    res.redirect(`${process.env.CLIENT_URL}/login?error=auth_failed`);
  }
};

exports.logout = (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/'
  });
  res.status(200).json({ success: true, message: 'Logged out successfully' });
};

exports.getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-googleTokens');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Generate a fresh token to return to the frontend
    const token = generateToken(user._id);
    
    res.status(200).json({
      success: true,
      token, // Include token in response for frontend storage
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName,
        photo: user.photo,
        hasRefreshToken: !!req.user.googleTokens?.refresh_token
      }
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Add a new function to handle re-authentication
exports.requestReauth = (req, res) => {
  res.status(200).json({ 
    success: true, 
    message: 'Re-authentication required', 
    authUrl: '/api/auth/google' 
  });
};