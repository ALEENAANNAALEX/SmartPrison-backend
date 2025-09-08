const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { Visit, ALLOWED_SLOTS } = require('../models/Visit');
const Prisoner = require('../models/Prisoner');
const User = require('../models/User');
const Details = require('../models/Details');
async function requireAdmin(req, res, next) {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });
    const decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'secret');
    const user = await User.findById(decoded.id);
    if (!user || user.role !== 'admin') return res.status(403).json({ msg: 'Access denied. Admin only.' });
    req.user = user;
    next();
  } catch (e) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
}
// GET /api/visits/approved (admin)
router.get('/approved', requireAdmin, async (req, res) => {
  try {
    const approved = await Visit.find({ status: 'approved' })
      .populate('prisoner', 'firstName lastName prisonerNumber')
      .populate('visitor', 'name email')
      .sort({ createdAt: -1 });
    res.json({ success: true, approved });
  } catch (err) {
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});
// DEBUG: List all visits for all users (no auth, for troubleshooting only)
router.get('/debug/all', async (req, res) => {
  try {
    const visits = await Visit.find({})
      .populate('prisoner', 'firstName lastName prisonerNumber')
      .populate('visitor', 'name email')
      .sort({ visitDate: -1, visitTime: -1 });
    res.json({ success: true, visits });
  } catch (err) {
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// GET /api/visits/linked-inmates
// Returns inmates where the current user's email/phone matches an emergency contact
router.get('/linked-inmates', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).lean();
    if (!user) return res.status(404).json({ msg: 'User not found' });

    const email = user.email || user?.supabaseData?.user_metadata?.email;
    const phone = user.phoneNumber;
    const fullName = (user.name || user?.supabaseData?.user_metadata?.full_name || '').trim();

    const orConditions = [];
    if (email) {
      orConditions.push({ 'emergencyContact.email': new RegExp('^' + email + '$', 'i') });
      orConditions.push({ 'emergencyContacts.email': new RegExp('^' + email + '$', 'i') });
    }
    if (phone) {
      const digits = String(phone).replace(/\D/g, '');
      if (digits) {
        // Match digits within contact phones (ignore formatting)
        orConditions.push({ 'emergencyContact.phone': { $regex: digits + '$' } });
        orConditions.push({ 'emergencyContacts.phone': { $regex: digits + '$' } });
      }
    }

    if (fullName) {
      orConditions.push({ 'emergencyContact.name': new RegExp('^' + fullName + '$', 'i') });
      orConditions.push({ 'emergencyContacts.name': new RegExp('^' + fullName + '$', 'i') });
    }

    if (orConditions.length === 0) {
      return res.json({ success: true, inmates: [] });
    }

    const prisoners = await Prisoner.find({ $or: orConditions })
      .select('firstName middleName lastName emergencyContact emergencyContacts')
      .lean();

    const inmates = prisoners.map((p) => {
      const fullName = [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ');
      let relationship = null;
      // Determine relationship from the matching contact
      const contacts = [];
      if (p.emergencyContact) contacts.push(p.emergencyContact);
      if (Array.isArray(p.emergencyContacts)) contacts.push(...p.emergencyContacts);
      const match = contacts.find((c) => {
        const cEmail = c?.email || '';
        const cPhone = (c?.phone || '').replace(/\D/g, '');
        const userPhone = String(phone || '').replace(/\D/g, '');
        const cName = (c?.name || '').trim();
        return (
          (email && cEmail && new RegExp('^' + email + '$', 'i').test(cEmail)) ||
          (userPhone && cPhone && cPhone.endsWith(userPhone)) ||
          (fullName && cName && new RegExp('^' + fullName + '$', 'i').test(cName))
        );
      });
      relationship = match?.relationship || null;
      return { fullName, relationship };
    });

    return res.json({ success: true, inmates });
  } catch (err) {
    return res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// Simple auth middleware (same behavior as in other routes)
function requireAuth(req, res, next) {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ msg: 'Token is not valid' });
  }
}

// Helpers
function normalizeDateOnly(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function isWithinNextMonthFromTomorrow(dateOnly) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const max = new Date(tomorrow);
  max.setMonth(max.getMonth() + 1);

  return dateOnly >= tomorrow && dateOnly <= max;
}

// GET /api/visits/availability?date=YYYY-MM-DD
// Returns remaining capacity per slot for the given date (global capacity 10 per slot)
router.get('/availability', requireAuth, async (req, res) => {
  try {
    const { date } = req.query;
    const dateOnly = normalizeDateOnly(date);
    if (!dateOnly) return res.status(400).json({ msg: 'Invalid date' });

    // Count existing approved visits grouped by slot
    const pipeline = [
      { $match: { visitDate: dateOnly, status: { $in: ['approved'] } } },
      { $group: { _id: '$visitTime', count: { $sum: 1 } } }
    ];
    const counts = await Visit.aggregate(pipeline);
    const bySlot = Object.fromEntries(counts.map(c => [c._id, c.count]));

    const capacity = 10;
    const slots = ALLOWED_SLOTS.map(slot => ({
      slot,
      remaining: Math.max(0, capacity - (bySlot[slot] || 0))
    }));

    res.json({ success: true, date: dateOnly.toISOString().slice(0,10), slots });
  } catch (err) {
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// POST /api/visits
// Body: { inmateName: string, visitDate: 'YYYY-MM-DD', visitTime: 'HH:mm', purpose }
// Rules:
// - Date must be from tomorrow up to +1 month (inclusive)
// - Only 1 approved visit per prisoner per day
// - Max 10 approved visits per time slot (global across all prisoners)
router.post('/', requireAuth, async (req, res) => {
  try {
    const { inmateName, visitDate, visitTime, purpose } = req.body || {};

    if (!inmateName || !visitDate || !visitTime) {
      return res.status(400).json({ msg: 'inmateName, visitDate and visitTime are required' });
    }

    if (!ALLOWED_SLOTS.includes(visitTime)) {
      return res.status(400).json({ msg: 'Invalid visit time slot' });
    }

    const dateOnly = normalizeDateOnly(visitDate);
    if (!dateOnly) return res.status(400).json({ msg: 'Invalid visit date' });
    if (!isWithinNextMonthFromTomorrow(dateOnly)) {
      return res.status(400).json({ msg: 'Visit date must be from tomorrow up to one month ahead' });
    }

    // Resolve prisoner by name
    const name = String(inmateName).trim();
    const parts = name.split(/\s+/);
    const first = parts.shift();
    const last = parts.join(' ') || '';

    let prisoner = null;
    if (first && last) {
      prisoner = await Prisoner.findOne({ firstName: new RegExp('^' + first + '$', 'i'), lastName: new RegExp('^' + last + '$', 'i') });
    }
    if (!prisoner) {
      prisoner = await Prisoner.findOne({ $or: [
        { firstName: new RegExp('^' + name + '$', 'i') },
        { lastName: new RegExp('^' + name + '$', 'i') }
      ]});
    }

    if (!prisoner) {
      return res.status(404).json({ msg: 'Prisoner not found by provided name' });
    }

    // Only block duplicates among approved for the day;
    // new requests are pending and will be approved later.
    const existingApproved = await Visit.findOne({ prisoner: prisoner._id, visitDate: dateOnly, status: 'approved' });
    if (existingApproved) {
      return res.status(400).json({ msg: 'This prisoner already has an approved visit for this day' });
    }

    // Capacity: count only approved in slot
    const capacity = 10;
    const currentApprovedCount = await Visit.countDocuments({ visitDate: dateOnly, visitTime, status: 'approved' });
    if (currentApprovedCount >= capacity) {
      return res.status(400).json({ msg: 'Selected time slot is full for this date' });
    }

    const visit = new Visit({
      prisoner: prisoner._id,
      visitor: req.user.id,
      visitDate: dateOnly,
      visitTime,
      purpose,
      status: 'pending'
    });

    await visit.save();
    console.log('[DEBUG] Visit created:', {
      visitor: req.user.id,
      prisoner: prisoner._id,
      visitDate: dateOnly,
      visitTime,
      status: 'pending'
    });

    return res.json({ success: true, visit });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(400).json({ msg: 'Duplicate request detected' });
    }
    return res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// DELETE /api/visits/:id - allow user to delete own pending request
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const visit = await Visit.findById(req.params.id);
    if (!visit) return res.status(404).json({ msg: 'Visit not found' });
    if (String(visit.visitor) !== String(req.user.id)) {
      return res.status(403).json({ msg: 'Not authorized to delete this visit' });
    }
    if (visit.status !== 'pending') {
      return res.status(400).json({ msg: 'Only pending requests can be deleted' });
    }
    await Visit.findByIdAndDelete(visit._id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// GET /api/visits/mine
// List current user visits by status
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const { status } = req.query; // optional: pending|approved|rejected|completed|cancelled
    const filter = { visitor: req.user.id };
    if (status) filter.status = status;
    const visits = await Visit.find(filter)
      .populate('prisoner', 'firstName lastName prisonerNumber')
      .sort({ visitDate: 1, visitTime: 1 });
    console.log('[DEBUG] /api/visits/mine for user', req.user.id, 'returned', visits.length, 'visits');
    res.json({ success: true, visits });
  } catch (err) {
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// GET /api/visits/upcoming
router.get('/upcoming', requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    // Helper to compare slot times (e.g., '09:00') with current time
    const slotToMinutes = (s) => {
      const [hh, mm] = String(s).split(':').map(Number);
      return (hh * 60) + (mm || 0);
    };
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const pastSlotsToday = ALLOWED_SLOTS.filter(s => slotToMinutes(s) < nowMinutes);
    const futureOrEqualSlotsToday = ALLOWED_SLOTS.filter(s => slotToMinutes(s) >= nowMinutes);

    // 1) Auto-move past approved visits to completed
    //    - Any approved visit with date < today
    //    - Or today with a slot that already passed
    await Visit.updateMany({
      visitor: req.user.id,
      status: 'approved',
      $or: [
        { visitDate: { $lt: today } },
        { visitDate: today, visitTime: { $in: pastSlotsToday } }
      ]
    }, {
      $set: { status: 'completed' }
    });

    // 2) Return only truly upcoming approved visits
    const visits = await Visit.find({
      visitor: req.user.id,
      status: 'approved',
      $or: [
        { visitDate: { $gt: today } },
        { visitDate: today, visitTime: { $in: futureOrEqualSlotsToday } }
      ]
    })
      .populate('prisoner', 'firstName lastName prisonerNumber')
      .sort({ visitDate: 1, visitTime: 1 });

    res.json({ success: true, visits });
  } catch (err) {
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// Admin moderation of visit requests
// ...existing code...

// GET /api/visits/pending (admin)
router.get('/pending', requireAdmin, async (req, res) => {
  try {
    const pending = await Visit.find({ status: 'pending' })
      .populate('prisoner', 'firstName lastName prisonerNumber')
      .populate('visitor', 'name email')
      .sort({ createdAt: -1 });
    // Augment with relationship between visitor and prisoner, if available
    const enhanced = await Promise.all(pending.map(async (v) => {
      let relationship = null;

      // 1) Try to resolve from prisoner's emergency contacts (set during prisoner creation)
      try {
        const prisoner = await Prisoner.findById(v.prisoner?._id)
          .select('emergencyContact emergencyContacts')
          .lean();
        if (prisoner) {
          const contacts = [];
          if (prisoner.emergencyContact) contacts.push(prisoner.emergencyContact);
          if (Array.isArray(prisoner.emergencyContacts)) contacts.push(...prisoner.emergencyContacts);

          const visitorName = (v.visitor?.name || '').trim().toLowerCase();
          const visitorEmail = (v.visitor?.email || '').trim().toLowerCase();

          const match = contacts.find(c => {
            const cName = (c?.name || '').trim().toLowerCase();
            const cEmail = (c?.email || '').trim().toLowerCase();
            return (visitorName && cName && cName === visitorName) || (visitorEmail && cEmail && cEmail === visitorEmail);
          });
          relationship = match?.relationship || null;
        }
      } catch (_) {
        // ignore
      }

      // 2) Fallback to visitor Details mapping, if available
      if (!relationship) {
        try {
          const details = await Details.findOne({ userId: v.visitor?._id }).lean();
          const relations = details?.visitorDetails?.prisonerRelations || [];
          const match = relations.find(r => String(r.prisonerId) === String(v.prisoner?._id));
          relationship = match?.relationship || details?.visitorDetails?.relationshipToPrisoner || null;
        } catch (_) {
          relationship = null;
        }
      }

      const obj = v.toObject();
      obj.relationship = relationship || undefined;
      return obj;
    }));

    res.json({ success: true, pending: enhanced });
  } catch (err) {
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// PUT /api/visits/:id/approve (admin)
router.put('/:id/approve', requireAdmin, async (req, res) => {
  try {
    const visit = await Visit.findById(req.params.id);
    if (!visit) return res.status(404).json({ msg: 'Visit not found' });

    // Check capacity for approved
    const approvedCount = await Visit.countDocuments({
      visitDate: visit.visitDate,
      visitTime: visit.visitTime,
      status: 'approved'
    });
    if (approvedCount >= 10) {
      return res.status(400).json({ msg: 'Slot full, cannot approve' });
    }

    // Ensure no other approved visit for the same prisoner/day
    const existingApproved = await Visit.findOne({
      _id: { $ne: visit._id },
      prisoner: visit.prisoner,
      visitDate: visit.visitDate,
      status: 'approved'
    });
    if (existingApproved) {
      return res.status(400).json({ msg: 'Prisoner already has an approved visit for this day' });
    }

    visit.status = 'approved';
    await visit.save();
    res.json({ success: true, visit });
  } catch (err) {
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// PUT /api/visits/:id/reject (admin)
router.put('/:id/reject', requireAdmin, async (req, res) => {
  try {
    const visit = await Visit.findById(req.params.id);
    if (!visit) return res.status(404).json({ msg: 'Visit not found' });
    visit.status = 'rejected';
    await visit.save();
    res.json({ success: true, visit });
  } catch (err) {
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

module.exports = router;