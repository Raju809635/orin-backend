const mongoose = require("mongoose");
const ChatMessage = require("../models/ChatMessage");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

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

async function getCounterpartUser(requestUser, counterpartId) {
  let counterpart;

  if (counterpartId === "admin") {
    counterpart = await User.findOne({
      isAdmin: true,
      isDeleted: false
    })
      .sort({ createdAt: 1 })
      .select("_id name email role isAdmin approvalStatus phoneNumber")
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
      .select("_id name email role isAdmin approvalStatus phoneNumber")
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

  return {
    ...counterpart,
    role: counterpartRole,
    status: counterpart.approvalStatus || "approved"
  };
}

exports.getConversations = asyncHandler(async (req, res) => {
  const userId = req.user.id;

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
    .select("_id name email role isAdmin approvalStatus phoneNumber")
    .lean();

  const normalizedCounterparts = counterparts.map((user) => ({
    ...user,
    role: effectiveRole(user),
    status: user.approvalStatus || "approved"
  }));

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
  const counterpart = await getCounterpartUser(req.user, req.params.userId);

  const message = await ChatMessage.create({
    sender: req.user.id,
    recipient: counterpart._id,
    text: req.body.text
  });

  res.status(201).json({
    message: "Sent",
    chatMessage: message
  });
});

exports.markConversationRead = asyncHandler(async (req, res) => {
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
