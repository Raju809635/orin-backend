function normalizeRoomToken(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function buildJitsiRoomName(scope, entityId) {
  const scopeToken = normalizeRoomToken(scope) || "meeting";
  const entityToken = normalizeRoomToken(entityId) || String(Date.now());
  return `orin-${scopeToken}-${entityToken}`;
}

function buildJitsiMeetingPayload({ scope, entityId, createdBy = null }) {
  const roomName = buildJitsiRoomName(scope, entityId);
  return {
    meetingProvider: "jitsi",
    meetingLink: `https://meet.jit.si/${roomName}`,
    meetingMeta: {
      roomName,
      createdAt: new Date(),
      createdBy: createdBy || null
    }
  };
}

function buildManualMeetingPayload(meetingLink = "") {
  return {
    meetingProvider: "manual",
    meetingLink: String(meetingLink || "").trim(),
    meetingMeta: {
      roomName: "",
      createdAt: null,
      createdBy: null
    }
  };
}

module.exports = {
  buildJitsiMeetingPayload,
  buildManualMeetingPayload
};
