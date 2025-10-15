const express = require('express');
const multer = require('multer');
const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads/ocr-temp');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'ocr-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// OCR text extraction endpoint
router.post('/extract-text', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    const imagePath = req.file.path;
    console.log('Processing image:', imagePath);

    // Preprocess image for better OCR results
    const processedImagePath = await preprocessImage(imagePath);

    // Perform OCR using Tesseract.js
    const { data: { text, confidence } } = await Tesseract.recognize(
      processedImagePath,
      'eng',
      {
        logger: m => console.log(m)
      }
    );

    console.log('OCR Confidence:', confidence);
    console.log('Extracted text:', text);

    // Clean up temporary files
    fs.unlinkSync(imagePath);
    if (processedImagePath !== imagePath) {
      fs.unlinkSync(processedImagePath);
    }

    res.json({
      success: true,
      text: text,
      confidence: confidence,
      message: 'Text extracted successfully'
    });

  } catch (error) {
    console.error('OCR processing error:', error);
    
    // Clean up files on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      message: 'OCR processing failed',
      error: error.message
    });
  }
});

// Image preprocessing function
async function preprocessImage(imagePath) {
  try {
    const processedPath = imagePath.replace(/\.[^/.]+$/, '_processed.png');
    
    await sharp(imagePath)
      .resize(2000, 2000, { 
        fit: 'inside',
        withoutEnlargement: true 
      })
      .grayscale()
      .normalize()
      .sharpen()
      .png()
      .toFile(processedPath);

    return processedPath;
  } catch (error) {
    console.error('Image preprocessing error:', error);
    return imagePath; // Return original if preprocessing fails
  }
}

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'OCR service is running',
    timestamp: new Date().toISOString()
  });
});

// Test endpoint with sample text extraction
router.post('/test', async (req, res) => {
  try {
    // This is a test endpoint that simulates OCR processing
    const sampleText = `
      GOVERNMENT OF INDIA
      AADHAAR CARD
      
      Name: John Michael Doe
      Date of Birth: 15/03/1985
      Gender: Male
      Father's Name: Robert Doe
      Mother's Name: Mary Doe
      Address: 123 Main Street, City, State, 12345
      Aadhaar Number: 1234 5678 9012
    `;

    res.json({
      success: true,
      text: sampleText,
      confidence: 95,
      message: 'Test OCR completed successfully'
    });

  } catch (error) {
    console.error('Test OCR error:', error);
    res.status(500).json({
      success: false,
      message: 'Test OCR failed',
      error: error.message
    });
  }
});

module.exports = router;

