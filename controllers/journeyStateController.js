const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const {
  getJourneyState,
  updateJourneyGoal,
  updateSkillProfile,
  recomputeJourneyState
} = require("../services/journeyStateService");

exports.getMyJourneyState = asyncHandler(async (req, res) => {
  const state = await getJourneyState(req.user.id, req.user.role);
  res.json(state);
});

exports.patchJourneyGoal = asyncHandler(async (req, res) => {
  const title = String(req.body?.title || "").trim();
  if (!title) throw new ApiError(400, "title is required");

  const state = await updateJourneyGoal(
    req.user.id,
    {
      title,
      domain: req.body?.domain,
      subDomain: req.body?.subDomain,
      focus: req.body?.focus,
      source: req.body?.source || "manual"
    },
    req.user.role
  );

  res.json({ message: "Journey goal updated", state });
});

exports.patchJourneySkills = asyncHandler(async (req, res) => {
  const state = await updateSkillProfile(
    req.user.id,
    {
      knownSkills: req.body?.knownSkills || [],
      missingSkills: req.body?.missingSkills || [],
      readinessScore: req.body?.readinessScore || 0,
      level: req.body?.level || "",
      roadmapSteps: req.body?.roadmapSteps || [],
      roadmapId: req.body?.roadmapId || "",
      recommendations: req.body?.recommendations || {}
    },
    req.user.role
  );

  res.json({ message: "Journey skill profile updated", state });
});

exports.recomputeMyJourneyState = asyncHandler(async (req, res) => {
  const state = await recomputeJourneyState(req.user.id, req.body || {}, req.user.role);
  res.json({ message: "Journey state recomputed", state });
});
