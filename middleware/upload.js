const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
const prisonerPhotosDir = path.join(uploadsDir, 'prisoner-photos');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

if (!fs.existsSync(prisonerPhotosDir)) {
  fs.mkdirSync(prisonerPhotosDir, { recursive: true });
}

// Configure multer for prisoner photo uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, prisonerPhotosDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename: prisoner_timestamp_originalname
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'prisoner_' + uniqueSuffix + ext);
  }
});

// File filter to only allow images
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  }
});

// Middleware for single photo upload
const uploadPrisonerPhoto = upload.single('photograph');

// Error handling middleware
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        success: false, 
        msg: 'File too large. Maximum size is 5MB.' 
      });
    }
    return res.status(400).json({ 
      success: false, 
      msg: 'File upload error: ' + error.message 
    });
  }
  
  if (error) {
    return res.status(400).json({ 
      success: false, 
      msg: error.message 
    });
  }
  
  next();
};

module.exports = {
  uploadPrisonerPhoto,
  handleUploadError
};
