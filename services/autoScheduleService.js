const mongoose = require('mongoose');
const Schedule = require('../models/Schedule');
const User = require('../models/User');
const Details = require('../models/Details');
const PrisonBlock = require('../models/PrisonBlock');

class AutoScheduleService {
  constructor() {
    this.dayShiftTimes = {
      start: '09:00',
      end: '21:00'
    };
    this.nightShiftTimes = {
      start: '21:00',
      end: '09:00'
    };
    this.visitingAreaTimes = {
      start: '09:00',
      end: '17:00'
    };
  }

  // Simple deterministic hash from string -> integer
  hashStringToInt(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0; // Convert to 32bit int
    }
    return Math.abs(hash);
  }

  async selectStaffWithRotation({ suitableStaff, requiredCount, date, location, usedStaffIds = new Set() }) {
    // Exclude already used in current run
    let pool = suitableStaff.filter(s => !usedStaffIds.has(String(s._id)));

    // Exclude recent assignees for same location on previous day (fairness)
    try {
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const prevStart = new Date(dayStart);
      prevStart.setDate(prevStart.getDate() - 1);
      const prevEnd = new Date(dayStart);

      const recent = await Schedule.find({
        date: { $gte: prevStart, $lt: prevEnd },
        location: location
      }).select('assignedStaff').limit(5);
      const recentIds = new Set(recent.flatMap(s => s.assignedStaff.map(id => String(id))));
      if (recentIds.size > 0) {
        pool = pool.filter(s => !recentIds.has(String(s._id)));
      }
    } catch (e) {
      // non-fatal
    }

    if (pool.length === 0) pool = suitableStaff.filter(s => !usedStaffIds.has(String(s._id)));
    if (pool.length === 0) return [];

    const seed = this.hashStringToInt(`${new Date(date).toISOString().slice(0,10)}|${location}`);
    const startIdx = seed % pool.length;
    const selected = [];
    const visited = new Set();
    for (let i = 0; i < pool.length && selected.length < requiredCount; i++) {
      const idx = (startIdx + i) % pool.length;
      if (visited.has(idx)) continue;
      visited.add(idx);
      const candidate = pool[idx];
      if (!candidate) continue;
      selected.push(candidate);
    }
    return selected;
  }

  // Generate auto-schedule for a specific date and shift
  async generateAutoSchedule(date, shift, createdBy) {
    try {
      const scheduleDate = new Date(date);
      
      // Clear existing auto-schedules for this date and shift
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      await Schedule.deleteMany({
        date: { $gte: dayStart, $lt: dayEnd },
        shift: shift,
        isAutoScheduled: true
      });

      // Determine opposite shift (no deletion here; we need to see existing
      // opposite-shift assignments to prevent cross-shift duplicates)
      const oppositeShift = shift === 'day' ? 'night' : 'day';
      
      // Get all available staff from Details model
      const allStaffDetails = await Details.find({ 
        userRole: 'staff',
        isActive: true 
      }).populate('userId', 'name email role');
      
      // Get all available staff
      const allStaff = allStaffDetails.map(detail => ({
        _id: detail.userId._id,
        name: detail.userId.name || 'Unknown Name',
        email: detail.userId.email || 'no-email@prison.com',
        role: detail.userId.role || 'staff',
        staffDetails: detail.roleSpecificDetails?.staffDetails || {},
        wardenDetails: detail.roleSpecificDetails?.wardenDetails || {}
      }));

      // Get staff availability for the shift
      const availableStaff = await this.getAvailableStaff(scheduleDate, shift);
      console.log(`Found ${availableStaff.length} available staff for ${shift} shift`);

      // Generate schedules for each location
      const schedules = [];
      const MAX_SCHEDULES_PER_SHIFT = 12;
      const usedStaffIds = new Set(); // Track used staff to ensure no double-booking

      // Central Facility locations - different for day and night shifts
      let centralLocations;
      if (shift === 'day') {
        centralLocations = [
          'Main Gate',
          'Control Room',
          'Medical Room',
          'Kitchen',
          'Visitor Area',
          'Admin Office',
          'Staff Room'
        ];
      } else {
        // Night shift: only essential locations
        centralLocations = [
          'Main Gate',
          'Control Room',
          'Medical Room'
        ];
      }

      for (const location of centralLocations) {
        console.log(`Creating schedule for ${location}...`);
        const schedule = await this.createLocationSchedule(
          scheduleDate, 
          shift, 
          location, 
          availableStaff,
          createdBy,
          usedStaffIds
        );
        if (schedule) {
          schedules.push(schedule);
          // Add assigned staff to used list
          schedule.assignedStaff.forEach(staffId => usedStaffIds.add(staffId.toString()));
          console.log(`✅ Created schedule for ${location} with ${schedule.assignedStaff.length} staff`);
          if (schedules.length >= MAX_SCHEDULES_PER_SHIFT) {
            console.log(`🛑 Reached max schedules for ${shift} (cap=${MAX_SCHEDULES_PER_SHIFT}) during central locations`);
            break;
          }
        } else {
          console.log(`❌ No schedule created for ${location}`);
        }
      }

      // Block locations - different for day and night shifts
      if (shift === 'day') {
        // Day shift: same staff for Cell and Dining Room
        const blockALocations = [
          'Block A - Cells',
          'Block A - Dining Room',
        ];

        // Get available staff excluding those already used in central facilities
        let blockAAvailableStaff = availableStaff.filter(
          staff => !usedStaffIds.has(staff._id.toString())
        );
        
        console.log(`Block A available staff (excluding used): ${blockAAvailableStaff.length}`);
        
        if (blockAAvailableStaff.length > 0 && schedules.length < MAX_SCHEDULES_PER_SHIFT) {
          // Select multiple staff members for both Block A locations
          const requiredCount = this.getRequiredStaffCount('Block A - Cells');
          const selectedStaff = blockAAvailableStaff.slice(0, Math.min(requiredCount, blockAAvailableStaff.length));
          console.log(`Selected ${selectedStaff.length} staff for Block A: ${selectedStaff.map(s => s.name).join(', ')}`);
          
          // Create schedule for both Block A locations with same staff
          for (const location of blockALocations) {
            const schedule = await this.createLocationScheduleWithStaff(
              scheduleDate, 
              shift, 
              location, 
              selectedStaff,
              createdBy
            );
            if (schedule) {
              schedules.push(schedule);
              // Add all selected staff to used list
              selectedStaff.forEach(staff => usedStaffIds.add(staff._id.toString()));
              console.log(`✅ Created schedule for ${location} with ${selectedStaff.length} staff: ${selectedStaff.map(s => s.name).join(', ')}`);
              if (schedules.length >= MAX_SCHEDULES_PER_SHIFT) {
                console.log(`🛑 Reached max schedules for ${shift} (cap=${MAX_SCHEDULES_PER_SHIFT}) after Block A`);
                break;
              }
            }
          }
        }

        // Block B locations - same staff for Cell and Dining Room, different from Block A
        const blockBLocations = [
          'Block B - Cells',
          'Block B - Dining Room',
        ];

        // Get available staff excluding those already used (central + Block A)
        let blockBAvailableStaff = availableStaff.filter(
          staff => !usedStaffIds.has(staff._id.toString())
        );
        
        console.log(`Block B available staff (excluding used): ${blockBAvailableStaff.length}`);
        
        if (blockBAvailableStaff.length > 0 && schedules.length < MAX_SCHEDULES_PER_SHIFT) {
          // Select multiple staff members for both Block B locations
          const requiredCount = this.getRequiredStaffCount('Block B - Cells');
          const selectedStaff = blockBAvailableStaff.slice(0, Math.min(requiredCount, blockBAvailableStaff.length));
          console.log(`Selected ${selectedStaff.length} staff for Block B: ${selectedStaff.map(s => s.name).join(', ')}`);
          
          // Create schedule for both Block B locations with same staff
          for (const location of blockBLocations) {
            const schedule = await this.createLocationScheduleWithStaff(
              scheduleDate, 
              shift, 
              location, 
              selectedStaff,
              createdBy
            );
            if (schedule) {
              schedules.push(schedule);
              // Add all selected staff to used list
              selectedStaff.forEach(staff => usedStaffIds.add(staff._id.toString()));
              console.log(`✅ Created schedule for ${location} with ${selectedStaff.length} staff: ${selectedStaff.map(s => s.name).join(', ')}`);
              if (schedules.length >= MAX_SCHEDULES_PER_SHIFT) {
                console.log(`🛑 Reached max schedules for ${shift} (cap=${MAX_SCHEDULES_PER_SHIFT}) after Block B`);
                break;
              }
            }
          }
        }
      } else {
        // Night shift: only Cells, no Dining Room
        const blockALocations = ['Block A - Cells'];
        const blockBLocations = ['Block B - Cells'];

        // Block A - Cells only
        let blockAAvailableStaff = availableStaff.filter(
          staff => !usedStaffIds.has(staff._id.toString())
        );
        
        if (blockAAvailableStaff.length > 0 && schedules.length < MAX_SCHEDULES_PER_SHIFT) {
          const selectedStaff = blockAAvailableStaff[0];
          console.log(`Selected staff for Block A Cells (night): ${selectedStaff.name}`);
          
          const schedule = await this.createLocationScheduleWithStaff(
            scheduleDate, 
            shift, 
            'Block A - Cells', 
            [selectedStaff],
            createdBy
          );
          if (schedule) {
            schedules.push(schedule);
            usedStaffIds.add(selectedStaff._id.toString());
            console.log(`✅ Created night schedule for Block A - Cells with staff ${selectedStaff.name}`);
          }
        }

        // Block B - Cells only
        let blockBAvailableStaff = availableStaff.filter(
          staff => !usedStaffIds.has(staff._id.toString())
        );
        
        if (blockBAvailableStaff.length > 0 && schedules.length < MAX_SCHEDULES_PER_SHIFT) {
          const selectedStaff = blockBAvailableStaff[0];
          console.log(`Selected staff for Block B Cells (night): ${selectedStaff.name}`);
          
          const schedule = await this.createLocationScheduleWithStaff(
            scheduleDate, 
            shift, 
            'Block B - Cells', 
            [selectedStaff],
            createdBy
          );
          if (schedule) {
            schedules.push(schedule);
            usedStaffIds.add(selectedStaff._id.toString());
            console.log(`✅ Created night schedule for Block B - Cells with staff ${selectedStaff.name}`);
          }
        }
      }

      // Save all schedules one by one to avoid duplicate key errors
      const savedSchedules = [];
      for (const schedule of schedules) {
        try {
          // Double-check that schedule has staff before saving
          if (!schedule.assignedStaff || schedule.assignedStaff.length === 0) {
            console.error(`🚨 SKIPPING: Schedule for ${schedule.location} has no staff - not saving`);
            continue;
          }

          console.log(`💾 Saving schedule for ${schedule.location} with ${schedule.assignedStaff.length} staff...`);
          const savedSchedule = await new Schedule(schedule).save();
          await savedSchedule.populate('assignedStaff', 'name email role');
          
          // Verify the saved schedule has staff
          if (!savedSchedule.assignedStaff || savedSchedule.assignedStaff.length === 0) {
            console.error(`🚨 ERROR: Saved schedule for ${schedule.location} has 0 staff!`);
            // Delete the invalid schedule
            await Schedule.findByIdAndDelete(savedSchedule._id);
            console.log(`🗑️ Deleted invalid schedule for ${schedule.location}`);
          } else {
            console.log(`✅ Successfully saved schedule for ${schedule.location} with ${savedSchedule.assignedStaff.length} staff`);
            savedSchedules.push(savedSchedule);
          }
        } catch (error) {
          console.error(`❌ Error saving schedule for ${schedule.location}:`, error.message);
          // Continue with other schedules even if one fails
        }
      }
      
      console.log(`Successfully created ${savedSchedules.length} auto-schedules`);
      
      // Post-process: ensure no staff is scheduled in BOTH day and night for this date
      try {
        await this.fixCrossShiftConflicts(dayStart, dayEnd);
      } catch (e) {
        console.warn('Cross-shift conflict fix failed:', e?.message || e);
      }
      
      // Do not delete opposite-shift schedules; we keep both shifts and
      // rely on availability + conflict fixer to ensure no person appears in both.

      // Log summary of all created schedules with staff names
      console.log('\n📋 AUTO-SCHEDULE SUMMARY:');
      savedSchedules.forEach((schedule, index) => {
        console.log(`\n${index + 1}. ${schedule.title}`);
        console.log(`   📍 Location: ${schedule.location}`);
        console.log(`   🕐 Time: ${schedule.startTime} - ${schedule.endTime}`);
        console.log(`   👥 Staff (${schedule.assignedStaff.length}):`);
        schedule.assignedStaff.forEach((staff, staffIndex) => {
          console.log(`      ${staffIndex + 1}. ${staff.name} (${staff.email})`);
        });
      });
      
      return savedSchedules;

    } catch (error) {
      console.error('Error generating auto-schedule:', error);
      throw error;
    }
  }

  // Ensure no person is assigned to both day and night on the same date
  async fixCrossShiftConflicts(dayStart, dayEnd) {
    // Collect all day-shift staff for the date
    const daySchedules = await Schedule.find({
      date: { $gte: dayStart, $lt: dayEnd },
      shift: 'day'
    }).select('assignedStaff location');
    const dayStaffIds = new Set(daySchedules.flatMap(s => s.assignedStaff.map(id => id.toString())));

    if (dayStaffIds.size === 0) return; // nothing to fix

    // Scan night schedules and remove any overlapping staff
    const nightSchedules = await Schedule.find({
      date: { $gte: dayStart, $lt: dayEnd },
      shift: 'night'
    });

    for (const ns of nightSchedules) {
      const before = (ns.assignedStaff || []).map(id => id.toString());
      const filtered = before.filter(id => !dayStaffIds.has(id));

      // If no change, continue
      if (filtered.length === before.length) continue;

      // If filtered left at least 1, update
      if (filtered.length > 0) {
        ns.assignedStaff = filtered;
        await ns.save();
        continue;
      }

      // Otherwise, we need to find a replacement for night shift
      // Get available staff for night (excludes busy + leave)
      const replacementPool = await this.getAvailableStaff(dayStart, 'night');
      // Exclude anyone who worked day
      const cleanPool = replacementPool.filter(s => !dayStaffIds.has(s._id.toString()));

      if (cleanPool.length === 0) {
        // No available replacement; leave empty to avoid double-booking
        ns.assignedStaff = [];
        await ns.save();
        continue;
      }

      // Prefer someone suitable for the location
      const suitable = this.filterStaffByLocation(cleanPool, ns.location);
      const pick = (suitable.length > 0 ? suitable : cleanPool)[0];
      ns.assignedStaff = [pick._id];
      await ns.save();
    }
  }

  // Generate auto-schedule for both day and night shifts
  async generateBothShiftsAutoSchedule(date, createdBy) {
    try {
      console.log(`🚀 Generating auto-schedule for BOTH shifts on ${date}`);
      
      // Generate day shift first
      const daySchedules = await this.generateAutoSchedule(date, 'day', createdBy);
      console.log(`✅ Day shift generated: ${daySchedules.length} schedules`);
      
      // Generate night shift second
      const nightSchedules = await this.generateAutoSchedule(date, 'night', createdBy);
      console.log(`✅ Night shift generated: ${nightSchedules.length} schedules`);
      
      // Combine both shifts
      const allSchedules = [...daySchedules, ...nightSchedules];
      
      console.log(`🎉 Total schedules created: ${allSchedules.length} (Day: ${daySchedules.length}, Night: ${nightSchedules.length})`);
      
      return allSchedules;
      
    } catch (error) {
      console.error('Error generating both shifts auto-schedule:', error);
      throw error;
    }
  }

  // Get available staff for a specific date and shift
  async getAvailableStaff(date, shift) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    // Get shift times
    const shiftTimes = shift === 'day' ? this.dayShiftTimes : this.nightShiftTimes;

    // Find overlapping schedules for the same shift
    const overlappingSchedules = await Schedule.find({
      date: { $gte: dayStart, $lt: dayEnd },
      shift: shift,
      $or: [
        {
          startTime: { $lt: shiftTimes.end },
          endTime: { $gt: shiftTimes.start }
        }
      ]
    }).select('assignedStaff');

    // Also exclude staff assigned in the opposite shift for the same date
    const oppositeShift = shift === 'day' ? 'night' : 'day';
    const oppositeSchedules = await Schedule.find({
      date: { $gte: dayStart, $lt: dayEnd },
      shift: oppositeShift
    }).select('assignedStaff');

    // Get busy staff IDs from both queries (keep ObjectIds to work with $nin)
    const busyStaffIds = [
      ...overlappingSchedules.flatMap(s => s.assignedStaff),
      ...oppositeSchedules.flatMap(s => s.assignedStaff)
    ];

    // Exclude staff with approved leave covering this day
    try {
      const LeaveRequest = require('../models/LeaveRequest');
      const approvedLeaves = await LeaveRequest.find({
        status: 'Approved',
        startDate: { $lte: dayEnd },
        endDate: { $gte: dayStart }
      }).select('staffId');
      const onLeaveIds = approvedLeaves.map(l => l.staffId); // keep as ObjectId
      if (onLeaveIds.length > 0) {
        console.log(`🟨 Excluding ${onLeaveIds.length} staff on approved leave`);
      }
      // Merge busy and on-leave IDs (preserve ObjectId types for $nin)
      const combined = [...busyStaffIds, ...onLeaveIds];
      busyStaffIds.length = 0;
      combined.forEach(id => busyStaffIds.push(id));
    } catch (e) {
      console.warn('Leave exclusion failed in getAvailableStaff:', e?.message || e);
    }

    // Get all valid staff users first
    const validStaffUsers = await User.find({ role: 'staff' });
    const validUserIds = new Set(validStaffUsers.map(user => user._id.toString()));

    // Get all active staff from Details model excluding busy ones
    const availableStaffDetails = await Details.find({
      userId: { $nin: busyStaffIds },
      userRole: 'staff',
      isActive: true
    });

    // Transform to match expected structure, only include staff with valid User records
    const availableStaff = availableStaffDetails
      .filter(detail => {
        const userIdStr = detail.userId?.toString();
        return userIdStr && validUserIds.has(userIdStr);
      })
      .map(detail => {
        const user = validStaffUsers.find(u => u._id.toString() === detail.userId.toString());
        return {
          _id: detail.userId,
          name: user?.name || `Staff-${detail.userId.toString().slice(-4)}`,
          email: user?.email || 'no-email@prison.com',
          role: user?.role || 'staff',
          staffDetails: detail.roleSpecificDetails?.staffDetails || {},
          wardenDetails: detail.roleSpecificDetails?.wardenDetails || {}
        };
      });

    console.log(`📊 Staff data sample for ${shift} shift on ${date}:`);
    if (availableStaff.length > 0) {
      console.log(`   - Total staff: ${availableStaff.length}`);
      console.log(`   - Sample staff:`, availableStaff.slice(0, 3).map(s => ({
        name: s.name,
        id: s._id,
        position: s.staffDetails?.position,
        department: s.staffDetails?.department
      })));
    } else {
      console.log(`   - No staff available!`);
    }

    return availableStaff;
  }

  // Create schedule for a specific location with specific staff
  async createLocationScheduleWithStaff(date, shift, location, selectedStaff, createdBy) {
    const requiredStaffCount = this.getRequiredStaffCount(location);
    
    // Get appropriate time slots
    let shiftTimes;
    if (location === 'Visitor Area') {
      shiftTimes = this.visitingAreaTimes;
    } else {
      shiftTimes = shift === 'day' ? this.dayShiftTimes : this.nightShiftTimes;
    }

    // Ensure all selected staff have valid IDs
    const validStaffIds = selectedStaff
      .filter(staff => staff._id && mongoose.Types.ObjectId.isValid(staff._id))
      .map(staff => staff._id);

    if (validStaffIds.length === 0) {
      console.warn(`⚠️ No valid staff IDs found for ${location} - skipping schedule creation`);
      return null;
    }

    const schedule = {
      title: location,
      type: this.getScheduleType(location),
      description: `Auto-scheduled ${shift} shift for ${location} - Assigned ${validStaffIds.length} staff`,
      date: date,
      startTime: shiftTimes.start,
      endTime: shiftTimes.end,
      shift: shift,
      location: location,
      assignedStaff: validStaffIds,
      priority: 'Medium',
      status: 'Scheduled',
      isAutoScheduled: true,
      createdBy: createdBy,
      notes: `Auto-generated schedule for ${shift} shift. Staff: ${selectedStaff.map(s => s.name || 'Unknown').join(', ')}`
    };

    console.log(`Creating schedule for ${location} with ${validStaffIds.length} staff:`);
    selectedStaff.forEach((staff, index) => {
      console.log(`  ${index + 1}. ${staff.name} (${staff._id}) - ${staff.staffDetails?.position || 'Unknown Position'}`);
    });

    // Final validation: Ensure schedule has staff assigned
    if (!schedule.assignedStaff || schedule.assignedStaff.length === 0) {
      console.error(`🚨 CRITICAL ERROR: Schedule created without staff assignment for ${location}`);
      return null;
    }

    console.log(`✅ Schedule created successfully for ${location} with ${schedule.assignedStaff.length} staff members`);
    return schedule;
  }

  // Create schedule for a specific location
  async createLocationSchedule(date, shift, location, availableStaff, createdBy, usedStaffIds = new Set()) {
    if (availableStaff.length === 0) {
      console.warn(`⚠️ No available staff for ${location} - skipping schedule creation`);
      return null;
    }

    // Determine required staff count based on location
    const requiredStaffCount = this.getRequiredStaffCount(location);
    
    // Filter out already used staff
    let availableStaffFiltered = availableStaff.filter(
      staff => !usedStaffIds.has(staff._id.toString())
    );

    // Hard guard: exclude anyone already assigned to the opposite shift on this date
    // This doubles the protection in case upstream availability checks miss someone
    try {
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const oppositeShift = shift === 'day' ? 'night' : 'day';
      const oppositeSchedules = await Schedule.find({
        date: { $gte: dayStart, $lt: dayEnd },
        shift: oppositeShift
      }).select('assignedStaff');
      const oppositeIds = new Set(oppositeSchedules.flatMap(s => s.assignedStaff.map(id => String(id))));
      if (oppositeIds.size > 0) {
        availableStaffFiltered = availableStaffFiltered.filter(s => !oppositeIds.has(String(s._id)));
      }
    } catch (e) {
      console.warn('Opposite-shift exclusion failed in createLocationSchedule:', e?.message || e);
    }

    // Night shift rule: exclude anyone who worked the same location in day shift
    if (shift === 'night') {
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      try {
        const daySameLocation = await Schedule.find({
          date: { $gte: dayStart, $lt: dayEnd },
          shift: 'day',
          location: location
        }).select('assignedStaff');
        const daySameLocationIds = new Set(daySameLocation.flatMap(s => s.assignedStaff.map(id => String(id))));
        if (daySameLocationIds.size > 0) {
          availableStaffFiltered = availableStaffFiltered.filter(s => !daySameLocationIds.has(String(s._id)));
        }
      } catch (e) {
        console.warn('Night-shift same-location exclusion failed:', e?.message || e);
      }
    }
    
    // Filter staff by department/role requirements for location
    let suitableStaff = this.filterStaffByLocation(availableStaffFiltered, location);
    
    // For strict locations (Medical Room, Control Room), don't use fallback
    const strictLocations = ['Medical Room', 'Control Room'];
    if (suitableStaff.length === 0 && strictLocations.includes(location)) {
      console.warn(`⚠️ No suitable staff found for ${location} - skipping schedule creation (strict department requirement)`);
      return null;
    }
    
    // For other locations, use fallback if no suitable staff found
    if (suitableStaff.length === 0) {
      console.warn(`⚠️ No suitable staff found for ${location} - using any available staff as fallback`);
      suitableStaff = availableStaffFiltered; // Use any available staff
    }
    
    if (suitableStaff.length === 0) {
      console.warn(`⚠️ No staff available at all for ${location} - skipping schedule creation`);
      return null;
    }

    // Select staff for this location with rotation/fairness
    let selectedStaff = await this.selectStaffWithRotation({
      suitableStaff,
      requiredCount: requiredStaffCount,
      date,
      location,
      usedStaffIds
    });
    if (!selectedStaff || selectedStaff.length === 0) {
      selectedStaff = suitableStaff.slice(0, Math.min(requiredStaffCount, suitableStaff.length));
    }

    console.log(`🔍 Staff selection for ${location}:`);
    console.log(`   - Available staff: ${availableStaff.length}`);
    console.log(`   - Suitable staff: ${suitableStaff.length}`);
    console.log(`   - Required count: ${requiredStaffCount}`);
    console.log(`   - Selected count: ${selectedStaff.length}`);

    if (selectedStaff.length === 0) {
      console.warn(`⚠️ No staff selected for ${location} - skipping schedule creation`);
      return null;
    }

    // Double-check: Ensure we have at least 1 staff member assigned
    if (selectedStaff.length < 1) {
      console.warn(`⚠️ CRITICAL: Attempted to create schedule with ${selectedStaff.length} staff - ABORTING`);
      return null;
    }

    // Ensure all selected staff have valid IDs
    const validStaffIds = selectedStaff
      .filter(staff => staff._id && mongoose.Types.ObjectId.isValid(staff._id))
      .map(staff => staff._id);

    if (validStaffIds.length === 0) {
      console.warn(`⚠️ No valid staff IDs found for ${location} - skipping schedule creation`);
      return null;
    }

    if (validStaffIds.length !== selectedStaff.length) {
      console.warn(`⚠️ Some staff IDs are invalid for ${location}. Using ${validStaffIds.length} valid IDs out of ${selectedStaff.length}`);
    }

    // Get appropriate time slots
    let shiftTimes;
    if (location === 'Visitor Area') {
      shiftTimes = this.visitingAreaTimes;
    } else {
      shiftTimes = shift === 'day' ? this.dayShiftTimes : this.nightShiftTimes;
    }
    
    const schedule = {
      title: location,
      type: this.getScheduleType(location),
      description: `Auto-scheduled ${shift} shift for ${location} - Assigned ${validStaffIds.length} staff`,
      date: date,
      startTime: shiftTimes.start,
      endTime: shiftTimes.end,
      shift: shift,
      location: location,
      assignedStaff: validStaffIds,
      priority: 'Medium',
      status: 'Scheduled',
      isAutoScheduled: true,
      createdBy: createdBy,
      notes: `Auto-generated schedule for ${shift} shift. Staff: ${selectedStaff.map(s => s.name || 'Unknown').join(', ')}`
    };

    selectedStaff.forEach((staff, index) => {
      console.log(`  ${index + 1}. ${staff.name} (${staff._id}) - ${staff.staffDetails?.position || 'Unknown Position'}`);
    });
    console.log(`Valid Staff IDs to assign:`, validStaffIds);

    // Final validation: Ensure schedule has staff assigned
    if (!schedule.assignedStaff || schedule.assignedStaff.length === 0) {
      console.error(`🚨 CRITICAL ERROR: Schedule created without staff assignment for ${location}`);
      return null;
    }

    console.log(`✅ Schedule created successfully for ${location} with ${schedule.assignedStaff.length} staff members`);
    return schedule;
  }

  // Get required staff count for location
  getRequiredStaffCount(location) {
    const staffRequirements = {
      'Main Gate': 1,
      'Control Room': 1,
      'Medical Room': 1,
      'Kitchen': 1,
      'Visitor Area': 1,
      'Admin Office': 1,
      'Staff Room': 1,
      'Block A - Cells': 2,
      'Block A - Dining Room': 2,
      'Block B - Cells': 2,
      'Block B - Dining Room': 2,
    };

    return staffRequirements[location] || 1;
  }

  // Filter staff by location requirements
  filterStaffByLocation(staff, location) {
    console.log(`🔍 Filtering staff for location: ${location}`);
    console.log(`   - Total staff available: ${staff.length}`);
    
    const filtered = staff.filter(staffMember => {
      // Get position and department from staffDetails
      const position = staffMember.staffDetails?.position || '';
      const department = staffMember.staffDetails?.department || '';
      
      // Central Facility - strict department requirements
      if (location === 'Medical Room') {
        // Only Medical department staff allowed
        const isMedical = department === 'Medical';
        if (!isMedical) {
          console.log(`     ❌ ${staffMember.name} rejected for Medical Room - Only Medical department allowed (Dept: "${department}", Position: "${position}")`);
        } else {
          console.log(`     ✅ ${staffMember.name} accepted for Medical Room (Medical department)`);
        }
        return isMedical;
      } else if (location === 'Admin Office') {
        const isAdmin = department === 'Administration' || position.toLowerCase().includes('admin') || position.toLowerCase().includes('clerk');
        if (!isAdmin) {
          console.log(`     ❌ ${staffMember.name} rejected for Admin Office (Dept: "${department}", Position: "${position}")`);
        }
        return isAdmin;
      } else if (location === 'Control Room') {
        // Only Prison Control Room Officer allowed
        const isControl = position.toLowerCase().includes('prison control room officer');
        if (!isControl) {
          console.log(`     ❌ ${staffMember.name} rejected for Control Room - Only Prison Control Room Officer allowed (Dept: "${department}", Position: "${position}")`);
        } else {
          console.log(`     ✅ ${staffMember.name} accepted for Control Room (Prison Control Room Officer)`);
        }
        return isControl;
      } else if (['Main Gate', 'Kitchen', 'Visitor Area', 'Workshop', 'Isolation', 'Staff Room'].includes(location)) {
        // Other central facilities can use any staff
        console.log(`     ✅ ${staffMember.name} accepted for ${location} (any staff allowed)`);
        return true;
      }

      // Block locations - prefer security staff, but allow others as fallback
      if (location.startsWith('Block A') || location.startsWith('Block B')) {
        const isBlock = department === 'Security' || department === 'Rehabilitation' || position.toLowerCase().includes('security') || position.toLowerCase().includes('officer');
        if (!isBlock) {
          console.log(`     ❌ ${staffMember.name} rejected for ${location} (Dept: "${department}", Position: "${position}")`);
        }
        return isBlock;
      }

      // Default: allow all staff
     
      return true;
    });
    
    console.log(`   - Filtered staff count: ${filtered.length}`);
    return filtered;
  }

  // Get department from position
  getDepartmentFromPosition(position) {
    const positionLower = position.toLowerCase();
    
    if (positionLower.includes('security') || positionLower.includes('officer') || positionLower.includes('guard')) {
      return 'Security';
    } else if (positionLower.includes('medical') || positionLower.includes('nurse') || positionLower.includes('doctor') || positionLower.includes('health')) {
      return 'Medical';
    } else if (positionLower.includes('admin') || positionLower.includes('clerk') || positionLower.includes('administrative')) {
      return 'Administration';
    } else if (positionLower.includes('control') || positionLower.includes('operator')) {
      return 'Control';
    } else {
      return 'General';
    }
  }

  // Get schedule type from location
  getScheduleType(location) {
    if (location.includes('Medical')) {
      return 'Medical';
    } else if (location.includes('Kitchen')) {
      return 'Work';
    } else if (location.includes('Workshop')) {
      return 'Work';
    } else {
      return 'Security';
    }
  }

  // Get available staff for Block A and Block B (excluding already scheduled)
  async getAvailableStaffForBlocks(date, shift, blockType) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    // Get shift times
    const shiftTimes = shift === 'day' ? this.dayShiftTimes : this.nightShiftTimes;

    // Find all schedules for this date and shift
    const allSchedules = await Schedule.find({
      date: { $gte: dayStart, $lt: dayEnd },
      shift: shift,
      $or: [
        {
          startTime: { $lt: shiftTimes.end },
          endTime: { $gt: shiftTimes.start }
        }
      ]
    }).select('assignedStaff location');

    // Exclude staff already scheduled ANYWHERE for the same date/shift
    // (not just within the requested block), so Block A/B do not share staff
    const busyStaffIds = allSchedules.flatMap(s => s.assignedStaff);

    // Get all valid staff users first
    const validStaffUsers = await User.find({ role: 'staff' });
    const validUserIds = new Set(validStaffUsers.map(user => user._id.toString()));

    // Get all active staff from Details model excluding busy ones
    const availableStaffDetails = await Details.find({
      userId: { $nin: busyStaffIds },
      userRole: 'staff',
      isActive: true
    });

    // Transform to match expected structure, only include staff with valid User records
    let availableStaff = availableStaffDetails
      .filter(detail => {
        const userIdStr = detail.userId?.toString();
        return userIdStr && validUserIds.has(userIdStr);
      })
      .map(detail => {
        const user = validStaffUsers.find(u => u._id.toString() === detail.userId.toString());
        return {
          _id: detail.userId,
          name: user?.name || `Staff-${detail.userId.toString().slice(-4)}`,
          email: user?.email || 'no-email@prison.com',
          role: user?.role || 'staff',
          staffDetails: detail.roleSpecificDetails?.staffDetails || {},
          wardenDetails: detail.roleSpecificDetails?.wardenDetails || {}
        };
      });

    // Fallback: if none found for block-specific filter, use general availability
    if (!availableStaff || availableStaff.length === 0) {
      try {
        const general = await this.getAvailableStaff(date, shift);
        // Prefer security-like roles for blocks
        availableStaff = general.filter(s => {
          const dept = s.staffDetails?.department || '';
          const pos = s.staffDetails?.position || '';
          return dept.toLowerCase().includes('security') ||
                 pos.toLowerCase().includes('security') ||
                 pos.toLowerCase().includes('officer') ||
                 pos.toLowerCase().includes('guard');
        });
      } catch (e) {
        // ignore and return empty
      }
    }

    return availableStaff;
  }

  // Get all available staff for Central Facility
  async getAvailableStaffForCentralFacility(date, shift) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    // Get shift times
    const shiftTimes = shift === 'day' ? this.dayShiftTimes : this.nightShiftTimes;

    // Find overlapping schedules
    const overlappingSchedules = await Schedule.find({
      date: { $gte: dayStart, $lt: dayEnd },
      shift: shift,
      $or: [
        {
          startTime: { $lt: shiftTimes.end },
          endTime: { $gt: shiftTimes.start }
        }
      ]
    }).select('assignedStaff');

    // Get busy staff IDs
    const busyStaffIds = overlappingSchedules.flatMap(s => s.assignedStaff);

    // Get all valid staff users first
    const validStaffUsers = await User.find({ role: 'staff' });
    const validUserIds = new Set(validStaffUsers.map(user => user._id.toString()));

    // Get all active staff from Details model (central facility can use any staff)
    const availableStaffDetails = await Details.find({
      userId: { $nin: busyStaffIds },
      userRole: 'staff',
      isActive: true
    });

    // Transform to match expected structure, only include staff with valid User records
    const availableStaff = availableStaffDetails
      .filter(detail => {
        const userIdStr = detail.userId?.toString();
        return userIdStr && validUserIds.has(userIdStr);
      })
      .map(detail => {
        const user = validStaffUsers.find(u => u._id.toString() === detail.userId.toString());
        return {
          _id: detail.userId,
          name: user?.name || `Staff-${detail.userId.toString().slice(-4)}`,
          email: user?.email || 'no-email@prison.com',
          role: user?.role || 'staff',
          staffDetails: detail.roleSpecificDetails?.staffDetails || {},
          wardenDetails: detail.roleSpecificDetails?.wardenDetails || {}
        };
      });

    return availableStaff;
  }
}

module.exports = new AutoScheduleService();
