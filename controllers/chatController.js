const mongoose = require("mongoose");
const ChatMessage = require("../models/ChatMessage");
const User = require("../models/User");
const StudentProfile = require("../models/StudentProfile");
const MentorProfile = require("../models/MentorProfile");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

const typingState = new Map();
const TYPING_TTL_MS = 6000;
const ONLINE_WINDOW_MS = 120000;

function canChatRoles(roleA, roleB) {
  return (
    (roleA === "student" && roleB === "mentor") ||
    (roleA === "mentor" && roleB === "student") ||
    (roleA === "mentor" && roleB === "admin") ||
    (roleA === "admin" && roleB === "mentor")
  );
}

function effectiveRole(user) {
  if (user.isAdmin) {
    return "admin";
  }
  return user.role;
}

function touchPresence(userId) {
  if (!userId) return;
  User.updateOne({ _id: userId }, { $set: { lastSeenAt: new Date() } }).catch(() => null);
}

function typingKey(senderId, recipientId) {
  return `${String(senderId)}:${String(recipientId)}`;
}

function setTypingState(senderId, recipientId, isTyping) {
  const key = typingKey(senderId, recipientId);
  if (!isTyping) {
    typingState.delete(key);
    return;
  }
  typingState.set(key, Date.now() + TYPING_TTL_MS);
}

function getTypingState(senderId, recipientId) {
  const key = typingKey(senderId, recipientId);
  const expiresAt = typingState.get(key);
  if (!expiresAt) return false;
  if (expiresAt < Date.now()) {
    typingState.delete(key);
    return false;
  }
  return true;
}

function isOnline(lastSeenAt) {
  if (!lastSeenAt) return false;
  const time = new Date(lastSeenAt).getTime();
  if (Number.isNaN(time)) return false;
  return Date.now() - time <= ONLINE_WINDOW_MS;
}

async function buildProfilePhotoMap(users) {
  const studentIds = [];
  const mentorIds = [];

  users.forEach((user) => {
    const id = String(user?._id || "");
    if (!id) return;
    if (effectiveRole(user) === "student") studentIds.push(new mongoose.Types.ObjectId(id));
    if (effectiveRole(user) === "mentor") mentorIds.push(new mongoose.Types.ObjectId(id));
  });

  const [studentProfiles, mentorProfiles] = await Promise.all([
    studentIds.length
      ? StudentProfile.find({ userId: { $in: studentIds } }).select("userId profilePhotoUrl").lean()
      : Promise.resolve([]),
    mentorIds.length
      ? MentorProfile.find({ userId: { $in: mentorIds } }).select("userId profilePhotoUrl").lean()
      : Promise.resolve([])
  ]);

  const photoMap = new Map();
  studentProfiles.forEach((profile) => {
    photoMap.set(String(profile.userId), profile.profilePhotoUrl || "");
  });
  mentorProfiles.forEach((profile) => {
    photoMap.set(String(profile.userId), profile.profilePhotoUrl || "");
  });

  return photoMap;
}

function decorateCounterpart(user, photoMap, requestUserId) {
  const normalizedRole = effectiveRole(user);
  const lastSeenAt = user.lastSeenAt || user.updatedAt || null;
  return {
    ...user,
    role: normalizedRole,
    status: user.approvalStatus || "approved",
    profilePhotoUrl: photoMap?.get(String(user._id)) || user.profilePhotoUrl || "",
    lastSeenAt,
    isOnline: isOnline(lastSeenAt),
    isTyping: getTypingState(String(user._id), String(requestUserId))
  };
}

async function getCounterpartUser(requestUser, counterpartId) {
  let counterpart;

  if (counterpartId === "admin") {
    counterpart = await User.findOne({
      isAdmin: true,
      isDeleted: false
    })
      .sort({ createdAt: 1 })
      .select("_id name email role isAdmin approvalStatus phoneNumber lastSeenAt updatedAt")
      .lean();

    if (!counterpart) {
      throw new ApiError(404, "Admin account not found");
    }
  } else {
    if (!mongoose.Types.ObjectId.isValid(counterpartId)) {
      throw new ApiError(400, "Invalid user id");
    }

    if (requestUser.id === counterpartId) {
      throw new ApiError(400, "Cannot chat with yourself");
    }

    counterpart = await User.findOne({
      _id: counterpartId,
      isDeleted: false
    })
      .select("_id name email role isAdmin approvalStatus phoneNumber lastSeenAt updatedAt")
      .lean();
  }

  if (!counterpart) {
    throw new ApiError(404, "Chat user not found");
  }

  const requestRole = effectiveRole(requestUser);
  const counterpartRole = effectiveRole(counterpart);

  if (!canChatRoles(requestRole, counterpartRole)) {
    throw new ApiError(403, "Chat allowed only between student-mentor or mentor-admin");
  }

  if (
    requestRole === "student" &&
    counterpartRole === "mentor" &&
    counterpart.approvalStatus !== "approved"
  ) {
    throw new ApiError(403, "Mentor is not approved yet");
  }

  const photoMap = await buildProfilePhotoMap([counterpart]);
  return decorateCounterpart({ ...counterpart, role: counterpartRole }, photoMap, requestUser.id);
}

exports.getConversations = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  touchPresence(userId);

  const recentMessages = await ChatMessage.find({
    $or: [{ sender: userId }, { recipient: userId }]
  })
    .sort({ createdAt: -1 })
    .limit(1000)
    .lean();

  const conversationMap = new Map();

  recentMessages.forEach((message) => {
    const senderId = message.sender.toString();
    const recipientId = message.recipient.toString();
    const counterpartId = senderId === userId ? recipientId : senderId;
    const existing = conversationMap.get(counterpartId);

    if (!existing) {
      conversationMap.set(counterpartId, {
        counterpartId,
        lastMessage: message.text,
        lastMessageAt: message.createdAt,
        lastMessageSenderId: senderId,
        lastMessageReadAt: message.readAt || null,
        unreadCount:
          recipientId === userId && !message.readAt ? 1 : 0
      });
      return;
    }

    if (recipientId === userId && !message.readAt) {
      existing.unreadCount += 1;
    }
  });

  const counterpartIds = [...conversationMap.keys()].map(
    (id) => new mongoose.Types.ObjectId(id)
  );

  const counterparts = await User.find({
    _id: { $in: counterpartIds },
    isDeleted: false
  })
    .select("_id name email role isAdmin approvalStatus phoneNumber lastSeenAt updatedAt")
    .lean();

  const photoMap = await buildProfilePhotoMap(counterparts);
  const normalizedCounterparts = counterparts.map((user) =>
    decorateCounterpart(user, photoMap, userId)
  );

  const counterpartById = new Map(
    normalizedCounterparts.map((user) => [user._id.toString(), user])
  );

  const conversations = [...conversationMap.values()]
    .map((conversation) => ({
      ...conversation,
      counterpart: counterpartById.get(conversation.counterpartId) || null
    }))
    .filter((conversation) => conversation.counterpart)
    .filter((conversation) =>
      canChatRoles(effectiveRole(req.user), effectiveRole(conversation.counterpart))
    )
    .sort(
      (a, b) =>
        new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    );

  res.status(200).json(conversations);
});

exports.getMessagesWithUser = asyncHandler(async (req, res) => {
  touchPresence(req.user.id);
  const counterpart = await getCounterpartUser(req.user, req.params.userId);

  const messages = await ChatMessage.find({
    $or: [
      { sender: req.user.id, recipient: counterpart._id },
      { sender: counterpart._id, recipient: req.user.id }
    ]
  })
    .sort({ createdAt: 1 })
    .limit(200)
    .lean();

  res.status(200).json({
    counterpart,
    messages
  });
});

exports.sendMessage = asyncHandler(async (req, res) => {
  touchPresence(req.user.id);
  const counterpart = await getCounterpartUser(req.user, req.params.userId);

  const message = await ChatMessage.create({
    sender: req.user.id,
    recipient: counterpart._id,
    text: req.body.text
  });
  setTypingState(req.user.id, counterpart._id, false);

  res.status(201).json({
    message: "Sent",
    chatMessage: message
  });
});

exports.markConversationRead = asyncHandler(async (req, res) => {
  touchPresence(req.user.id);
  const counterpart = await getCounterpartUser(req.user, req.params.userId);

  const result = await ChatMessage.updateMany(
    {
      sender: counterpart._id,
      recipient: req.user.id,
      readAt: null
    },
    { $set: { readAt: new Date() } }
  );

  res.status(200).json({
    message: "Conversation marked as read",
    updatedCount: result.modifiedCount
  });
});

exports.setTypingIndicator = asyncHandler(async (req, res) => {
  touchPresence(req.user.id);
  const counterpart = await getCounterpartUser(req.user, req.params.userId);
  const isTyping = Boolean(req.body?.isTyping);
  setTypingState(req.user.id, counterpart._id, isTyping);

  res.status(200).json({
    message: isTyping ? "Typing started" : "Typing stopped",
    isTyping
  });
});

exports.getTypingIndicator = asyncHandler(async (req, res) => {
  touchPresence(req.user.id);
  const counterpart = await getCounterpartUser(req.user, req.params.userId);

  res.status(200).json({
    isTyping: getTypingState(counterpart._id, req.user.id),
    isOnline: isOnline(counterpart.lastSeenAt),
    lastSeenAt: counterpart.lastSeenAt || null
  });
});
