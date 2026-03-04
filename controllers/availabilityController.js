const mongoose = require("mongoose");
const Availability = require("../models/Availability");
const Session = require("../models/Session");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayFromDate(dateStr) {
  if (!dateStr) return null;
  const dateObj = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(dateObj.getTime())) return null;
  return weekdayLabels[dateObj.getUTCDay()];
}

exports.createAvailability = asyncHandler(async (req, res) => {
  const specificDate = req.body.specificDate || null;
  const resolvedDay = req.body.day || dayFromDate(specificDate);

  if (!resolvedDay) {
    throw new ApiError(400, "Either valid day or specificDate is required");
  }

  const availability = await Availability.create({
    mentorId: req.user.id,
    day: resolvedDay,
    startTime: req.body.startTime,
    endTime: req.body.endTime,
    sessionDurationMinutes: req.body.sessionDurationMinutes || 60,
    specificDate,
    isBlockedDate: false
  });

  res.status(201).json({
    message: "Availability slot created",
    availability
  });
});

exports.updateAvailability = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, "Invalid availability id");

  const availability = await Availability.findOneAndUpdate(
    { _id: id, mentorId: req.user.id, isBlockedDate: false },
    { $set: req.body },
    { new: true, runValidators: true }
  );

  if (!availability) throw new ApiError(404, "Availability not found");

  res.status(200).json({
    message: "Availability updated",
    availability
  });
});

exports.blockDate = asyncHandler(async (req, res) => {
  const blockedDate = req.body.blockedDate;

  const existing = await Availability.findOne({
    mentorId: req.user.id,
    isBlockedDate: true,
    blockedDate
  });

  if (existing) throw new ApiError(409, "Date already blocked");

  const blockEntry = await Availability.create({
    mentorId: req.user.id,
    blockedDate,
    isBlockedDate: true
  });

  res.status(201).json({
    message: "Date blocked",
    availability: blockEntry
  });
});

exports.getMentorAvailability = asyncHandler(async (req, res) => {
  const { mentorId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(mentorId)) throw new ApiError(400, "Invalid mentor id");

  const mentor = await User.findOne({ _id: mentorId, role: "mentor", approvalStatus: "approved" }).select(
    "name email"
  );
  if (!mentor) throw new ApiError(404, "Mentor not found");

  const [allSlots, blockedDates] = await Promise.all([
    Availability.find({ mentorId, isBlockedDate: false }).sort({ day: 1, startTime: 1 }).lean(),
    Availability.find({ mentorId, isBlockedDate: true }).sort({ blockedDate: 1 }).lean()
  ]);
  const weeklySlots = allSlots.filter((slot) => !slot.specificDate);
  const dateSlots = allSlots.filter((slot) => slot.specificDate);

  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 7);

  const confirmedSessions = await Session.find({
    mentorId,
    scheduledStart: { $gte: now, $lt: end },
    sessionStatus: "confirmed",
    paymentStatus: { $in: ["paid", "verified"] },
    status: { $in: ["confirmed", "approved"] }
  })
    .select("date time")
    .lean();

  const bookedSlotSet = new Set(confirmedSessions.map((item) => `${item.date}|${item.time}`));
  const blockedDateSet = new Set(blockedDates.map((item) => item.blockedDate));
  const upcomingSlots = [];
  const seenSlotKeys = new Set();

  for (let offset = 0; offset < 7; offset += 1) {
    const dateObj = new Date(now);
    dateObj.setUTCHours(0, 0, 0, 0);
    dateObj.setUTCDate(dateObj.getUTCDate() + offset);

    const date = dateObj.toISOString().slice(0, 10);
    if (blockedDateSet.has(date)) {
      continue;
    }

    const dayLabel = weekdayLabels[dateObj.getUTCDay()];
    const daySlots = [
      ...weeklySlots.filter((slot) => slot.day === dayLabel),
      ...dateSlots.filter((slot) => slot.specificDate === date)
    ];

    daySlots.forEach((slot) => {
      const duration = Number(slot.sessionDurationMinutes || 60);
      const [startH, startM] = (slot.startTime || "00:00").split(":").map(Number);
      const [endH, endM] = (slot.endTime || "00:00").split(":").map(Number);
      let cursor = startH * 60 + startM;
      const endTotal = endH * 60 + endM;

      while (cursor + duration <= endTotal) {
        const h = String(Math.floor(cursor / 60)).padStart(2, "0");
        const m = String(cursor % 60).padStart(2, "0");
        const time = `${h}:${m}`;
        const slotKey = `${date}|${time}|${duration}`;
        if (seenSlotKeys.has(slotKey)) {
          cursor += duration;
          return;
        }
        seenSlotKeys.add(slotKey);
        const iso = new Date(`${date}T${time}:00.000Z`).toISOString();
        const isBooked = bookedSlotSet.has(`${date}|${time}`);

        upcomingSlots.push({
          date,
          time,
          iso,
          label: new Date(`${date}T${time}:00.000Z`).toLocaleString([], {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit"
          }),
          isBooked
        });

        cursor += duration;
      }
    });
  }

  res.status(200).json({
    mentor,
    weeklySlots,
    dateSlots,
    blockedDates,
    upcomingSlots
  });
});
