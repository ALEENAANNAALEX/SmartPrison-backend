const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: false }, // Not required for OAuth users

  // User role
  role: {
    type: String,
    enum: ['user', 'visitor', 'admin', 'warden', 'staff'],
    default: 'visitor'
  },

  // Warden-specific fields
  wardenDetails: {
    employeeId: { type: String },
    assignedBlocks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PrisonBlock' }],
    shift: { type: String, enum: ['day', 'night', 'rotating'], default: 'day' },
    experience: { type: Number },
    specialization: { type: String },
    isActive: { type: Boolean, default: true }
  },

  // OAuth fields
  authProvider: {
    type: String,
    enum: ['local', 'google'],
    default: 'local'
  },

  // Complete Supabase user details
  supabaseId: { type: String, unique: true, sparse: true }, // Supabase user ID
  supabaseData: {
    aud: { type: String }, // Audience
    role: { type: String }, // User role
    email_confirmed_at: { type: Date }, // Email confirmation timestamp
    phone_confirmed_at: { type: Date }, // Phone confirmation timestamp
    confirmed_at: { type: Date }, // Account confirmation timestamp
    last_sign_in_at: { type: Date }, // Last sign in timestamp
    app_metadata: {
      provider: { type: String }, // OAuth provider (google, etc.)
      providers: [{ type: String }] // Array of providers used
    },
    user_metadata: {
      avatar_url: { type: String }, // Profile picture URL
      email: { type: String }, // Email from provider
      email_verified: { type: Boolean }, // Email verification status
      full_name: { type: String }, // Full name from provider
      iss: { type: String }, // Issuer
      name: { type: String }, // Name from provider
      picture: { type: String }, // Picture URL
      provider_id: { type: String }, // Provider user ID
      sub: { type: String } // Subject
    },
    identities: [{
      id: { type: String }, // Identity ID
      user_id: { type: String }, // User ID
      identity_data: {
        avatar_url: { type: String },
        email: { type: String },
        email_verified: { type: Boolean },
        full_name: { type: String },
        iss: { type: String },
        name: { type: String },
        picture: { type: String },
        provider_id: { type: String },
        sub: { type: String }
      },
      provider: { type: String }, // Provider name
      last_sign_in_at: { type: Date },
      created_at: { type: Date },
      updated_at: { type: Date }
    }],
    created_at: { type: Date }, // Supabase account creation
    updated_at: { type: Date }, // Last update in Supabase
    email_change_sent_at: { type: Date },
    phone_change_sent_at: { type: Date }
  },

  // Extracted fields for easy access
  profilePicture: { type: String }, // Primary profile picture URL
  emailVerified: { type: Boolean, default: false }, // Email verification status
  phoneNumber: { type: String }, // Phone number if provided
  address: { type: String }, // Address if provided
  gender: { type: String, enum: ['male', 'female', 'other'] }, // Gender
  nationality: { type: String }, // Nationality
  isActive: { type: Boolean, default: true }, // User active status

  // Reset password fields (only for local auth)
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },

  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date, default: Date.now }
});

// Hash password before saving, if it was set/changed
userSchema.pre('save', async function(next) {
  try {
    if (!this.isModified('password') || !this.password) return next();
    const bcrypt = require('bcryptjs');
    this.password = await bcrypt.hash(this.password, 10);
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model('User', userSchema);
