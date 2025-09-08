// Generates a clean Excel template (header-only) for prisoner bulk upload
// Outputs to the frontend public folder for easy download

const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');

const root = path.resolve(__dirname, '../../');
const outputPath = path.join(root, 'Prison', 'public', 'prisoner-bulk-upload-template.xlsx');

// Ensure public directory exists
const publicDir = path.dirname(outputPath);
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Simplified header matching the form fields from screenshot
// Prisoner number will be auto-generated, so not included in template
const headers = [
  'fullName',
  'dateOfBirth',
  'gender',
  'currentBlock',
  'cellNumber',
  'securityLevel',
  'admissionDate',
  'primaryCharge',
  'sentenceLength',
  'address_street',
  'address_city',
  'address_state',
  'address_pincode',
  'emergencyContact_name',
  'emergencyContact_relationship',
  'emergencyContact_phone',
  'photoFilename'
];

const title = [['Prisoner Bulk Upload Template - All Fields Required']];
const instructions = [['INSTRUCTIONS: Fill all columns below. Prisoner numbers will be auto-generated. Delete this row before upload.']];
const spacer = [[]];
const headerRow = [...headers];
const sampleRow = [
  'John Michael Doe',           // fullName
  '1990-05-15',                // dateOfBirth (YYYY-MM-DD)
  'male',                      // gender (male/female/other)
  'Block A',                   // currentBlock (must match existing block)
  'C001',                      // cellNumber
  'medium',                    // securityLevel (minimum/medium/maximum/supermax)
  '2024-01-15',               // admissionDate (YYYY-MM-DD)
  'Theft',                     // primaryCharge
  '24',                        // sentenceLength (in months)
  '123 Main Street',           // address_street
  'Mumbai',                    // address_city
  'Maharashtra',               // address_state
  '400001',                    // address_pincode
  'Jane Doe',                  // emergencyContact_name
  'Mother',                    // emergencyContact_relationship
  '9876543210',               // emergencyContact_phone
  'prisoner_photo_1.jpg'       // photoFilename (optional)
];

const ws = xlsx.utils.aoa_to_sheet([
  title,
  instructions,
  spacer,
  headerRow,
  sampleRow
]);

// Merge title and instruction rows across all columns
ws['!merges'] = [
  { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }, // Title row
  { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } }  // Instructions row
];

// Make the header row bold (Excel style hint)
ws['!cols'] = headers.map(() => ({ wch: 20 }));

const wb = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(wb, ws, 'Template');
xlsx.writeFile(wb, outputPath);

console.log('Template written to:', outputPath);