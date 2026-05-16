const express = require("express");
const router = express.Router();
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const {
  getNetworkOverview,
  getConnections,
  sendConnectionRequest,
  respondConnectionRequest,
  toggleFollow,
  getFeed,
  getInstitutionFeed,
  getPublicFeed,
  getSavedPosts,
  createPost,
  updatePost,
  deletePost,
  addComment,
  getPostComments,
  updateComment,
  deleteComment,
  reactToPost,
  endorseSkill,
  getDailyDashboard,
  completeDailyTask,
  getDailyQuiz,
  submitDailyQuiz,
  getSmartSuggestions,
  getCollegeNetwork,
  getMentorMatches,
  getSessionHistory,
  updateStudentSessionNote,
  submitMentorReview,
  getMentorReviews,
  getCareerRoadmap,
  startCareerRoadmapMission,
  submitCareerRoadmapProof,
  getInstitutionRoadmaps,
  createInstitutionRoadmap,
  submitInstitutionRoadmapWeekProof,
  getInstitutionRoadmapSubmissionsForMentor,
  reviewInstitutionRoadmapSubmission,
  getMentorLiveSessionPaidBookings,
  getMentorSprintPaidEnrollments,
  getCareerOpportunities,
  submitCareerOpportunity,
  getCollegeLeaderboard,
  getLiveSessions,
  createLiveSession,
  updateLiveSessionMeetingLink,
  toggleLiveSessionInterest,
  bookLiveSession,
  retryLiveSessionPaymentOrder,
  verifyLiveSessionPayment,
  cancelLiveSessionBooking,
  getSprints,
  getSprintDetail,
  createSprint,
  updateSprintMeetingLink,
  bookSprint,
  retrySprintPaymentOrder,
  verifySprintPayment,
  cancelSprintEnrollment,
  getMentorSprintPayouts,
  confirmSprintPayoutReceived,
  reportSprintPayoutIssue,
  generateResume,
  downloadResumePdf,
  getSkillGapAnalysis,
  getVerifiedMentors,
  getCommunityChallenges,
  submitCommunityChallenge,
  joinCommunityChallenge,
  submitCommunityChallengeProof,
  reviewCommunityChallengeSubmission,
  getOrinCertifications,
  getCertificateDetail,
  verifyCertificatePublic,
  generateCertificate,
  getCertificationTracks,
  requestCertificationTrack,
  getMyCertificationRequests,
  getMentorGroups,
  joinMentorGroup,
  respondMentorGroupJoinRequest,
  updateMentorGroup,
  createMentorGroup,
  getMentorGroupMessages,
  sendMentorGroupMessage,
  updateMentorGroupMessage,
  reactMentorGroupMessage,
  deleteMentorGroupMessage,
  createHighSchoolQuizBattleRoom,
  joinHighSchoolQuizBattleRoom,
  getHighSchoolQuizBattleState,
  submitHighSchoolQuizBattleAnswer,
  createHighSchoolCompetition,
  listHighSchoolCompetitions,
  registerHighSchoolCompetition,
  submitHighSchoolCompetitionLevel1,
  finalizeHighSchoolCompetitionLevel1,
  createHighSchoolCompetitionLevel2Batches,
  joinHighSchoolCompetitionLevel2Batch,
  getHighSchoolCompetitionLevel2BatchState,
  submitHighSchoolCompetitionLevel2BatchAnswer,
  getHighSchoolCompetitionReports,
  getProjectIdeas,
  startProjectIdea,
  toggleProjectIdeaTask,
  submitProjectIdeaProof,
  getKnowledgeLibrary,
  submitKnowledgeResource,
  getMentorKnowledgeResources,
  submitKnowledgeResourceProof,
  getKnowledgeResourceSubmissionsForMentor,
  reviewKnowledgeResourceSubmission,
  getMentorCertificateTemplates,
  createMentorCertificateTemplate,
  getReputationSummary
} = require("../controllers/networkController");

router.get("/overview", verifyToken, authorizeRoles("student", "mentor"), getNetworkOverview);

router.get("/connections", verifyToken, authorizeRoles("student", "mentor"), getConnections);
router.post("/connections/request", verifyToken, authorizeRoles("student", "mentor"), sendConnectionRequest);
router.post(
  "/connections/:connectionId/respond",
  verifyToken,
  authorizeRoles("student", "mentor"),
  respondConnectionRequest
);

router.post("/follow/:userId", verifyToken, authorizeRoles("student", "mentor"), toggleFollow);

router.get("/feed", verifyToken, authorizeRoles("student", "mentor"), getFeed);
router.get("/feed/institution", verifyToken, authorizeRoles("student", "mentor"), getInstitutionFeed);
router.get("/feed/public", verifyToken, authorizeRoles("student", "mentor"), getPublicFeed);
router.get("/feed/saved", verifyToken, authorizeRoles("student", "mentor"), getSavedPosts);
router.post("/feed", verifyToken, authorizeRoles("student", "mentor"), createPost);
router.patch("/feed/:postId", verifyToken, authorizeRoles("student", "mentor"), updatePost);
router.delete("/feed/:postId", verifyToken, authorizeRoles("student", "mentor"), deletePost);
router.post("/feed/:postId/comment", verifyToken, authorizeRoles("student", "mentor"), addComment);
router.get("/feed/:postId/comments", verifyToken, authorizeRoles("student", "mentor"), getPostComments);
router.patch("/feed/:postId/comment/:commentId", verifyToken, authorizeRoles("student", "mentor"), updateComment);
router.delete("/feed/:postId/comment/:commentId", verifyToken, authorizeRoles("student", "mentor"), deleteComment);
router.post("/feed/:postId/react", verifyToken, authorizeRoles("student", "mentor"), reactToPost);

router.post("/endorse/:userId", verifyToken, authorizeRoles("student", "mentor"), endorseSkill);

router.get("/daily-dashboard", verifyToken, authorizeRoles("student", "mentor"), getDailyDashboard);
router.post("/daily-task/complete", verifyToken, authorizeRoles("student", "mentor"), completeDailyTask);
router.get("/daily-quiz", verifyToken, authorizeRoles("student"), getDailyQuiz);
router.post("/daily-quiz/submit", verifyToken, authorizeRoles("student"), submitDailyQuiz);

router.get("/suggestions", verifyToken, authorizeRoles("student", "mentor"), getSmartSuggestions);
router.get("/college-network", verifyToken, authorizeRoles("student", "mentor"), getCollegeNetwork);
router.get("/mentor-matches", verifyToken, authorizeRoles("student"), getMentorMatches);
router.get("/session-history", verifyToken, authorizeRoles("student"), getSessionHistory);
router.patch("/session-history/:sessionId/note", verifyToken, authorizeRoles("student"), updateStudentSessionNote);
router.post("/sessions/:sessionId/review", verifyToken, authorizeRoles("student"), submitMentorReview);
router.get("/mentors/:mentorId/reviews", verifyToken, authorizeRoles("student", "mentor"), getMentorReviews);
router.get("/career-roadmap", verifyToken, authorizeRoles("student"), getCareerRoadmap);
router.post("/career-roadmap/:stepId/start", verifyToken, authorizeRoles("student"), startCareerRoadmapMission);
router.post("/career-roadmap/:stepId/submit-proof", verifyToken, authorizeRoles("student"), submitCareerRoadmapProof);
router.get("/institution-roadmaps", verifyToken, authorizeRoles("student", "mentor"), getInstitutionRoadmaps);
router.post("/institution-roadmaps", verifyToken, authorizeRoles("mentor"), createInstitutionRoadmap);
router.post("/institution-roadmaps/:roadmapId/weeks/:weekId/submissions", verifyToken, authorizeRoles("student"), submitInstitutionRoadmapWeekProof);
router.get("/institution-roadmaps/submissions/mentor", verifyToken, authorizeRoles("mentor"), getInstitutionRoadmapSubmissionsForMentor);
router.patch("/institution-roadmaps/submissions/:submissionId/review", verifyToken, authorizeRoles("mentor"), reviewInstitutionRoadmapSubmission);
router.get("/opportunities", verifyToken, authorizeRoles("student", "mentor"), getCareerOpportunities);
router.post("/opportunities/submit", verifyToken, authorizeRoles("mentor"), submitCareerOpportunity);
router.get("/leaderboard", verifyToken, authorizeRoles("student", "mentor"), getCollegeLeaderboard);
router.get("/live-sessions", verifyToken, authorizeRoles("student", "mentor"), getLiveSessions);
router.post("/live-sessions", verifyToken, authorizeRoles("mentor"), createLiveSession);
router.patch("/live-sessions/:liveSessionId/meeting-link", verifyToken, authorizeRoles("mentor"), updateLiveSessionMeetingLink);
router.post("/live-sessions/:liveSessionId/interest", verifyToken, authorizeRoles("student", "mentor"), toggleLiveSessionInterest);
router.post("/live-sessions/:liveSessionId/book", verifyToken, authorizeRoles("student"), bookLiveSession);
router.post("/live-sessions/bookings/:bookingId/retry-order", verifyToken, authorizeRoles("student"), retryLiveSessionPaymentOrder);
router.post("/live-sessions/verify-payment", verifyToken, authorizeRoles("student"), verifyLiveSessionPayment);
router.patch("/live-sessions/bookings/:bookingId/cancel", verifyToken, authorizeRoles("student"), cancelLiveSessionBooking);
router.get("/live-sessions/bookings/mentor", verifyToken, authorizeRoles("mentor"), getMentorLiveSessionPaidBookings);
router.get("/sprints", verifyToken, authorizeRoles("student", "mentor"), getSprints);
router.get("/sprints/mentor/payouts", verifyToken, authorizeRoles("mentor"), getMentorSprintPayouts);
router.get("/sprints/:sprintId", verifyToken, authorizeRoles("student", "mentor"), getSprintDetail);
router.post("/sprints", verifyToken, authorizeRoles("mentor"), createSprint);
router.patch("/sprints/:sprintId/meeting-link", verifyToken, authorizeRoles("mentor"), updateSprintMeetingLink);
router.post("/sprints/:sprintId/book", verifyToken, authorizeRoles("student"), bookSprint);
router.post("/sprints/enrollments/:enrollmentId/retry-order", verifyToken, authorizeRoles("student"), retrySprintPaymentOrder);
router.post("/sprints/verify-payment", verifyToken, authorizeRoles("student"), verifySprintPayment);
router.patch("/sprints/enrollments/:enrollmentId/cancel", verifyToken, authorizeRoles("student"), cancelSprintEnrollment);
router.patch("/sprints/enrollments/:enrollmentId/payout/confirm", verifyToken, authorizeRoles("mentor"), confirmSprintPayoutReceived);
router.patch("/sprints/enrollments/:enrollmentId/payout/report-issue", verifyToken, authorizeRoles("mentor"), reportSprintPayoutIssue);
router.get("/sprints/enrollments/mentor", verifyToken, authorizeRoles("mentor"), getMentorSprintPaidEnrollments);
router.get("/resume/generate", verifyToken, authorizeRoles("student", "mentor"), generateResume);
router.post("/resume/generate", verifyToken, authorizeRoles("student", "mentor"), generateResume);
router.get("/resume/pdf", verifyToken, authorizeRoles("student", "mentor"), downloadResumePdf);
router.get("/skill-gap", verifyToken, authorizeRoles("student"), getSkillGapAnalysis);
router.get("/verified-mentors", verifyToken, authorizeRoles("student", "mentor"), getVerifiedMentors);
router.get("/challenges", verifyToken, authorizeRoles("student", "mentor"), getCommunityChallenges);
router.post("/challenges/submit", verifyToken, authorizeRoles("mentor"), submitCommunityChallenge);
router.post("/challenges/:challengeId/join", verifyToken, authorizeRoles("student"), joinCommunityChallenge);
router.post("/challenges/:challengeId/submissions", verifyToken, authorizeRoles("student"), submitCommunityChallengeProof);
router.patch("/challenges/:challengeId/submissions/:submissionId/review", verifyToken, authorizeRoles("mentor", "admin"), reviewCommunityChallengeSubmission);
router.get("/certifications/verify/:certificateId", verifyCertificatePublic);
router.get("/certifications", verifyToken, authorizeRoles("student", "mentor"), getOrinCertifications);
router.post("/certifications/generate", verifyToken, authorizeRoles("student", "mentor"), generateCertificate);
router.get("/certifications/:certificateId", verifyToken, authorizeRoles("student", "mentor"), getCertificateDetail);
router.get("/certification-tracks", verifyToken, authorizeRoles("student", "mentor"), getCertificationTracks);
router.post("/certification-tracks/:trackId/request", verifyToken, authorizeRoles("student"), requestCertificationTrack);
router.get("/certification-requests/me", verifyToken, authorizeRoles("student", "mentor"), getMyCertificationRequests);
router.get("/mentor-groups", verifyToken, authorizeRoles("student", "mentor"), getMentorGroups);
router.post("/mentor-groups", verifyToken, authorizeRoles("mentor"), createMentorGroup);
router.patch("/mentor-groups/:groupId", verifyToken, authorizeRoles("mentor"), updateMentorGroup);
router.post("/mentor-groups/:groupId/join", verifyToken, authorizeRoles("student"), joinMentorGroup);
router.patch("/mentor-groups/:groupId/requests/:studentId", verifyToken, authorizeRoles("mentor"), respondMentorGroupJoinRequest);
router.get("/mentor-groups/:groupId/messages", verifyToken, authorizeRoles("student", "mentor"), getMentorGroupMessages);
router.post("/mentor-groups/:groupId/messages", verifyToken, authorizeRoles("student", "mentor"), sendMentorGroupMessage);
router.patch("/mentor-groups/:groupId/messages/:messageId", verifyToken, authorizeRoles("student", "mentor"), updateMentorGroupMessage);
router.post("/mentor-groups/:groupId/messages/:messageId/reactions", verifyToken, authorizeRoles("student", "mentor"), reactMentorGroupMessage);
router.delete("/mentor-groups/:groupId/messages/:messageId", verifyToken, authorizeRoles("student", "mentor"), deleteMentorGroupMessage);
router.post("/highschool-quiz-battle/rooms", verifyToken, authorizeRoles("student"), createHighSchoolQuizBattleRoom);
router.post("/highschool-quiz-battle/rooms/:roomId/join", verifyToken, authorizeRoles("student"), joinHighSchoolQuizBattleRoom);
router.get("/highschool-quiz-battle/rooms/:roomId/state", verifyToken, authorizeRoles("student"), getHighSchoolQuizBattleState);
router.post("/highschool-quiz-battle/rooms/:roomId/answer", verifyToken, authorizeRoles("student"), submitHighSchoolQuizBattleAnswer);
router.post("/highschool-competitions", verifyToken, authorizeRoles("mentor"), createHighSchoolCompetition);
router.get("/highschool-competitions", verifyToken, authorizeRoles("student", "mentor"), listHighSchoolCompetitions);
router.post("/highschool-competitions/:competitionId/register", verifyToken, authorizeRoles("student"), registerHighSchoolCompetition);
router.post("/highschool-competitions/:competitionId/level1/submit", verifyToken, authorizeRoles("student"), submitHighSchoolCompetitionLevel1);
router.post("/highschool-competitions/:competitionId/level1/finalize", verifyToken, authorizeRoles("mentor"), finalizeHighSchoolCompetitionLevel1);
router.post("/highschool-competitions/:competitionId/level2/batches", verifyToken, authorizeRoles("mentor"), createHighSchoolCompetitionLevel2Batches);
router.post("/highschool-competitions/:competitionId/level2/batches/:batchIndex/join", verifyToken, authorizeRoles("student"), joinHighSchoolCompetitionLevel2Batch);
router.get("/highschool-competitions/:competitionId/level2/batches/:batchIndex/state", verifyToken, authorizeRoles("student", "mentor"), getHighSchoolCompetitionLevel2BatchState);
router.post("/highschool-competitions/:competitionId/level2/batches/:batchIndex/answer", verifyToken, authorizeRoles("student"), submitHighSchoolCompetitionLevel2BatchAnswer);
router.get("/highschool-competitions/:competitionId/reports", verifyToken, authorizeRoles("mentor"), getHighSchoolCompetitionReports);
router.get("/project-ideas", verifyToken, authorizeRoles("student"), getProjectIdeas);
router.post("/project-ideas/:projectKey/start", verifyToken, authorizeRoles("student"), startProjectIdea);
router.post("/project-ideas/:projectKey/task", verifyToken, authorizeRoles("student"), toggleProjectIdeaTask);
router.post("/project-ideas/:projectKey/submit-proof", verifyToken, authorizeRoles("student"), submitProjectIdeaProof);
router.get("/knowledge-library", verifyToken, authorizeRoles("student", "mentor"), getKnowledgeLibrary);
router.post("/knowledge-library/submit", verifyToken, authorizeRoles("student", "mentor"), submitKnowledgeResource);
router.get("/knowledge-library/mine", verifyToken, authorizeRoles("mentor"), getMentorKnowledgeResources);
router.post("/knowledge-library/:resourceId/submissions", verifyToken, authorizeRoles("student"), submitKnowledgeResourceProof);
router.get("/knowledge-library/submissions/mentor", verifyToken, authorizeRoles("mentor"), getKnowledgeResourceSubmissionsForMentor);
router.patch("/knowledge-library/submissions/:submissionId/review", verifyToken, authorizeRoles("mentor"), reviewKnowledgeResourceSubmission);
router.get("/certificate-templates/mentor", verifyToken, authorizeRoles("mentor"), getMentorCertificateTemplates);
router.post("/certificate-templates/mentor", verifyToken, authorizeRoles("mentor"), createMentorCertificateTemplate);
router.get("/reputation-summary", verifyToken, authorizeRoles("student", "mentor"), getReputationSummary);

module.exports = router;
