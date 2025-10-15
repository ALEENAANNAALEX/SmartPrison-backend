/**
 * Government Validation Service
 * Simulates validation against government databases (Aadhaar, Voter ID, etc.)
 * In a real implementation, this would connect to actual government APIs
 */

class GovernmentValidationService {
  constructor() {
    // Mock government database - in real implementation, these would be actual API endpoints
    this.mockGovernmentDB = {
      // Sample records for testing
      '123456789012': {
        name: 'John Michael Doe',
        dateOfBirth: '1990-05-15',
        gender: 'male',
        fatherName: 'Robert Doe',
        motherName: 'Jane Doe',
        address: '123 Main Street, New Delhi, Delhi, 110001'
      },
      '987654321098': {
        name: 'Jane Smith',
        dateOfBirth: '1985-12-03',
        gender: 'female',
        fatherName: 'William Smith',
        motherName: 'Mary Smith',
        address: '456 Park Avenue, Mumbai, Maharashtra, 400001'
      }
    };
  }

  /**
   * Validate prisoner data against government records
   * @param {Object} prisonerData - The prisoner data to validate
   * @param {string} governmentIdNumber - Government ID number (Aadhaar, etc.)
   * @returns {Object} Validation result with discrepancies
   */
  async validatePrisonerData(prisonerData, governmentIdNumber) {
    try {
      // In real implementation, this would make API calls to government services
      const governmentRecord = await this.fetchGovernmentRecord(governmentIdNumber);
      
      if (!governmentRecord) {
        return {
          success: false,
          message: 'Government record not found',
          validationStatus: 'not_found',
          discrepancies: []
        };
      }

      const discrepancies = this.compareData(prisonerData, governmentRecord);
      
      return {
        success: true,
        validationStatus: discrepancies.length === 0 ? 'verified' : 'discrepancies_found',
        discrepancies: discrepancies,
        governmentRecord: governmentRecord
      };

    } catch (error) {
      console.error('Government validation error:', error);
      return {
        success: false,
        message: 'Validation service temporarily unavailable',
        validationStatus: 'error',
        discrepancies: []
      };
    }
  }

  /**
   * Fetch government record by ID number
   * @param {string} idNumber - Government ID number
   * @returns {Object|null} Government record or null if not found
   */
  async fetchGovernmentRecord(idNumber) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // In real implementation, this would be an actual API call
    return this.mockGovernmentDB[idNumber] || null;
  }

  /**
   * Compare prisoner data with government record
   * @param {Object} prisonerData - Prisoner data from form
   * @param {Object} governmentRecord - Government database record
   * @returns {Array} Array of discrepancies
   */
  compareData(prisonerData, governmentRecord) {
    const discrepancies = [];

    // Compare name
    const prisonerName = `${prisonerData.firstName} ${prisonerData.middleName || ''} ${prisonerData.lastName}`.trim();
    const govName = governmentRecord.name;
    
    if (this.normalizeName(prisonerName) !== this.normalizeName(govName)) {
      discrepancies.push({
        field: 'name',
        providedValue: prisonerName,
        governmentValue: govName,
        severity: this.calculateNameDiscrepancySeverity(prisonerName, govName),
        notes: 'Name does not match government records'
      });
    }

    // Compare date of birth
    const prisonerDOB = new Date(prisonerData.dateOfBirth).toISOString().split('T')[0];
    const govDOB = governmentRecord.dateOfBirth;
    
    if (prisonerDOB !== govDOB) {
      discrepancies.push({
        field: 'dateOfBirth',
        providedValue: prisonerDOB,
        governmentValue: govDOB,
        severity: 'major',
        notes: 'Date of birth does not match government records'
      });
    }

    // Compare gender
    if (prisonerData.gender !== governmentRecord.gender) {
      discrepancies.push({
        field: 'gender',
        providedValue: prisonerData.gender,
        governmentValue: governmentRecord.gender,
        severity: 'critical',
        notes: 'Gender does not match government records'
      });
    }

    // Compare address (if provided)
    if (prisonerData.address && prisonerData.address.street) {
      const prisonerAddress = prisonerData.address.street.toLowerCase();
      const govAddress = governmentRecord.address.toLowerCase();
      
      if (!this.addressesMatch(prisonerAddress, govAddress)) {
        discrepancies.push({
          field: 'address',
          providedValue: prisonerData.address.street,
          governmentValue: governmentRecord.address,
          severity: 'minor',
          notes: 'Address does not match government records'
        });
      }
    }

    return discrepancies;
  }

  /**
   * Normalize name for comparison
   * @param {string} name - Name to normalize
   * @returns {string} Normalized name
   */
  normalizeName(name) {
    return name.toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[^\w\s]/g, ''); // Remove special characters
  }

  /**
   * Calculate name discrepancy severity
   * @param {string} providedName - Name provided by user
   * @param {string} govName - Name from government records
   * @returns {string} Severity level
   */
  calculateNameDiscrepancySeverity(providedName, govName) {
    const provided = this.normalizeName(providedName).split(' ');
    const gov = this.normalizeName(govName).split(' ');
    
    // Check if at least first and last name match
    const firstMatch = provided[0] === gov[0];
    const lastMatch = provided[provided.length - 1] === gov[gov.length - 1];
    
    if (firstMatch && lastMatch) {
      return 'minor'; // Only middle name or order differs
    } else if (firstMatch || lastMatch) {
      return 'major'; // One of first/last name matches
    } else {
      return 'critical'; // No name components match
    }
  }

  /**
   * Check if addresses match (fuzzy matching)
   * @param {string} address1 - First address
   * @param {string} address2 - Second address
   * @returns {boolean} True if addresses match
   */
  addressesMatch(address1, address2) {
    const words1 = address1.split(/\s+/);
    const words2 = address2.split(/\s+/);
    
    // Check if at least 70% of words match
    const commonWords = words1.filter(word => words2.includes(word));
    const matchPercentage = commonWords.length / Math.max(words1.length, words2.length);
    
    return matchPercentage >= 0.7;
  }

  /**
   * Get validation status color for UI
   * @param {string} status - Validation status
   * @returns {string} CSS color class
   */
  getStatusColor(status) {
    switch (status) {
      case 'verified':
        return 'text-green-600 bg-green-100';
      case 'discrepancies_found':
        return 'text-yellow-600 bg-yellow-100';
      case 'override_approved':
        return 'text-blue-600 bg-blue-100';
      case 'not_found':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  }

  /**
   * Get severity color for UI
   * @param {string} severity - Discrepancy severity
   * @returns {string} CSS color class
   */
  getSeverityColor(severity) {
    switch (severity) {
      case 'minor':
        return 'text-yellow-600 bg-yellow-100';
      case 'major':
        return 'text-orange-600 bg-orange-100';
      case 'critical':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  }
}

module.exports = new GovernmentValidationService();
