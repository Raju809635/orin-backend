const AuditLog = require("../models/AuditLog");

async function createAuditLog({
  req,
  actorId = null,
  action,
  entityType = "",
  entityId = "",
  status = "success",
  metadata = {}
}) {
  try {
    await AuditLog.create({
      actorId,
      action,
      entityType,
      entityId: entityId ? String(entityId) : "",
      status,
      ipAddress: req?.ip || "",
      userAgent: req?.headers?.["user-agent"] || "",
      metadata
    });
  } catch (error) {
    console.error("[AUDIT_LOG_ERROR]", error);
  }
}

module.exports = {
  createAuditLog
};
