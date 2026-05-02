const User = require("../models/User");
const StudentProfile = require("../models/StudentProfile");
const MentorProfile = require("../models/MentorProfile");
const InstitutionRoadmap = require("../models/InstitutionRoadmap");
const InstitutionRoadmapSubmission = require("../models/InstitutionRoadmapSubmission");
const KnowledgeResource = require("../models/KnowledgeResource");
const KnowledgeResourceSubmission = require("../models/KnowledgeResourceSubmission");
const CommunityChallenge = require("../models/CommunityChallenge");
const CommunityChallengeSubmission = require("../models/CommunityChallengeSubmission");
const OrinCertification = require("../models/OrinCertification");
const ApiError = require("../utils/ApiError");

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeClassName(value) {
  return cleanText(value).toLowerCase();
}

async function getMentorScope(req) {
  if (req.user.role !== "mentor") {
    throw new ApiError(403, "Only mentors can access institution management");
  }

  const profile = await MentorProfile.findOne({ userId: req.user.id })
    .select("mentorOrgRole institutionName assignedClasses institutionPermissions")
    .lean();
  const mentorOrgRole = profile?.mentorOrgRole || "global_mentor";
  if (!["institution_teacher", "organisation_head"].includes(mentorOrgRole)) {
    throw new ApiError(403, "Institution management is available only for institution teachers and organisation heads");
  }

  const institutionName = cleanText(profile?.institutionName);
  if (!institutionName) {
    throw new ApiError(400, "Add institution to mentor profile before using institution management");
  }

  return {
    mentorOrgRole,
    mentorId: String(req.user.id),
    institutionName,
    assignedClasses: Array.isArray(profile?.assignedClasses) ? profile.assignedClasses.map(cleanText).filter(Boolean) : [],
    isHead: mentorOrgRole === "organisation_head"
  };
}

function classAllowed(scope, className) {
  if (scope.isHead) return true;
  const allowed = new Set(scope.assignedClasses.map(normalizeClassName));
  return allowed.has(normalizeClassName(className));
}

function scopedItemAllowed(scope, className, ownerId = "") {
  if (scope.isHead) return true;
  if (String(ownerId || "") === scope.mentorId) return true;
  return classAllowed(scope, className);
}

function studentProfileQuery(scope, className = "") {
  const query = {
    $or: [{ institutionName: scope.institutionName }, { collegeName: scope.institutionName }]
  };
  if (scope.isHead) {
    if (className) query.className = className;
    return query;
  }
  const classes = scope.assignedClasses.filter(Boolean);
  query.className = className ? className : { $in: classes };
  return query;
}

async function getInstitutionStudentProfiles(scope, className = "") {
  if (!scope.isHead && !scope.assignedClasses.length) return [];
  return StudentProfile.find(studentProfileQuery(scope, className))
    .select("userId profilePhotoUrl institutionName collegeName className learnerStage growthScore updatedAt")
    .populate("userId", "name email role approvalStatus createdAt")
    .lean();
}

function serializeStudent(profile) {
  return {
    id: String(profile.userId?._id || profile.userId || ""),
    name: profile.userId?.name || "Student",
    email: profile.userId?.email || "",
    approvalStatus: profile.userId?.approvalStatus || "approved",
    className: profile.className || "",
    learnerStage: profile.learnerStage || "after12",
    growthScore: profile.growthScore || 0,
    profilePhotoUrl: profile.profilePhotoUrl || "",
    updatedAt: profile.updatedAt
  };
}

function serializeTeacher(profile) {
  return {
    id: String(profile.userId?._id || profile.userId || ""),
    name: profile.userId?.name || "Teacher",
    email: profile.userId?.email || "",
    approvalStatus: profile.userId?.approvalStatus || "pending",
    mentorOrgRole: profile.mentorOrgRole || "global_mentor",
    institutionName: profile.institutionName || "",
    assignedClasses: Array.isArray(profile.assignedClasses) ? profile.assignedClasses.filter(Boolean) : [],
    permissions: Array.isArray(profile.institutionPermissions) ? profile.institutionPermissions : [],
    profilePhotoUrl: profile.profilePhotoUrl || "",
    title: profile.title || "",
    rating: profile.rating || 0,
    totalSessionsConducted: profile.totalSessionsConducted || 0,
    updatedAt: profile.updatedAt
  };
}

async function getScopedRoadmaps(scope) {
  const query = { institutionName: scope.institutionName };
  if (!scope.isHead) query.className = { $in: ["", ...scope.assignedClasses] };
  return InstitutionRoadmap.find(query).sort({ createdAt: -1 }).lean();
}

async function getScopedResources(scope) {
  const query = { institutionName: scope.institutionName, isActive: true };
  if (!scope.isHead) query.className = { $in: ["", ...scope.assignedClasses] };
  return KnowledgeResource.find(query).sort({ updatedAt: -1 }).lean();
}

async function getScopedChallenges(scope) {
  const query = { institutionName: scope.institutionName, isActive: true };
  if (!scope.isHead) query.className = { $in: ["", ...scope.assignedClasses] };
  return CommunityChallenge.find(query).sort({ deadline: 1 }).lean();
}

async function getOverview(req, res) {
  const scope = await getMentorScope(req);
  const [students, teachers, roadmaps, resources, challenges, roadmapSubmissions, resourceSubmissions] = await Promise.all([
    getInstitutionStudentProfiles(scope),
    MentorProfile.find({ institutionName: scope.institutionName, mentorOrgRole: { $in: ["institution_teacher", "organisation_head"] } })
      .select("userId mentorOrgRole institutionName assignedClasses institutionPermissions profilePhotoUrl title rating totalSessionsConducted updatedAt")
      .populate("userId", "name email approvalStatus role createdAt")
      .lean(),
    getScopedRoadmaps(scope),
    getScopedResources(scope),
    getScopedChallenges(scope),
    InstitutionRoadmapSubmission.find({}).populate("roadmapId", "institutionName className title mentorId").lean(),
    KnowledgeResourceSubmission.find({}).populate("resourceId", "institutionName className title submittedBy").lean()
  ]);

  const scopedRoadmapSubmissions = roadmapSubmissions.filter((item) => {
    const roadmap = item.roadmapId;
    return roadmap?.institutionName === scope.institutionName && scopedItemAllowed(scope, roadmap?.className || "", roadmap?.mentorId);
  });
  const scopedResourceSubmissions = resourceSubmissions.filter((item) => {
    const resource = item.resourceId;
    return resource?.institutionName === scope.institutionName && scopedItemAllowed(scope, resource?.className || "", resource?.submittedBy);
  });

  res.json({
    scope,
    summary: {
      students: students.length,
      teachers: teachers.length,
      classes: new Set(students.map((item) => item.className).filter(Boolean)).size,
      roadmaps: roadmaps.length,
      resources: resources.length,
      challenges: challenges.length,
      pendingReviews: scopedRoadmapSubmissions.filter((item) => item.status === "submitted").length + scopedResourceSubmissions.filter((item) => item.status === "submitted").length
    },
    recentStudents: students.slice(0, 8).map(serializeStudent),
    recentTeachers: teachers.slice(0, 8).map(serializeTeacher),
    recentRoadmaps: roadmaps.slice(0, 6).map((item) => ({ id: item._id, title: item.title, className: item.className || "", weeks: item.weeks?.length || 0 })),
    recentResources: resources.slice(0, 6).map((item) => ({ id: item._id, title: item.title, className: item.className || "", approvalStatus: item.approvalStatus || "approved" }))
  });
}

async function getClasses(req, res) {
  const scope = await getMentorScope(req);
  const students = await getInstitutionStudentProfiles(scope);
  const classMap = new Map();
  students.forEach((profile) => {
    const className = profile.className || "Unassigned";
    if (!classMap.has(className)) classMap.set(className, []);
    classMap.get(className).push(profile);
  });
  const classes = Array.from(classMap.entries()).map(([className, profiles]) => ({
    className,
    studentCount: profiles.length,
    highSchoolCount: profiles.filter((item) => item.learnerStage === "highschool").length,
    after12Count: profiles.filter((item) => item.learnerStage === "after12").length,
    students: profiles.slice(0, 8).map(serializeStudent)
  }));
  res.json({ scope, classes });
}

async function getClassStudents(req, res) {
  const scope = await getMentorScope(req);
  const className = cleanText(req.params.className);
  if (!classAllowed(scope, className)) throw new ApiError(403, "You cannot access this class");
  const students = await getInstitutionStudentProfiles(scope, className);
  res.json({ scope, className, students: students.map(serializeStudent) });
}

async function getTeachers(req, res) {
  const scope = await getMentorScope(req);
  if (!scope.isHead) throw new ApiError(403, "Only organisation heads can manage teachers");
  const teachers = await MentorProfile.find({ institutionName: scope.institutionName, mentorOrgRole: { $in: ["institution_teacher", "organisation_head"] } })
    .select("userId mentorOrgRole institutionName assignedClasses institutionPermissions profilePhotoUrl title rating totalSessionsConducted updatedAt")
    .populate("userId", "name email approvalStatus role createdAt")
    .sort({ updatedAt: -1 })
    .lean();
  res.json({ scope, teachers: teachers.map(serializeTeacher) });
}

async function getReviews(req, res) {
  const scope = await getMentorScope(req);
  const [roadmapSubmissions, resourceSubmissions, challengeSubmissions] = await Promise.all([
    InstitutionRoadmapSubmission.find({}).populate("roadmapId", "institutionName className title mentorId").populate("studentId", "name email").sort({ updatedAt: -1 }).lean(),
    KnowledgeResourceSubmission.find({}).populate("resourceId", "institutionName className title submittedBy").populate("studentId", "name email").sort({ updatedAt: -1 }).lean(),
    CommunityChallengeSubmission.find({}).populate("challengeId", "institutionName className title createdBy").populate("userId", "name email").sort({ updatedAt: -1 }).lean()
  ]);

  const roadmap = roadmapSubmissions
    .filter((item) => item.roadmapId?.institutionName === scope.institutionName && scopedItemAllowed(scope, item.roadmapId?.className || "", item.roadmapId?.mentorId))
    .map((item) => ({
      id: item._id,
      type: "roadmap",
      title: item.roadmapId?.title || "Roadmap submission",
      className: item.roadmapId?.className || "",
      studentName: item.studentId?.name || "Student",
      status: item.status,
      submittedAt: item.submittedAt,
      routeHint: "/ai/career-roadmap?section=institution"
    }));
  const resources = resourceSubmissions
    .filter((item) => item.resourceId?.institutionName === scope.institutionName && scopedItemAllowed(scope, item.resourceId?.className || "", item.resourceId?.submittedBy))
    .map((item) => ({
      id: item._id,
      type: "resource",
      title: item.resourceId?.title || "Resource proof",
      className: item.resourceId?.className || "",
      studentName: item.studentId?.name || "Student",
      status: item.status,
      submittedAt: item.submittedAt,
      routeHint: "/community/knowledge-library"
    }));
  const challenges = challengeSubmissions
    .filter((item) => item.challengeId?.institutionName === scope.institutionName && scopedItemAllowed(scope, item.challengeId?.className || "", item.challengeId?.createdBy))
    .map((item) => ({
      id: item._id,
      type: "challenge",
      title: item.challengeId?.title || "Challenge submission",
      className: item.challengeId?.className || "",
      studentName: item.userId?.name || "Student",
      status: item.status,
      submittedAt: item.createdAt,
      routeHint: "/community/challenges"
    }));

  res.json({ scope, reviews: [...roadmap, ...resources, ...challenges].sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0)) });
}

async function getReports(req, res) {
  const scope = await getMentorScope(req);
  const [students, teachers, roadmaps, resources, challenges, certificates] = await Promise.all([
    getInstitutionStudentProfiles(scope),
    MentorProfile.countDocuments({ institutionName: scope.institutionName, mentorOrgRole: { $in: ["institution_teacher", "organisation_head"] } }),
    getScopedRoadmaps(scope),
    getScopedResources(scope),
    getScopedChallenges(scope),
    OrinCertification.find({ institutionName: scope.institutionName }).select("studentId title issuedAt").lean().catch(() => [])
  ]);
  const classBreakdown = {};
  students.forEach((profile) => {
    const key = profile.className || "Unassigned";
    classBreakdown[key] = (classBreakdown[key] || 0) + 1;
  });
  res.json({
    scope,
    summary: {
      students: students.length,
      teachers,
      roadmaps: roadmaps.length,
      resources: resources.length,
      challenges: challenges.length,
      certificates: certificates.length
    },
    classBreakdown: Object.entries(classBreakdown).map(([className, studentCount]) => ({ className, studentCount }))
  });
}

async function getApprovals(req, res) {
  const scope = await getMentorScope(req);
  if (!scope.isHead) throw new ApiError(403, "Only organisation heads can access approvals");
  const [teachers, resources, challenges] = await Promise.all([
    MentorProfile.find({ institutionName: scope.institutionName }).populate("userId", "name email approvalStatus role").lean(),
    KnowledgeResource.find({ institutionName: scope.institutionName, approvalStatus: "pending" }).sort({ createdAt: -1 }).lean(),
    CommunityChallenge.find({ institutionName: scope.institutionName, approvalStatus: "pending" }).sort({ createdAt: -1 }).lean()
  ]);
  res.json({
    scope,
    approvals: [
      ...teachers
        .filter((item) => item.userId?.approvalStatus === "pending")
        .map((item) => ({ id: item._id, type: "teacher", title: item.userId?.name || "Teacher", status: "pending", detail: item.userId?.email || "" })),
      ...resources.map((item) => ({ id: item._id, type: "resource", title: item.title, status: item.approvalStatus, detail: item.className || "Institution" })),
      ...challenges.map((item) => ({ id: item._id, type: "challenge", title: item.title, status: item.approvalStatus, detail: item.className || "Institution" }))
    ]
  });
}

module.exports = {
  getOverview,
  getClasses,
  getClassStudents,
  getTeachers,
  getReviews,
  getReports,
  getApprovals
};
