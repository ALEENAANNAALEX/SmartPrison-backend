const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
const prisonerPhotosDir = path.join(uploadsDir, 'prisoner-photos');
const prisonerDocsDir = path.join(uploadsDir, 'prisoner-docs');
const bulkDir = path.join(uploadsDir, 'bulk');
const profilesDir = path.join(uploadsDir, 'profiles');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

if (!fs.existsSync(prisonerPhotosDir)) {
  fs.mkdirSync(prisonerPhotosDir, { recursive: true });
}

if (!fs.existsSync(prisonerDocsDir)) {
  fs.mkdirSync(prisonerDocsDir, { recursive: true });
}

if (!fs.existsSync(bulkDir)) {
  fs.mkdirSync(bulkDir, { recursive: true });
}

if (!fs.existsSync(profilesDir)) {
  fs.mkdirSync(profilesDir, { recursive: true });
}

// Configure multer storage with dynamic destination for photos/bulk CSV
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (file.fieldname === 'csvFile') {
      cb(null, bulkDir);
    } else if (file.fieldname === 'photos' || file.fieldname === 'photograph') {
      cb(null, prisonerPhotosDir);
    } else if (file.fieldname === 'governmentId') {
      cb(null, prisonerDocsDir);
    } else if (file.fieldname === 'profileImage' || file.fieldname === 'staffImage') {
      cb(null, profilesDir);
    } else {
      cb(null, uploadsDir);
    }
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    let base = 'prisoner_';
    if (file.fieldname === 'csvFile') {
      base = 'bulk_';
    } else if (file.fieldname === 'profileImage' || file.fieldname === 'staffImage') {
      base = 'profile_';
    } else if (file.fieldname === 'governmentId') {
      base = 'govid_';
    }
    cb(null, base + uniqueSuffix + ext);
  }
});

// File filter to allow images and CSV/XLSX (for bulk)
const fileFilter = (req, file, cb) => {
  const isImage = file.mimetype.startsWith('image/');
  const isGovId = file.fieldname === 'governmentId' && (
    file.mimetype === 'application/pdf' || isImage
  );
  const isSpreadsheet = file.fieldname === 'csvFile' && (
    file.mimetype === 'text/csv' ||
    file.mimetype === 'application/vnd.ms-excel' ||
    file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    /\.(csv|xlsx|xls)$/i.test(file.originalname)
  );
  if (isImage || isSpreadsheet || isGovId) {
    cb(null, true);
  } else {
    cb(new Error('Only image files or a CSV/XLSX (for bulk upload) are allowed!'), false);
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

// Middleware for prisoner file uploads (photo + governmentId)
const uploadPrisonerFiles = upload.fields([
  { name: 'photograph', maxCount: 1 },
  { name: 'governmentId', maxCount: 1 }
]);

// Middleware for staff profile image upload
const uploadStaffProfile = upload.single('staffImage');

// Middleware for bulk upload (CSV + multiple photos)
const uploadBulkPrisoners = upload.fields([
  { name: 'csvFile', maxCount: 1 },
  { name: 'photos', maxCount: 200 }
]);

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
  uploadPrisonerFiles,
  uploadStaffProfile,
  uploadBulkPrisoners,
  handleUploadError
};
